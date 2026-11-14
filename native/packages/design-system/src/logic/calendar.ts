// Calendar math for the date picker, with no renderer, so it can be tested. A date is a civil day written `YYYY-MM-DD`, the way the server and the
// planner hold dates. Days are read at noon, so a daylight-saving change never moves one across midnight.

export interface MonthRef { year: number; month: number }

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const fromDateKey = (key: string) => new Date(`${key}T12:00:00`);

/** A real calendar day: `2026-02-30` is not one. */
export function isDateKey(text: string | null | undefined): text is string {
  const match = text ? PATTERN.exec(text) : null;
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

export const todayKey = () => toDateKey(new Date());

export function shiftDays(key: string, amount: number) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

/** The same day of another month, or that month's last day when it is shorter: 31 January plus one month is 28 or 29 February. */
export function shiftMonths(key: string, amount: number) {
  const date = fromDateKey(key);
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  return toDateKey(target);
}

export const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0, 12).getDate();
export const monthOf = (key: string): MonthRef => { const date = fromDateKey(key); return { year: date.getFullYear(), month: date.getMonth() }; };
export const shiftMonth = ({ year, month }: MonthRef, amount: number): MonthRef => { const date = new Date(year, month + amount, 1, 12); return { year: date.getFullYear(), month: date.getMonth() }; };
export const firstOfMonth = ({ year, month }: MonthRef) => toDateKey(new Date(year, month, 1, 12));
export const lastOfMonth = ({ year, month }: MonthRef) => toDateKey(new Date(year, month, daysInMonth(year, month), 12));

/** 0 for the first day of the week. Weeks start on Monday, as Plan's calendar does. */
export const weekIndex = (key: string, weekStart = 1) => (fromDateKey(key).getDay() - weekStart + 7) % 7;

/** Always six rows of seven, so the picker keeps one height from month to month and never jumps under the pointer. */
export function monthGrid({ year, month }: MonthRef, weekStart = 1): (string | null)[][] {
  const lead = weekIndex(firstOfMonth({ year, month }), weekStart);
  const length = daysInMonth(year, month);
  const cells = Array.from({ length: 42 }, (_, index) => { const day = index - lead + 1; return day >= 1 && day <= length ? toDateKey(new Date(year, month, day, 12)) : null; });
  return Array.from({ length: 6 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

export const inRange = (key: string, min?: string | null, max?: string | null) => (!min || key >= min) && (!max || key <= max);
export const clampDay = (key: string, min?: string | null, max?: string | null) => (min && key < min ? min : max && key > max ? max : key);

/** Whether any day of this month can be chosen. */
export const monthOpen = (shown: MonthRef, min?: string | null, max?: string | null) => (!min || lastOfMonth(shown) >= min) && (!max || firstOfMonth(shown) <= max);

/** Weekday names in the device's language, starting on the week's first day. 1 January 2024 was a Monday. */
export function weekdayNames(style: "short" | "narrow" = "short", weekStart = 1) {
  return Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 1 + ((index + weekStart - 1 + 7) % 7), 12).toLocaleDateString([], { weekday: style }));
}

export const monthTitle = ({ year, month }: MonthRef) => new Date(year, month, 1, 12).toLocaleDateString([], { month: "long", year: "numeric" });

/** "Tue, 1 December 2026" for a field; the full weekday for what a screen reader says. */
export function formatDateKey(key: string, style: "field" | "spoken" = "field") {
  return fromDateKey(key).toLocaleDateString([], style === "field" ? { weekday: "short", day: "numeric", month: "long", year: "numeric" } : { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
