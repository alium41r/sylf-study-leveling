// Local minutes to instants and back, for one IANA time zone. The kernel works in local dates and minutes; only the server turns them into instants,
// and across a daylight-saving change the conversion resolves the wall-clock time the student sees.
import { TimezoneService } from "@/lib/timezone-service";
import { toUtc } from "../kernel/dates";

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
    formatters.set(tz, f);
  }
  return f;
}
const safe = (tz: string) => (TimezoneService.validateTimezone(tz) ? tz : "UTC");

export function localParts(timezone: string, at: Date): { date: string; minute: number; weekday: number; hour: number } {
  const parts = formatter(safe(timezone)).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minute: hour * 60 + Number(get("minute")), weekday, hour };
}

function offsetMinutes(timezone: string, at: Date): number {
  const p = formatter(safe(timezone)).formatToParts(at);
  const get = (type: string) => Number(p.find((x) => x.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant of a local date and minute. */
export function localInstant(timezone: string, date: string, minute: number): Date {
  const naive = toUtc(date) + minute * 60_000;
  let guess = naive - offsetMinutes(timezone, new Date(naive)) * 60_000;
  guess = naive - offsetMinutes(timezone, new Date(guess)) * 60_000;
  return new Date(guess);
}
