export { type CityInfo } from "./connectors/geocode";
export { type ResearchSource } from "./connectors/research";

export const BUDGET_STYLES = ["Backpacker", "Mid-range", "Luxury"] as const;
export const TRANSPORT_MODES = ["fly", "drive", "train"] as const;
export const DISPLAY_CURRENCIES = ["USD", "EUR", "GBP", "AUD", "JPY", "THB", "SGD", "INR"] as const;

export type BudgetStyle = (typeof BUDGET_STYLES)[number];
export type TransportMode = (typeof TRANSPORT_MODES)[number];
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export type FlightQuote = {
    priceUSD: number;
    airline: string;
    fromAirport: string;   // IATA code actually used (first departure)
    toAirport: string;     // IATA code actually used (final arrival — last leg)
    via?: string;          // intermediate stop codes, e.g. "HKG" for BKK→HKG→LAX
    actualOutbound: string; // date that returned a price (may differ from requested)
    searchUrl?: string;    // Google Flights deep-link for this result
};
export type HotelQuote = { medianNightUSD: number; sampleName: string; sampleSize: number; searchUrl?: string };
export type WeatherSummary = { maxTempC: number; avgRainChance: number; days: number };

export type BudgetLine = {
    id: string;
    label: string;
    amountUSD: number | null; // null = no data, never a guess
    source: "live" | "estimate" | "research";
    note?: string;
    url?: string;  // citation link shown next to the price
};

export type Budget = {
    lines: BudgetLine[];
    totalKnownUSD: number;
    missing: string[];
    complete: boolean;
    fxRate: number | null; // USD -> display currency
    displayCurrency: DisplayCurrency;
};