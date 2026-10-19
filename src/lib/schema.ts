import { z } from "zod";
import { BUDGET_STYLES, DISPLAY_CURRENCIES, TRANSPORT_MODES } from "./types";
import { todayUTC } from "./dates";

const cityField = z.string().min(1, "Required").max(100).transform((s) => s.trim());

export const PlanRequest = z.object({
    originCity: cityField,
    originCountry: cityField,
    destCity: cityField,
    destCountry: cityField,
    startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
        .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date")
        .refine((d) => d >= todayUTC(), "Start date is in the past"),
    nights: z.coerce.number().int().min(1).max(14),
    style: z.enum(BUDGET_STYLES),
    mode: z.enum(TRANSPORT_MODES),
    displayCurrency: z.enum(DISPLAY_CURRENCIES)
});
export type PlanRequest = z.infer<typeof PlanRequest>;