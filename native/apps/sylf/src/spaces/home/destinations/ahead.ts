// How a day is said on Today: Today, Tomorrow, the weekday inside a week, the date after that. Pure, so it can be tested without a screen.
const DAY = 86_400_000;

export function dayWords(scheduled: string, now: Date): string {
  const [year, month, day] = scheduled.slice(0, 10).split("-").map(Number);
  const then = new Date(year!, (month ?? 1) - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const gap = Math.round((then.getTime() - today.getTime()) / DAY);
  return gap <= 0 ? "Today" : gap === 1 ? "Tomorrow" : gap < 7 ? then.toLocaleDateString([], { weekday: "long" }) : then.toLocaleDateString([], { day: "numeric", month: "short" });
}
