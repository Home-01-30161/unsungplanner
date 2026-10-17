import { travelWorkflow } from "@/lib/agents/travelGraph";
import { PlanRequest } from "@/lib/schema";
import { takeDailyPlanSlot } from "@/lib/cache";
import { todayInBangkok } from "@/lib/dates";

export const maxDuration = 60; // seconds; plenty on Vercel Hobby with Fluid Compute

const DAILY_LIMIT = Number(process.env.DAILY_PLAN_LIMIT ?? 4);
const KEYS_TO_SEND = ["gaps", "calendarWarnings", "budget", "itinerary"] as const;

export async function POST(req: Request) {
    const parsed = PlanRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return Response.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
    }
    if (!(await takeDailyPlanSlot(DAILY_LIMIT, todayInBangkok()))) {
        return Response.json({ error: "Daily planning limit reached. Try again tomorrow." }, { status: 429 });
    }

    const encoder = new TextEncoder();
    const send = (c: ReadableStreamDefaultController, obj: unknown) => c.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

    // Newline-delimited JSON: one event per line, sent as each node finishes.
    const stream = new ReadableStream({
        async start(controller) {
            try {
                const updates = await travelWorkflow.stream(parsed.data, { streamMode: "updates" });
                for await (const chunk of updates) {
                    for (const [node, update] of Object.entries(chunk as Record<string, Record<string, unknown>>)) {
                        const data: Record<string, unknown> = {};
                        for (const k of KEYS_TO_SEND) if (update?.[k] !== undefined) data[k] = update[k];
                        send(controller, { type: "step", node, data });
                    }
                }
                send(controller, { type: "done" });
            } catch (err) {
                console.error("plan failed", err); // details stay in server logs
                send(controller, { type: "error", message: "Something went wrong while planning. Please try again." });
            } finally {
                controller.close();
            }
        }
    });

    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}