import { addDays, daysBetween, todayUTC } from "../dates";
import type { CityInfo, WeatherSummary } from "../types";

const FORECAST_LIMIT_DAYS = 15; // Open-Meteo forecasts reach ~16 days ahead

/** Real forecast when the trip is within range, otherwise null. */
export async function getForecast(dest: CityInfo, startDate: string, endDate: string): Promise<WeatherSummary | null> {
    const today = todayUTC();
    if (daysBetween(today, startDate) > FORECAST_LIMIT_DAYS || endDate < today) return null;

    const start = startDate < today ? today : startDate;
    const end = daysBetween(today, endDate) > FORECAST_LIMIT_DAYS ? addDays(today, FORECAST_LIMIT_DAYS) : endDate;

    // Use the city's own timezone for the weather API
    const tz = dest.timezone ? encodeURIComponent(dest.timezone) : "UTC";
    const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${dest.lat}&longitude=${dest.lng}` +
        `&daily=temperature_2m_max,precipitation_probability_max&timezone=${tz}&start_date=${start}&end_date=${end}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = (await res.json()) as {
            daily?: { temperature_2m_max?: number[]; precipitation_probability_max?: (number | null)[] };
        };
        const temps = data.daily?.temperature_2m_max ?? [];
        const rain = (data.daily?.precipitation_probability_max ?? []).filter((n): n is number => typeof n === "number");
        if (!temps.length) return null;
        return {
            maxTempC: Math.max(...temps),
            avgRainChance: rain.length ? Math.round(rain.reduce((a, b) => a + b, 0) / rain.length) : 0,
            days: temps.length
        };
    } catch {
        return null;
    }
}

/** Generic climate note for when no forecast is available yet. */
export function seasonNote(lat: number, startDate: string): string {
    const month = Number(startDate.slice(5, 7));
    const northernHemisphere = lat >= 0;

    // Map month to season in the relevant hemisphere
    const summerMonths = northernHemisphere ? [6, 7, 8] : [12, 1, 2];
    const winterMonths = northernHemisphere ? [12, 1, 2] : [6, 7, 8];

    if (summerMonths.includes(month)) return "Typically summer: warm to hot; check local weather forecasts.";
    if (winterMonths.includes(month)) return "Typically winter: cooler temperatures; pack layers.";
    return "Shoulder season: generally pleasant but variable; check local forecasts closer to your trip.";
}