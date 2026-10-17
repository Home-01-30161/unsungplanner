import { eachDate } from "./dates";

export interface CalendarEvent {
    date: string;
    name: string;
    /** Alcohol SALES are restricted (drinking in private is not). Hotels, airports and some licensed tourist venues are exempt. */
    alcoholSalesBan: boolean;
    /** Expect crowds and higher prices for transport and rooms. */
    peak: boolean;
    /** Banks and government offices closed. */
    publicHoliday: boolean;
    note?: string;
}

/**
 * MAINTENANCE: lunar (Buddhist) dates move every year. Update LUNAR_DATES each
 * year, and bump LUNAR_DATA_VALID_THROUGH. Trips past that date get a warning
 * instead of silently missing a ban. Verify against an official Thai source.
 * Election days also trigger alcohol-sale bans; those are announced ad hoc and
 * can't be listed here.
 */
export const LUNAR_DATA_VALID_THROUGH = "2027-06-30";

const LUNAR_DATES: Record<string, { name: string; alcoholSalesBan: boolean; peak?: boolean; note?: string }> = {
    "2026-10-26": { name: "Ok Phansa (end of Buddhist Lent)", alcoholSalesBan: true },
    "2026-11-24": { name: "Loy Krathong", alcoholSalesBan: false, peak: true, note: "Chiang Mai's Yi Peng lantern festival runs around the same dates, so rooms there book out." },
    "2027-02-21": { name: "Makha Bucha", alcoholSalesBan: true },
    "2027-05-20": { name: "Visakha Bucha", alcoholSalesBan: true },
    // Already past as of Oct 2026, kept so the file is a complete 2026 reference:
    "2026-03-03": { name: "Makha Bucha", alcoholSalesBan: true },
    "2026-05-31": { name: "Visakha Bucha", alcoholSalesBan: true },
    "2026-07-29": { name: "Asahna Bucha", alcoholSalesBan: true },
    "2026-07-30": { name: "Khao Phansa (start of Buddhist Lent)", alcoholSalesBan: true }
};

/** Fixed-date holidays, repeat every year. Key is "MM-DD". */
const FIXED: Record<string, { name: string; peak?: boolean; publicHoliday?: boolean; note?: string }> = {
    "01-01": { name: "New Year's Day", peak: true, publicHoliday: true },
    "04-06": { name: "Chakri Memorial Day", publicHoliday: true },
    "04-13": { name: "Songkran", peak: true, publicHoliday: true, note: "Water festival; intercity transport is packed and some shops close." },
    "04-14": { name: "Songkran", peak: true, publicHoliday: true },
    "04-15": { name: "Songkran", peak: true, publicHoliday: true },
    "05-01": { name: "Labour Day", publicHoliday: true },
    "05-04": { name: "Coronation Day", publicHoliday: true },
    "07-28": { name: "King's Birthday", publicHoliday: true },
    "08-12": { name: "Mother's Day", publicHoliday: true },
    "10-13": { name: "King Bhumibol Memorial Day", publicHoliday: true },
    "10-23": { name: "Chulalongkorn Day", publicHoliday: true },
    "12-05": { name: "Father's Day", publicHoliday: true },
    "12-10": { name: "Constitution Day", publicHoliday: true },
    "12-31": { name: "New Year's Eve", peak: true, publicHoliday: true }
};

export function eventsOn(date: string): CalendarEvent[] {
    const out: CalendarEvent[] = [];
    const fixed = FIXED[date.slice(5)];
    if (fixed) {
        out.push({ date, name: fixed.name, alcoholSalesBan: false, peak: !!fixed.peak, publicHoliday: !!fixed.publicHoliday, note: fixed.note });
    }
    const lunar = LUNAR_DATES[date];
    if (lunar) {
        out.push({ date, name: lunar.name, alcoholSalesBan: lunar.alcoholSalesBan, peak: !!lunar.peak, publicHoliday: lunar.alcoholSalesBan, note: lunar.note });
    }
    return out;
}

export interface TripCalendar {
    events: CalendarEvent[];
    warnings: string[];
}

/** Checks EVERY day of the trip, not just the first. */
export function checkTripCalendar(startDate: string, endDate: string): TripCalendar {
    const events = eachDate(startDate, endDate).flatMap(eventsOn);
    const warnings: string[] = [];

    for (const e of events) {
        if (e.alcoholSalesBan) {
            warnings.push(`${e.date}: ${e.name}. Shops and most restaurants can't sell alcohol for about 24 hours. Hotels, airports and some licensed tourist venues are exempt. Drinking is not banned.`);
        } else if (e.peak) {
            warnings.push(`${e.date}: ${e.name}. Peak travel period: book transport and rooms early.${e.note ? " " + e.note : ""}`);
        } else if (e.publicHoliday) {
            warnings.push(`${e.date}: ${e.name} (public holiday; banks and government offices closed).`);
        }
    }

    if (endDate > LUNAR_DATA_VALID_THROUGH) {
        warnings.push(`Buddhist holiday and alcohol-ban dates are only loaded through ${LUNAR_DATA_VALID_THROUGH}. Check dates after that yourself.`);
    }
    return { events, warnings };
}