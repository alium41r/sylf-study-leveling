import {
  LIMITS,
  type UserInputV1,
} from "../contracts";
import { PlannerValidationError } from "../errors";
import { dateOrdinal } from "../dates";
import { EXAM_RESERVE } from "../exam-policy";
import { ROADMAP_RESERVE } from "../roadmap-policy";
import { MASTERY_RESERVE } from "../mastery-policy";
import { flattenScope, type PlanBriefV1 } from "./brief";
import { distributeWeeklyBudget, weeklyFromSchedule } from "./distribution";
import { briefReadiness } from "./readiness";

/**
 * Deterministic translation: Plan Brief → the engine's own input contract.
 *
 * This is the only bridge between the intake layer and the planner engine, and it
 * is deliberately boring: no model call, no inference, no academic content beyond
 * what the student typed. Everything the engine requires is satisfied exactly as
 * the existing validators demand — `scope` is the flattened labels joined with
 * newlines in the same order, labels are unique, the horizon is inside the limit,
 * the availability vector is the distributor's output, and every mode detail is
 * either a stated value or a documented default.
 *
 * The adapter is where intake-only concepts stop: the engine never learns that a
 * brief existed, and nothing intake-shaped is written into a revision snapshot.
 */

export interface AdapterContext {
  /**
   * Today, in the plan's own timezone, from the server's schedule read. A brief
   * never invents a start date: the horizon begins when planning begins.
   */
  today: string;
  /** The account's rest weekdays. */
  restWeekdays: readonly number[];
  /** Dated rest days inside the horizon. */
  floatingRestDates?: readonly string[];
  /** Minutes already committed by existing Quests, keyed by date. */
  existingLoadByDate?: Readonly<Record<string, number>>;
  /**
   * The weekly figure implied by the account's own schedule, used when the student
   * chose to keep their normal Sylf rhythm instead of naming hours.
   */
  dailyGoalMinutes?: number | null;
}

/** Documented defaults for everything Quick Plan does not ask. */
export const ADAPTER_DEFAULTS = {
  /** Exam session length when no preference is stated, matching the contract floor band. */
  preferredSessionMinutes: 45,
  examFormat: "UNSPECIFIED",
  examApproach: "STANDARD",
  masteryDepth: "SOLID",
  masteryPriorExposure: "NEW",
  masteryCheckPreference: "MIXED_PRACTICE",
  /** Roadmap switches to month granularity beyond this span. */
  monthGranularityAfterDays: 70,
} as const;

const fail: (code: string) => never = (code) => {
  throw new PlannerValidationError(code);
};

/** The weekly figure this brief plans against, from the budget or the schedule. */
function effectiveWeekly(brief: PlanBriefV1, context: AdapterContext): number {
  if (brief.budget.weeklyMinutes !== null) return brief.budget.weeklyMinutes;
  const derived = weeklyFromSchedule({
    dailyGoalMinutes: context.dailyGoalMinutes ?? null,
    restWeekdays: context.restWeekdays,
  });
  if (derived === null) fail("CAPACITY_MISSING");
  return derived as number;
}

/** Shared pieces every mode uses: horizon, availability, flattened scope. */
function commonInput(brief: PlanBriefV1, context: AdapterContext) {
  const flat = flattenScope(brief.scope.nodes);
  if (!flat.units.length) fail("SCOPE_MISSING");
  const endDate = brief.target.endDate;
  if (!endDate) fail("TARGET_DATE_MISSING");
  const startDate = context.today;
  const horizon = dateOrdinal(endDate) - dateOrdinal(startDate);
  if (horizon < 0) fail("INVALID_HORIZON");
  if (horizon > LIMITS.horizonDays) fail("INVALID_HORIZON");

  const weekly = effectiveWeekly(brief, context);
  const distribution = distributeWeeklyBudget({
    weeklyMinutes: weekly,
    firstDate: startDate,
    lastDate: endDate,
    restWeekdays: context.restWeekdays,
    floatingRestDates: context.floatingRestDates ?? [],
    existingLoadByDate: context.existingLoadByDate ?? {},
    softHints: softHintsFrom(brief),
    dailyOverrides: brief.budget.dailyOverrides,
  });
  const blockedDates = [
    ...new Set([
      ...brief.budget.blockedDates.filter((date) => date >= startDate && date <= endDate),
      ...distribution.blockedDates,
    ]),
  ].sort();

  // Preparedness is sparse in the brief and explicit in the contract: a unit the
  // student never rated carries `null`s, which the planner reads as unstated rather
  // than as "not covered" or "very weak".
  const byNode = new Map(brief.preparedness.map((entry) => [entry.nodeId, entry]));
  const topics = flat.units.map((unit) => {
    const stated = byNode.get(unit.nodeId);
    return {
      label: unit.label,
      covered: stated?.covered ?? null,
      confidence: stated?.confidence ?? null,
      difficult: stated?.difficult ?? null,
      ...(stated?.priority ? { priority: stated.priority } : {}),
      ...(stated?.prioritySource ? { prioritySource: stated.prioritySource } : {}),
    };
  });

  return { flat, startDate, endDate, horizon, distribution, blockedDates, topics, weekly };
}

/** A1 soft preferences become distribution hints; they never become constraints. */
function softHintsFrom(brief: PlanBriefV1): { evenSpread?: boolean; fewerDates?: boolean } {
  const hints: { evenSpread?: boolean; fewerDates?: boolean } = {};
  for (const constraint of brief.constraints) {
    if (constraint.kind === "EVEN_SPREAD_PREFERENCE") hints.evenSpread = true;
    if (constraint.kind === "PREFER_FEWER_DATES") hints.fewerDates = true;
  }
  return hints;
}

/** The session length the student set, if any, else the documented default. */
function sessionMinutes(brief: PlanBriefV1): number {
  const stated = brief.constraints.find(
    (constraint) => constraint.kind === "SESSION_LENGTH_PREFERENCE"
  );
  const value = stated?.value ?? ADAPTER_DEFAULTS.preferredSessionMinutes;
  return Math.min(120, Math.max(15, Math.round(value)));
}

/** Recovery reserve: the student's value, or the mode's own default. */
const reserveFor = (brief: PlanBriefV1, fallback: number): number =>
  brief.budget.recoveryPercent ?? fallback;

export function examInputFromBrief(brief: PlanBriefV1, context: AdapterContext): UserInputV1 {
  if (brief.mode !== "EXAM") fail("MODE_MISMATCH");
  const common = commonInput(brief, context);
  const examDate = brief.target.examDate;
  if (!examDate) fail("TARGET_DATE_MISSING");
  if (examDate !== common.endDate) fail("EXAM_DATE_MISMATCH");
  const subjectName = brief.subject.name?.trim() || brief.goal.title.trim();
  return {
    schemaVersion: 1,
    mode: "EXAM",
    title: brief.goal.title,
    scope: common.flat.scope,
    startDate: common.startDate,
    endDate: common.endDate,
    examDate,
    availability: {
      dailyMinutes: common.distribution.dailyMinutes,
      recoveryPercent: reserveFor(brief, EXAM_RESERVE),
      blockedDates: common.blockedDates,
    },
    exam: {
      subjectName,
      subjectId: brief.subject.kind === "SYLF_SUBJECT" ? brief.subject.subjectId : null,
      topics: common.topics,
      format: ADAPTER_DEFAULTS.examFormat,
      preferredMinutes: sessionMinutes(brief),
      mockMinutes: null,
      allowExamDayStudy: false,
      approach: ADAPTER_DEFAULTS.examApproach,
      acceptReducedReserve: brief.budget.acceptReducedReserve,
    },
    ...(brief.constraints.length ? { constraints: brief.constraints } : {}),
  };
}

export function roadmapInputFromBrief(brief: PlanBriefV1, context: AdapterContext): UserInputV1 {
  if (brief.mode !== "ROADMAP") fail("MODE_MISMATCH");
  const common = commonInput(brief, context);
  const subjectName = brief.subject.name?.trim() || brief.goal.title.trim();
  return {
    schemaVersion: 1,
    mode: "ROADMAP",
    title: brief.goal.title,
    outcome: brief.goal.title,
    scope: common.flat.scope,
    startDate: common.startDate,
    endDate: common.endDate,
    availability: {
      dailyMinutes: common.distribution.dailyMinutes,
      recoveryPercent: reserveFor(brief, ROADMAP_RESERVE),
      blockedDates: common.blockedDates,
    },
    roadmap: {
      subjectName,
      subjectId: brief.subject.kind === "SYLF_SUBJECT" ? brief.subject.subjectId : null,
      qualification: brief.backgroundCurriculum
        ? [brief.backgroundCurriculum.level, brief.backgroundCurriculum.board]
            .filter(Boolean)
            .join(" · ") || null
        : null,
      topics: common.topics,
      granularity:
        common.horizon > ADAPTER_DEFAULTS.monthGranularityAfterDays ? "MONTH" : "WEEK",
      acceptReducedReserve: brief.budget.acceptReducedReserve,
    },
    ...(brief.constraints.length ? { constraints: brief.constraints } : {}),
  };
}

export function masteryInputFromBrief(brief: PlanBriefV1, context: AdapterContext): UserInputV1 {
  if (brief.mode !== "MASTERY") fail("MODE_MISMATCH");
  const common = commonInput(brief, context);
  const subjectName = brief.subject.name?.trim() || brief.goal.title.trim();
  return {
    schemaVersion: 1,
    mode: "MASTERY",
    title: brief.goal.title,
    focus: brief.goal.title,
    scope: common.flat.scope,
    startDate: common.startDate,
    endDate: common.endDate,
    availability: {
      dailyMinutes: common.distribution.dailyMinutes,
      recoveryPercent: reserveFor(brief, MASTERY_RESERVE),
      blockedDates: common.blockedDates,
    },
    mastery: {
      subjectName,
      subjectId: brief.subject.kind === "SYLF_SUBJECT" ? brief.subject.subjectId : null,
      unitTitle: brief.goal.title,
      topics: common.topics,
      desiredDepth: ADAPTER_DEFAULTS.masteryDepth,
      priorExposure: ADAPTER_DEFAULTS.masteryPriorExposure,
      checkPreference: ADAPTER_DEFAULTS.masteryCheckPreference,
      targetDate: common.endDate,
      acceptReducedReserve: brief.budget.acceptReducedReserve,
    },
    ...(brief.constraints.length ? { constraints: brief.constraints } : {}),
  };
}

/** The one entry point callers should use: mode is read from the brief itself. */
export function inputFromBrief(brief: PlanBriefV1, context: AdapterContext): UserInputV1 {
  switch (brief.mode) {
    case "EXAM":
      return examInputFromBrief(brief, context);
    case "ROADMAP":
      return roadmapInputFromBrief(brief, context);
    default:
      return masteryInputFromBrief(brief, context);
  }
}

/**
 * Adapter-level guard for the generate action: readiness first, then translation.
 *
 * Kept here so the route, the tests and any future caller agree on the order —
 * readiness is a structured refusal, translation is a technical failure, and the
 * two must not be confused in the response the student sees.
 */
export function assertBriefGeneratable(
  brief: PlanBriefV1,
  context: AdapterContext
): void {
  const readiness = briefReadiness(brief, {
    scheduleWeeklyMinutes: weeklyFromSchedule({
      dailyGoalMinutes: context.dailyGoalMinutes ?? null,
      restWeekdays: context.restWeekdays,
    }),
  });
  if (!readiness.canGenerate) fail("BRIEF_NOT_READY");
  inputFromBrief(brief, context);
}

/** Serialized size of the engine input a brief produces — measured in the report. */
export function inputBytesFor(brief: PlanBriefV1, context: AdapterContext): number {
  const payload = JSON.stringify(inputFromBrief(brief, context));
  return payload ? new TextEncoder().encode(payload).byteLength : 0;
}
