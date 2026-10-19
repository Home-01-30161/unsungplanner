import { cached } from "../cache";
import { eachDate } from "../dates";

export interface HolidayEvent {
    date: string;     // YYYY-MM-DD
    name: string;
    publicHoliday: boolean;
    peak: boolean;    // always false from Nager; callers may enrich
}

export interface TripCalendar {
    events: HolidayEvent[];
    warnings: string[];
}

type NagerHoliday = {
    date: string;
    name: string;
    types: string[];
    global: boolean;
};

/**
 * Fetches public holidays from Nager.Date (free, no key).
 * Returns all global Public-type holidays in the given year for the country.
 * Falls back to an empty array on network failure.
 */
async function fetchHolidaysForYear(countryCode: string, year: number): Promise<NagerHoliday[]> {
    const key = `nager:${countryCode.toUpperCase()}:${year}`;
    const result = await cached<NagerHoliday[]>(key, 7 * 86_400, async () => {
        try {
            const res = await fetch(
                `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode.toUpperCase()}`
            );
            if (!res.ok) return null;
            const data = (await res.json()) as NagerHoliday[];
            return Array.isArray(data) ? data : null;
        } catch {
            return null;
        }
    });
    return result ?? [];
}

/** Checks every day of the trip for public holidays in the destination country. */
export async function checkTripCalendar(
    startDate: string,
    endDate: string,
    countryCode: string
): Promise<TripCalendar> {
    const years = [...new Set(
        eachDate(startDate, endDate).map((d) => Number(d.slice(0, 4)))
    )];

    const allHolidays = (
        await Promise.all(years.map((y) => fetchHolidaysForYear(countryCode, y)))
    ).flat();

    // Index by date for O(1) lookup
    const byDate = new Map<string, NagerHoliday>();
    for (const h of allHolidays) {
        // Prefer global holidays; keep first seen per date
        if (!byDate.has(h.date) || h.global) byDate.set(h.date, h);
    }

    const tripDates = eachDate(startDate, endDate);
    const events: HolidayEvent[] = [];
    const warnings: string[] = [];

    for (const d of tripDates) {
        const h = byDate.get(d);
        if (!h) continue;
        const isPublic = h.types.includes("Public") || h.types.includes("Bank");
        if (!isPublic) continue;
        events.push({ date: d, name: h.name, publicHoliday: true, peak: false });
        warnings.push(`${d}: ${h.name} (public holiday — banks and some offices closed).`);
    }

    return { events, warnings };
}
