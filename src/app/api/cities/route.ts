import { NextRequest } from "next/server";
import { searchCitiesLocal } from "@/lib/connectors/citySearch";

type GeoResult = {
    name: string;
    admin1?: string;
    admin2?: string;
    country: string;
    country_code: string;
    latitude: number;
    longitude: number;
    timezone: string;
    population?: number;
    feature_code?: string;
};

export async function GET(req: NextRequest) {
    const city    = req.nextUrl.searchParams.get("city")?.trim()    ?? "";
    const country = req.nextUrl.searchParams.get("country")?.trim() ?? "";

    if (city.length < 2) return Response.json([]);

    // 1. Primary: Curated SimpleMaps dataset (50,248 verified cities, instant <1ms, zero noise)
    const localResults = searchCitiesLocal(city, country, 6);
    if (localResults.length > 0) {
        return Response.json(localResults);
    }

    // 2. Fallback: Open-Meteo (for tiny villages not in the top 50,000 cities)
    try {
        const url =
            `https://geocoding-api.open-meteo.com/v1/search` +
            `?name=${encodeURIComponent(city)}&count=10&language=en&format=json`;
        const r = await fetch(url, { signal: AbortSignal.timeout(4_000) });
        if (!r.ok) return Response.json([]);
        const data = (await r.json()) as { results?: GeoResult[] };

        const q = country.toLowerCase();
        const results = (data.results ?? [])
            .filter((r) =>
                !q ||
                r.country_code.toLowerCase() === q ||
                r.country.toLowerCase().includes(q)
            )
            .slice(0, 6)
            .map((r) => ({
                name:        r.name,
                admin1:      r.admin1  ?? null,
                country:     r.country,
                countryCode: r.country_code.toUpperCase(),
                lat:         r.latitude,
                lng:         r.longitude,
                timezone:    r.timezone,
                population:  r.population ?? 0,
                label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
            }));

        return Response.json(results);
    } catch {
        return Response.json([]);
    }
}
