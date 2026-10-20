import { z } from "zod";
import { addDays, localTimeToISO, weekStart } from "./dates";
import { TimezoneService } from "@/lib/timezone-service";
import type { CalendarEvent, EventInput } from "./contracts";

export const recurrenceSchema = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().min(1).max(99),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    monthly: z.enum(["date", "weekday"]).optional(),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    count: z.number().int().min(1).max(10000).nullable(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (rule.until && rule.count)
      ctx.addIssue({
        code: "custom",
        message: "Choose an end date or an occurrence count.",
      });
    if (
      rule.frequency === "weekly" &&
      (!rule.weekdays?.length ||
        new Set(rule.weekdays).size !== rule.weekdays.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose unique weekdays for the series.",
      });
  });
export type Recurrence = z.infer<typeof recurrenceSchema>;
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const weekday = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();

/** Civil candidates, never UTC+24h recurrence. Jump to the visible period for
 * open/until rules; count rules enumerate at most 10,000 civil occurrences. */
export function recurrenceDates(
  origin: string,
  rule: Recurrence,
  from: string,
  to: string
): string[] {
  const result: string[] = [];
  const limit =
    rule.until && rule.until < addDays(to, -1) ? addDays(rule.until, 1) : to;
  if (limit <= origin || limit <= from) return result;
  const start = new Date(origin + "T12:00:00Z");
  const monthDiff =
    (Number(from.slice(0, 4)) - start.getUTCFullYear()) * 12 +
    Number(from.slice(5, 7)) -
    1 -
    start.getUTCMonth();
  const distance =
    rule.frequency === "daily"
      ? daysBetween(origin, from)
      : rule.frequency === "weekly"
        ? Math.floor(daysBetween(weekStart(origin), from) / 7)
        : rule.frequency === "monthly"
          ? monthDiff
          : Number(from.slice(0, 4)) - start.getUTCFullYear();
  let period =
    rule.count && !["daily", "weekly"].includes(rule.frequency)
      ? 0
      : Math.max(0, Math.floor(distance / rule.interval) - 1);
  let ordinal = 0;
  if (rule.count && period > 0) {
    if (rule.frequency === "daily") ordinal = period;
    if (rule.frequency === "weekly") {
      const weekdays = rule.weekdays || [weekday(origin)];
      ordinal =
        weekdays.filter((day) => day >= weekday(origin)).length +
        (period - 1) * weekdays.length;
    }
    if (ordinal >= rule.count) return result;
  }
  // The supported civil-date domain itself bounds the loop (101 years).
  for (; period < 37000; period++) {
    const step = period * rule.interval;
    let candidates: string[];
    let boundary: string;
    if (rule.frequency === "daily") {
      boundary = addDays(origin, step);
      candidates = [boundary];
    } else if (rule.frequency === "weekly") {
      boundary = addDays(weekStart(origin), step * 7);
      candidates = [...(rule.weekdays || [weekday(origin)])]
        .sort((a, b) => a - b)
        .map((day) => addDays(boundary, day));
    } else {
      const base = new Date(start);
      base.setUTCDate(1);
      if (rule.frequency === "monthly")
        base.setUTCMonth(start.getUTCMonth() + step);
      else base.setUTCFullYear(start.getUTCFullYear() + step);
      boundary = base.toISOString().slice(0, 10);
      const month = base.getUTCMonth();
      if (rule.frequency === "monthly" && rule.monthly === "weekday") {
        const nextMonth = new Date(base);
        nextMonth.setUTCMonth(month + 1);
        nextMonth.setUTCDate(0);
        const last =
          start.getUTCDate() + 7 >
          new Date(
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)
          ).getUTCDate();
        const n = last
          ? nextMonth.getUTCDate() -
            ((nextMonth.getUTCDay() - start.getUTCDay() + 7) % 7)
          : 1 +
            ((start.getUTCDay() - base.getUTCDay() + 7) % 7) +
            Math.floor((start.getUTCDate() - 1) / 7) * 7;
        base.setUTCDate(n);
      } else base.setUTCDate(start.getUTCDate());
      candidates =
        base.getUTCMonth() === month ? [base.toISOString().slice(0, 10)] : [];
    }
    if (boundary >= limit || boundary > "2100-12-31") break;
    for (const date of candidates) {
      if (date < origin || date >= limit) continue;
      ordinal++;
      if (rule.count && ordinal > rule.count) return result;
      if (date >= from) result.push(date);
    }
  }
  return result;
}

/** DST gaps omit that occurrence; repeated hours consistently choose the earlier
 * instant. Preserve the seed's exact instant, including a later repeated hour. */
export function occurrenceInput(
  seed: EventInput,
  date: string
): EventInput | null {
  if (date === seed.startDate) return { ...seed };
  const span = daysBetween(seed.startDate, seed.endDate);
  const endDate = addDays(date, span);
  if (seed.allDay) return { ...seed, startDate: date, endDate };
  try {
    const startsAt = localTimeToISO(
      date,
      TimezoneService.getUserLocalTime(seed.timezone, new Date(seed.startsAt!)),
      seed.timezone
    );
    const endsAt = localTimeToISO(
      endDate,
      TimezoneService.getUserLocalTime(seed.timezone, new Date(seed.endsAt!)),
      seed.timezone
    );
    if (Date.parse(endsAt) <= Date.parse(startsAt)) return null;
    return { ...seed, startDate: date, endDate, startsAt, endsAt };
  } catch {
    return null;
  }
}
export interface EventException {
  originalDate: string;
  cancelled: boolean;
  data: EventInput | null;
}
export function expandEvent(
  seed: CalendarEvent,
  exceptions: EventException[],
  from: string,
  to: string,
  timezone: string
): CalendarEvent[] {
  const dates = seed.recurrence
    ? recurrenceDates(
        seed.startDate,
        seed.recurrence,
        addDays(
          from,
          -Math.max(2, daysBetween(seed.startDate, seed.endDate) + 2)
        ),
        addDays(to, 2)
      )
    : [seed.startDate];
  const projected = new Map<string, CalendarEvent>();
  for (const date of dates) {
    const data = occurrenceInput(seed, date);
    if (data)
      projected.set(date, {
        ...seed,
        ...data,
        occurrenceDate: seed.recurrence ? date : undefined,
      });
  }
  for (const exception of exceptions) {
    if (
      !seed.recurrence ||
      (!dates.includes(exception.originalDate) &&
        !recurrenceDates(
          seed.startDate,
          seed.recurrence,
          exception.originalDate,
          addDays(exception.originalDate, 1)
        ).includes(exception.originalDate))
    )
      continue;
    projected.delete(exception.originalDate);
    if (!exception.cancelled && exception.data)
      projected.set(exception.originalDate, {
        ...seed,
        ...exception.data,
        recurrence: seed.recurrence,
        occurrenceDate: exception.originalDate,
      });
  }
  const min = TimezoneService.getStartOfLocalDateUTC(timezone, from).getTime();
  const max = TimezoneService.getStartOfLocalDateUTC(timezone, to).getTime();
  return [...projected.values()].filter((event) =>
    event.allDay
      ? event.startDate < to && event.endDate > from
      : Date.parse(event.startsAt!) < max && Date.parse(event.endsAt!) > min
  );
}

export function recurrenceThrough(input: EventInput): string | null {
  if (!input.recurrence) return null;
  if (!input.recurrence.count)
    return input.recurrence.until
      ? addDays(
          input.recurrence.until,
          Math.max(1, daysBetween(input.startDate, input.endDate)) + 2
        )
      : "2101-12-31";
  const dates = recurrenceDates(
    input.startDate,
    input.recurrence,
    input.startDate,
    "2101-01-01"
  );
  return addDays(
    dates.at(-1) || input.startDate,
    Math.max(1, daysBetween(input.startDate, input.endDate)) + 2
  );
}

export function recurrenceLabel(rule: Recurrence | null | undefined): string {
  if (!rule) return "Does not repeat";
  const unit = {
    daily: "day",
    weekly: "week",
    monthly: "month",
    yearly: "year",
  }[rule.frequency];
  return `Every ${rule.interval === 1 ? unit : `${rule.interval} ${unit}s`}${
    rule.frequency === "weekly"
      ? ` · ${[...(rule.weekdays || [])]
          .sort()
          .map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day])
          .join(", ")}`
      : ""
  }${rule.until ? ` · until ${rule.until}` : rule.count ? ` · ${rule.count} times` : ""}`;
}
