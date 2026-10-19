import { cached } from "../cache";
import { searchCitiesLocal } from "./citySearch";
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
 * Prefecture / region → canonical city aliases.
 * When a user types a prefecture or region name instead of a city, we silently
 * resolve it to the region's main city before geocoding. This prevents
 * Open-Meteo returning a tiny village that shares a name with the region.
 */
const REGION_TO_CITY: Record<string, string> = {
    // Japan — all 47 prefectures mapped to their capital/main city
    "aichi": "Nagoya", "akita": "Akita", "aomori": "Aomori",
    "chiba": "Chiba", "ehime": "Matsuyama", "fukui": "Fukui",
    "fukuoka": "Fukuoka", "fukushima": "Fukushima", "gifu": "Gifu",
    "gunma": "Maebashi", "hiroshima": "Hiroshima", "hokkaido": "Sapporo",
    "hyogo": "Kobe", "ibaraki": "Mito", "ishikawa": "Kanazawa",
    "iwate": "Morioka", "kagawa": "Takamatsu", "kagoshima": "Kagoshima",
    "kanagawa": "Yokohama", "kochi": "Kochi", "kumamoto": "Kumamoto",
    "kyoto": "Kyoto", "mie": "Tsu", "miyagi": "Sendai",
    "miyazaki": "Miyazaki", "nagano": "Nagano", "nagasaki": "Nagasaki",
    "nara": "Nara", "niigata": "Niigata", "oita": "Oita",
    "okayama": "Okayama", "okinawa": "Naha", "osaka": "Osaka",
    "saga": "Saga", "saitama": "Saitama", "shiga": "Otsu",
    "shimane": "Matsue", "shizuoka": "Shizuoka", "tochigi": "Utsunomiya",
    "tokushima": "Tokushima", "tokyo": "Tokyo", "tottori": "Tottori",
    "toyama": "Toyama", "wakayama": "Wakayama", "yamagata": "Yamagata",
    "yamaguchi": "Yamaguchi", "yamanashi": "Kofu",
    // Common German states
    "bayern": "Munich", "bavaria": "Munich",
    "baden-wurttemberg": "Stuttgart", "baden-wuerttemberg": "Stuttgart",
    "hessen": "Frankfurt", "hesse": "Frankfurt",
    "nordrhein-westfalen": "Cologne", "north rhine-westphalia": "Cologne",
    "sachsen": "Dresden", "saxony": "Dresden",
    "niedersachsen": "Hannover", "lower saxony": "Hannover",
    // Common Italian & Spanish regions
    "toscana": "Florence", "tuscany": "Florence",
    "lombardia": "Milan", "lombardy": "Milan",
    "andalucia": "Seville", "andalusia": "Seville",
    "catalunya": "Barcelona", "catalonia": "Barcelona",
    // Common US state → capital/main city
    "california": "Los Angeles", "new york state": "New York",
    "texas": "Houston", "florida": "Miami", "illinois": "Chicago",
    "washington state": "Seattle", "colorado": "Denver",
    // Common UK regions
    "scotland": "Edinburgh", "wales": "Cardiff", "northern ireland": "Belfast",
    // Common Australian states
    "new south wales": "Sydney", "victoria": "Melbourne",
    "queensland": "Brisbane", "western australia": "Perth",
};

/**
 * Resolves a city name + country name/code to a CityInfo.
 * Geocoding: Open-Meteo (free, no key required).
 * Airport codes: bundled city table → haversine scan of OurAirports JSON (3,244 airports, no key).
 */
export async function resolveCity(city: string, country: string): Promise<CityInfo | null> {
    // Transparently remap prefecture/region names to their main city
    const cityAlias = REGION_TO_CITY[city.trim().toLowerCase()];
    const effectiveCity = cityAlias ?? city;
    // Store the original user city for display purposes (used by hotel search via dest.name)
    const cacheKey = `geocode_v7:${city.toLowerCase()}:${country.toLowerCase()}`;
    return cached<CityInfo>(cacheKey, 30 * 86_400, async () => {
        // 1. Primary: Curated SimpleMaps dataset (50k verified cities, instant, zero noise)
        const localMatches = searchCitiesLocal(effectiveCity, country, 1);
        if (localMatches.length > 0) {
            const best = localMatches[0];
            const cityKey = best.name.trim().toLowerCase();
            const airports = CITY_AIRPORTS[cityKey] ?? nearestFromDb(best.lat, best.lng);
            return {
                name: best.name,
                country: best.country,
                countryCode: best.countryCode,
                lat: best.lat,
                lng: best.lng,
                timezone: best.timezone,
                airports,
            };
        }

        // 2. Fallback: Geocode via Open-Meteo for tiny villages
        const geoUrl =
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(effectiveCity)}` +
            `&count=10&language=en&format=json`;
        let geoData: { results?: GeoResult[] } | null = null;
        try {
            const r = await fetch(geoUrl, { signal: AbortSignal.timeout(8_000) });
            if (r.ok) geoData = (await r.json()) as { results?: GeoResult[] };
        } catch { /* fall through */ }

        if (!geoData?.results?.length) return null;

        // Pick best match:
        //  1. Country match (ISO code or name)
        //  2. Admin1 region contains the search term (e.g. "Aichi Prefecture" for query "Aichi")
        //     — strongly signals this is the right administrative area
        //  3. Population (biggest city wins)
        //  4. Original Open-Meteo relevance order
        const q = country.trim().toLowerCase();
        const cityQ = effectiveCity.trim().toLowerCase();
        const ranked = geoData.results
            .map((r, idx) => ({
                r,
                idx,
                countryMatch:
                    r.country_code.toLowerCase() === q || r.country.toLowerCase() === q ? 1 : 0,
                adminMatch:
                    (r.admin1?.toLowerCase().includes(cityQ) ||
                     r.admin1?.toLowerCase() === cityQ) ? 1 : 0,
                pop: r.population ?? 0,
            }))
            .sort((a, b) =>
                b.countryMatch - a.countryMatch ||
                b.adminMatch  - a.adminMatch   ||
                b.pop - a.pop ||
                a.idx - b.idx
            );

        const best = ranked[0].r;
        const cc = best.country_code.toUpperCase();

        // 2. Airports — fast-path table first, then haversine scan of bundled OurAirports data
        // Use effectiveCity (alias-resolved) for the fast-path lookup
        const cityKey = effectiveCity.trim().toLowerCase();
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

/**
 * Builds a CityInfo from a user-confirmed pin (from the disambiguation picker).
 * Skips Open-Meteo entirely — the user has already chosen the exact location.
 */
export function resolveCityFromPin(pin: {
    name: string;
    country: string;
    countryCode: string;
    lat: number;
    lng: number;
    timezone: string;
}): CityInfo {
    const cityKey = pin.name.trim().toLowerCase();
    const airports = CITY_AIRPORTS[cityKey] ?? nearestFromDb(pin.lat, pin.lng);
    return {
        name:        pin.name,
        country:     pin.country,
        countryCode: pin.countryCode,
        lat:         pin.lat,
        lng:         pin.lng,
        timezone:    pin.timezone,
        airports,
    };
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

