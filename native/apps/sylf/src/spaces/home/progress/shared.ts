// Small pure helpers Progress's views share. Pure so they can be tested without a screen.
import type { StudySummary } from "@sylf/backend";

export interface DayBar { date: string; minutes: number; today: boolean; weekday: number }

const DAY = 86_400_000;
const at = (date: string) => new Date(`${date}T12:00:00Z`).getTime();

/** The last `count` days ending today, oldest first. Days the server did not list were days of no study. */
export function lastDays(summary: StudySummary, count: number): DayBar[] {
  const minutes = new Map(summary.dailyStudy.map((day) => [day.date, day.minutes]));
  const end = at(summary.todayDate);
  return Array.from({ length: count }, (_, index) => {
    const when = new Date(end - (count - 1 - index) * DAY);
    const date = when.toISOString().slice(0, 10);
    return { date, minutes: Math.round(minutes.get(date) ?? 0), today: date === summary.todayDate, weekday: when.getUTCDay() };
  });
}

/** What a student set as a week: the daily target on each day that is not a rest day. */
export const weekTarget = (dailyGoalMinutes: number, restDays: number[]) => dailyGoalMinutes * (7 - new Set(restDays).size);

/** Monday to today, the week the Overview measures. */
export function thisWeek(summary: StudySummary): DayBar[] {
  const days = lastDays(summary, 7);
  const sinceMonday = (new Date(at(summary.todayDate)).getUTCDay() + 6) % 7;
  return days.slice(days.length - 1 - sinceMonday);
}

/** A bar as a share of the target, never of the longest day, so one minute looks like one minute. Clamped to the bar's height. */
export const barHeight = (minutes: number, target: number, height: number) => (minutes <= 0 ? 0 : Math.min(height, Math.max(2, Math.round((minutes / Math.max(1, target)) * height))));

export type Band = "Morning" | "Afternoon" | "Evening" | "Night";
export const BANDS: Band[] = ["Morning", "Afternoon", "Evening", "Night"];
export const bandOf = (hour: number): Band => (hour >= 5 && hour < 12 ? "Morning" : hour >= 12 && hour < 17 ? "Afternoon" : hour >= 17 && hour < 22 ? "Evening" : "Night");

/** Study time by time of day, from sessions the server listed, in the device's own hours. */
export function rhythmByBand(sessions: { startedAt: string; durationSeconds: number }[]): Record<Band, number> {
  const totals: Record<Band, number> = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
  for (const session of sessions) {
    const time = new Date(session.startedAt);
    if (!Number.isNaN(time.getTime())) totals[bandOf(time.getHours())] += session.durationSeconds / 60;
  }
  return totals;
}

/** "3rd", "22nd". */
export function ordinal(value: number) {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${["th", "st", "nd", "rd"][value % 10 > 3 ? 0 : value % 10]}`;
}

/** You in context: two above, you, two below, then the top. A person outside the list is told their place and shown the top alone. */
export function contextWindow<T extends { isCurrentUser: boolean }>(entries: T[], top = 5): { top: T[]; around: T[] } {
  const index = entries.findIndex((entry) => entry.isCurrentUser);
  const head = entries.slice(0, top);
  if (index < 0 || index < top) return { top: head, around: [] };
  return { top: head, around: entries.slice(Math.max(top, index - 2), index + 3) };
}

/** A line of attribute copy that speaks of HP is left out. Native shows none (ADR 0017). */
export const mentionsHp = (text: string | undefined) => /\bHP\b|hit points?/i.test(text ?? "");
