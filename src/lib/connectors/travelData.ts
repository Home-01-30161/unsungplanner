import { cached } from "../cache";
import type { BudgetStyle, FlightQuote, HotelQuote } from "../types";

const SERP = "https://serpapi.com/search.json";

type FlightLeg = { price?: number; flights?: { airline?: string }[] };

/** Cheapest round-trip fare for 1 adult across all returned options. Null if none. */
export async function searchFlights(
    fromAirports: string[],
    toAirports: string[],
    outbound: string,
    inbound: string
): Promise<FlightQuote | null> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey || !fromAirports.length || !toAirports.length) return null;

    const dep = fromAirports.join(",");
    const arr = toAirports.join(",");
    return cached<FlightQuote>(`flights:${dep}:${arr}:${outbound}:${inbound}`, 12 * 3600, async () => {
        try {
            const params = new URLSearchParams({
                engine: "google_flights",
                departure_id: dep,
                arrival_id: arr,
                outbound_date: outbound,
                return_date: inbound,
                type: "1", // round trip
                adults: "1",
                currency: "THB",
                hl: "en",
                api_key: apiKey
            });
            const res = await fetch(`${SERP}?${params}`);
            if (!res.ok) return null;
            const data = (await res.json()) as { error?: string; best_flights?: FlightLeg[]; other_flights?: FlightLeg[] };
            if (data.error) return null;

            const options = [...(data.best_flights ?? []), ...(data.other_flights ?? [])].filter(
                (o): o is FlightLeg & { price: number } => typeof o.price === "number"
            );
            if (!options.length) return null;
            const cheapest = options.reduce((a, b) => (b.price < a.price ? b : a));
            return { priceTHB: cheapest.price, airline: cheapest.flights?.[0]?.airline ?? "Unknown airline" };
        } catch {
            return null;
        }
    });
}

type HotelProperty = { name?: string; rate_per_night?: { extracted_lowest?: number } };

const HOTEL_CLASS: Record<BudgetStyle, string> = { Backpacker: "2", "Mid-range": "3,4", Luxury: "5" };

/** Median nightly rate across the first results for the chosen star range. Null if none. */
export async function searchHotels(
    city: string,
    checkIn: string,
    checkOut: string,
    style: BudgetStyle
): Promise<HotelQuote | null> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) return null;

    return cached<HotelQuote>(`hotels:${city}:${checkIn}:${checkOut}:${style}`, 12 * 3600, async () => {
        try {
            const params = new URLSearchParams({
                engine: "google_hotels",
                q: `${city} Thailand hotels`,
                check_in_date: checkIn,
                check_out_date: checkOut,
                adults: "1",
                hotel_class: HOTEL_CLASS[style],
                currency: "THB",
                hl: "en",
                api_key: apiKey
            });
            const res = await fetch(`${SERP}?${params}`);
            if (!res.ok) return null;
            const data = (await res.json()) as { error?: string; properties?: HotelProperty[] };
            if (data.error) return null;

            const priced = (data.properties ?? [])
                .map((p) => ({ name: p.name ?? "Unnamed property", rate: p.rate_per_night?.extracted_lowest }))
                .filter((p): p is { name: string; rate: number } => typeof p.rate === "number")
                .slice(0, 10)
                .sort((a, b) => a.rate - b.rate);
            if (!priced.length) return null;

            const mid = priced[Math.floor(priced.length / 2)];
            return { medianNightTHB: mid.rate, sampleName: mid.name, sampleSize: priced.length };
        } catch {
            return null;
        }
    });
}