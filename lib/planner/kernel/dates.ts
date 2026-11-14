// Local calendar arithmetic for the planning kernel. Dates are student-local `YYYY-MM-DD` keys and times are integer minutes after local midnight, so
// nothing here depends on a time zone database or Intl: the kernel produces identical results on V8 and Hermes. Converting a local minute to an instant
// is the server's job (lib/planner/studio/time.ts), and the device never needs it.
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (value: number) => String(value).padStart(2, "0");

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  return fromUtc(toUtc(value)) === value;
}
export function toUtc(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}
export function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export const addDays = (date: string, days: number) => fromUtc(toUtc(date) + days * DAY_MS);
/** Whole days from `b` to `a` (a − b). */
export const diffDays = (a: string, b: string) => Math.round((toUtc(a) - toUtc(b)) / DAY_MS);
/** Sunday is 0, matching `User.restDays`. */
export const weekdayOf = (date: string) => new Date(toUtc(date)).getUTCDay();
export const dateRange = (start: string, days: number) => Array.from({ length: Math.max(0, days) }, (_, index) => addDays(start, index));
export const minDate = (a: string, b: string) => (a <= b ? a : b);
export const maxDate = (a: string, b: string) => (a >= b ? a : b);

/** "Thu 27 Nov". */
export function dayLabel(date: string): string {
  return `${WEEKDAYS[weekdayOf(date)]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}
export const weekdayName = (weekday: number, long = false) => (long ? WEEKDAYS_LONG : WEEKDAYS)[((weekday % 7) + 7) % 7];
/** "09:30". */
export function clockLabel(minute: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minute)));
  return `${pad(Math.floor(m / 60) % 25)}:${pad(m % 60)}`;
}
/** "11 h 40 m", "45 m", "2 h". Never negative. */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest} m`;
  return rest ? `${h} h ${rest} m` : `${h} h`;
}
/** Rounds to the 5-minute grid the kernel works on. */
export const round5 = (minutes: number) => Math.max(0, Math.round(minutes / 5) * 5);
export const ceil5 = (minutes: number) => Math.max(0, Math.ceil(minutes / 5) * 5);
export const floor5 = (minutes: number) => Math.max(0, Math.floor(minutes / 5) * 5);

/** Monday of the week containing `date`. */
export const weekStart = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

/**
 * Where a session the student moves lands. Their placement wins over every rule of the plan (daily and subject caps, rest days, study hours,
 * commitments, other sessions, topic order): only the clock bounds it, so a time already past moves to the next five minutes from now, and a session
 * never runs past midnight (with no room left today, it goes to the same time tomorrow). The device and the server both use this.
 */
export function studentLanding(date: string, start: number, length: number, today: string, nowMinute: number): { date: string; start: number } {
  const span = Math.min(Math.max(5, length), 1440);
  const clamp = (minute: number) => Math.max(0, Math.min(1440 - span, Math.round(minute / 5) * 5));
  let day = isDateKey(date) && date >= today ? date : today;
  let at = clamp(start);
  if (day === today) {
    at = Math.max(at, Math.ceil(nowMinute / 5) * 5);
    if (at + span > 1440) { day = addDays(today, 1); at = clamp(start); }
  }
  return { date: day, start: at };
}
