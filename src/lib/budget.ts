import costs from "@/data/cost.json";
import type { Budget, BudgetLine, BudgetStyle, Destination, DisplayCurrency, FlightQuote, HotelQuote, TransportMode } from "./types";

export interface BudgetInput {
    originId: string;
    destinationId: string;
    destination: Destination;
    mode: TransportMode;
    style: BudgetStyle;
    nights: number;
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
    const sameCity = i.originId === i.destinationId;

    if (!sameCity) {
        if (i.mode === "fly") {
            lines.push({
                id: "transport",
                label: "Round-trip flight",
                amountTHB: i.flight?.priceTHB ?? null,
                source: "live",
                note: i.flight
                    ? `Cheapest found (${i.flight.airline}), 1 adult`
                    : i.destination.airports.length
                        ? "No live fare found. Check Google Flights."
                        : `${i.destination.name} has no commercial airport in this planner. Try driving.`
            });
        } else if (i.mode === "drive") {
            const fuelPrice = i.fuelPricePerLiter ?? costs.driving.defaultFuelPricePerLiter;
            lines.push({
                id: "car",
                label: "Rental car",
                amountTHB: costs.rentals.carPerDay * days,
                source: "estimate",
                note: `${days} days at ${costs.rentals.carPerDay} THB/day`
            });
            lines.push({
                id: "fuel",
                label: "Fuel (round trip)",
                amountTHB: i.drivingKm == null ? null : Math.round(((i.drivingKm * 2) / costs.driving.kmPerLiter) * fuelPrice),
                source: i.fuelPricePerLiter ? "research" : "estimate",
                note:
                    i.drivingKm == null
                        ? "Route distance unavailable (island, or routing service down)."
                        : `${i.drivingKm * 2} km at ${fuelPrice} THB/L (${i.fuelPricePerLiter ? "from web research, unverified" : "default estimate"}). Tolls not included.`
            });
        } else {
            const key = [i.originId, i.destinationId].sort().join("|");
            const route = (costs.train.routes as Record<string, Record<string, number>>)[key];
            const fare = route ? (i.style === "Luxury" ? route.first_class_cabin : route.second_class_ac_sleeper) : null;
            lines.push({
                id: "transport",
                label: "Round-trip train",
                amountTHB: fare == null ? null : fare * 2,
                source: "estimate",
                note: fare == null ? "No train fare data for this route." : "Unverified fares. Confirm on the SRT booking site."
            });
        }
    }

    lines.push({
        id: "hotel",
        label: `Accommodation (${i.nights} night${i.nights === 1 ? "" : "s"})`,
        amountTHB: i.hotel ? i.hotel.medianNightTHB * i.nights : null,
        source: "live",
        note: i.hotel
            ? `Median of ${i.hotel.sampleSize} listings, ${i.hotel.medianNightTHB} THB/night (e.g. ${i.hotel.sampleName})`
            : "No live hotel rates found."
    });
    lines.push({ id: "food", label: "Food", amountTHB: costs.daily.food[i.style] * days, source: "estimate", note: `${costs.daily.food[i.style]} THB/day` });
    if (i.mode !== "drive" || sameCity) {
        lines.push({ id: "local", label: "Local transport", amountTHB: costs.daily.localTransport[i.style] * days, source: "estimate", note: `${costs.daily.localTransport[i.style]} THB/day` });
    }
    lines.push({ id: "activities", label: "Activities & entry fees", amountTHB: costs.daily.activities[i.style] * days, source: "estimate", note: `${costs.daily.activities[i.style]} THB/day` });

    const totalKnownTHB = lines.reduce((sum, l) => sum + (l.amountTHB ?? 0), 0);
    const missing = lines.filter((l) => l.amountTHB == null).map((l) => l.label);
    return { lines, totalKnownTHB, missing, complete: missing.length === 0, fxRate: i.fxRate, displayCurrency: i.displayCurrency };
}