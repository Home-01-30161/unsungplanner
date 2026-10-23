import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only cache + quota. Uses the SERVICE ROLE key, which must never be
 * prefixed NEXT_PUBLIC_. With RLS enabled and no policies, the browser can't
 * touch it.
 *
 * Quotas are enforced through the atomic `take_slot` SQL function (see
 * supabase/migrations). Without Supabase a per-instance in-memory limiter is
 * used instead, so the app never runs with no ceiling at all.
 *
 * If Supabase isn't configured, caching silently degrades but the app works.
 */
let client: SupabaseClient | null | undefined;

function getClient(): SupabaseClient | null {
    if (client !== undefined) return client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
    return client;
}

/** Returns the cached value if fresh, otherwise runs fn and stores a non-null result. Cache failures never break a request. */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T | null>): Promise<T | null> {
    const db = getClient();
    if (db) {
        try {
            const { data } = await db
                .from("api_cache")
                .select("data")
                .eq("key", key)
                .gt("expires_at", new Date().toISOString())
                .maybeSingle();
            if (data?.data != null) return data.data as T;
        } catch (err) {
            console.warn("cache read failed", err);
        }
    }

    const fresh = await fn();

    if (db && fresh != null) {
        try {
            await db.from("api_cache").upsert({
                key,
                data: fresh,
                expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString()
            });
        } catch (err) {
            console.warn("cache write failed", err);
        }
    }
    return fresh;
}

// ─── Quota / rate limiting ────────────────────────────────────────────────────

type Counter = { count: number; resetAt: number };
const localCounters = new Map<string, Counter>();
const LOCAL_MAX_KEYS = 5_000;

function pruneLocal(now: number): void {
    for (const [key, entry] of localCounters) {
        if (entry.resetAt <= now) localCounters.delete(key);
    }
    // Pathological traffic from many IPs: start over rather than grow forever.
    if (localCounters.size >= LOCAL_MAX_KEYS) localCounters.clear();
}

/**
 * Per-instance fallback limiter. Serverless instances do not share this map,
 * so it is weaker than the database counter — but it still caps a single
 * instance, and it never fails open.
 */
export function consumeSlotLocal(key: string, limit: number, ttlSeconds: number): boolean {
    if (limit <= 0) return false;
    const now = Date.now();
    if (localCounters.size >= LOCAL_MAX_KEYS) pruneLocal(now);

    const entry = localCounters.get(key);
    if (!entry || entry.resetAt <= now) {
        localCounters.set(key, { count: 1, resetAt: now + ttlSeconds * 1000 });
        return limit >= 1;
    }
    entry.count += 1;
    return entry.count <= limit;
}

/**
 * Atomically counts one hit for `key` and returns true while the count is
 * within `limit`. Uses the `take_slot` RPC when Supabase is available
 * (shared across all instances); otherwise falls back to the local map.
 */
export async function consumeSlot(key: string, limit: number, ttlSeconds: number): Promise<boolean> {
    if (limit <= 0) return false;

    const db = getClient();
    if (db) {
        try {
            const { data, error } = await db.rpc("take_slot", {
                p_key: key,
                p_limit: limit,
                p_ttl_seconds: ttlSeconds
            });
            if (!error && typeof data === "boolean") return data;
            if (error) console.warn("take_slot unavailable, using in-memory limiter:", error.message);
        } catch (err) {
            console.warn("take_slot failed, using in-memory limiter:", err instanceof Error ? err.message : err);
        }
    }

    return consumeSlotLocal(key, limit, ttlSeconds);
}

/** Global daily cap so a public deployment can't burn the free API quotas. */
export async function takeDailyPlanSlot(limit: number, todayIso: string): Promise<boolean> {
    return consumeSlot(`quota:${todayIso}`, limit, 2 * 86_400);
}
