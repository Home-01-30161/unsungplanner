import type { Budget, BudgetLine, BudgetStyle, CityInfo, DisplayCurrency, FlightQuote, HotelQuote, TransportMode } from "./types";

/**
 * USD per-person daily estimates. These are global midpoints — the AI writer
 * will note they are rough estimates and advise checking locally.
 */
const DAILY_USD: Record<BudgetStyle, { food: number; localTransport: number; activities: number }> = {
    Backpacker:  { food: 15,  localTransport: 5,  activities: 10  },
    "Mid-range": { food: 40,  localTransport: 15, activities: 30  },
    Luxury:      { food: 120, localTransport: 50, activities: 100 }
};

const CAR_RENTAL_PER_DAY_USD = 55; // rough global estimate
const KM_PER_LITER = 10;           // conservative urban driving
const FALLBACK_FUEL_USD_PER_LITER = 1.5; // global average-ish

export interface BudgetInput {
    originCity: string;
    destCity: string;
    origin: CityInfo;
    destination: CityInfo;
    mode: TransportMode;
    style: BudgetStyle;
    nights: number;
    travelers: number;
    requestedOutbound: string; // the date the user originally requested
    flight: FlightQuote | null;
    hotel: HotelQuote | null;
    drivingKm: number | null;
    fuelPricePerLiter: number | null;
    fxRate: number | null;
    displayCurrency: DisplayCurrency;
}

/** Pure arithmetic. The LLM never touches these numbers. Missing data stays null instead of becoming a guess. */
export function buildBudget(i: BudgetInput): Budget {
    const days = i.nights + 1;
    const lines: BudgetLine[] = [];
    const sameCity = i.originCity.toLowerCase() === i.destCity.toLowerCase();
    const daily = DAILY_USD[i.style];

    if (!sameCity) {
        if (i.mode === "fly") {
            const f = i.flight;
            const dateNote = f && f.actualOutbound !== i.requestedOutbound
                ? ` — closest price found on ${f.actualOutbound}`
                : "";
            lines.push({
                id: "transport",
                label: "Round-trip flight",
                amountUSD: f?.priceUSD ?? null,
                source: "live",
                url: f?.searchUrl,
                note: f
                    ? `${f.fromAirport} → ${f.toAirport}${f.via ? ` (via ${f.via})` : ""}, ${f.airline}, ${i.travelers} adult${i.travelers > 1 ? "s" : ""}${dateNote}`
                    : i.destination.airports.length
                        ? "No fare found ±3 days. Check Google Flights."
                        : `${i.destination.name} has no airport codes on file. Try driving.`
            });
        } else if (i.mode === "drive") {
            const fuelPrice = i.fuelPricePerLiter ?? FALLBACK_FUEL_USD_PER_LITER;
            lines.push({
                id: "car",
                label: "Rental car",
                amountUSD: CAR_RENTAL_PER_DAY_USD * days,
                source: "estimate",
                note: `${days} days at ~$${CAR_RENTAL_PER_DAY_USD}/day (global estimate)`
            });
            lines.push({
                id: "fuel",
                label: "Fuel (round trip)",
                amountUSD: i.drivingKm == null
                    ? null
                    : Math.round(((i.drivingKm * 2) / KM_PER_LITER) * fuelPrice),
                source: i.fuelPricePerLiter ? "research" : "estimate",
                note: i.drivingKm == null
                    ? "Route distance unavailable (routing service down)."
                    : `${i.drivingKm * 2} km at ${fuelPrice.toFixed(2)}/L (${i.fuelPricePerLiter ? "from web research, unverified" : "global estimate"}). Tolls not included.`
            });
        } else {
            // train — no pre-loaded fares; flag as missing
            lines.push({
                id: "transport",
                label: "Round-trip train",
                amountUSD: null,
                source: "estimate",
                note: "No pre-loaded train fares for this route. Check the national rail operator."
            });
        }
    }

    lines.push({
        id: "hotel",
        label: `Accommodation (${i.nights} night${i.nights === 1 ? "" : "s"})`,
        amountUSD: i.hotel ? i.hotel.medianNightUSD * i.nights : null,
        source: "live",
        url: i.hotel?.searchUrl,
        note: i.hotel
            ? `${i.hotel.sampleName} — $${i.hotel.medianNightUSD}/night (${i.travelers > 1 ? `${i.travelers} guests, ` : ""}cheapest of ${i.hotel.sampleSize} listings)`
            : "No live hotel rates found."
    });
    lines.push({
        id: "food",
        label: "Food",
        amountUSD: daily.food * days * i.travelers,
        source: "estimate",
        note: i.travelers > 1 ? `~$${daily.food}/day per person (${i.travelers} travellers)` : `~$${daily.food}/day (rough global estimate)`
    });
    if (i.mode !== "drive" || sameCity) {
        lines.push({
            id: "local",
            label: "Local transport",
            amountUSD: daily.localTransport * days * i.travelers,
            source: "estimate",
            note: i.travelers > 1 ? `~$${daily.localTransport}/day per person (${i.travelers} travellers)` : `~$${daily.localTransport}/day`
        });
    }
    lines.push({
        id: "activities",
        label: "Activities & entry fees",
        amountUSD: daily.activities * days * i.travelers,
        source: "estimate",
        note: i.travelers > 1 ? `~$${daily.activities}/day per person (${i.travelers} travellers)` : `~$${daily.activities}/day`
    });

    const totalKnownUSD = lines.reduce((sum, l) => sum + (l.amountUSD ?? 0), 0);
    const missing = lines.filter((l) => l.amountUSD == null).map((l) => l.label);
    return { lines, totalKnownUSD, missing, complete: missing.length === 0, fxRate: i.fxRate, displayCurrency: i.displayCurrency, travelers: i.travelers };
}