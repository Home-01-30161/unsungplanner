import { addDays, daysBetween, todayInBangkok } from "../dates";
import type { Destination, WeatherSummary } from "../types";

const FORECAST_LIMIT_DAYS = 15; // Open-Meteo forecasts reach ~16 days ahead

/** Real forecast when the trip is within range, otherwise null. */
export async function getForecast(dest: Destination, startDate: string, endDate: string): Promise<WeatherSummary | null> {
    const today = todayInBangkok();
    if (daysBetween(today, startDate) > FORECAST_LIMIT_DAYS || endDate < today) return null;

    const start = startDate < today ? today : startDate;
    const end = daysBetween(today, endDate) > FORECAST_LIMIT_DAYS ? addDays(today, FORECAST_LIMIT_DAYS) : endDate;

    const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${dest.lat}&longitude=${dest.lng}` +
        `&daily=temperature_2m_max,precipitation_probability_max&timezone=Asia%2FBangkok&start_date=${start}&end_date=${end}`;
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

/** Typical-season note for when no forecast exists yet. General climate pattern, not a forecast. */
export function seasonNote(region: Destination["region"], startDate: string): string {
    const month = Number(startDate.slice(5, 7));
    const hot = month >= 3 && month <= 5;
    const gulfWet = month >= 10 || month <= 1; // Gulf coast peaks Oct to Dec
    const wet = region === "gulf" ? gulfWet : month >= 5 && month <= 10;

    if (wet) return "Typically the rainy season here: expect showers, and some boat trips may be cancelled.";
    if (hot) return "Typically the hot season: very high daytime temperatures, so plan outdoor activity early or late.";
    return region === "north"
        ? "Typically the dry, cooler season: pleasant days, chilly mornings in the hills."
        : "Typically the dry season: the most comfortable weather of the year.";
}