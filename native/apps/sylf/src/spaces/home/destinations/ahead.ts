// How a day is said on Today: Today, Tomorrow, the weekday inside a week, the date after that. And which quests count as coming up. Pure, so both are tested
// without a screen.
const DAY = 86_400_000;
const keyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function dayWords(scheduled: string, now: Date): string {
  const [year, month, day] = scheduled.slice(0, 10).split("-").map(Number);
  const then = new Date(year!, (month ?? 1) - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const gap = Math.round((then.getTime() - today.getTime()) / DAY);
  return gap <= 0 ? "Today" : gap === 1 ? "Tomorrow" : gap < 7 ? then.toLocaleDateString([], { weekday: "long" }) : then.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Open quests dated after today and within a week, soonest first. A quest with no date is not coming up: it has no day to come up on. */
export function upcomingQuests<Q extends { status: string; scheduledFor?: string | null }>(quests: Q[], now: Date, limit = 4): Q[] {
  const today = keyOf(now);
  const horizon = keyOf(new Date(now.getTime() + 7 * DAY));
  return quests
    .filter((quest) => quest.status !== "COMPLETED" && quest.scheduledFor && quest.scheduledFor.slice(0, 10) > today && quest.scheduledFor.slice(0, 10) <= horizon)
    .sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor)))
    .slice(0, limit);
}
