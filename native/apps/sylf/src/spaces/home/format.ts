// Small words and numbers Home works out itself, from data it already has, kept apart so they can be tested without a renderer.
import type { DayEntry } from "./data/contracts";

export function greetingFor(hour: number) {
  if (hour < 5) return "Still up.";
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** A session length as the timer will show it. */

const count = (value: number, one: string) => (value === 1 ? `One ${one}` : `${value} ${one}s`);

/** The day in one sentence, worked out here so the backend needs no new field. */
export function summarizeDay(entries: DayEntry[]) {
  const ahead = entries.filter((entry) => entry.state !== "past");
  const sessions = ahead.filter((entry) => entry.kind === "session").length;
  const deadlines = ahead.filter((entry) => entry.kind === "deadline").length;
  const parts = [sessions ? `${count(sessions, "session")} left` : null, deadlines ? `${count(deadlines, "deadline").replace(/^One/, sessions ? "one" : "One")} to come` : null].filter(Boolean);
  return parts.length ? `${parts.join(", and ")}.` : "Nothing left to do today.";
}

export const plannedMinutes = (entries: DayEntry[]) => entries.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0);
