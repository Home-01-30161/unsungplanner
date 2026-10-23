import { cached } from "@/lib/cache";
import type { DisplayCurrency } from "@/lib/types";

/** USD -> target currency via Frankfurter (no key). Returns null if unavailable; callers show USD only. */
export async function getRateFromUSD(target: DisplayCurrency): Promise<number | null> {
    if (target === "USD") return 1;
    return cached<number>(`fx:USD:${target}`, 86_400, async () => {
        try {
            const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${target}`, {
                signal: AbortSignal.timeout(8_000),
            });
            if (!res.ok) return null;
            const data = (await res.json()) as { rates?: Record<string, number> };
            const rate = data.rates?.[target];
            return typeof rate === "number" ? rate : null;
        } catch {
            return null;
        }
    });
}