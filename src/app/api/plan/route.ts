import { travelWorkflow } from "@/lib/agents/travelGraph";
import { PlanRequest } from "@/lib/schema";
import { takeDailyPlanSlot, consumeSlot } from "@/lib/cache";
import { clientIp, scrubSecrets, verifyTurnstile } from "@/lib/security";
import { todayUTC } from "@/lib/dates";

export const maxDuration = 60; // seconds; plenty on Vercel Hobby with Fluid Compute

const DAILY_LIMIT = Number(process.env.DAILY_PLAN_LIMIT ?? 100);
const PER_IP_LIMIT = Number(process.env.PLAN_PER_IP_LIMIT ?? 5);
const PER_IP_WINDOW_SEC = 3_600;
const MAX_BODY_BYTES = 16_384;
const KEYS_TO_SEND = ["gaps", "calendarWarnings", "budget", "itinerary", "researchSources"] as const;

function tooMany(message: string, retryAfterSec: number): Response {
    return Response.json(
        { error: message },
        { status: 429, headers: { "Retry-After": String(retryAfterSec), "Cache-Control": "no-store" } }
    );
}

export async function POST(req: Request) {
    // Reject oversized bodies before parsing them (protects against chunked-encoding bypass).
    const text = await req.text().catch(() => "");
    if (!text || text.length > MAX_BODY_BYTES) {
        return Response.json({ error: "Request body too large or empty." }, { status: 413 });
    }

    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (raw == null || typeof raw !== "object") {
        return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = PlanRequest.safeParse(raw);
    if (!parsed.success) {
        return Response.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
    }

    const ip = clientIp(req);

    // Layer 1: optional bot check (only active when TURNSTILE_SECRET_KEY is set).
    // Verified first so failed captcha attempts don't burn the user's per-IP quota.
    const turnstileToken = (raw as { turnstileToken?: unknown }).turnstileToken;
    if (!(await verifyTurnstile(turnstileToken, ip))) {
        return Response.json(
            { error: "Verification failed. Please refresh the page and try again." },
            { status: 403, headers: { "Cache-Control": "no-store" } }
        );
    }

    // Layer 2: per-IP cap, so one visitor cannot drain the shared quota.
    // In local dev without proxy headers, skip per-IP check so testing doesn't get blocked.
    const isDev = process.env.NODE_ENV !== "production";
    if (ip !== "unknown" || !isDev) {
        const hourBucket = Math.floor(Date.now() / (PER_IP_WINDOW_SEC * 1_000));
        if (!(await consumeSlot(`rl:plan:${ip}:${hourBucket}`, PER_IP_LIMIT, PER_IP_WINDOW_SEC * 2))) {
            return tooMany("Too many plans from this address. Please try again later.", PER_IP_WINDOW_SEC);
        }
    }

    // Layer 3: global daily cap on paid API usage.
    if (!(await takeDailyPlanSlot(DAILY_LIMIT, todayUTC()))) {
        return tooMany("Daily planning limit reached. Try again tomorrow.", 3_600);
    }

    const encoder = new TextEncoder();
    const send = (c: ReadableStreamDefaultController, obj: unknown) => c.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

    // Newline-delimited JSON: one event per line, sent as each node finishes.
    const stream = new ReadableStream({
        async start(controller) {
            try {
                const updates = await travelWorkflow.stream(parsed.data, { streamMode: "updates" });
                for await (const chunk of updates) {
                    if (req.signal.aborted) break; // client went away — stop spending API credits
                    for (const [node, update] of Object.entries(chunk as Record<string, Record<string, unknown>>)) {
                        const data: Record<string, unknown> = {};
                        for (const k of KEYS_TO_SEND) if (update?.[k] !== undefined) data[k] = update[k];
                        send(controller, { type: "step", node, data });
                    }
                }
                send(controller, { type: "done" });
            } catch (err) {
                // Details stay in server logs, with any api_key=... scrubbed first.
                console.error("plan failed:", scrubSecrets(err));
                send(controller, { type: "error", message: "Something went wrong while planning. Please try again." });
            } finally {
                try {
                    controller.close();
                } catch {
                    // Already closed because the client disconnected.
                }
            }
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        }
    });
}
