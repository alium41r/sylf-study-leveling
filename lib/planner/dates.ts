import { PlannerValidationError } from "./errors";
import { TimezoneService } from "../timezone-service";

/** Calendar arithmetic only. These values are never localized UTC instants. */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 2000 || y > 2199 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function dateOrdinal(key: string): number {
  if (!isDateKey(key)) throw new PlannerValidationError("INVALID_DATE");
  return Date.parse(`${key}T12:00:00Z`) / 86400000;
}
export function datesBetween(start: string, end: string): string[] {
  const count = dateOrdinal(end) - dateOrdinal(start);
  if (count < 0 || count > 365) throw new PlannerValidationError("INVALID_HORIZON");
  return Array.from({ length: count + 1 }, (_, i) => new Date((dateOrdinal(start) + i) * 86400000).toISOString().slice(0, 10));
}
export function weekday(key: string): number {
  return new Date(dateOrdinal(key) * 86400000).getUTCDay();
}
export function localToday(timezone: string, now = new Date()): string {
  if (!TimezoneService.validateTimezone(timezone)) throw new PlannerValidationError("INVALID_TIMEZONE");
  return TimezoneService.getUserLocalDate(timezone, now);
}
