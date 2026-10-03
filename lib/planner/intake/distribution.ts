import { datesBetween, weekday } from "../dates";

/**
 * The weekly study budget → the engine's availability vector.
 *
 * A student thinks in hours per week; the engine needs `dailyMinutes[7]`. This
 * module performs that translation, and it is load-balanced rather than merely
 * divided: the remainder does not pile onto the first days of the week, rest days
 * and already-committed work shape the split, and a stated per-weekday value always
 * wins.
 *
 * Non-negotiable properties:
 *
 * - **deterministic** — same inputs, byte-identical output. Weights are integers,
 *   ties break by weekday index, and there is no randomness or clock read.
 * - **server-authoritative** — floating rest dates and existing Quest workload
 *   exist only on the server, so the client shows this function's result rather
 *   than estimating one of its own.
 * - **no double subtraction** — existing workload *balances* the split; the engine
 *   already subtracts it from each day's capacity (`capacity.ts`), so subtracting it
 *   here too would under-plan the week twice.
 * - **the budget is a target, not a cap** — nothing here blocks a plan; hard limits
 *   (`MAX_SESSION_MINUTES`, `UNAVAILABLE_WEEKDAY`, `MAX_WEEKLY_MINUTES`) are enforced
 *   by the engine exactly as before.
 * - **partial weeks scale down, never up** — a horizon shorter than a week cannot
 *   reach the full budget. The pattern is left alone (no day is inflated to absorb
 *   the days the horizon does not contain) and the result says how much of the budget
 *   falls outside it.
 */

export const WEEKLY_BUDGET_LIMITS = {
  /** 0 to 7 days × 24h; the brief schema enforces the same bound. */
  weeklyMinutes: { min: 0, max: 10080 },
  /** The absolute per-day ceiling the availability contract allows. */
  dailyMinutes: { min: 0, max: 720 },
  /** Weight precision: integer thousandths keep the split deterministic. */
  weightScale: 1000,
} as const;

export interface DistributionInput {
  /** The student's stated budget for THIS plan. */
  weeklyMinutes: number;
  /** First and last date of the horizon being planned. */
  firstDate: string;
  lastDate: string;
  /** The account's rest weekdays, which receive no minutes. */
  restWeekdays: readonly number[];
  /** Dated rest days inside the horizon. */
  floatingRestDates?: readonly string[];
  /** Explicitly forbidden weekdays from HARD `UNAVAILABLE_WEEKDAY` constraints. */
  hardUnavailableWeekdays?: readonly number[];
  /** Minutes already committed by existing Quests, keyed by date. */
  existingLoadByDate?: Readonly<Record<string, number>>;
  /** A1 soft scheduling preferences, used only as balancing hints. */
  softHints?: {
    evenSpread?: boolean;
    fewerDates?: boolean;
  };
  /** Stated per-weekday minutes; a non-null entry wins for that weekday. */
  dailyOverrides?: readonly (number | null)[] | null;
}

export const DISTRIBUTION_REASONS = [
  "STUDY_DAY",
  "REST_WEEKDAY",
  "HARD_UNAVAILABLE",
  "FLOATING_REST",
  "STATED_OVERRIDE",
  "DAILY_CEILING",
  "FEWER_DATES",
] as const;
export type DistributionReason = (typeof DISTRIBUTION_REASONS)[number];

export interface DistributionDay {
  date: string;
  weekday: number;
  minutes: number;
  reason: DistributionReason;
  /** Minutes already committed on this date, echoed for the UI's explanation. */
  existingMinutes: number;
}

export interface DistributionResult {
  /** The engine contract: one value per weekday. */
  dailyMinutes: number[];
  /** Dated exclusions the engine honours in addition to the weekly pattern. */
  blockedDates: string[];
  /** The next two weeks of the horizon, day by day, for the preview. */
  preview: DistributionDay[];
  /**
   * How much of the stated weekly budget this horizon can actually place.
   *
   * The vector is a *weekly pattern*; a horizon shorter than a week realizes only
   * the weekdays it contains. A three-day horizon therefore reaches about 3/7 of the
   * budget, and saying 180 would be a claim about a week that does not exist. Capped
   * at the stated budget, so a long horizon never reports more than was asked for.
   */
  reachableMinutes: number;
  /** Stated budget minus what the horizon can place. Never negative. */
  shortfallMinutes: number;
  /** One content-free sentence the UI can show verbatim. */
  note: string;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Split a weekly budget across the week.
 *
 * The algorithm, in order: usable weekdays → weights → largest remainder →
 * per-day ceiling → explanation. Every step is integer arithmetic.
 */
export function distributeWeeklyBudget(input: DistributionInput): DistributionResult {
  const weekly = clamp(
    Math.round(input.weeklyMinutes),
    WEEKLY_BUDGET_LIMITS.weeklyMinutes.min,
    WEEKLY_BUDGET_LIMITS.weeklyMinutes.max
  );
  const rest = new Set(input.restWeekdays);
  const hard = new Set(input.hardUnavailableWeekdays ?? []);
  const floating = new Set(input.floatingRestDates ?? []);
  const dates = datesBetween(input.firstDate, input.lastDate);
  const existing = input.existingLoadByDate ?? {};

  // 1. Usable weekdays: neither a rest day nor an explicitly forbidden one.
  const usable = [0, 1, 2, 3, 4, 5, 6].filter((day) => !rest.has(day) && !hard.has(day));

  const dailyMinutes = [0, 0, 0, 0, 0, 0, 0];
  const reasons = new Map<number, DistributionReason>();
  for (const day of rest) reasons.set(day, "REST_WEEKDAY");
  for (const day of hard) reasons.set(day, "HARD_UNAVAILABLE");

  if (weekly <= 0 || usable.length === 0) {
    return {
      dailyMinutes,
      blockedDates: [...floating].filter((date) => dates.includes(date)).sort(),
      preview: previewFor(dates, dailyMinutes, reasons, existing, floating),
      reachableMinutes: 0,
      shortfallMinutes: weekly,
      note:
        usable.length === 0
          ? "No study day is available: every weekday is a rest day or unavailable."
          : "No weekly study time was given, so no day holds any minutes yet.",
    };
  }
  // 2. Stated overrides win, and are excluded from the pool being distributed.
  const overrides = input.dailyOverrides ?? null;
  let overriddenMinutes = 0;
  for (const day of usable) {
    const stated = overrides?.[day];
    if (stated === null || stated === undefined) continue;
    const value = clamp(Math.round(stated), 0, WEEKLY_BUDGET_LIMITS.dailyMinutes.max);
    dailyMinutes[day] = value;
    reasons.set(day, "STATED_OVERRIDE");
    overriddenMinutes += value;
  }
  const pool = Math.max(0, weekly - overriddenMinutes);
  const openDays = usable.filter((day) => dailyMinutes[day] === 0 && reasons.get(day) === undefined);
  if (pool === 0 || openDays.length === 0) {
    const reachable = Math.min(weekly, horizonMinutes(dates, dailyMinutes, floating));
    return {
      dailyMinutes,
      blockedDates: [...floating].filter((date) => dates.includes(date)).sort(),
      preview: previewFor(dates, dailyMinutes, reasons, existing, floating),
      reachableMinutes: reachable,
      shortfallMinutes: Math.max(0, weekly - reachable),
      note: explain(dailyMinutes, usable, rest, hard, floating, dates, weekly, overriddenMinutes, pool, reachable),
    };
  }

  // 3. Weights: even by default; existing workload pulls a day's share down.
  const meanExisting = meanLoadByWeekday(existing, dates);
  const perDayShare = Math.max(1, Math.round(pool / openDays.length));
  const weights = openDays.map((day) => {
    if (input.softHints?.evenSpread) return WEEKLY_BUDGET_LIMITS.weightScale;
    const loaded = meanExisting[day] ?? 0;
    // A day already carrying a full share of existing work keeps half a share of
    // the new budget; a clear day keeps all of it. Integer, bounded, monotone.
    const factor = WEEKLY_BUDGET_LIMITS.weightScale / (1 + loaded / perDayShare);
    return Math.max(Math.round(WEEKLY_BUDGET_LIMITS.weightScale / 4), Math.round(factor));
  });

  // 4. `fewerDates` concentrates the budget on the least-loaded days.
  const activeDays =
    input.softHints?.fewerDates && openDays.length > 1
      ? [...openDays]
          .sort((a, b) => (meanExisting[a] ?? 0) - (meanExisting[b] ?? 0) || a - b)
          .slice(0, Math.max(1, Math.ceil(openDays.length / 2)))
          .sort((a, b) => a - b)
      : openDays;
  const activeWeights = activeDays.map((day) => weights[openDays.indexOf(day)]);
  for (const day of openDays) if (!activeDays.includes(day)) reasons.set(day, "FEWER_DATES");

  // 5. Largest remainder, ties broken by weekday index.
  const weightTotal = sum(activeWeights);
  const exact = activeWeights.map((weight) => (pool * weight) / weightTotal);
  const floors = exact.map((value) => Math.floor(value));
  let remaining = pool - sum(floors);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || activeDays[a.index] - activeDays[b.index]);
  const assigned = [...floors];
  for (const entry of order) {
    if (remaining <= 0) break;
    assigned[entry.index] += 1;
    remaining -= 1;
  }
  // Any minute the ceiling could not take is offered to the other days, in order.
  const overflow = assigned
    .map((value, index) => ({ index, over: Math.max(0, value - WEEKLY_BUDGET_LIMITS.dailyMinutes.max) }))
    .filter((entry) => entry.over > 0);
  for (const entry of overflow)
    for (let guard = 0; guard < activeDays.length && entry.over > 0; guard += 1) {
      const target = (entry.index + guard + 1) % activeDays.length;
      const room =
        WEEKLY_BUDGET_LIMITS.dailyMinutes.max - assigned[target];
      const moved = Math.min(room, entry.over);
      assigned[target] += moved;
      assigned[entry.index] -= moved;
      entry.over -= moved;
    }

  activeDays.forEach((day, index) => {
    dailyMinutes[day] = clamp(assigned[index], 0, WEEKLY_BUDGET_LIMITS.dailyMinutes.max);
    if (assigned[index] >= WEEKLY_BUDGET_LIMITS.dailyMinutes.max) reasons.set(day, "DAILY_CEILING");
    else if (!reasons.has(day)) reasons.set(day, "STUDY_DAY");
  });

  const reachable = Math.min(weekly, horizonMinutes(dates, dailyMinutes, floating));
  return {
    dailyMinutes,
    blockedDates: [...floating].filter((date) => dates.includes(date)).sort(),
    preview: previewFor(dates, dailyMinutes, reasons, existing, floating),
    reachableMinutes: reachable,
    shortfallMinutes: Math.max(0, weekly - reachable),
    note: explain(dailyMinutes, usable, rest, hard, floating, dates, weekly, overriddenMinutes, pool, reachable),
  };
}

/**
 * What the horizon can realize from a weekly pattern.
 *
 * Each date contributes its weekday's minutes, except a dated rest day, which
 * contributes nothing. This is why a partial week is reported honestly: the pattern
 * still sums to the stated budget (nothing is inflated into the days that remain),
 * while the horizon only contains the part of the week it actually spans.
 */
function horizonMinutes(
  dates: readonly string[],
  dailyMinutes: readonly number[],
  floating: ReadonlySet<string>
): number {
  let total = 0;
  for (const date of dates)
    total += floating.has(date) ? 0 : dailyMinutes[weekday(date)] ?? 0;
  return total;
}

/**
 * The weekly budget implied by the student's own Sylf schedule.
 *
 * "Use my normal Sylf schedule" has to produce a concrete number, and the honest
 * source is the account's own daily goal: `dailyGoalMinutes` on each usable
 * weekday. It is recorded as `SYLF_DATA` authority, never as something the student
 * stated for this plan.
 */
export function weeklyFromSchedule(args: {
  dailyGoalMinutes: number | null;
  restWeekdays: readonly number[];
  hardUnavailableWeekdays?: readonly number[];
}): number | null {
  if (!args.dailyGoalMinutes || args.dailyGoalMinutes <= 0) return null;
  const rest = new Set(args.restWeekdays);
  const hard = new Set(args.hardUnavailableWeekdays ?? []);
  const usable = [0, 1, 2, 3, 4, 5, 6].filter((day) => !rest.has(day) && !hard.has(day));
  if (!usable.length) return null;
  return clamp(
    Math.round(args.dailyGoalMinutes) * usable.length,
    WEEKLY_BUDGET_LIMITS.weeklyMinutes.min,
    WEEKLY_BUDGET_LIMITS.weeklyMinutes.max
  );
}

const previewFor = (
  dates: readonly string[],
  dailyMinutes: readonly number[],
  reasons: ReadonlyMap<number, DistributionReason>,
  existing: Readonly<Record<string, number>>,
  floating: ReadonlySet<string>
): DistributionDay[] =>
  dates.slice(0, 14).map((date) => {
    const day = weekday(date);
    const isFloating = floating.has(date);
    return {
      date,
      weekday: day,
      minutes: isFloating ? 0 : dailyMinutes[day],
      reason: isFloating ? "FLOATING_REST" : reasons.get(day) ?? "STUDY_DAY",
      existingMinutes: Math.max(0, Math.round(existing[date] ?? 0)),
    };
  });

const meanLoadByWeekday = (
  existing: Readonly<Record<string, number>>,
  dates: readonly string[]
): Record<number, number> => {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const date of dates) {
    const day = weekday(date);
    totals[day] += Math.max(0, existing[date] ?? 0);
    counts[day] += 1;
  }
  return Object.fromEntries(
    totals.map((total, day) => [day, counts[day] ? total / counts[day] : 0])
  );
};

/** One content-free sentence: counts, weekday names and minutes only. */
function explain(
  dailyMinutes: readonly number[],
  usable: readonly number[],
  rest: ReadonlySet<number>,
  hard: ReadonlySet<number>,
  floating: ReadonlySet<string>,
  dates: readonly string[],
  weekly: number,
  overriddenMinutes: number,
  pool: number,
  reachable: number
): string {
  const studyDays = usable.filter((day) => dailyMinutes[day] > 0);
  const perDay = studyDays.length ? Math.round(sum(dailyMinutes) / studyDays.length) : 0;
  const parts: string[] = [];
  parts.push(
    studyDays.length
      ? `${formatMinutes(weekly)} across ${studyDays.length} study day${studyDays.length === 1 ? "" : "s"} (about ${formatMinutes(perDay)} each)`
      : `${formatMinutes(weekly)} could not be placed on any day`
  );
  if (overriddenMinutes > 0)
    parts.push(`including ${formatMinutes(overriddenMinutes)} you set per day`);
  const restNames = [...rest].sort((a, b) => a - b).map((day) => WEEKDAY_NAMES[day]);
  if (restNames.length) parts.push(`${restNames.join(" and ")} left free`);
  const hardNames = [...hard].sort((a, b) => a - b).map((day) => WEEKDAY_NAMES[day]);
  if (hardNames.length) parts.push(`${hardNames.join(" and ")} excluded by your settings`);
  const floatingInHorizon = [...floating].filter((date) => dates.includes(date)).length;
  if (floatingInHorizon) parts.push(`${floatingInHorizon} individual day${floatingInHorizon === 1 ? "" : "s"} excluded`);
  if (pool === 0 && overriddenMinutes > 0) parts.push("every study day was set by hand");
  // Two different reasons the stated budget may not be fully placed, and they read
  // differently to a student, so they are named separately.
  const unplacedByDays = Math.max(0, weekly - sum(dailyMinutes));
  const unplacedByHorizon = Math.max(0, sum(dailyMinutes) - reachable);
  if (unplacedByHorizon > 0)
    parts.push(
      `the plan ends after ${dates.length} day${dates.length === 1 ? "" : "s"}, so ${formatMinutes(unplacedByHorizon)} of the week falls outside it`
    );
  if (unplacedByDays > 0)
    parts.push(
      `about ${formatMinutes(unplacedByDays)} of the budget does not fit the days you have, so it is not forced into shorter days`
    );
  return `${parts.join("; ")}.`;
}

const formatMinutes = (minutes: number): string => {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
};

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
