// ============================================================
// Cheap Answers — date & time (user timezone aware)
// ============================================================
// Only explicit, unambiguous date phrasings are answered here:
// today's date/day, and "how many days until/since <explicit date>".
// Everything relative/ambiguous (holidays, "next Friday", birthdays)
// escalates to the LLM.
// ============================================================

import { TimezoneService } from "../../timezone-service";
import { getUserTimezone } from "../../timezone-server";

const TODAY_RE = /^(whats? (the |todays )?date|what day is it today|todays date|what day is today|whats? today'?s date)$/i;

export function tryToday(raw: string, timezone: string): string | null {
  if (!TODAY_RE.test(raw.trim())) return null;
  const date = TimezoneService.getUserLocalDate(timezone);
  const dow = TimezoneService.getUserDayOfWeek(timezone, date);
  return `Today is **${dow}, ${date}**.`;
}

const DAYS_UNTIL_RE = /^how many days (?:until|till|left until|from now to) (.+)$/i;
const DAYS_SINCE_RE = /^how many days (?:since|have passed since) (.+)$/i;

/** Conservative date parsing: YYYY-MM-DD, YYYY/MM/DD or "MonthName DD". */
function parseExplicitDate(text: string, now: Date): Date | null {
  const t = text.trim().replace(/[?.,!]+$/, "");

  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  m = t.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})$/i);
  if (m) {
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const month = months.indexOf(m[1].toLowerCase());
    const day = Number(m[2]);
    if (month < 0 || day < 1 || day > 31) return null;
    // Default to the current year; if it's already past, roll to next year.
    let d = new Date(now.getFullYear(), month, day);
    if (d.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
      d = new Date(now.getFullYear() + 1, month, day);
    }
    return d;
  }

  return null;
}

export function tryDaysBetween(
  raw: string,
  timezone: string,
  kind: "until" | "since"
): string | null {
  const re = kind === "until" ? DAYS_UNTIL_RE : DAYS_SINCE_RE;
  const m = raw.trim().match(re);
  if (!m) return null;

  const target = parseExplicitDate(m[1], new Date());
  if (!target) return null;

  const today = TimezoneService.getUserLocalDate(timezone);
  const [ty, tm, td] = today.split("-").map((n) => parseInt(n, 10));
  const todayStart = new Date(ty, tm - 1, td);
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.round((targetStart.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));

  if (kind === "until") {
    if (diffDays < 0) return `That date was ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago.`;
    if (diffDays === 0) return "That's today.";
    return `**${diffDays}** day${diffDays === 1 ? "" : "s"} until ${m[1].trim()}.`;
  }
  if (diffDays <= 0) return `**${Math.abs(diffDays)}** day${Math.abs(diffDays) === 1 ? "" : "s"} since ${m[1].trim()}.`;
  return `That date is ${diffDays} day${diffDays === 1 ? "" : "s"} from now.`;
}

/** Entry point for all cheap date/time questions. */
export async function tryDateTime(raw: string, userId: number): Promise<string | null> {
  const timezone = await getUserTimezone(userId);
  return (
    tryToday(raw, timezone) ||
    tryDaysBetween(raw, timezone, "until") ||
    tryDaysBetween(raw, timezone, "since")
  );
}
