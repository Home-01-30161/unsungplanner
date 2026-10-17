import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only cache. Uses the SERVICE ROLE key, which must never be prefixed
 * NEXT_PUBLIC_. With RLS enabled and no policies, the browser can't touch it.
 * If Supabase isn't configured, everything still works, just uncached.
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

/**
 * Crude global daily cap so a public deployment can't burn the free API quotas.
 * Not atomic (two simultaneous requests can both slip through), which is fine here.
 * Returns false when today's limit is used up.
 */
export async function takeDailyPlanSlot(limit: number, todayIso: string): Promise<boolean> {
    const db = getClient();
    if (!db) return true;
    const key = `quota:${todayIso}`;
    try {
        const { data } = await db.from("api_cache").select("data").eq("key", key).maybeSingle();
        const used = Number((data?.data as { n?: number } | null)?.n ?? 0);
        if (used >= limit) return false;
        await db.from("api_cache").upsert({
            key,
            data: { n: used + 1 },
            expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString()
        });
    } catch (err) {
        console.warn("quota check failed, allowing request", err);
    }
    return true;
}