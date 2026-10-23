import { z } from "zod";
import { BUDGET_STYLES, DISPLAY_CURRENCIES, TRANSPORT_MODES } from "./types";
import { todayUTC } from "./dates";

const cityField = z.string().min(1, "Required").max(100).transform((s) => s.trim());

/**
 * Pinned coordinates from the disambiguation picker. When present, geocoding is skipped.
 * Every field is bounded: this data reaches cache keys, third-party queries and the LLM prompt.
 */
const pinnedCity = z.object({
    name:        z.string().min(1).max(100),
    admin1:      z.string().max(100).nullable().optional(),
    country:     z.string().min(1).max(100),
    countryCode: z.string().length(2),
    lat:         z.number().min(-90).max(90),
    lng:         z.number().min(-180).max(180),
    timezone:    z.string().max(64),
}).optional();

export const PlanRequest = z.object({
    originCity:    cityField,
    originCountry: cityField,
    destCity:      cityField,
    destCountry:   cityField,
    // Pre-confirmed coordinates from the city picker (optional)
    originPin:     pinnedCity,
    destPin:       pinnedCity,
    startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
        .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date")
        .refine((d) => d >= todayUTC(), "Start date is in the past"),
    nights:          z.coerce.number().int().min(1).max(14),
    travelers:       z.coerce.number().int().min(1).max(6).default(1),
    style:           z.enum(BUDGET_STYLES),
    mode:            z.enum(TRANSPORT_MODES),
    displayCurrency: z.enum(DISPLAY_CURRENCIES),
});
export type PlanRequest = z.infer<typeof PlanRequest>;