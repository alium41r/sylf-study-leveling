import { z } from "zod";
export const filterSchema = z
  .object({
    personal: z.boolean(),
    objectives: z.boolean(),
    study: z.boolean(),
    blocks: z.boolean(),
    notes: z.boolean(),
    annotations: z.boolean(),
    categories: z
      .array(z.enum(["personal", "work", "learning", "health"]))
      .max(4),
  })
  .strict();
export const preferencesSchema = z
  .object({
    timePlanning: z.boolean(),
    workload: z.boolean(),
    organization: z.boolean(),
    detailedEvents: z.boolean(),
    view: z.enum(["month", "week", "day"]),
    filters: filterSchema,
  })
  .strict();
export type CalendarPreferences = z.infer<typeof preferencesSchema>;
export const defaultCalendarPreferences: CalendarPreferences = {
  timePlanning: false,
  workload: false,
  organization: false,
  detailedEvents: false,
  view: "month",
  filters: {
    personal: true,
    objectives: true,
    study: true,
    blocks: true,
    notes: true,
    annotations: true,
    categories: ["personal", "work", "learning", "health"],
  },
};
export const preferenceWriteSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    patch: preferencesSchema.partial(),
  })
  .strict();
