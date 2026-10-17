// Calls each live connector once and prints what came back.
// Run:  npx tsx --env-file=.env.local scripts/smoke.mts
import { searchFlights, searchHotels } from "../src/lib/connectors/travelData";
import { researchDestination, researchFuelPrice } from "../src/lib/connectors/research";
import { getForecast } from "../src/lib/connectors/weather";
import { getDrivingDistanceKm } from "../src/lib/connectors/routing";
import { getRateFromTHB } from "../src/lib/connectors/currency";
import { addDays, todayInBangkok } from "../src/lib/dates";
import { DESTINATIONS } from "../src/lib/types";

const start = addDays(todayInBangkok(), 30);
const end = addDays(start, 3);
const bkk = DESTINATIONS["bangkok"], cnx = DESTINATIONS["chiang-mai"];

const checks: [string, () => Promise<unknown>][] = [
    ["Frankfurter THB->USD", () => getRateFromTHB("USD")],
    ["Open-Meteo forecast (next 3 days)", () => getForecast(cnx, todayInBangkok(), addDays(todayInBangkok(), 3))],
    ["OpenRouteService BKK->CNX km", () => getDrivingDistanceKm(bkk, cnx)],
    ["SerpApi flights BKK/DMK->CNX", () => searchFlights(bkk.airports, cnx.airports, start, end)],
    ["SerpApi hotels Chiang Mai", () => searchHotels("Chiang Mai", start, end, "Mid-range")],
    ["Tavily attractions", async () => (await researchDestination("Chiang Mai"))?.slice(0, 200)],
    ["Tavily fuel price", () => researchFuelPrice()]
];

for (const [name, fn] of checks) {
    const result = await fn();
    console.log(`${result == null ? "FAIL (null)" : "ok  "}  ${name}:`, result ?? "");
}