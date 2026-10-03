import { PlannerValidationError } from "./errors";
import type { UserInputV1, PlannerItem } from "./contracts";
import { datesBetween, weekday, isDateKey } from "./dates";
import { TimezoneService } from "../timezone-service";

export const OPEN_QUEST_STATUSES = ["ACTIVE", "PENDING", "IN_PROGRESS"] as const;
export interface AvailabilitySnapshot {
  schemaVersion: 1; timezone: string; restDays: number[]; floatingDates: string[];
  existingWork: { id: number; date: string; minutes: number; status: string; fingerprint: string }[];
  /** Hash covers linked execution, tombstones, sessions, and owned Subject/Goal references. */
  lineageFingerprint: string;
}
export interface CapacityDay { date: string; budget: number; reserve: number; existing: number; proposed: number; remaining: number; blocked: boolean }
export type CapacityResult = { feasible: true; days: CapacityDay[] } | { feasible: false; days: CapacityDay[]; reasons: { date: string; code: "BLOCKED" | "OVER_CAPACITY" }[] };
/** No allocation, rolling dates, or fallback scheduling. Invalid/missing data fails closed. */
export function validateCapacity(input: UserInputV1, state: AvailabilitySnapshot, items: Pick<PlannerItem, "date" | "minutes">[]): CapacityResult {
  if (!state || state.schemaVersion !== 1 || !TimezoneService.validateTimezone(state.timezone) ||
      !Array.isArray(state.restDays) || state.restDays.some(d => !Number.isInteger(d) || d < 0 || d > 6) ||
      !Array.isArray(state.existingWork) || !Array.isArray(state.floatingDates)) throw new PlannerValidationError("SCHEDULE_UNAVAILABLE");
  if (state.floatingDates.some(d => !isDateKey(d)) || state.existingWork.some(q => !isDateKey(q.date) || !Number.isFinite(q.minutes) || q.minutes < 0)) throw new PlannerValidationError("SCHEDULE_UNAVAILABLE");
  const range = datesBetween(input.startDate, input.endDate);
  if (items.some(i => !range.includes(i.date) || !Number.isInteger(i.minutes) || i.minutes < 15 || i.minutes > 240)) throw new PlannerValidationError("INVALID_ITEM_CAPACITY");
  const days = range.map(date => {
    const blocked = state.restDays.includes(weekday(date)) || state.floatingDates.includes(date) || input.availability.blockedDates.includes(date);
    const budget = blocked ? 0 : input.availability.dailyMinutes[weekday(date)];
    const reserve = Math.ceil(budget * input.availability.recoveryPercent / 100);
    const existing = state.existingWork.filter(q => q.date === date && q.status !== "FAILED").reduce((n, q) => {
      if (!Number.isFinite(q.minutes) || q.minutes < 0) throw new PlannerValidationError("SCHEDULE_UNAVAILABLE");
      return n + q.minutes;
    }, 0);
    const proposed = items.filter(i => i.date === date).reduce((n, i) => n + i.minutes, 0);
    return { date, budget, reserve, existing, proposed, remaining: budget - reserve - existing - proposed, blocked };
  });
  // Existing overload on a day with no proposed work is shown, not silently repaired.
  const reasons = days.filter(d => d.proposed > 0 && (d.blocked || d.remaining < 0)).map(d => ({ date: d.date, code: d.blocked ? "BLOCKED" as const : "OVER_CAPACITY" as const }));
  return reasons.length ? { feasible: false, days, reasons } : { feasible: true, days };
}
