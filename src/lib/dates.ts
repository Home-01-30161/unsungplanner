/** All dates are ISO "YYYY-MM-DD" strings; arithmetic is done in UTC so time zones can't shift them. */

export function addDays(iso: string, n: number): string {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
    const [y1, m1, d1] = fromIso.split("-").map(Number);
    const [y2, m2, d2] = toIso.split("-").map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Every date from start to end, inclusive. */
export function eachDate(startIso: string, endIso: string): string[] {
    const out: string[] = [];
    for (let d = startIso; d <= endIso; d = addDays(d, 1)) out.push(d);
    return out;
}

/** Today's date in Thailand (Asia/Bangkok), not the server's time zone. */
export function todayInBangkok(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}