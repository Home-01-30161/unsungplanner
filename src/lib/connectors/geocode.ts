import { cached } from "../cache";
// Pre-built dataset from OurAirports (large + medium airports with scheduled service).
// Generated via scripts/fetch-airports.mjs — 3,244 airports worldwide, no API key needed.
// Format: [iata, lat, lng][]
import airportsRaw from "../../data/airports.json";

export interface CityInfo {
    name: string;
    country: string;
    countryCode: string; // ISO 3166-1 alpha-2
    lat: number;
    lng: number;
    timezone: string;
    airports: string[]; // IATA codes, may be empty
}

type GeoResult = {
    name: string;
    latitude: number;
    longitude: number;
    country: string;
    country_code: string;
    timezone: string;
    population?: number;
    admin1?: string;
};

// Compact airport records loaded from bundled JSON — instant, no network needed.
const AIRPORT_DB = airportsRaw as [string, number, number][];

/**
 * Bundled fast-path for major hub cities: skips the haversine scan entirely.
 * Key = lowercase city name.
 */
const CITY_AIRPORTS: Record<string, string[]> = {
    // Asia
    "bangkok":          ["BKK", "DMK"],
    "chiang mai":       ["CNX"],
    "chiang rai":       ["CEI"],
    "phuket":           ["HKT"],
    "koh samui":        ["USM"],
    "krabi":            ["KBV"],
    "hat yai":          ["HDY"],
    "tokyo":            ["NRT", "HND"],
    "osaka":            ["KIX", "ITM"],
    "nagoya":           ["NGO"],
    "sapporo":          ["CTS"],
    "fukuoka":          ["FUK"],
    "seoul":            ["ICN", "GMP"],
    "busan":            ["PUS"],
    "beijing":          ["PEK", "PKX"],
    "shanghai":         ["PVG", "SHA"],
    "guangzhou":        ["CAN"],
    "shenzhen":         ["SZX"],
    "chengdu":          ["CTU"],
    "hong kong":        ["HKG"],
    "taipei":           ["TPE", "TSA"],
    "singapore":        ["SIN"],
    "kuala lumpur":     ["KUL", "SZB"],
    "jakarta":          ["CGK", "HLP"],
    "bali":             ["DPS"],
    "manila":           ["MNL"],
    "ho chi minh":      ["SGN"],
    "saigon":           ["SGN"],
    "hanoi":            ["HAN"],
    "da nang":          ["DAD"],
    "phnom penh":       ["PNH"],
    "yangon":           ["RGN"],
    "kathmandu":        ["KTM"],
    "colombo":          ["CMB"],
    "delhi":            ["DEL"],
    "new delhi":        ["DEL"],
    "mumbai":           ["BOM"],
    "bangalore":        ["BLR"],
    "bengaluru":        ["BLR"],
    "chennai":          ["MAA"],
    "kolkata":          ["CCU"],
    "hyderabad":        ["HYD"],
    "dubai":            ["DXB", "DWC"],
    "abu dhabi":        ["AUH"],
    "doha":             ["DOH"],
    "riyadh":           ["RUH"],
    "istanbul":         ["IST", "SAW"],
    "tel aviv":         ["TLV"],
    "amman":            ["AMM"],
    // Europe
    "london":           ["LHR", "LGW", "STN", "LCY"],
    "manchester":       ["MAN"],
    "edinburgh":        ["EDI"],
    "dublin":           ["DUB"],
    "paris":            ["CDG", "ORY"],
    "amsterdam":        ["AMS"],
    "brussels":         ["BRU"],
    "frankfurt":        ["FRA"],
    "munich":           ["MUC"],
    "berlin":           ["BER"],
    "hamburg":          ["HAM"],
    "zurich":           ["ZRH"],
    "geneva":           ["GVA"],
    "vienna":           ["VIE"],
    "rome":             ["FCO", "CIA"],
    "milan":            ["MXP", "LIN"],
    "venice":           ["VCE"],
    "barcelona":        ["BCN"],
    "madrid":           ["MAD"],
    "lisbon":           ["LIS"],
    "porto":            ["OPO"],
    "athens":           ["ATH"],
    "warsaw":           ["WAW"],
    "prague":           ["PRG"],
    "budapest":         ["BUD"],
    "bucharest":        ["OTP"],
    "stockholm":        ["ARN"],
    "oslo":             ["OSL"],
    "copenhagen":       ["CPH"],
    "helsinki":         ["HEL"],
    "reykjavik":        ["KEF"],
    "moscow":           ["SVO", "DME"],
    "st. petersburg":   ["LED"],
    "kyiv":             ["KBP"],
    // Americas
    "new york":         ["JFK", "EWR", "LGA"],
    "los angeles":      ["LAX"],
    "chicago":          ["ORD", "MDW"],
    "miami":            ["MIA", "FLL"],
    "san francisco":    ["SFO"],
    "seattle":          ["SEA"],
    "dallas":           ["DFW", "DAL"],
    "houston":          ["IAH", "HOU"],
    "boston":           ["BOS"],
    "washington":       ["IAD", "DCA", "BWI"],
    "atlanta":          ["ATL"],
    "denver":           ["DEN"],
    "las vegas":        ["LAS"],
    "phoenix":          ["PHX"],
    "minneapolis":      ["MSP"],
    "detroit":          ["DTW"],
    "toronto":          ["YYZ"],
    "vancouver":        ["YVR"],
    "montreal":         ["YUL"],
    "mexico city":      ["MEX"],
    "cancun":           ["CUN"],
    "bogota":           ["BOG"],
    "lima":             ["LIM"],
    "santiago":         ["SCL"],
    "buenos aires":     ["EZE", "AEP"],
    "sao paulo":        ["GRU", "CGH"],
    "rio de janeiro":   ["GIG", "SDU"],
    // Africa & Oceania
    "cairo":            ["CAI"],
    "nairobi":          ["NBO"],
    "johannesburg":     ["JNB"],
    "cape town":        ["CPT"],
    "casablanca":       ["CMN"],
    "lagos":            ["LOS"],
    "addis ababa":      ["ADD"],
    "sydney":           ["SYD"],
    "melbourne":        ["MEL"],
    "brisbane":         ["BNE"],
    "perth":            ["PER"],
    "auckland":         ["AKL"],
};

/**
 * Resolves a city name + country name/code to a CityInfo.
 * Geocoding: Open-Meteo (free, no key required).
 * Airport codes: bundled city table → haversine scan of OurAirports JSON (3,244 airports, no key).
 */
export async function resolveCity(city: string, country: string): Promise<CityInfo | null> {
    const cacheKey = `geocode_v5:${city.toLowerCase()}:${country.toLowerCase()}`;
    return cached<CityInfo>(cacheKey, 30 * 86_400, async () => {
        // 1. Geocode via Open-Meteo
        const geoUrl =
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}` +
            `&count=10&language=en&format=json`;
        let geoData: { results?: GeoResult[] } | null = null;
        try {
            const r = await fetch(geoUrl, { signal: AbortSignal.timeout(8_000) });
            if (r.ok) geoData = (await r.json()) as { results?: GeoResult[] };
        } catch { /* fall through */ }

        if (!geoData?.results?.length) return null;

        // Pick best match:
        //  1. Prefer results whose country name or ISO code matches user input
        //  2. Break ties by population (biggest city wins — prevents e.g. a tiny
        //     Malaysian "Tokyo" beating the real Tokyo, Japan)
        //  3. Final tiebreaker: preserve Open-Meteo's own relevance order
        const q = country.trim().toLowerCase();
        const ranked = geoData.results
            .map((r, idx) => ({
                r,
                idx,
                countryMatch:
                    r.country_code.toLowerCase() === q || r.country.toLowerCase() === q ? 1 : 0,
                pop: r.population ?? 0,
            }))
            .sort((a, b) =>
                b.countryMatch - a.countryMatch ||
                b.pop - a.pop ||
                a.idx - b.idx
            );

        const best = ranked[0].r;
        const cc = best.country_code.toUpperCase();

        // 2. Airports — fast-path table first, then haversine scan of bundled OurAirports data
        const cityKey = city.trim().toLowerCase();
        const airports =
            CITY_AIRPORTS[cityKey] ??
            nearestFromDb(best.latitude, best.longitude);

        return {
            name: best.name,
            country: best.country,
            countryCode: cc,
            lat: best.latitude,
            lng: best.longitude,
            timezone: best.timezone,
            airports,
        };
    });
}

/**
 * Finds up to 3 commercial airports within 200 km of the given coordinates
 * using the bundled OurAirports dataset (3,244 airports, every country).
 * Pure in-memory — no network call, no API key.
 */
function nearestFromDb(lat: number, lng: number): string[] {
    return AIRPORT_DB
        .map(([iata, aLat, aLng]) => ({ iata, dist: haversineKm(lat, lng, aLat, aLng) }))
        .filter((a) => a.dist < 200)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3)
        .map((a) => a.iata);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(d: number) { return (d * Math.PI) / 180; }
