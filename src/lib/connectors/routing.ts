import { cached } from "../cache";

/** Driving distance in km via OpenRouteService (HeiGIT). Null when unavailable. */
export async function getDrivingDistanceKm(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
): Promise<number | null> {
    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) return null;

    const key = `route:${from.lat},${from.lng}:${to.lat},${to.lng}`;
    return cached<number>(key, 30 * 86_400, async () => {
        try {
            const url =
                `https://api.heigit.org/openrouteservice/v2/directions/driving-car` +
                `?api_key=${apiKey}&start=${from.lng},${from.lat}&end=${to.lng},${to.lat}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = (await res.json()) as {
                features?: { properties?: { summary?: { distance?: number } } }[];
            };
            const meters = data.features?.[0]?.properties?.summary?.distance;
            return typeof meters === "number" ? Math.round(meters / 1000) : null;
        } catch {
            return null;
        }
    });
}