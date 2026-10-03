import { UserInputV1Schema, type UserInputV1 } from "./contracts";
import type { ExamTopic } from "./exam-fields";
import type { ExamInput } from "./exam-policy";
import { examInput, topicMinutes } from "./exam-policy";
import {
  periodSpecsFor,
  roadmapInput,
  scopeMinutes,
  type RoadmapInput,
} from "./roadmap-policy";
import {
  masteryInput,
  masteryScopeMinutes,
  type MasteryInput,
} from "./mastery-policy";
import { dateOrdinal, datesBetween, weekday } from "./dates";
import { PlannerValidationError } from "./errors";
import { planMinutes } from "./priority";
import {
  PlannerQuestionReasonSchema,
  type PlannerConstraint,
  type PlannerQuestionReason,
} from "./constraints";

/**
 * Smart Plan Setup — value-of-information questioning (Addendum §2).
 *
 * The pipeline is deliberately: minimum normalized input → DETERMINISTIC
 * uncertainty extraction → strict question schema → at most 1–3 questions →
 * answers merged back into the normalized planning input.
 *
 * There is no freeform questioning and no interview flow. Every question comes
 * from a closed catalog, carries a stable reason code, names the planning
 * dimension it can change, and offers closed choices only. When the planner
 * already has enough information it asks nothing, and every detector below is a
 * pure function of the normalized input so the client, the server and the tests
 * cannot disagree about which questions are justified.
 */
export const SMART_QUESTION_MAX = 3;
export const SMART_QUESTION_OPTION_MAX = 12;

export type PlanningDimension =
  | "PRIORITIZATION"
  | "WORKLOAD"
  | "SCHEDULING"
  | "SCOPE";

export interface SmartQuestionOption {
  value: string;
  label: string;
}
export interface SmartQuestion {
  reasonCode: PlannerQuestionReason;
  dimension: PlanningDimension;
  kind: "SINGLE_CHOICE";
  prompt: string;
  whyItMatters: string;
  options: SmartQuestionOption[];
  allowSkip: true;
}

/**
 * Deterministic ranking, truncation order only. It is a fixed product decision,
 * not a model decision: the generator never chooses which question to ask.
 */
export const QUESTION_RANK: Record<PlannerQuestionReason, number> = {
  PRIORITY_UNCLEAR: 1,
  CONSTRAINT_STRENGTH_UNCLEAR: 2,
  SCOPE_SIZE_UNCLEAR: 3,
  AVAILABILITY_PATTERN_UNCLEAR: 4,
};

/** A label this broad cannot be sized reliably without one clarifying answer. */
const BROAD_LABEL =
  /\b(unit|chapter|module|section|topic|part|block|whole|entire|everything|all)\b/i;
const BROAD_WORDS = 8;
const BROAD_LENGTH = 80;

export interface CoarseSetupSignals {
  usableDates: number;
  usableMinutes: number;
  requiredMinutes: number;
  uniformDailyMinutes: number | null;
  /** Confirmed weekly capacity (sum of the availability grid). */
  weeklyMinutes: number;
  /** Planning periods: exam horizon days for Exam, roadmap periods for Roadmap. */
  periods: number;
}

/** Shared availability maths: both modes confirm the same weekly grid. */
function availabilitySignals(
  input: { startDate: string; endDate: string; availability: { dailyMinutes: number[]; recoveryPercent: number; blockedDates: string[] } },
  requiredMinutes: number,
  periods: number
): CoarseSetupSignals {
  const dates = datesBetween(input.startDate, input.endDate).filter(
    (date) =>
      !input.availability.blockedDates.includes(date) &&
      input.availability.dailyMinutes[weekday(date)] > 0
  );
  const usableMinutes = dates.reduce(
    (sum, date) =>
      sum +
      Math.floor(
        (input.availability.dailyMinutes[weekday(date)] *
          (100 - input.availability.recoveryPercent)) /
          100
      ),
    0
  );
  const openDays = input.availability.dailyMinutes.filter((minutes) => minutes > 0);
  const uniform =
    openDays.length >= 2 && openDays.every((minutes) => minutes === openDays[0])
      ? openDays[0]
      : null;
  return {
    usableDates: dates.length,
    usableMinutes,
    requiredMinutes,
    uniformDailyMinutes: uniform,
    weeklyMinutes: input.availability.dailyMinutes.reduce((a, b) => a + b, 0),
    periods,
  };
}

/**
 * Roadmap signals. Its availability model is a weekly total rather than an exam's
 * explicit per-day grid, so the pattern question becomes genuinely meaningful here
 * and the weekly capacity is what a constraint-strength answer can turn into a
 * limit.
 */
export function roadmapSetupSignals(input: RoadmapInput): CoarseSetupSignals {
  return availabilitySignals(
    input,
    scopeMinutes(input.roadmap.topics),
    periodSpecsFor(input).length
  );
}

/**
 * Mastery signals. Chapter mastery shares Roadmap's weekly availability model, so
 * the coarse requirement is the depth-scaled unit estimate over the derived horizon.
 */
export function masterySetupSignals(input: MasteryInput): CoarseSetupSignals {
  return availabilitySignals(
    input,
    masteryScopeMinutes(input.mastery.topics, input.mastery.desiredDepth),
    Math.max(
      1,
      Math.ceil(
        (dateOrdinal(input.endDate) - dateOrdinal(input.startDate)) / 7
      )
    )
  );
}

/**
 * Coarse, input-only planning signals. Deliberately not the authoritative
 * capacity snapshot: it exists to decide whether a question could materially
 * change the plan, and the server re-validates the real capacity later.
 */
export function coarseSetupSignals(input: ExamInput): CoarseSetupSignals {
  const requiredMinutes =
    input.exam.topics.reduce(
      (sum, topic) => sum + topicMinutes(topic, input.exam.approach === "TRIAGE"),
      0
    ) +
    (input.exam.mockMinutes ?? 0) +
    15;
  return availabilitySignals(
    input,
    requiredMinutes,
    datesBetween(input.startDate, input.endDate).length
  );
}

/** Confirmed scope units, whichever mode the input belongs to. */
export function setupScopeTopics(
  input: UserInputV1 | ExamInput | RoadmapInput | MasteryInput
): readonly { label: string }[] {
  if (input.mode === "EXAM") return (input as ExamInput).exam?.topics ?? [];
  if (input.mode === "ROADMAP") return (input as RoadmapInput).roadmap?.topics ?? [];
  if (input.mode === "MASTERY") return (input as MasteryInput).mastery?.topics ?? [];
  return [];
}

function topicOptions(input: ExamInput): SmartQuestionOption[] {
  return [
    ...input.exam.topics.slice(0, SMART_QUESTION_OPTION_MAX - 1).map((topic, index) => ({
      value: `t${index + 1}`,
      label: topic.label,
    })),
    { value: "NONE", label: "No preference" },
  ];
}

function isBroadLabel(label: string): boolean {
  const value = label.trim();
  return (
    value.length > BROAD_LENGTH ||
    value.split(/\s+/).filter(Boolean).length >= BROAD_WORDS ||
    value.split(/[,;]/).filter((part) => part.trim()).length >= 3 ||
    BROAD_LABEL.test(value)
  );
}

function hasConstraint(input: ExamInput, kind: PlannerConstraint["kind"]): boolean {
  return (input.constraints ?? []).some((constraint) => constraint.kind === kind);
}

/**
 * PRIORITY_UNCLEAR — two topics that confidence alone cannot separate, under a
 * plan where ordering actually competes for capacity. Asking which matters more
 * changes sequencing, depth and practice share.
 */
function priorityUnclear(
  input: ExamInput,
  signals: CoarseSetupSignals
): SmartQuestion | null {
  const topics = input.exam.topics;
  if (topics.length < 2) return null;
  if (topics.some((topic) => (topic.priority ?? "NEUTRAL") !== "NEUTRAL"))
    return null;
  const separated = topics.some((topic, index) =>
    topics
      .slice(index + 1)
      .some(
        (other) =>
          other.confidence === topic.confidence &&
          (other.covered !== topic.covered || other.difficult !== topic.difficult)
      )
  );
  if (!separated) return null;
  if (signals.requiredMinutes <= 0.5 * signals.usableMinutes) return null;
  return {
    reasonCode: "PRIORITY_UNCLEAR",
    dimension: "PRIORITIZATION",
    kind: "SINGLE_CHOICE",
    prompt: "Which confirmed topic matters most for this exam?",
    whyItMatters:
      "Your confidence ratings do not separate these topics, and how much time each one gets depends on which matters more.",
    options: topicOptions(input),
    allowSkip: true,
  };
}

/**
 * CONSTRAINT_STRENGTH_UNCLEAR — your preferred session length cannot be honoured
 * everywhere, so Sylf must know whether it is a real-life limit or a preference.
 * Treating a real limit as a preference would silently break it; treating a
 * preference as a limit would falsely report an impossible plan.
 */
function constraintStrengthUnclear(
  input: ExamInput,
  signals: CoarseSetupSignals
): SmartQuestion | null {
  if (hasConstraint(input, "MAX_SESSION_MINUTES")) return null;
  if (hasConstraint(input, "SESSION_LENGTH_PREFERENCE")) return null;
  if (signals.usableDates < 2 || signals.requiredMinutes <= 0) return null;
  const perDay = Math.ceil(signals.requiredMinutes / signals.usableDates);
  if (input.exam.preferredMinutes >= perDay) return null;
  return {
    reasonCode: "CONSTRAINT_STRENGTH_UNCLEAR",
    dimension: "SCHEDULING",
    kind: "SINGLE_CHOICE",
    prompt: `Your ${input.exam.preferredMinutes}-minute session length cannot cover every date. Is it a limit or a preference?`,
    whyItMatters:
      "A required limit is never broken and may change what fits. A preference lets Sylf exceed it when necessary and explain why.",
    options: [
      { value: "PREFERENCE", label: "Preference / try to honor" },
      { value: "REQUIRED", label: "Required / cannot break" },
    ],
    allowSkip: true,
  };
}

/**
 * SCOPE_SIZE_UNCLEAR — a label too broad to size. The answer only scales the
 * coarse work floor for that label; it never renames or splits the user's scope.
 */
function scopeSizeUnclear(input: ExamInput): SmartQuestion | null {
  if (!input.exam.topics.some((topic) => isBroadLabel(topic.label))) return null;
  return {
    reasonCode: "SCOPE_SIZE_UNCLEAR",
    dimension: "SCOPE",
    kind: "SINGLE_CHOICE",
    prompt: "How large is the broad topic you entered?",
    whyItMatters:
      "A full section needs more planned work than one chapter, and Sylf will not guess which one you meant.",
    options: [
      { value: "ONE_UNIT", label: "One chapter or unit" },
      { value: "SEVERAL_SUBTOPICS", label: "Several subtopics" },
      { value: "FULL_SECTION", label: "A full section or module" },
    ],
    allowSkip: true,
  };
}

/**
 * AVAILABILITY_PATTERN_UNCLEAR — an even daily grid, but no statement about
 * whether every one of those days should be used. Both patterns fit, so the
 * answer changes workload placement.
 */
function availabilityPatternUnclear(
  input: ExamInput,
  signals: CoarseSetupSignals
): SmartQuestion | null {
  if (signals.uniformDailyMinutes === null) return null;
  if (hasConstraint(input, "EVEN_SPREAD_PREFERENCE")) return null;
  if (hasConstraint(input, "PREFER_FEWER_DATES")) return null;
  if (signals.usableDates < 5) return null;
  if (signals.requiredMinutes < 3 * signals.uniformDailyMinutes) return null;
  if (signals.requiredMinutes > 0.7 * signals.usableMinutes) return null;
  return {
    reasonCode: "AVAILABILITY_PATTERN_UNCLEAR",
    dimension: "WORKLOAD",
    kind: "SINGLE_CHOICE",
    prompt:
      "Would you rather spread study evenly across your available days, or keep longer sessions on fewer days?",
    whyItMatters:
      "Both fit your confirmed minutes, and the choice changes how many days carry work.",
    options: [
      { value: "EVEN", label: "Spread it evenly across available days" },
      { value: "FEWER_LONGER", label: "Keep longer sessions on fewer days" },
    ],
    allowSkip: true,
  };
}

/**
 * Unit-shaped detectors, shared by Course Roadmap and Chapter / Unit Mastery.
 *
 * Both modes confirm a list of units with coverage, confidence, difficulty, size
 * and priority, and both have a weekly availability model, so the uncertainty is
 * literally the same question. Only the wording and the option source differ, and
 * those are passed in — one detector serves both modes instead of two copies that
 * could drift apart.
 */
function unitsPriorityUnclear(
  topics: readonly ExamTopic[],
  input: UserInputV1,
  signals: CoarseSetupSignals,
  copy: { prompt: string; whyItMatters: string; options: SmartQuestionOption[] }
): SmartQuestion | null {
  if (topics.length < 2) return null;
  if (topics.some((topic) => (topic.priority ?? "NEUTRAL") !== "NEUTRAL"))
    return null;
  const separated = topics.some((topic, index) =>
    topics
      .slice(index + 1)
      .some(
        (other) =>
          other.confidence === topic.confidence &&
          (other.covered !== topic.covered || other.difficult !== topic.difficult)
      )
  );
  if (!separated) return null;
  if (signals.requiredMinutes <= 0.5 * signals.usableMinutes) return null;
  return {
    reasonCode: "PRIORITY_UNCLEAR",
    dimension: "PRIORITIZATION",
    kind: "SINGLE_CHOICE",
    prompt: copy.prompt,
    whyItMatters: copy.whyItMatters,
    options: copy.options,
    allowSkip: true,
  };
}

function unitsScopeSizeUnclear(
  topics: readonly ExamTopic[],
  copy: { prompt: string; whyItMatters: string }
): SmartQuestion | null {
  if (!topics.some((topic) => isBroadLabel(topic.label))) return null;
  return {
    reasonCode: "SCOPE_SIZE_UNCLEAR",
    dimension: "SCOPE",
    kind: "SINGLE_CHOICE",
    prompt: copy.prompt,
    whyItMatters: copy.whyItMatters,
    options: [
      { value: "ONE_UNIT", label: "One chapter or unit" },
      { value: "SEVERAL_SUBTOPICS", label: "Several subtopics" },
      { value: "FULL_SECTION", label: "A full section or module" },
    ],
    allowSkip: true,
  };
}

function unitsAvailabilityPatternUnclear(
  input: UserInputV1,
  signals: CoarseSetupSignals,
  copy: { prompt: string; whyItMatters: string; even: string; fewer: string }
): SmartQuestion | null {
  if (signals.uniformDailyMinutes === null) return null;
  if (signals.usableDates < 5) return null;
  if (
    (input.constraints ?? []).some(
      (constraint) =>
        constraint.kind === "EVEN_SPREAD_PREFERENCE" ||
        constraint.kind === "PREFER_FEWER_DATES"
    )
  )
    return null;
  if (signals.requiredMinutes < 3 * signals.uniformDailyMinutes) return null;
  if (signals.requiredMinutes > 0.7 * signals.usableMinutes) return null;
  return {
    reasonCode: "AVAILABILITY_PATTERN_UNCLEAR",
    dimension: "WORKLOAD",
    kind: "SINGLE_CHOICE",
    prompt: copy.prompt,
    whyItMatters: copy.whyItMatters,
    options: [
      { value: "EVEN", label: copy.even },
      { value: "FEWER_LONGER", label: copy.fewer },
    ],
    allowSkip: true,
  };
}

function unitsConstraintStrengthUnclear(
  input: UserInputV1,
  signals: CoarseSetupSignals,
  copy: { prompt: string; whyItMatters: string }
): SmartQuestion | null {
  const weekly = signals.weeklyMinutes;
  if (weekly <= 0) return null;
  if (
    (input.constraints ?? []).some(
      (constraint) =>
        constraint.kind === "MAX_WEEKLY_MINUTES" ||
        constraint.kind === "WEEKLY_WORKLOAD_PREFERENCE"
    )
  )
    return null;
  const usableWeeks = Math.max(1, Math.ceil(signals.usableDates / 7));
  const neededPerWeek = Math.ceil(signals.requiredMinutes / usableWeeks);
  if (neededPerWeek > weekly) return null; // Feasibility reports this, not a question.
  if (neededPerWeek <= 0.8 * weekly) return null;
  return {
    reasonCode: "CONSTRAINT_STRENGTH_UNCLEAR",
    dimension: "SCHEDULING",
    kind: "SINGLE_CHOICE",
    prompt: copy.prompt,
    whyItMatters: copy.whyItMatters,
    options: [
      { value: "PREFERENCE", label: "Preference / try to honor" },
      { value: "REQUIRED", label: "Required / cannot break" },
    ],
    allowSkip: true,
  };
}

/**
 * A mastery plan's sessions are daily Quests, so its constraint-strength question is
 * about the session length limit the mode can actually evaluate — never a weekly
 * limit, which is Roadmap-only vocabulary.
 */
function masteryConstraintStrengthUnclear(
  input: MasteryInput,
  signals: CoarseSetupSignals
): SmartQuestion | null {
  if (hasConstraint(input as unknown as ExamInput, "MAX_SESSION_MINUTES")) return null;
  if (
    hasConstraint(input as unknown as ExamInput, "SESSION_LENGTH_PREFERENCE")
  )
    return null;
  if (signals.requiredMinutes <= 0) return null;
  const longest = Math.max(
    0,
    ...input.availability.dailyMinutes.filter((minutes) => minutes > 0)
  );
  if (longest < 15) return null;
  return {
    reasonCode: "CONSTRAINT_STRENGTH_UNCLEAR",
    dimension: "SCHEDULING",
    kind: "SINGLE_CHOICE",
    prompt: `Your longest available day is ${longest} minutes. Is that a limit or a preference for one session?`,
    whyItMatters:
      "A required limit is never exceeded and may mean a unit needs more dates. A preference lets Sylf go above it when a unit needs more time and explain why.",
    options: [
      { value: "PREFERENCE", label: "Preference / try to honor" },
      { value: "REQUIRED", label: "Required / cannot break" },
    ],
    allowSkip: true,
  };
}

/** Roadmap's copy of the shared unit detectors. */
function roadmapUnitCopy() {
  return {
    priority: {
      prompt: "Which syllabus unit matters most for this course?",
      whyItMatters:
        "Your progress ratings do not separate these units, and how much time each one gets depends on which matters more.",
    },
    scope: {
      prompt: "How large is the broad syllabus unit you entered?",
      whyItMatters:
        "A full module needs more planned work than one chapter, and Sylf will not guess which one you meant.",
    },
    availability: {
      prompt:
        "Would you rather spread study evenly across your study days, or keep longer sessions on fewer days?",
      whyItMatters:
        "Both fit your confirmed weekly minutes, and the choice changes how many days each period uses when you plan it.",
      even: "Spread it evenly across study days",
      fewer: "Keep longer sessions on fewer days",
    },
  };
}

/** Mastery's copy of the same detectors, in the mode's own words. */
function masteryUnitCopy() {
  return {
    priority: {
      prompt: "Which unit in this chapter matters most to you?",
      whyItMatters:
        "Your progress ratings do not separate these units, and which one is practised most and checked hardest depends on which matters more.",
    },
    scope: {
      prompt: "How large is the broad unit you entered?",
      whyItMatters:
        "A whole module needs more planned work than one chapter, and Sylf will not guess which one you meant.",
    },
    availability: {
      prompt:
        "Would you rather spread mastery work evenly across your study days, or keep longer sessions on fewer days?",
      whyItMatters:
        "Both fit your confirmed minutes, and the choice changes how many days carry recall and practice.",
      even: "Spread it evenly across study days",
      fewer: "Keep longer sessions on fewer days",
    },
  };
}

/**
 * Roadmap variant of the same four reason codes. The uncertainty is the same kind
 * of uncertainty; what differs is the input model (units, periods and a weekly
 * total instead of an exam's daily grid), so the detectors are mode-specific while
 * the catalog, ranking, schema and answer handling stay shared.
 */
function roadmapPriorityUnclear(
  input: RoadmapInput,
  signals: CoarseSetupSignals
): SmartQuestion | null {
  return unitsPriorityUnclear(
    input.roadmap.topics,
    input,
    signals,
    {
      ...roadmapUnitCopy().priority,
      options: roadmapTopicOptions(input),
    }
  );
}

function roadmapConstraintStrengthUnclear(
  input: RoadmapInput,
  signals: CoarseSetupSignals
): SmartQuestion | null {
  const weekly = signals.weeklyMinutes;
  if (weekly <= 0) return null;
  return unitsConstraintStrengthUnclear(input, signals, {
    prompt: `Your ${weekly}-minute week is almost fully needed. Is it a limit or a preference?`,
    whyItMatters:
      "A required limit is never exceeded and may change what fits. A preference lets Sylf go above it when a period needs more and explain why.",
  });
}

function roadmapScopeSizeUnclear(input: RoadmapInput): SmartQuestion | null {
  return unitsScopeSizeUnclear(
    input.roadmap.topics,
    roadmapUnitCopy().scope
  );
}

/**
 * A confirmed weekly total with no distribution says nothing about whether those
 * minutes should be spread across the week or concentrated, and the answer changes
 * how a later period expansion fills its days.
 */
function roadmapAvailabilityPatternUnclear(
  input: RoadmapInput,
  signals: CoarseSetupSignals
): SmartQuestion | null {
  return unitsAvailabilityPatternUnclear(
    input,
    signals,
    roadmapUnitCopy().availability
  );
}

function masteryPriorityUnclear(
  input: MasteryInput,
  signals: CoarseSetupSignals
): SmartQuestion | null {
  return unitsPriorityUnclear(input.mastery.topics, input, signals, {
    ...masteryUnitCopy().priority,
    options: masteryTopicOptions(input),
  });
}

function masteryScopeSizeUnclear(input: MasteryInput): SmartQuestion | null {
  return unitsScopeSizeUnclear(input.mastery.topics, masteryUnitCopy().scope);
}

function masteryAvailabilityPatternUnclear(
  input: MasteryInput,
  signals: CoarseSetupSignals
): SmartQuestion | null {
  return unitsAvailabilityPatternUnclear(
    input,
    signals,
    masteryUnitCopy().availability
  );
}

function masteryTopicOptions(input: MasteryInput): SmartQuestionOption[] {
  return [
    ...input.mastery.topics
      .slice(0, SMART_QUESTION_OPTION_MAX - 1)
      .map((topic, index) => ({ value: `t${index + 1}`, label: topic.label })),
    { value: "NONE", label: "No preference" },
  ];
}

function roadmapTopicOptions(input: RoadmapInput): SmartQuestionOption[] {
  return [
    ...input.roadmap.topics
      .slice(0, SMART_QUESTION_OPTION_MAX - 1)
      .map((topic, index) => ({ value: `t${index + 1}`, label: topic.label })),
    { value: "NONE", label: "No preference" },
  ];
}

/**
 * At most `limit` (default 3) high-value questions, or none at all when no answer
 * would materially change the plan. One entry point dispatches by mode so Exam and
 * Roadmap cannot drift in ranking, bounds or answer handling.
 */
export function smartQuestions(
  input: ExamInput | RoadmapInput | MasteryInput,
  limit = SMART_QUESTION_MAX
): SmartQuestion[] {
  let detected: SmartQuestion[];
  if (input.mode === "EXAM") {
    const exam = input as ExamInput;
    examInput(exam);
    const signals = coarseSetupSignals(exam);
    detected = [
      priorityUnclear(exam, signals),
      constraintStrengthUnclear(exam, signals),
      scopeSizeUnclear(exam),
      availabilityPatternUnclear(exam, signals),
    ].filter((question): question is SmartQuestion => question !== null);
  } else if (input.mode === "ROADMAP") {
    const roadmap = roadmapInput(input as UserInputV1);
    const signals = roadmapSetupSignals(roadmap);
    detected = [
      roadmapPriorityUnclear(roadmap, signals),
      roadmapConstraintStrengthUnclear(roadmap, signals),
      roadmapScopeSizeUnclear(roadmap),
      roadmapAvailabilityPatternUnclear(roadmap, signals),
    ].filter((question): question is SmartQuestion => question !== null);
  } else {
    const mastery = masteryInput(input as UserInputV1);
    const signals = masterySetupSignals(mastery);
    detected = [
      masteryPriorityUnclear(mastery, signals),
      masteryConstraintStrengthUnclear(mastery, signals),
      masteryScopeSizeUnclear(mastery),
      masteryAvailabilityPatternUnclear(mastery, signals),
    ].filter((question): question is SmartQuestion => question !== null);
  }
  return detected
    .sort((a, b) => QUESTION_RANK[a.reasonCode] - QUESTION_RANK[b.reasonCode])
    .slice(0, Math.max(0, Math.min(limit, SMART_QUESTION_MAX)))
    .map((question) => ({
      ...question,
      options: question.options.slice(0, SMART_QUESTION_OPTION_MAX),
    }));
}

export interface SmartAnswer {
  reasonCode: string;
  value: string;
}

/**
 * The closed option catalog. Only these values can ever be merged into the
 * planning input, so an answer can never introduce data the planner did not ask
 * for — and re-applying an answer stays idempotent even though its question is no
 * longer justified once it has been answered.
 */
export const SMART_ANSWER_OPTIONS: Record<PlannerQuestionReason, "TOPICS" | string[]> = {
  PRIORITY_UNCLEAR: "TOPICS",
  CONSTRAINT_STRENGTH_UNCLEAR: ["PREFERENCE", "REQUIRED"],
  SCOPE_SIZE_UNCLEAR: ["ONE_UNIT", "SEVERAL_SUBTOPICS", "FULL_SECTION"],
  AVAILABILITY_PATTERN_UNCLEAR: ["EVEN", "FEWER_LONGER"],
};

export function assertAnswerSchema(answers: readonly SmartAnswer[]): void {
  if (answers.length > SMART_QUESTION_MAX)
    throw new PlannerValidationError("TOO_MANY_SMART_ANSWERS");
  const codes = answers.map((answer) => answer.reasonCode);
  if (new Set(codes).size !== codes.length)
    throw new PlannerValidationError("DUPLICATE_SMART_ANSWER");
  for (const answer of answers) {
    if (!PlannerQuestionReasonSchema.safeParse(answer.reasonCode).success)
      throw new PlannerValidationError("UNSUPPORTED_SMART_QUESTION");
    if (!answer.value || answer.value.length > 120)
      throw new PlannerValidationError("UNSUPPORTED_SMART_ANSWER");
  }
}

/**
 * An answer is accepted only for an approved reason code with an approved option.
 * The planner never asks a question outside this catalog, so anything else is
 * arbitrary data collection and is rejected rather than stored.
 */
export function assertSupportedAnswers(
  input: ExamInput | RoadmapInput | MasteryInput,
  answers: readonly SmartAnswer[]
): void {
  assertAnswerSchema(answers);
  const topics = setupScopeTopics(input);
  for (const answer of answers) {
    const reasonCode = answer.reasonCode as PlannerQuestionReason;
    const allowed = SMART_ANSWER_OPTIONS[reasonCode];
    if (allowed === "TOPICS") {
      if (answer.value === "NONE") continue;
      const index = Number(answer.value.replace(/^t/, "")) - 1;
      if (
        !/^t[1-9][0-9]*$/.test(answer.value) ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= topics.length
      )
        throw new PlannerValidationError("UNSUPPORTED_SMART_ANSWER");
      continue;
    }
    if (!allowed.includes(answer.value))
      throw new PlannerValidationError("UNSUPPORTED_SMART_ANSWER");
  }
}

function withoutReason(
  constraints: PlannerConstraint[],
  reasonCode: PlannerQuestionReason
): PlannerConstraint[] {
  return constraints.filter((constraint) => constraint.reasonCode !== reasonCode);
}

/**
 * Merge answers into the normalized planning input. Idempotent: re-applying the
 * same answers replaces the constraints they own instead of stacking them, so a
 * user cannot accumulate contradictory constraints by re-answering.
 */
export function applySmartAnswers<T extends UserInputV1>(
  input: T,
  answers: readonly SmartAnswer[]
): T {
  if (!answers.length) return input;
  if (input.mode === "ROADMAP") {
    const roadmap = roadmapInput(input);
    return applyRoadmapAnswers(roadmap, answers) as unknown as T;
  }
  if (input.mode === "MASTERY") {
    const mastery = masteryInput(input);
    return applyMasteryAnswers(mastery, answers) as unknown as T;
  }
  const exam = input as unknown as ExamInput;
  examInput(exam);
  return applyExamAnswers(exam, answers) as unknown as T;
}

function applyExamAnswers(
  input: ExamInput,
  answers: readonly SmartAnswer[]
): ExamInput {
  assertSupportedAnswers(input, answers);
  const signals = coarseSetupSignals(input);
  let constraints: PlannerConstraint[] = [...(input.constraints ?? [])];
  let topics = input.exam.topics;

  for (const answer of answers) {
    const reasonCode = answer.reasonCode as PlannerQuestionReason;
    constraints = withoutReason(constraints, reasonCode);
    if (reasonCode === "PRIORITY_UNCLEAR")
      topics = applyPriorityAnswer(topics, answer.value);
    if (reasonCode === "SCOPE_SIZE_UNCLEAR")
      topics = applyScopeSizeAnswer(topics, answer.value);
    if (reasonCode === "CONSTRAINT_STRENGTH_UNCLEAR") {
      constraints.push(
        answer.value === "REQUIRED"
          ? {
              kind: "MAX_SESSION_MINUTES",
              strength: "HARD",
              value: input.exam.preferredMinutes,
              source: "USER_EXPLICIT",
              reasonCode,
            }
          : {
              kind: "SESSION_LENGTH_PREFERENCE",
              strength: "SOFT",
              value: input.exam.preferredMinutes,
              preferenceWeight: 2,
              source: "USER_EXPLICIT",
              reasonCode,
            }
      );
    }
    if (reasonCode === "AVAILABILITY_PATTERN_UNCLEAR") {
      const perDay = Math.max(
        30,
        planMinutes(signals.requiredMinutes / Math.max(1, signals.usableDates))
      );
      const fewestDates = Math.max(
        1,
        Math.ceil(signals.requiredMinutes / (signals.uniformDailyMinutes ?? 60))
      );
      const maxDates = Math.max(
        fewestDates,
        Math.ceil(signals.usableDates / 2)
      );
      constraints.push(
        answer.value === "EVEN"
          ? {
              kind: "EVEN_SPREAD_PREFERENCE",
              strength: "SOFT",
              value: Math.min(perDay, 720),
              preferenceWeight: 2,
              source: "USER_EXPLICIT",
              reasonCode,
            }
          : {
              kind: "PREFER_FEWER_DATES",
              strength: "SOFT",
              value: Math.min(maxDates, 90),
              preferenceWeight: 2,
              source: "USER_EXPLICIT",
              reasonCode,
            }
      );
    }
  }

  const merged = UserInputV1Schema.parse({
    ...input,
    exam: { ...input.exam, topics },
    ...(constraints.length ? { constraints } : {}),
  });
  examInput(merged);
  return merged;
}

/**
 * Roadmap answers, using the same reason codes, constraints and idempotent
 * replacement rules. The only mode-specific part is which limit a strength answer
 * becomes: a weekly capacity limit rather than a per-session one.
 */
/** PRIORITY_UNCLEAR: one unit is marked HIGH; nothing else about the scope moves. */
function applyPriorityAnswer(
  topics: ExamTopic[],
  value: string
): ExamTopic[] {
  if (value === "NONE") return topics;
  const index = Number(value.replace(/^t/, "")) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= topics.length)
    throw new PlannerValidationError("UNSUPPORTED_SMART_ANSWER");
  return topics.map((topic, position) =>
    position === index
      ? { ...topic, priority: "HIGH", prioritySource: "USER_EXPLICIT" }
      : topic
  );
}

/** SCOPE_SIZE_UNCLEAR: scales the coarse work floor of a broad label only. */
function applyScopeSizeAnswer(
  topics: ExamTopic[],
  value: string
): ExamTopic[] {
  const signal = value as "ONE_UNIT" | "SEVERAL_SUBTOPICS" | "FULL_SECTION";
  return topics.map((topic) =>
    isBroadLabel(topic.label) ? { ...topic, sizeSignal: signal } : topic
  );
}

function applyRoadmapAnswers(
  input: RoadmapInput,
  answers: readonly SmartAnswer[]
): UserInputV1 {
  assertSupportedAnswers(input, answers);
  const signals = roadmapSetupSignals(input);
  let constraints: PlannerConstraint[] = [...(input.constraints ?? [])];
  let topics = input.roadmap.topics;
  for (const answer of answers) {
    const reasonCode = answer.reasonCode as PlannerQuestionReason;
    constraints = withoutReason(constraints, reasonCode);
    if (reasonCode === "PRIORITY_UNCLEAR") {
      if (answer.value === "NONE") continue;
      const index = Number(answer.value.replace(/^t/, "")) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= topics.length)
        throw new PlannerValidationError("UNSUPPORTED_SMART_ANSWER");
      topics = topics.map((topic, position) =>
        position === index
          ? { ...topic, priority: "HIGH", prioritySource: "USER_EXPLICIT" }
          : topic
      );
    }
    if (reasonCode === "SCOPE_SIZE_UNCLEAR") {
      const signal = answer.value as "ONE_UNIT" | "SEVERAL_SUBTOPICS" | "FULL_SECTION";
      topics = topics.map((topic) =>
        isBroadLabel(topic.label) ? { ...topic, sizeSignal: signal } : topic
      );
    }
    if (reasonCode === "CONSTRAINT_STRENGTH_UNCLEAR") {
      constraints.push(
        answer.value === "REQUIRED"
          ? {
              kind: "MAX_WEEKLY_MINUTES",
              strength: "HARD",
              value: signals.weeklyMinutes,
              source: "USER_EXPLICIT",
              reasonCode,
            }
          : {
              kind: "WEEKLY_WORKLOAD_PREFERENCE",
              strength: "SOFT",
              value: signals.weeklyMinutes,
              preferenceWeight: 2,
              source: "USER_EXPLICIT",
              reasonCode,
            }
      );
    }
    if (reasonCode === "AVAILABILITY_PATTERN_UNCLEAR") {
      const perDay = Math.max(
        30,
        planMinutes(signals.requiredMinutes / Math.max(1, signals.usableDates))
      );
      const fewestDates = Math.max(
        1,
        Math.ceil(signals.requiredMinutes / (signals.uniformDailyMinutes ?? 60))
      );
      const maxDates = Math.max(fewestDates, Math.ceil(signals.usableDates / 2));
      constraints.push(
        answer.value === "EVEN"
          ? {
              kind: "EVEN_SPREAD_PREFERENCE",
              strength: "SOFT",
              value: Math.min(perDay, 720),
              preferenceWeight: 2,
              source: "USER_EXPLICIT",
              reasonCode,
            }
          : {
              kind: "PREFER_FEWER_DATES",
              strength: "SOFT",
              value: Math.min(maxDates, 90),
              preferenceWeight: 2,
              source: "USER_EXPLICIT",
              reasonCode,
            }
      );
    }
  }
  const merged = UserInputV1Schema.parse({
    ...input,
    roadmap: { ...input.roadmap, topics },
    ...(constraints.length ? { constraints } : {}),
  });
  return merged;
}

/**
 * Mastery answers. The unit-shaped answers are merged exactly as Roadmap merges
 * them; the constraint answer becomes the session-length limit the mode can
 * evaluate, never a weekly limit that Mastery does not support.
 */
function applyMasteryAnswers(
  input: MasteryInput,
  answers: readonly SmartAnswer[]
): UserInputV1 {
  assertSupportedAnswers(input, answers);
  const signals = masterySetupSignals(input);
  let constraints: PlannerConstraint[] = [...(input.constraints ?? [])];
  let topics = input.mastery.topics;
  for (const answer of answers) {
    const reasonCode = answer.reasonCode as PlannerQuestionReason;
    constraints = withoutReason(constraints, reasonCode);
    if (reasonCode === "PRIORITY_UNCLEAR")
      topics = applyPriorityAnswer(topics, answer.value);
    if (reasonCode === "SCOPE_SIZE_UNCLEAR")
      topics = applyScopeSizeAnswer(topics, answer.value);
    if (reasonCode === "CONSTRAINT_STRENGTH_UNCLEAR") {
      const longest = Math.max(
        15,
        Math.min(
          240,
          Math.max(
            0,
            ...input.availability.dailyMinutes.filter((minutes) => minutes > 0)
          ) || 60
        )
      );
      constraints.push(
        answer.value === "REQUIRED"
          ? {
              kind: "MAX_SESSION_MINUTES",
              strength: "HARD",
              value: longest,
              source: "USER_EXPLICIT",
              reasonCode,
            }
          : {
              kind: "SESSION_LENGTH_PREFERENCE",
              strength: "SOFT",
              value: longest,
              preferenceWeight: 2,
              source: "USER_EXPLICIT",
              reasonCode,
            }
      );
    }
    if (reasonCode === "AVAILABILITY_PATTERN_UNCLEAR") {
      const perDay = Math.max(
        30,
        planMinutes(signals.requiredMinutes / Math.max(1, signals.usableDates))
      );
      const fewestDates = Math.max(
        1,
        Math.ceil(signals.requiredMinutes / (signals.uniformDailyMinutes ?? 60))
      );
      const maxDates = Math.max(fewestDates, Math.ceil(signals.usableDates / 2));
      constraints.push(
        answer.value === "EVEN"
          ? {
              kind: "EVEN_SPREAD_PREFERENCE",
              strength: "SOFT",
              value: Math.min(perDay, 720),
              preferenceWeight: 2,
              source: "USER_EXPLICIT",
              reasonCode,
            }
          : {
              kind: "PREFER_FEWER_DATES",
              strength: "SOFT",
              value: Math.min(maxDates, 90),
              preferenceWeight: 2,
              source: "USER_EXPLICIT",
              reasonCode,
            }
      );
    }
  }
  return UserInputV1Schema.parse({
    ...input,
    mastery: { ...input.mastery, topics },
    ...(constraints.length ? { constraints } : {}),
  });
}

/**
 * Content-free description of the A1 inputs a user actually supplied. Used for
 * telemetry; contains no academic text.
 */
export function smartSetupSummary(
  input: ExamInput | RoadmapInput | MasteryInput
): {
  answeredReasons: PlannerQuestionReason[];
  priorityTopics: number;
  sizedTopics: number;
} {
  const answeredReasons = PlannerQuestionReasonSchema.options.filter((reason) =>
    (input.constraints ?? []).some((constraint) => constraint.reasonCode === reason)
  );
  const topics = setupScopeTopics(input);
  return {
    answeredReasons,
    priorityTopics: topics.filter(
      (topic) => ((topic as { priority?: string }).priority ?? "NEUTRAL") !== "NEUTRAL"
    ).length,
    sizedTopics: topics.filter((topic) => Boolean((topic as { sizeSignal?: string }).sizeSignal))
      .length,
  };
}
