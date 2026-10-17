import { cached } from "@/lib/cache";
import type { DisplayCurrency } from "@/lib/types";

/** THB -> target currency via Frankfurter (no key). Returns null if unavailable; callers show THB only. */
export async function getRateFromTHB(target: DisplayCurrency): Promise<number | null> {
    if (target === "THB") return 1;
    return cached<number>(`fx:THB:${target}`, 86_400, async () => {
        try {
            const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=THB&symbols=${target}`);
            if (!res.ok) return null;
            const data = (await res.json()) as { rates?: Record<string, number> };
            const rate = data.rates?.[target];
            return typeof rate === "number" ? rate : null;
        } catch {
            return null;
        }
    });
}