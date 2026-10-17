import destinations from "@/data/destinations.json";

export const BUDGET_STYLES = ["Backpacker", "Mid-range", "Luxury"] as const;
export const TRANSPORT_MODES = ["fly", "drive", "train"] as const;
export const DISPLAY_CURRENCIES = ["THB", "USD", "EUR", "GBP", "AUD"] as const;

export type BudgetStyle = (typeof BUDGET_STYLES)[number];
export type TransportMode = (typeof TRANSPORT_MODES)[number];
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export type Destination = {
    name: string;
    region: "north" | "central" | "east" | "andaman" | "gulf";
    lat: number;
    lng: number;
    airports: string[];
    island: boolean;
};

export const DESTINATIONS = destinations as Record<string, Destination>;
export const DESTINATION_IDS = Object.keys(DESTINATIONS) as [string, ...string[]];

export type FlightQuote = { priceTHB: number; airline: string };
export type HotelQuote = { medianNightTHB: number; sampleName: string; sampleSize: number };
export type WeatherSummary = { maxTempC: number; avgRainChance: number; days: number };

export type BudgetLine = {
    id: string;
    label: string;
    amountTHB: number | null; // null = no data, never a guess
    source: "live" | "estimate" | "research";
    note?: string;
};

export type Budget = {
    lines: BudgetLine[];
    totalKnownTHB: number;
    missing: string[];
    complete: boolean;
    fxRate: number | null; // THB -> display currency
    displayCurrency: DisplayCurrency;
};