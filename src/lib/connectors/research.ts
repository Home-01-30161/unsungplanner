import { tavily } from "@tavily/core";
import { cached } from "../cache";

function client() {
    const apiKey = process.env.TAVILY_API_KEY;
    return apiKey ? tavily({ apiKey }) : null;
}

/** Attraction and entrance-fee snippets. UNTRUSTED web text: only ever pass it to the LLM as quoted data. */
export async function researchDestination(destinationName: string): Promise<string | null> {
    const tvly = client();
    if (!tvly) return null;
    return cached<string>(`research:${destinationName}`, 7 * 86_400, async () => {
        try {
            const res = await tvly.search(`top attractions and entrance fees in ${destinationName} Thailand`, { maxResults: 4 });
            const notes = res.results.map((r) => `- ${r.title}: ${r.content.slice(0, 300)}`).join("\n");
            return notes || null;
        } catch {
            return null;
        }
    });
}

/** Tries to read a petrol price (THB/litre) from search snippets. Sanity-bounded; null if nothing plausible. */
export async function researchFuelPrice(): Promise<number | null> {
    const tvly = client();
    if (!tvly) return null;
    return cached<number>("fuel:gasohol95", 24 * 3600, async () => {
        try {
            const res = await tvly.search("PTT Gasohol 95 price per litre today Thailand baht", { maxResults: 5 });
            const text = res.results.map((r) => r.content).join(" ");
            const prices = [...text.matchAll(/(\d{2}(?:\.\d{1,2})?)\s*(?:baht|THB|฿)/gi)]
                .map((m) => Number(m[1]))
                .filter((n) => n >= 25 && n <= 60)
                .sort((a, b) => a - b);
            return prices.length ? prices[Math.floor(prices.length / 2)] : null;
        } catch {
            return null;
        }
    });
}