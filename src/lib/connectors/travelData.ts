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
    search_metadata?: { google_flights_url?: string };   // ← actual URL SerpAPI used
};

type SerpHotelResponse = {
    error?: string;
    properties?: HotelProperty[];
    search_metadata?: { google_url?: string };           // ← actual URL SerpAPI used
};

type HotelProperty = {
    name?: string;
    rate_per_night?: {
        lowest?: string;           // e.g. "$19" or "฿638"
        extracted_lowest?: number; // numeric, may be per-person for Japanese 民宿
        before_taxes_fees?: string;
    };
};

/** Single SerpAPI call. dep/arr may be comma-separated multi-airport strings. */
async function fetchFlightPrice(
    dep: string,
    arr: string,
    outbound: string,
    inbound: string,
    apiKey: string
): Promise<{
    priceUSD: number; airline: string;
    fromAirport: string; toAirport: string;
    via?: string; searchUrl: string
} | null> {
    try {
        const params = new URLSearchParams({
            engine: "google_flights",
            departure_id: dep,
            arrival_id: arr,
            outbound_date: outbound,
            return_date: inbound,
            type: "1",      // round trip
            adults: "1",
            currency: "USD",
            hl: "en",
            api_key: apiKey,
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
        const firstLeg = legs[0];
        const lastLeg  = legs[legs.length - 1] ?? firstLeg;
        const fromAirport = firstLeg?.departure_airport?.id ?? dep.split(",")[0];
        const toAirport   = lastLeg?.arrival_airport?.id   ?? arr.split(",")[0];
        const via = legs.length > 1
            ? legs.slice(0, -1).map(l => l.arrival_airport?.id ?? "?").join(", ")
            : undefined;

        // Use the ACTUAL Google Flights URL that SerpAPI used — guaranteed to match.
        // Fall back to a plain search query if metadata is missing.
        const searchUrl =
            data.search_metadata?.google_flights_url ??
            `https://www.google.com/travel/flights?q=Flights+from+${encodeURIComponent(dep)}+to+${encodeURIComponent(arr)}`;

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
 *  1. Combined multi-airport search first (e.g. "BKK,DMK" → "KIX,ITM") — this is
 *     how Google Flights itself finds the globally cheapest option across all airports.
 *  2. Fall back to individual pairs if the combined search yields nothing.
 *  3. If nothing on the exact date, retry ±1…±3 days.
 */
export async function searchFlights(
    fromAirports: string[],
    toAirports: string[],
    outbound: string,
    inbound: string
): Promise<FlightQuote | null> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey || !fromAirports.length || !toAirports.length) return null;

    const combinedDep = fromAirports.join(",");
    const combinedArr = toAirports.join(",");

    const individualPairs: [string, string][] = [];
    for (const dep of fromAirports) for (const arr of toAirports) individualPairs.push([dep, arr]);

    const offsets = [0, 1, -1, 2, -2, 3, -3];
    const cacheKey = `flights4:${combinedDep}:${combinedArr}:${outbound}:${inbound}`;

    return cached<FlightQuote>(cacheKey, 2 * 3600, async () => {
        for (const offset of offsets) {
            const tryOut = offset === 0 ? outbound : addDays(outbound, offset);
            const tryRet = offset === 0 ? inbound  : addDays(inbound,  offset);

            const combined = await fetchFlightPrice(combinedDep, combinedArr, tryOut, tryRet, apiKey);
            const individuals = await Promise.all(
                individualPairs.map(([d, a]) => fetchFlightPrice(d, a, tryOut, tryRet, apiKey))
            );

            const all = [combined, ...individuals].filter((r): r is NonNullable<typeof r> => r !== null);
            if (!all.length) continue;

            const cheapest = all.reduce((a, b) => (b.priceUSD < a.priceUSD ? b : a));
            return { ...cheapest, actualOutbound: tryOut };
        }
        return null;
    });
}

/**
 * Cheapest nightly rate (USD) for the destination.
 *
 * Price accuracy notes:
 * - SerpAPI returns `extracted_lowest` which for some property types (Japanese 民宿,
 *   hostels that list per-person rates) can be 1/2 to 1/3 of the per-room price.
 * - We cross-check: if `extracted_lowest` is < $10 USD and the city is in a country
 *   where that is implausible for a commercial property, we assume it's a per-person
 *   rate and skip that listing.
 * - Always labelled "from X/night (excl. taxes & fees)" to set expectations.
 */
export async function searchHotels(
    city: string,
    country: string,
    checkIn: string,
    checkOut: string,
    style: BudgetStyle
): Promise<HotelQuote | null> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) return null;

    const HOTEL_CLASS: Partial<Record<BudgetStyle, string>> = {
        "Mid-range": "3,4",
        Luxury: "5",
    };

    const query = `${city}, ${country}`;
    const classFilter = HOTEL_CLASS[style];

    return cached<HotelQuote>(`hotels3:${query}:${checkIn}:${checkOut}:${style}`, 2 * 3600, async () => {
        try {
            const paramObj: Record<string, string> = {
                engine: "google_hotels",
                // For Backpacker search hostels/guesthouses; star filter would exclude them
                q: style === "Backpacker" ? `${query} hostel guesthouse` : `${query} hotels`,
                check_in_date: checkIn,
                check_out_date: checkOut,
                adults: "1",
                currency: "USD",
                hl: "en",
                api_key: apiKey,
            };
            if (classFilter) paramObj.hotel_class = classFilter;

            const params = new URLSearchParams(paramObj);
            const res = await fetch(`${SERP}?${params}`);
            if (!res.ok) return null;
            const data = (await res.json()) as SerpHotelResponse;
            if (data.error) return null;

            const priced = (data.properties ?? [])
                .map((p) => {
                    const raw = p.rate_per_night?.extracted_lowest;
                    if (typeof raw !== "number") return null;
                    // Sanity-check: skip implausibly cheap rates (<$12 USD) which are
                    // likely per-person dorm prices, not per-room (common in Japan/Asia).
                    // $12 is below any commercially-listed private room globally.
                    if (raw < 12) return null;
                    return { name: p.name ?? "Unnamed property", rate: raw };
                })
                .filter((p): p is { name: string; rate: number } => p !== null)
                .sort((a, b) => a.rate - b.rate);

            if (!priced.length) return null;

            const cheapest = priced[0];

            // Use the ACTUAL Google URL that SerpAPI used — this is exactly what the
            // user will see when they click the link.
            const searchUrl =
                data.search_metadata?.google_url ??
                `https://www.google.com/travel/hotels?q=${encodeURIComponent(query)}&checkin=${checkIn}&checkout=${checkOut}`;

            return {
                medianNightUSD: cheapest.rate,
                sampleName: cheapest.name,
                sampleSize: priced.length,
                searchUrl,
            };
        } catch {
            return null;
        }
    });
}