import { z } from "zod";
import { PlannerValidationError } from "./errors";
import { weekday } from "./dates";
import type { UserInputV1 } from "./contracts";

/**
 * Typed planning constraints (Addendum §3).
 *
 * A HARD constraint is a limit the scheduler must never violate; it is validated
 * deterministically before any draft is shown and may legitimately make a plan
 * infeasible. A SOFT constraint is a preference the planner optimizes for and may
 * break when necessary; it can never make an otherwise feasible plan appear
 * infeasible, and a material violation is explained in one concise sentence.
 *
 * Strength is bound to kind by schema: a soft preference can never be promoted to
 * a hard limit, and a hard limit can never be softened.
 */
export const HARD_CONSTRAINT_KINDS = [
  "MAX_SESSION_MINUTES",
  "UNAVAILABLE_WEEKDAY",
  "MAX_WEEKLY_MINUTES",
] as const;
export const SOFT_CONSTRAINT_KINDS = [
  "SESSION_LENGTH_PREFERENCE",
  "EVEN_SPREAD_PREFERENCE",
  "PREFER_FEWER_DATES",
  "WEEKLY_WORKLOAD_PREFERENCE",
  "PREFER_EARLIER_WORKLOAD",
  "PREFER_BALANCED_PERIODS",
  "PREFER_UNIT_ORDER",
  "PREFER_FEWER_SWITCHES",
] as const;
export const PlannerConstraintKindSchema = z.enum([
  ...HARD_CONSTRAINT_KINDS,
  ...SOFT_CONSTRAINT_KINDS,
]);
export type PlannerConstraintKind = z.infer<typeof PlannerConstraintKindSchema>;

export const PlannerConstraintStrengthSchema = z.enum(["HARD", "SOFT"]);
export type PlannerConstraintStrength = z.infer<
  typeof PlannerConstraintStrengthSchema
>;

/**
 * Where a constraint came from. `LEARNED_PREFERENCE` is present so the schema can
 * anticipate Addendum A3, but preference learning is NOT implemented: supplying it
 * is rejected rather than silently treated as a user statement.
 */
export const PlannerConstraintSourceSchema = z.enum([
  "USER_EXPLICIT",
  "DRAFT_EDIT",
  "LEARNED_PREFERENCE",
]);

/** Closed vocabulary of high-value uncertainty reason codes (Addendum §2.3). */
export const PlannerQuestionReasonSchema = z.enum([
  "PRIORITY_UNCLEAR",
  "AVAILABILITY_PATTERN_UNCLEAR",
  "CONSTRAINT_STRENGTH_UNCLEAR",
  "SCOPE_SIZE_UNCLEAR",
]);
export type PlannerQuestionReason = z.infer<
  typeof PlannerQuestionReasonSchema
>;

const BOUNDS: Record<PlannerConstraintKind, [number, number]> = {
  // 15 is the existing minimum quest duration, 240 the maximum.
  MAX_SESSION_MINUTES: [15, 240],
  UNAVAILABLE_WEEKDAY: [0, 6],
  SESSION_LENGTH_PREFERENCE: [15, 240],
  EVEN_SPREAD_PREFERENCE: [30, 720],
  PREFER_FEWER_DATES: [1, 90],
  // Roadmap-only: weekly capacity in minutes, and share-style preferences.
  MAX_WEEKLY_MINUTES: [60, 5040],
  WEEKLY_WORKLOAD_PREFERENCE: [60, 5040],
  PREFER_EARLIER_WORKLOAD: [40, 90],
  PREFER_BALANCED_PERIODS: [20, 80],
  PREFER_UNIT_ORDER: [1, 60],
  PREFER_FEWER_SWITCHES: [0, 100],
};

/**
 * Which modes may carry each kind. Adding a constraint the mode cannot evaluate
 * would let a user state a limit the planner silently ignores, so applicability is
 * explicit and rejected at input validation.
 */
export const CONSTRAINT_MODES: Record<PlannerConstraintKind, readonly ModeName[]> = {
  // Item-level kinds apply wherever a plan contains dated, actionable items, which
  // includes a confirmed Chapter / Unit Mastery plan.
  MAX_SESSION_MINUTES: ["EXAM", "ROADMAP", "MASTERY"],
  UNAVAILABLE_WEEKDAY: ["EXAM", "ROADMAP", "MASTERY"],
  SESSION_LENGTH_PREFERENCE: ["EXAM", "ROADMAP", "MASTERY"],
  EVEN_SPREAD_PREFERENCE: ["EXAM", "ROADMAP", "MASTERY"],
  PREFER_FEWER_DATES: ["EXAM", "ROADMAP", "MASTERY"],
  MAX_WEEKLY_MINUTES: ["ROADMAP"],
  WEEKLY_WORKLOAD_PREFERENCE: ["ROADMAP"],
  PREFER_EARLIER_WORKLOAD: ["ROADMAP"],
  PREFER_BALANCED_PERIODS: ["ROADMAP"],
  PREFER_UNIT_ORDER: ["ROADMAP"],
  PREFER_FEWER_SWITCHES: ["ROADMAP"],
};
export type ModeName = "EXAM" | "ROADMAP" | "MASTERY";
/** Only weekday exclusion may repeat, once per weekday. */
const REPEATABLE: PlannerConstraintKind[] = ["UNAVAILABLE_WEEKDAY"];

export const PlannerConstraintV1Schema = z
  .strictObject({
    kind: PlannerConstraintKindSchema,
    strength: PlannerConstraintStrengthSchema,
    value: z.number().int().min(0).max(720),
    preferenceWeight: z.number().int().min(1).max(3).optional(),
    source: PlannerConstraintSourceSchema,
    reasonCode: PlannerQuestionReasonSchema.optional(),
  })
  .superRefine((constraint, ctx) => {
    const hard = (HARD_CONSTRAINT_KINDS as readonly string[]).includes(
      constraint.kind
    );
    if (hard !== (constraint.strength === "HARD"))
      ctx.addIssue({
        code: "custom",
        message: "Constraint strength does not match its kind",
      });
    const [min, max] = BOUNDS[constraint.kind];
    if (constraint.value < min || constraint.value > max)
      ctx.addIssue({ code: "custom", message: "Constraint value out of bounds" });
    if (constraint.strength === "HARD" && constraint.preferenceWeight !== undefined)
      ctx.addIssue({
        code: "custom",
        message: "Only soft preferences carry a weight",
      });
    if (constraint.source === "LEARNED_PREFERENCE")
      ctx.addIssue({
        code: "custom",
        message: "Learned preferences are not enabled in this phase",
      });
  });
export type PlannerConstraint = z.infer<typeof PlannerConstraintV1Schema>;

export const PlannerConstraintsSchema = z
  .array(PlannerConstraintV1Schema)
  .max(12)
  .superRefine((list, ctx) => {
    const seen = new Map<string, number>();
    for (const constraint of list) {
      const repeats = REPEATABLE.includes(constraint.kind);
      const key = repeats
        ? `${constraint.kind}:${constraint.value}`
        : constraint.kind;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, count] of seen)
      if (count > 1)
        ctx.addIssue({ code: "custom", message: `Duplicate constraint ${key}` });
  });

export interface ConstraintItem {
  key?: string;
  date: string;
  minutes: number;
}

/** Rejects a constraint the mode cannot evaluate, rather than ignoring it. */
export function assertConstraintsApplicable(mode: ModeName, list: readonly { kind: PlannerConstraintKind }[]): void {
  for (const constraint of list)
    if (!CONSTRAINT_MODES[constraint.kind].includes(mode))
      throw new PlannerValidationError("CONSTRAINT_NOT_APPLICABLE");
}

/** The strictest HARD weekly ceiling, or null when the user set none. */
export function hardWeeklyLimit(input: UserInputV1): number | null {
  const limits = hardConstraints(input)
    .filter((c) => c.kind === "MAX_WEEKLY_MINUTES")
    .map((c) => c.value);
  return limits.length ? Math.min(...limits) : null;
}

/** The soft weekly preference, or null when the user set none. */
export function softWeeklyPreference(input: UserInputV1): number | null {
  const limits = softConstraints(input)
    .filter((c) => c.kind === "WEEKLY_WORKLOAD_PREFERENCE")
    .map((c) => c.value);
  return limits.length ? Math.min(...limits) : null;
}

export function constraintsOf(input: UserInputV1): PlannerConstraint[] {
  return input.constraints ?? [];
}

export function hardConstraints(input: UserInputV1): PlannerConstraint[] {
  return constraintsOf(input).filter((c) => c.strength === "HARD");
}

export function softConstraints(input: UserInputV1): PlannerConstraint[] {
  return constraintsOf(input).filter((c) => c.strength === "SOFT");
}

/**
 * Weekdays the confirmed availability grid closes. These are already HARD in the
 * capacity model (a zero-minute day has no budget); exposing them as typed
 * constraints makes the rule explicit and testable rather than implicit.
 */
export function unavailableWeekdays(input: UserInputV1): number[] {
  const days = [
    ...input.availability.dailyMinutes
      .map((minutes, day) => ({ minutes, day }))
      .filter((entry) => entry.minutes <= 0)
      .map((entry) => entry.day),
    ...hardConstraints(input)
      .filter((c) => c.kind === "UNAVAILABLE_WEEKDAY")
      .map((c) => c.value),
  ];
  return [...new Set(days)].sort((a, b) => a - b);
}

/** The strictest HARD session ceiling, or null when the user set none. */
export function hardSessionLimit(input: UserInputV1): number | null {
  const limits = hardConstraints(input)
    .filter((c) => c.kind === "MAX_SESSION_MINUTES")
    .map((c) => c.value);
  return limits.length ? Math.min(...limits) : null;
}

/**
 * Deterministic HARD enforcement. Runs before a draft can be shown, again after a
 * semantic repair, and again at confirmation. The generator and the critic cannot
 * override it because neither can write a draft that skips this check.
 */
/**
 * The heaviest rolling seven days in a set of dated items.
 *
 * Anchored on every date that holds work and summed forward, so a week that straddles a
 * month boundary — or a plan whose work is not aligned to calendar weeks — is measured the
 * same way the capacity findings measure it. Exported because the finding and the gate must
 * agree about what "a week" means, and two implementations of that is one too many.
 */
export function worstRollingWeek(items: readonly ConstraintItem[]): number {
  const byDate = new Map<string, number>();
  for (const item of items) byDate.set(item.date, (byDate.get(item.date) ?? 0) + item.minutes);
  let worst = 0;
  for (const anchor of byDate.keys()) {
    const start = Math.floor(Date.parse(`${anchor}T00:00:00.000Z`) / 86_400_000);
    let total = 0;
    for (let offset = 0; offset < 7; offset += 1)
      total += byDate.get(new Date((start + offset) * 86_400_000).toISOString().slice(0, 10)) ?? 0;
    if (total > worst) worst = total;
  }
  return worst;
}

export function validateHardConstraints(
  input: UserInputV1,
  items: ConstraintItem[]
): void {
  const weekdays = unavailableWeekdays(input);
  const limit = hardSessionLimit(input);
  for (const item of items) {
    if (weekdays.includes(weekday(item.date)))
      throw new PlannerValidationError("HARD_UNAVAILABLE_DAY_USED");
    if (limit !== null && item.minutes > limit)
      throw new PlannerValidationError("HARD_SESSION_LIMIT_EXCEEDED");
    if (!Number.isInteger(item.minutes) || item.minutes < 15 || item.minutes > 240)
      throw new PlannerValidationError("INVALID_ITEM_CAPACITY");
  }
  /**
   * The weekly maximum is enforced here, on the items alone.
   *
   * It used to be reported only as a *finding* — and only for a draft that also overran the
   * daily grid, because the finding was derived from the capacity verdict. That left a real
   * hole: a plan whose days each fit comfortably but whose busiest week is over the ceiling
   * the student set could be generated, edited and confirmed without the limit ever being
   * checked. §10 and §61 of the final phase require the opposite — a target warns, an explicit
   * maximum blocks — so the gate is now unconditional, and every mode that charges work
   * against capacity inherits it through this one function.
   */
  const weekly = hardWeeklyLimit(input);
  if (weekly !== null && worstRollingWeek(items) > weekly)
    throw new PlannerValidationError("HARD_WEEKLY_LIMIT_EXCEEDED");
}

export interface SoftViolation {
  kind: PlannerConstraintKind;
  preferenceWeight: number;
  explanation: string;
  /**
   * The items that make this preference unhonored, when the preference is
   * localizable. A localized violation can drive a targeted repair; a global one
   * (`PREFER_FEWER_DATES`) is explained to the user instead of triggering a
   * whole-plan rewrite.
   */
  items: ConstraintItem[];
  localized: boolean;
}

/**
 * The availability the planner actually schedules against: every HARD weekday
 * exclusion removes that day's capacity. Soft preferences are deliberately absent —
 * a preference can never remove capacity or make a plan infeasible.
 */
export function constraintCapacityInput(input: UserInputV1): UserInputV1 {
  const closed = new Set(unavailableWeekdays(input));
  if (!closed.size) return input;
  return {
    ...input,
    availability: {
      ...input.availability,
      dailyMinutes: input.availability.dailyMinutes.map((minutes, day) =>
        closed.has(day) ? 0 : minutes
      ),
    },
  };
}

/**
 * Soft preferences are evaluated on a validated plan and never feed feasibility.
 * A violation is reported, not repaired silently, and the user is told why in one
 * concise sentence.
 */
export function softConstraintViolations(
  input: UserInputV1,
  items: ConstraintItem[]
): SoftViolation[] {
  const violations: SoftViolation[] = [];
  for (const constraint of softConstraints(input)) {
    const weight = constraint.preferenceWeight ?? 1;
    if (constraint.kind === "SESSION_LENGTH_PREFERENCE") {
      const over = items.filter((i) => i.minutes > constraint.value);
      if (over.length)
        violations.push({
          kind: constraint.kind,
          preferenceWeight: weight,
          explanation: `${over.length} session${over.length === 1 ? " is" : "s are"} longer than your preferred ${constraint.value} minutes because the confirmed dates and capacity could not fit the work otherwise.`,
          items: over,
          localized: true,
        });
    }
    if (constraint.kind === "EVEN_SPREAD_PREFERENCE") {
      const perDate = new Map<string, number>();
      for (const item of items)
        perDate.set(item.date, (perDate.get(item.date) ?? 0) + item.minutes);
      const heavy = [...perDate.entries()]
        .filter(([, minutes]) => minutes > constraint.value)
        .sort((a, b) => b[1] - a[1])[0];
      if (heavy)
        violations.push({
          kind: constraint.kind,
          preferenceWeight: weight,
          explanation: `${heavy[0]} holds ${heavy[1]} minutes, above your preferred ${constraint.value} minutes per day, because the remaining capacity required it.`,
          items: items.filter((item) => item.date === heavy[0]),
          localized: true,
        });
    }
    if (constraint.kind === "PREFER_FEWER_DATES") {
      const dates = new Set(items.map((i) => i.date)).size;
      if (dates > constraint.value)
        violations.push({
          kind: constraint.kind,
          preferenceWeight: weight,
          explanation: `The plan uses ${dates} study days rather than your preferred ${constraint.value} because the confirmed scope did not fit in fewer.`,
          items,
          localized: false,
        });
    }
  }
  return violations.sort(
    (a, b) => b.preferenceWeight - a.preferenceWeight || a.kind.localeCompare(b.kind)
  );
}

export const MAX_TRADEOFFS = 3;

/** One concise user-facing explanation at most per violated preference. */
export function tradeoffExplanations(
  input: UserInputV1,
  items: ConstraintItem[]
): string[] {
  return softConstraintViolations(input, items)
    .slice(0, MAX_TRADEOFFS)
    .map((violation) => violation.explanation);
}

export interface SoftConstraintStatus {
  total: number;
  satisfied: number;
  violated: number;
}

/** Content-free counters for the `soft_constraint_satisfied_rate` metric. */
export function softConstraintStatus(
  input: UserInputV1,
  items: ConstraintItem[]
): SoftConstraintStatus {
  const total = softConstraints(input).length;
  const violated = softConstraintViolations(input, items).length;
  return { total, satisfied: total - violated, violated };
}

export const CONSTRAINT_STRENGTH_LABEL: Record<
  PlannerConstraintStrength,
  string
> = {
  HARD: "Required / cannot break",
  SOFT: "Preference / try to honor",
};

export const CONSTRAINT_KIND_LABEL: Record<PlannerConstraintKind, string> = {
  MAX_SESSION_MINUTES: "Maximum session length",
  UNAVAILABLE_WEEKDAY: "No study on this weekday",
  SESSION_LENGTH_PREFERENCE: "Preferred session length",
  EVEN_SPREAD_PREFERENCE: "Preferred minutes per day",
  PREFER_FEWER_DATES: "Preferred number of study days",
  MAX_WEEKLY_MINUTES: "Maximum study minutes per week",
  WEEKLY_WORKLOAD_PREFERENCE: "Preferred study minutes per week",
  PREFER_EARLIER_WORKLOAD: "Prefer more work earlier in the course",
  PREFER_BALANCED_PERIODS: "Prefer evenly sized periods",
  PREFER_UNIT_ORDER: "Prefer this unit earlier",
  PREFER_FEWER_SWITCHES: "Prefer fewer topic switches between periods",
};

/**
 * How a strategic roadmap measures a weekly limit.
 *
 * A month-level roadmap does not know which days the work happens on, so an exact
 * rolling seven-day window would be execution detail the plan cannot honour. The
 * weekly limit is therefore converted to the capacity available to each strategic
 * period: `floor(weeklyMinutes × periodDays / 7)`, computed with `floor` so the
 * bound is conservative. Exact rolling-window enforcement runs only on an EXPAND
 * revision, which does know its dates.
 */
export function weeklyMinutesForPeriod(weeklyMinutes: number, periodDays: number): number {
  return Math.floor((weeklyMinutes * Math.max(0, periodDays)) / 7);
}
