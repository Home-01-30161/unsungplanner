// Calls each live connector once and prints what came back.
// Run:  npx tsx --env-file=.env.local scripts/smoke.mts
import { resolveCity } from "../src/lib/connectors/geocode";
import { searchFlights, searchHotels } from "../src/lib/connectors/travelData";
import { researchDestination } from "../src/lib/connectors/research";
import { getForecast } from "../src/lib/connectors/weather";
import { getDrivingDistanceKm } from "../src/lib/connectors/routing";
import { getRateFromUSD } from "../src/lib/connectors/currency";
import { checkTripCalendar } from "../src/lib/connectors/holidays";
import { addDays, todayUTC } from "../src/lib/dates";

const start = addDays(todayUTC(), 30);
const end = addDays(start, 3);

const london = await resolveCity("London", "United Kingdom");
const tokyo  = await resolveCity("Tokyo",  "Japan");

const checks: [string, () => Promise<unknown>][] = [
    ["Geocode London, UK",            () => resolveCity("London", "United Kingdom")],
    ["Geocode Tokyo, Japan",          () => resolveCity("Tokyo", "Japan")],
    ["Frankfurter USD->EUR",          () => getRateFromUSD("EUR")],
    ["Open-Meteo forecast Tokyo",     () => tokyo ? getForecast(tokyo, todayUTC(), addDays(todayUTC(), 3)) : Promise.resolve("skipped: geocode failed")],
    ["ORS driving London",            () => london && tokyo ? getDrivingDistanceKm(london, tokyo) : Promise.resolve("skipped")],
    ["Nager holidays JP 2026",        () => checkTripCalendar(start, end, "JP")],
    ["SerpApi flights LHR->TYO",      () => london && tokyo ? searchFlights(london.airports, tokyo.airports, start, end) : Promise.resolve("skipped: no airports")],
    ["SerpApi hotels Tokyo",          () => searchHotels("Tokyo", "Japan", start, end, "Mid-range")],
    ["Tavily attractions Tokyo",      async () => (await researchDestination("Tokyo", "Japan"))?.notes.slice(0, 200)],
];

for (const [name, fn] of checks) {
    const result = await fn();
    console.log(`${result == null ? "FAIL (null)" : "ok  "}  ${name}:`, result ?? "");
}