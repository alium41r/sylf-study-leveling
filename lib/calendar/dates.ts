import { TimezoneService } from "@/lib/timezone-service";
import type { CalendarEvent } from "./contracts";

/** Civil date arithmetic deliberately never uses the device's timezone. */
export function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
export function dateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
export function weekStart(date: string): string {
  return addDays(date, -new Date(`${date}T12:00:00Z`).getUTCDay());
}
export function monthDates(date: string): string[] {
  const first = `${date.slice(0, 7)}-01`;
  const last = new Date(`${first}T12:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const end = addDays(weekStart(last.toISOString().slice(0, 10)), 6);
  const days: string[] = [];
  for (let day = weekStart(first); day <= end; day = addDays(day, 1))
    days.push(day);
  return days;
}
export function shiftMonth(date: string, amount: number): string {
  const day = Number(date.slice(8));
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + amount);
  const last = new Date(value);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  value.setUTCDate(Math.min(day, last.getUTCDate()));
  return value.toISOString().slice(0, 10);
}

/** Resolve a wall-clock minute against IANA rules. Reject DST gaps; choose the
 * earlier instant for a repeated minute, consistently on every device. */
export function localTimeToISO(
  date: string,
  time: string,
  timezone: string
): string {
  if (
    !/^\d{2}:\d{2}$/.test(time) ||
    Number(time.slice(0, 2)) > 23 ||
    Number(time.slice(3)) > 59
  )
    throw new Error("Choose a valid time.");
  const wall = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const sample = new Date(wall + delta * 3600000);
    const localDate = TimezoneService.getUserLocalDate(timezone, sample);
    const localTime = TimezoneService.getUserLocalTime(timezone, sample);
    offsets.add(Date.parse(`${localDate}T${localTime}:00Z`) - sample.getTime());
  }
  const candidates = [...offsets]
    .map((offset) => new Date(wall - offset))
    .filter(
      (value) =>
        TimezoneService.getUserLocalDate(timezone, value) === date &&
        TimezoneService.getUserLocalTime(timezone, value) === time
    )
    .sort((a, b) => a.getTime() - b.getTime());
  if (!candidates.length)
    throw new Error(
      "This time does not exist because the clocks change. Choose another time."
    );
  return candidates[0].toISOString();
}
export function eventsOnDate(
  events: CalendarEvent[],
  date: string,
  timezone: string
): CalendarEvent[] {
  return events
    .filter((event) => {
      if (event.allDay) return event.startDate <= date && event.endDate > date;
      if (!event.startsAt || !event.endsAt) return false;
      const start = TimezoneService.getUserLocalDate(
        timezone,
        new Date(event.startsAt)
      );
      const end = TimezoneService.getUserLocalDate(
        timezone,
        new Date(Date.parse(event.endsAt) - 1)
      );
      return start <= date && end >= date;
    })
    .sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        (a.startsAt || a.startDate).localeCompare(b.startsAt || b.startDate)
    );
}
export function eventTime(event: CalendarEvent, timezone: string): string {
  if (event.allDay) return "All day";
  const sameDay =
    TimezoneService.getUserLocalDate(timezone, new Date(event.startsAt!)) ===
    TimezoneService.getUserLocalDate(timezone, new Date(event.endsAt!));
  const folded =
    sameDay &&
    TimezoneService.getUserLocalTime(timezone, new Date(event.endsAt!)) <=
      TimezoneService.getUserLocalTime(timezone, new Date(event.startsAt!));
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      ...(folded ? { timeZoneName: "shortOffset" as const } : {}),
    }).format(new Date(value));
  const startDate = TimezoneService.getUserLocalDate(
    timezone,
    new Date(event.startsAt!)
  );
  const endDate = TimezoneService.getUserLocalDate(
    timezone,
    new Date(event.endsAt!)
  );
  return `${format(event.startsAt!)} – ${startDate !== endDate ? dateLabel(endDate, { month: "short", day: "numeric" }) + ", " : ""}${format(event.endsAt!)}`;
}
