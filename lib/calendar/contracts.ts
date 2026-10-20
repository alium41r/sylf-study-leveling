import { z } from "zod";
import { TimezoneService } from "@/lib/timezone-service";
import { inkV2Schema } from "./ink";
import { GOAL_COLOR_TOKENS } from "@/lib/goal-theme";
import { recurrenceSchema, recurrenceDates } from "./recurrence";

export const calendarColors = GOAL_COLOR_TOKENS;
export function validDateKey(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "2000-01-01" &&
    value <= "2100-12-31" &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export const dateKeySchema = z
  .string()
  .refine(validDateKey, "Choose a valid date between 2000 and 2100.");
export const noteDocumentSchema = z.discriminatedUnion("version", [
  z.object({ version: z.literal(1), text: z.string().max(50000) }).strict(),
  inkV2Schema,
]);
export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give your event a title.").max(180),
    description: z.string().max(10000),
    color: z.enum(calendarColors),
    category: z
      .enum(["personal", "work", "learning", "health", "time-block"])
      .optional(),
    recurrence: recurrenceSchema.nullable().optional(),
    reminders: z.array(z.number().int().min(0).max(40320)).max(5).optional(),
    allDay: z.boolean(),
    startDate: dateKeySchema,
    endDate: dateKeySchema,
    startsAt: z.iso.datetime().nullable(),
    endsAt: z.iso.datetime().nullable(),
    timezone: z
      .string()
      .refine(
        (value) => TimezoneService.validateTimezone(value),
        "Invalid timezone."
      ),
  })
  .strict()
  .superRefine((event, ctx) => {
    if (
      event.reminders &&
      new Set(event.reminders).size !== event.reminders.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose different reminder times.",
        path: ["reminders"],
      });
    if (event.recurrence) {
      const rule = event.recurrence;
      if (
        (rule.until &&
          (!validDateKey(rule.until) || rule.until < event.startDate)) ||
        Date.parse(event.endDate) - Date.parse(event.startDate) > 366 * 86400000
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Check the series end date. Recurring events can span up to one year.",
          path: ["recurrence"],
        });
      if (
        rule.frequency === "weekly" &&
        !rule.weekdays?.includes(
          new Date(`${event.startDate}T12:00:00Z`).getUTCDay()
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Include the start date’s weekday in the repeat schedule.",
          path: ["recurrence"],
        });
      if (
        rule.count &&
        recurrenceDates(event.startDate, rule, event.startDate, "2101-01-01")
          .length < rule.count
      )
        ctx.addIssue({
          code: "custom",
          message: "This series extends beyond 2100. Choose fewer occurrences.",
          path: ["recurrence"],
        });
    }
    if (event.allDay) {
      if (
        event.endDate <= event.startDate ||
        event.startsAt !== null ||
        event.endsAt !== null
      )
        ctx.addIssue({
          code: "custom",
          message:
            "All-day events need an exclusive end date after their start.",
          path: ["endDate"],
        });
    } else if (
      !event.startsAt ||
      !event.endsAt ||
      Date.parse(event.endsAt) <= Date.parse(event.startsAt)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "End time must be after start time.",
        path: ["endsAt"],
      });
    } else if (
      TimezoneService.getUserLocalDate(
        event.timezone,
        new Date(event.startsAt)
      ) !== event.startDate ||
      TimezoneService.getUserLocalDate(
        event.timezone,
        new Date(event.endsAt)
      ) !== event.endDate
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Event dates must match their timezone.",
        path: ["startDate"],
      });
    }
  });
export const noteInputSchema = z
  .object({
    dateKey: dateKeySchema,
    title: z.string().trim().max(180),
    document: noteDocumentSchema,
  })
  .strict()
  .superRefine((note, ctx) => {
    if (note.document.version !== 2) return;
    for (const stroke of note.document.ink.strokes) {
      if (
        note.document.mode === "annotation" &&
        (!stroke.anchor || stroke.anchor.key.slice(0, 10) !== note.dateKey)
      )
        ctx.addIssue({
          code: "custom",
          message: "Calendar marks must stay anchored to their owning date.",
        });
      if (note.document.mode === "note" && (stroke.anchor || stroke.endAnchor))
        ctx.addIssue({
          code: "custom",
          message: "Notebook strokes use page coordinates.",
        });
    }
  });
export type EventInput = z.infer<typeof eventInputSchema>;
export type NoteInput = z.infer<typeof noteInputSchema>;
export type CalendarEvent = EventInput & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Original civil date identifies a virtual occurrence even after moving it. */
  occurrenceDate?: string;
  lastMutationId?: string | null;
  shared?: {
    calendarId: string;
    name: string;
    role: "OWNER" | "EDITOR" | "VIEWER";
    revision: number;
  };
  external?: {
    calendarId: string;
    calendarName: string;
    provider: "google" | "microsoft" | "ics";
    writable: boolean;
    seriesId?: string;
    recurring: boolean;
    originalStart?: string;
    busy: boolean;
    meeting: boolean;
    visible?: boolean;
    planning?: boolean;
    etag?: string;
    unsupportedRecurrence?: boolean;
  };
};
export type CalendarNote = NoteInput & {
  preview?: boolean;
  hasHandwriting?: boolean;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export interface PersonalCalendarData {
  sharedCount?:number;
  events: CalendarEvent[];
  notes: CalendarNote[];
  externalCoverage?: {
    complete: boolean;
    warnings: string[];
    connected?: number;
  };
}

export const externalTargetSchema = z
  .object({
    calendarId: z.uuid(),
    scope: z.enum(["event", "occurrence", "series"]),
    etag: z.string().max(1000).optional(),
  })
  .strict();
const identity = { id: z.uuid(), revision: z.number().int().positive() };
export const calendarWriteSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("event"),
      ...identity,
      data: eventInputSchema,
      external: externalTargetSchema.optional(),
      sharedCalendarId: z.uuid().optional(),
      occurrenceDate: dateKeySchema.optional(),
      mutationId: z.uuid().optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal("note"), ...identity, data: noteInputSchema })
    .strict(),
]);
export const calendarDeleteSchema = z
  .object({
    kind: z.enum(["event", "note"]),
    external: externalTargetSchema.optional(),
    sharedCalendarId: z.uuid().optional(),
    ...identity,
    occurrenceDate: dateKeySchema.optional(),
    mutationId: z.uuid().optional(),
  })
  .strict();
