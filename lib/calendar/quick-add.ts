import { addDays, localTimeToISO } from "./dates";
import { eventInputSchema, validDateKey, type EventInput } from "./contracts";
import type { Recurrence } from "./recurrence";

const weekdayNames = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
/** Deliberately small, deterministic grammar. Always returns a reviewable draft;
 * unrecognized words remain in the title and defaults are described explicitly. */
export function parseQuickEvent(
  input: string,
  today: string,
  selected: string,
  timezone: string
): { data: EventInput; hints: string[] } {
  let title = input.trim(),
    date = selected,
    hour: number | null = null,
    minute = 0,
    duration = 60;
  const hints: string[] = [];
  let recurrence: Recurrence | null = null;
  const repeat = title.match(
    /\bevery\s+(?:(\d+)\s+)?(day|week|month|year)s?\b|\bevery\s+(weekdays|(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s*(?:,|and)\s*(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))*)\b/i
  );
  if (repeat) {
    const list = repeat[3]?.toLowerCase();
    recurrence = {
      frequency: list
        ? "weekly"
        : (
            {
              day: "daily",
              week: "weekly",
              month: "monthly",
              year: "yearly",
            } as const
          )[repeat[2].toLowerCase() as "day"],
      interval: Number(repeat[1] || 1),
      until: null,
      count: null,
    };
    if (list) {
      recurrence.weekdays =
        list === "weekdays"
          ? [1, 2, 3, 4, 5]
          : weekdayNames.flatMap((name, index) =>
              list.includes(name) ? [index] : []
            );
      const day = new Date(today + "T12:00Z").getUTCDay();
      date = addDays(
        today,
        Math.min(...recurrence.weekdays.map((value) => (value - day + 7) % 7))
      );
    }
    title = title.replace(repeat[0], " ");
  }
  const civil = title.match(/\b(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/);
  const relative = title.match(/\b(today|tomorrow)\b/i);
  const named = title.match(
    /\b(?:on\s+)?(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
  );
  if (civil) {
    if (!validDateKey(civil[1]))
      throw new Error("Check the date in your event.");
    date = civil[1];
    title = title.replace(civil[0], " ");
  } else if (relative) {
    date = relative[1].toLowerCase() === "tomorrow" ? addDays(today, 1) : today;
    title = title.replace(relative[0], " ");
  } else if (named) {
    const day = new Date(today + "T12:00Z").getUTCDay(),
      target = weekdayNames.indexOf(named[2].toLowerCase());
    date = addDays(today, (target - day + 7) % 7 || (named[1] ? 7 : 0));
    title = title.replace(named[0], " ");
  } else if (!repeat) hints.push(`Date defaults to ${date}.`);
  const time = title.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (time) {
    hour = Number(time[1]);
    minute = Number(time[2] || 0);
    if (minute > 59 || (time[3] ? hour < 1 || hour > 12 : hour > 23))
      throw new Error("Check the time in your event.");
    if (time[3]) hour = (hour % 12) + (time[3].toLowerCase() === "pm" ? 12 : 0);
    else if (!time[2] && hour <= 12)
      hints.push(
        `“${time[1]}” is interpreted as ${hour < 12 ? "AM" : "noon"}; change it below if needed.`
      );
    title = title.replace(time[0], " ");
  }
  const length = title.match(
    /\bfor\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/i
  );
  if (length) {
    duration = Number(length[1]) * (/^(h)/i.test(length[2]) ? 60 : 1);
    title = title.replace(length[0], " ");
  }
  const allDay = hour === null || /\ball[ -]day\b/i.test(title);
  title = title
    .replace(/\ball[ -]day\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (allDay) hints.push("All-day event; add a time below if needed.");
  else
    hints.push(
      `${duration} minutes. Times use ${timezone.replaceAll("_", " ")}.`
    );
  if (/\b(next week|next month|in \d+ days?|at|every)\b/i.test(title))
    hints.push(
      "Some scheduling words were not understood. Check the date, time, and repeat rule below."
    );
  if (recurrence?.frequency === "weekly" && !recurrence.weekdays)
    recurrence.weekdays = [new Date(date + "T12:00Z").getUTCDay()];
  const startsAt = allDay
    ? null
    : localTimeToISO(
        date,
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        timezone
      );
  const wallEnd = new Date(
    Date.parse(`${date}T00:00:00Z`) +
      ((hour || 0) * 60 + minute + duration) * 60000
  );
  const endDate = allDay
    ? addDays(date, 1)
    : wallEnd.toISOString().slice(0, 10);
  const endsAt = allDay
    ? null
    : localTimeToISO(endDate, wallEnd.toISOString().slice(11, 16), timezone);
  return {
    data: eventInputSchema.parse({
      title,
      description: "",
      color: "VIOLET",
      category: "personal",
      recurrence,
      reminders: [],
      allDay,
      startDate: date,
      endDate,
      startsAt,
      endsAt,
      timezone,
    }),
    hints,
  };
}
