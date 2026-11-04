// Plan's small rules, with no renderer, so they can be tested. Dates are the student's own civil days, as strings, the way the server holds them.
import type { DayQuest, MonthDay, PlanEvent } from "@sylf/backend";

export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const addDays = (day: string, amount: number) => { const next = new Date(`${day}T12:00:00`); next.setDate(next.getDate() + amount); return dateKey(next); };
export const weekday = (day: string) => new Date(`${day}T12:00:00`).getDay();
export const dayTitle = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
export const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric" });
export const clock = (time: string) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Monday first. Each row is seven dates or nulls, and the month is complete. */
export function monthRows(year: number, month: number): (string | null)[][] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const length = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + length) / 7) * 7 }, (_, index) => { const day = index - lead + 1; return day >= 1 && day <= length ? dateKey(new Date(year, month, day)) : null; });
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

export const weekOf = (day: string) => { const monday = addDays(day, -((weekday(day) + 6) % 7)); return Array.from({ length: 7 }, (_, index) => addDays(monday, index)); };

/** An all-day end date is exclusive, as the Calendar contract defines it. */
export function eventsOn(events: PlanEvent[], day: string) {
  return events
    .filter((event) => (event.allDay ? event.startDate <= day && day < event.endDate : event.startsAt !== null && dateKey(new Date(event.startsAt)) === day))
    .sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
}

export const questMinutes = (quest: Pick<DayQuest, "plannedMinutes" | "requiredMinutes">) => quest.plannedMinutes ?? quest.requiredMinutes ?? null;
export const questDone = (quest: Pick<DayQuest, "status">) => quest.status === "COMPLETED";
export const questFailed = (quest: Pick<DayQuest, "status">) => quest.status === "FAILED";

/** A quest whose day has passed and is still open. It is offered a new day rather than a tick: finishing it late is a different thing on the server. */
export const questOverdue = (quest: Pick<DayQuest, "status">, day: string, today: string) => day < today && !questDone(quest) && !questFailed(quest);

/** How full a day is, for the month's quiet marks. At most three. */
export function dayDensity(events: PlanEvent[], day: MonthDay | undefined, date: string) {
  return Math.min(3, eventsOn(events, date).length + (day?.questsCount ?? 0));
}

/** `MATHS`, `FURTHERM`: letters and digits, and unique against what exists. The server takes the code as given. */
export function subjectCode(name: string, taken: readonly (string | null | undefined)[]) {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "SUBJECT";
  const used = new Set(taken.map((code) => code?.toUpperCase()));
  if (!used.has(slug)) return slug;
  for (let counter = 2; ; counter++) { const next = `${slug.slice(0, 6)}${counter}`; if (!used.has(next)) return next; }
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const validTime = (text: string) => TIME.test(text.trim());
/** A local date and time on this device, as the instant the server stores. */
export const instantOf = (day: string, time: string) => { const match = TIME.exec(time.trim())!; return new Date(`${day}T${match[1].padStart(2, "0")}:${match[2]}:00`).toISOString(); };
export const timeOf = (instant: string) => { const date = new Date(instant); return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; };
export const validDay = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T12:00:00`));
export const deviceTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };
