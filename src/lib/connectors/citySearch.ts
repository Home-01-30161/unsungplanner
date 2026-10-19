import citiesRaw from "../../data/cities.json";

// Tuple format: [cityAscii, adminName, country, iso2, lat, lng, pop, capital]
type CityTuple = [string, string, string, string, number, number, number, string];

const CITIES = citiesRaw as CityTuple[];

export interface CitySearchResult {
    name: string;
    admin1: string | null;
    country: string;
    countryCode: string;
    lat: number;
    lng: number;
    timezone: string;
    population: number;
    label: string;
}

// Approximate timezone map for common countries, or fallback to auto
const COUNTRY_TZ: Record<string, string> = {
    "JP": "Asia/Tokyo",
    "TH": "Asia/Bangkok",
    "VN": "Asia/Ho_Chi_Minh",
    "SG": "Asia/Singapore",
    "MY": "Asia/Kuala_Lumpur",
    "KR": "Asia/Seoul",
    "TW": "Asia/Taipei",
    "HK": "Asia/Hong_Kong",
    "PH": "Asia/Manila",
    "ID": "Asia/Jakarta",
    "GB": "Europe/London",
    "FR": "Europe/Paris",
    "DE": "Europe/Berlin",
    "IT": "Europe/Rome",
    "ES": "Europe/Madrid",
    "NL": "Europe/Amsterdam",
    "CH": "Europe/Zurich",
    "AT": "Europe/Vienna",
};

const REGION_ALIASES: Record<string, string> = {
    // Germany
    "bayern": "bavaria",
    "bavaria": "bavaria",
    "baden-wurttemberg": "baden-wurttemberg",
    "baden-wuerttemberg": "baden-wurttemberg",
    "hessen": "hesse",
    "hesse": "hesse",
    "nordrhein-westfalen": "north rhine-westphalia",
    "north rhine-westphalia": "north rhine-westphalia",
    "niedersachsen": "lower saxony",
    "lower saxony": "lower saxony",
    "sachsen": "saxony",
    "saxony": "saxony",
    // Italy
    "toscana": "tuscany",
    "tuscany": "tuscany",
    "lombardia": "lombardy",
    "lombardy": "lombardy",
    // Spain
    "andalucia": "andalusia",
    "andalusia": "andalusia",
    "catalunya": "catalonia",
    "catalonia": "catalonia",
};

function stripDiacritics(s: string): string {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function searchCitiesLocal(query: string, countryQuery: string = "", max: number = 8): CitySearchResult[] {
    const q = stripDiacritics(query.trim());
    const cQ = stripDiacritics(countryQuery.trim());
    if (q.length < 2) return [];

    const targetAdmin = REGION_ALIASES[q] ?? q;
    const matches: (CitySearchResult & { score: number })[] = [];

    for (const c of CITIES) {
        const [city, admin, country, iso2, lat, lng, pop, capital] = c;

        // Filter by country if specified
        if (cQ) {
            const matchCountry =
                stripDiacritics(country).includes(cQ) ||
                iso2.toLowerCase() === cQ;
            if (!matchCountry) continue;
        }

        const cityClean = stripDiacritics(city);
        const adminClean = stripDiacritics(admin);

        // Check matching criteria
        const exactCity = cityClean === q;
        const cityStartsWith = cityClean.startsWith(q);
        const cityIncludes = cityClean.includes(q);
        const adminExact = adminClean === targetAdmin || adminClean === q;
        const adminStartsWith = adminClean.startsWith(targetAdmin) || adminClean.startsWith(q);
        const adminIncludes = adminClean.includes(targetAdmin) || adminClean.includes(q);

        if (exactCity || cityStartsWith || cityIncludes || adminExact || adminStartsWith || adminIncludes) {
            let score = 0;

            if (exactCity) {
                score += 2000;
            } else if (cityStartsWith) {
                score += 1000;
            } else if (cityIncludes) {
                score += 200;
            }

            if (adminExact) {
                score += 1200;
                // Administrative capital of the region/prefecture gets highest priority
                if (capital === "admin" || capital === "primary") score += 500;
            } else if (adminStartsWith) {
                score += 400;
            } else if (adminIncludes) {
                score += 50;
            }

            // Capital bonuses
            if (capital === "primary") score += 300;
            if (capital === "admin") score += 150;

            // Population weighting (major metropolises rank high on partial match)
            score += Math.log10(pop + 1) * 80;

            const tz = COUNTRY_TZ[iso2.toUpperCase()] ?? "auto";
            const isRedundantAdmin = !admin || adminClean === cityClean;
            const label = isRedundantAdmin
                ? `${city}, ${country}`
                : `${city}, ${admin}, ${country}`;

            matches.push({
                name: city,
                admin1: admin || null,
                country,
                countryCode: iso2.toUpperCase(),
                lat,
                lng,
                timezone: tz,
                population: pop,
                label,
                score,
            });
        }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, max);
}
