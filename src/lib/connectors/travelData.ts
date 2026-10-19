import { cached } from "../cache";
import { addDays } from "../dates";
import type { BudgetStyle, FlightQuote, HotelQuote } from "../types";

const SERP = "https://serpapi.com/search.json";

type FlightLeg = {
    price?: number;
    flights?: {
        airline?: string;
        departure_airport?: { id?: string; name?: string };
        arrival_airport?: { id?: string; name?: string };
    }[];
};

type SerpFlightResponse = {
    error?: string;
    best_flights?: FlightLeg[];
    other_flights?: FlightLeg[];
};

/** Single SerpAPI call for one airport pair on one date. Returns null on any failure. */
async function fetchFlightPrice(
    dep: string,
    arr: string,
    outbound: string,
    inbound: string,
    apiKey: string
): Promise<{ priceUSD: number; airline: string; fromAirport: string; toAirport: string; via?: string; searchUrl: string } | null> {
    try {
        const params = new URLSearchParams({
            engine: "google_flights",
            departure_id: dep,
            arrival_id: arr,
            outbound_date: outbound,
            return_date: inbound,
            type: "1",   // round trip
            adults: "1",
            currency: "USD",
            hl: "en",
            api_key: apiKey
        });
        const res = await fetch(`${SERP}?${params}`);
        if (!res.ok) return null;
        const data = (await res.json()) as SerpFlightResponse;
        if (data.error) return null;

        const options = [...(data.best_flights ?? []), ...(data.other_flights ?? [])].filter(
            (o): o is FlightLeg & { price: number } => typeof o.price === "number"
        );
        if (!options.length) return null;

        const cheapest = options.reduce((a, b) => (b.price < a.price ? b : a));
        const legs = cheapest.flights ?? [];
        // Use what SerpAPI echoes back for the FIRST departure and LAST arrival.
        // For multi-leg itineraries (e.g. BKK→HKG→LAX), flights[0].arrival is the
        // layover — we need the final leg's arrival for the destination airport.
        const firstLeg = legs[0];
        const lastLeg  = legs[legs.length - 1] ?? firstLeg;
        const fromAirport = firstLeg?.departure_airport?.id ?? dep.split(",")[0];
        const toAirport   = lastLeg?.arrival_airport?.id   ?? arr.split(",")[0];
        // Collect any intermediate stops for display
        const via = legs.length > 1
            ? legs.slice(0, -1).map(l => l.arrival_airport?.id ?? "?").join(", ")
            : undefined;
        // Build a Google Flights deep-link the user can click to verify the price
        const searchUrl = `https://www.google.com/travel/flights?q=Flights+from+${encodeURIComponent(dep)}+to+${encodeURIComponent(arr)}&curr=USD#flt=${dep}.${arr}.${outbound}*${arr}.${dep}.${inbound};c:USD;e:1;sd:1;t:f`;
        return {
            priceUSD: cheapest.price,
            airline: firstLeg?.airline ?? "Unknown airline",
            fromAirport,
            toAirport,
            ...(via ? { via } : {}),
            searchUrl,
        };
    } catch {
        return null;
    }
}

/**
 * Cheapest round-trip fare for 1 adult.
 *
 * Strategy:
 *  1. Try every individual airport pair (e.g. BKK→NRT, BKK→HND, DMK→NRT, DMK→HND)
 *     on the exact requested date.
 *  2. If none return a price, try date offsets -3…+3 days across all pairs.
 *  3. Return the cheapest result found, noting which airport pair and date was used.
 */
export async function searchFlights(
    fromAirports: string[],
    toAirports: string[],
    outbound: string,
    inbound: string
): Promise<FlightQuote | null> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey || !fromAirports.length || !toAirports.length) return null;

    // Build all (dep, arr) pairs to try
    const pairs: [string, string][] = [];
    for (const dep of fromAirports) for (const arr of toAirports) pairs.push([dep, arr]);

    // Date offsets to try in order: exact first, then ±1, ±2, ±3
    const offsets = [0, 1, -1, 2, -2, 3, -3];

    const cacheKey = `flights2:${fromAirports.join(",")}:${toAirports.join(",")}:${outbound}:${inbound}`;
    return cached<FlightQuote>(cacheKey, 6 * 3600, async () => {
        for (const offset of offsets) {
            const tryOut = offset === 0 ? outbound : addDays(outbound, offset);
            // Return date must stay >= outbound; shift it by the same offset
            const tryRet = offset === 0 ? inbound  : addDays(inbound,  offset);

            // Try all airport pairs for this date in parallel
            const results = await Promise.all(
                pairs.map(([dep, arr]) => fetchFlightPrice(dep, arr, tryOut, tryRet, apiKey))
            );

            const found = results.filter((r): r is NonNullable<typeof r> => r !== null);
            if (!found.length) continue;

            const cheapest = found.reduce((a, b) => (b.priceUSD < a.priceUSD ? b : a));
            return { ...cheapest, actualOutbound: tryOut };
        }
        return null;
    });
}

type HotelProperty = { name?: string; rate_per_night?: { extracted_lowest?: number } };

const HOTEL_CLASS: Record<BudgetStyle, string> = { Backpacker: "2", "Mid-range": "3,4", Luxury: "5" };

/** Median nightly rate (USD) across the first results for the chosen star range. Null if none. */
export async function searchHotels(
    city: string,
    country: string,
    checkIn: string,
    checkOut: string,
    style: BudgetStyle
): Promise<HotelQuote | null> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) return null;

    const query = `${city}, ${country}`;
    return cached<HotelQuote>(`hotels:${query}:${checkIn}:${checkOut}:${style}`, 12 * 3600, async () => {
        try {
            const params = new URLSearchParams({
                engine: "google_hotels",
                q: `${query} hotels`,
                check_in_date: checkIn,
                check_out_date: checkOut,
                adults: "1",
                hotel_class: HOTEL_CLASS[style],
                currency: "USD",
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
            // Build a Google Hotels deep-link the user can click to verify the price
            const searchUrl = `https://www.google.com/travel/hotels?q=${encodeURIComponent(query + " hotels")}&checkin=${checkIn}&checkout=${checkOut}`;
            return { medianNightUSD: mid.rate, sampleName: mid.name, sampleSize: priced.length, searchUrl };
        } catch {
            return null;
        }
    });
}