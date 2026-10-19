import { tavily } from "@tavily/core";
import { cached } from "../cache";

export interface ResearchSource {
    title: string;
    url: string;
    snippet: string;
}

export interface DestinationResearch {
    /** Plain-text notes for the LLM prompt (untrusted web content). */
    notes: string;
    /** Structured sources for display in the UI with clickable links. */
    sources: ResearchSource[];
}

function client() {
    const apiKey = process.env.TAVILY_API_KEY;
    return apiKey ? tavily({ apiKey }) : null;
}

/**
 * Returns attraction, restaurant, and hotel snippets plus their source URLs.
 * UNTRUSTED web text: only ever pass `notes` to the LLM as quoted data.
 */
export async function researchDestination(city: string, country: string): Promise<DestinationResearch | null> {
    const tvly = client();
    if (!tvly) return null;
    const query = `${city}, ${country}`;
    return cached<DestinationResearch>(`research2:${query}`, 7 * 86_400, async () => {
        try {
            // Run three targeted searches in parallel for richer results
            const [attractions, restaurants, hotels] = await Promise.all([
                tvly.search(`top tourist attractions and entrance fees ${query}`, { maxResults: 3 }),
                tvly.search(`best restaurants to eat in ${query} with prices`, { maxResults: 3 }),
                tvly.search(`recommended hotels in ${query} price per night`, { maxResults: 2 }),
            ]);

            const allResults = [
                ...attractions.results.map((r) => ({ ...r, tag: "attraction" })),
                ...restaurants.results.map((r) => ({ ...r, tag: "restaurant" })),
                ...hotels.results.map((r) => ({ ...r, tag: "hotel" })),
            ];

            if (!allResults.length) return null;

            const sources: ResearchSource[] = allResults.map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.content.slice(0, 280),
            }));

            const notes = allResults
                .map((r) => `[${r.tag.toUpperCase()}] ${r.title}: ${r.content.slice(0, 300)}`)
                .join("\n");

            return { notes, sources };
        } catch {
            return null;
        }
    });
}

/**
 * Tries to read a fuel price (local currency/litre) from search snippets.
 * Returns null when Tavily is unavailable or no plausible value is found.
 */
export async function researchFuelPrice(city: string, country: string): Promise<number | null> {
    const tvly = client();
    if (!tvly) return null;
    return cached<number>(`fuel:${country}`, 24 * 3600, async () => {
        try {
            const res = await tvly.search(`petrol gasoline price per litre today ${country}`, { maxResults: 5 });
            const text = res.results.map((r) => r.content).join(" ");
            const prices = [...text.matchAll(/(\d{1,3}(?:\.\d{1,3})?)\s*(?:per\s*litre|\/l\b)/gi)]
                .map((m) => Number(m[1]))
                .filter((n) => n > 0.2 && n < 5000)
                .sort((a, b) => a - b);
            return prices.length ? prices[Math.floor(prices.length / 2)] : null;
        } catch {
            return null;
        }
    });
}