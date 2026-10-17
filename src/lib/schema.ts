import { z } from "zod";
import { BUDGET_STYLES, DESTINATION_IDS, DISPLAY_CURRENCIES, TRANSPORT_MODES } from "./types";
import { todayInBangkok } from "./dates";

export const PlanRequest = z.object({
    originId: z.enum(DESTINATION_IDS),
    destinationId: z.enum(DESTINATION_IDS),
    startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date")
        .refine((d) => d >= todayInBangkok(), "Start date is in the past"),
    nights: z.coerce.number().int().min(1).max(14),
    style: z.enum(BUDGET_STYLES),
    mode: z.enum(TRANSPORT_MODES),
    displayCurrency: z.enum(DISPLAY_CURRENCIES)
});
export type PlanRequest = z.infer<typeof PlanRequest>;