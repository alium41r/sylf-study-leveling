import type { UserInputV1, ValidatedDraftV1, ModelProposalV1 } from "./contracts";
import type { PlannerConstraint } from "./constraints";
import type { AvailabilitySnapshot } from "./capacity";
import { validateCapacity } from "./capacity";
import { dateOrdinal } from "./dates";
import { PlannerValidationError } from "./errors";
import { milestoneOutcomeIssue } from "./done";
import { priorityLevel } from "./priority";
import { scopeTopicMinutes, type ScopeTopic } from "./scope-topic";
import {
  ROADMAP_LIMITS,
  type RoadmapDetails,
  type RoadmapGranularity,
} from "./roadmap-fields";
import {
  assertConstraintsApplicable,
  constraintsOf,
  hardWeeklyLimit,
  softConstraints,
  weeklyMinutesForPeriod,
  type ConstraintItem,
  type SoftViolation,
} from "./constraints";
import type { PlannerSemanticIssue } from "./semantic";
import { isWeak } from "./preparedness";

/** Roadmap planning protects the same recovery reserve as Exam planning. */
export const ROADMAP_RESERVE = 15;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Structural view of a confirmed roadmap input. Declared explicitly rather than
 * derived from the contract union so the pure policy module has no type cycle with
 * `contracts.ts` (which imports these validators).
 */
export interface RoadmapInput {
  schemaVersion: 1;
  mode: "ROADMAP";
  title: string;
  scope: string;
  startDate: string;
  endDate: string;
  availability: {
    dailyMinutes: number[];
    recoveryPercent: number;
    blockedDates: string[];
  };
  constraints?: PlannerConstraint[];
  outcome: string;
  roadmap: RoadmapDetails;
}
export type RoadmapDraft = Extract<ValidatedDraftV1, { mode: "ROADMAP" }>;

export interface PeriodSpec {
  ref: string;
  title: string;
  granularity: RoadmapGranularity;
  startDate: string;
  endDate: string;
  order: number;
  days: number;
}

/**
 * Granularity is a deterministic product rule: a long horizon uses calendar
 * months, a shorter one uses weeks. The chosen value is recorded in the input, so a
 * saved plan always replays with exactly the same periods.
 */
export function defaultRoadmapGranularity(
  startDate: string,
  endDate: string
): RoadmapGranularity {
  return dateOrdinal(endDate) - dateOrdinal(startDate) <=
    ROADMAP_LIMITS.weekGranularityMaxDays
    ? "WEEK"
    : "MONTH";
}

export function roadmapGranularity(input: RoadmapInput): RoadmapGranularity {
  return input.roadmap.granularity;
}

function monthEnd(date: string): string {
  const [year, month] = date.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}
function monthTitle(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
function nextDay(date: string): string {
  return new Date((dateOrdinal(date) + 1) * 86400000)
    .toISOString()
    .slice(0, 10);
}
function daysInclusive(start: string, end: string): number {
  return dateOrdinal(end) - dateOrdinal(start) + 1;
}

/**
 * Deterministic period boundaries. Periods tile the horizon exactly: no gaps, no
 * overlaps and no model-chosen buckets. `MONTH` follows calendar months clipped to
 * the horizon; `WEEK` uses consecutive seven-day blocks with the last clipped.
 */
export function roadmapPeriodSpecs(
  startDate: string,
  endDate: string,
  granularity: RoadmapGranularity
): PeriodSpec[] {
  const specs: PeriodSpec[] = [];
  let cursor = startDate;
  while (cursor <= endDate && specs.length < ROADMAP_LIMITS.periods.WEEK) {
    const rawEnd =
      granularity === "MONTH"
        ? monthEnd(cursor)
        : new Date((dateOrdinal(cursor) + 6) * 86400000)
            .toISOString()
            .slice(0, 10);
    const end = rawEnd < endDate ? rawEnd : endDate;
    const order = specs.length;
    specs.push({
      ref: `p${order + 1}`,
      title: granularity === "MONTH" ? monthTitle(cursor) : `Week ${order + 1}`,
      granularity,
      startDate: cursor,
      endDate: end,
      order,
      days: daysInclusive(cursor, end),
    });
    cursor = nextDay(end);
  }
  return specs;
}

export function periodSpecsFor(input: RoadmapInput): PeriodSpec[] {
  return roadmapPeriodSpecs(
    input.startDate,
    input.endDate,
    roadmapGranularity(input)
  );
}
export function periodFor(date: string, specs: PeriodSpec[]): PeriodSpec | undefined {
  return specs.find((spec) => date >= spec.startDate && date <= spec.endDate);
}

/** Confirmed scope as `tN` tokens, exactly as Exam Planner issues them. */
export function scopeTokens(input: RoadmapInput) {
  return input.roadmap.topics.map((topic, index) => ({
    ...topic,
    ref: `t${index + 1}`,
  }));
}

/** Confirmed scope size, using the shared A1 effort floors. */
export function scopeMinutes(topics: readonly ScopeTopic[]): number {
  return topics.reduce(
    (total, topic) => total + scopeTopicMinutes(topic, false),
    0
  );
}

export function roadmapInput(raw: UserInputV1): RoadmapInput {
  if (raw.mode !== "ROADMAP")
    throw new PlannerValidationError("ROADMAP_DETAILS_REQUIRED");
  const details = raw.roadmap;
  if (!details) throw new PlannerValidationError("ROADMAP_DETAILS_REQUIRED");
  if (raw.scope !== details.topics.map((topic) => topic.label).join("\n"))
    throw new PlannerValidationError("SCOPE_MISMATCH");
  if (
    new Set(details.topics.map((topic) => topic.label.toLowerCase())).size !==
    details.topics.length
  )
    throw new PlannerValidationError("DUPLICATE_SCOPE_TOPIC");
  if (details.topics.length > ROADMAP_LIMITS.topics)
    throw new PlannerValidationError("ROADMAP_SCOPE_TOO_LARGE");
  if (
    raw.availability.recoveryPercent < ROADMAP_RESERVE &&
    !details.acceptReducedReserve
  )
    throw new PlannerValidationError("RESERVE_ACCEPTANCE_REQUIRED");
  assertConstraintsApplicable("ROADMAP", constraintsOf(raw));
  const horizon = dateOrdinal(raw.endDate) - dateOrdinal(raw.startDate);
  if (horizon < 0 || horizon > 365)
    throw new PlannerValidationError("INVALID_HORIZON");
  const periods = roadmapPeriodSpecs(
    raw.startDate,
    raw.endDate,
    details.granularity
  );
  if (!periods.length || periods.length > ROADMAP_LIMITS.periods[details.granularity])
    throw new PlannerValidationError("ROADMAP_PERIOD_LIMIT");
  return { ...raw, roadmap: details };
}

/**
 * Measured input size. A topic count can never bound a payload whose size depends
 * on label length and JSON escaping, so this byte measure is the actual guarantee
 * and the topic count is a human-facing convenience bound.
 */
export function roadmapInputBytes(value: unknown): number {
  const json = JSON.stringify(value);
  return json ? new TextEncoder().encode(json).byteLength : 0;
}

export function assertRoadmapEnvelope(raw: unknown): void {
  if (roadmapInputBytes(raw) > ROADMAP_LIMITS.inputBytes)
    throw new PlannerValidationError("ROADMAP_SCOPE_TOO_LARGE");
}

export interface PeriodCapacity {
  spec: PeriodSpec;
  /** Capacity the confirmed schedule leaves for planned work in this period. */
  available: number;
  /** Ceiling implied by a HARD weekly limit, when the user set one. */
  weeklyCeiling: number | null;
  /** What the plan may actually use: the tighter of the two. */
  ceiling: number;
}

/**
 * Capacity available to each strategic period, aggregated from the shared day
 * model. A weekly HARD limit becomes a per-period ceiling here: a month-level
 * roadmap does not know which days the work happens on, so a rolling seven-day
 * window would be a claim the plan cannot honour. Exact weekly enforcement runs
 * only on an expansion, which does know its dates.
 */
export function roadmapPeriodCapacity(
  input: RoadmapInput,
  state: AvailabilitySnapshot,
  specs: PeriodSpec[] = periodSpecsFor(input)
): PeriodCapacity[] {
  const days = validateCapacity(input, state, []).days;
  const weekly = hardWeeklyLimit(input);
  return specs.map((spec) => {
    const available = days
      .filter((day) => day.date >= spec.startDate && day.date <= spec.endDate)
      .reduce((total, day) => total + Math.max(0, day.remaining), 0);
    const weeklyCeiling =
      weekly === null ? null : weeklyMinutesForPeriod(weekly, spec.days);
    return {
      spec,
      available,
      weeklyCeiling,
      ceiling:
        weeklyCeiling === null ? available : Math.min(available, weeklyCeiling),
    };
  });
}

export interface RoadmapFeasibility {
  status: "POTENTIAL_FIT" | "INFEASIBLE" | "SEGMENT_REQUIRED";
  scopeMinutes: number;
  availableMinutes: number;
  weeklyMinutes: number;
  periods: number;
  granularity: RoadmapGranularity;
  minimumMilestones: number;
  scopeBytes: number;
  inputEnvelopeBytes: number;
  reasons: string[];
  choices: string[];
}

/** Coarse, honest feasibility. It never rolls work forward or hides a shortfall. */
export function roadmapFeasibility(
  raw: UserInputV1,
  state: AvailabilitySnapshot
): RoadmapFeasibility {
  const input = roadmapInput(raw);
  const specs = periodSpecsFor(input);
  const capacity = roadmapPeriodCapacity(input, state, specs);
  const available = capacity.reduce((total, period) => total + period.ceiling, 0);
  const required = scopeMinutes(input.roadmap.topics);
  const bytes = roadmapInputBytes(input);
  const segment =
    input.roadmap.topics.length > ROADMAP_LIMITS.topics ||
    bytes > ROADMAP_LIMITS.inputBytes ||
    specs.length > ROADMAP_LIMITS.periods[input.roadmap.granularity];
  const reasons: string[] = [];
  if (!specs.length) reasons.push("NO_PLANNING_PERIODS");
  if (capacity.every((period) => period.available < 15))
    reasons.push("NO_STUDY_DATES");
  if (required > available) reasons.push("INSUFFICIENT_CAPACITY");
  if (input.roadmap.topics.length > ROADMAP_LIMITS.topics)
    reasons.push("TOPIC_LIMIT_REQUIRES_SEGMENTS");
  if (bytes > ROADMAP_LIMITS.inputBytes) reasons.push("SCOPE_TOO_LARGE");
  if (specs.length > ROADMAP_LIMITS.periods[input.roadmap.granularity])
    reasons.push("PERIOD_LIMIT_REQUIRES_SEGMENTS");
  return {
    status: segment
      ? "SEGMENT_REQUIRED"
      : reasons.length
        ? "INFEASIBLE"
        : "POTENTIAL_FIT",
    scopeMinutes: required,
    availableMinutes: available,
    weeklyMinutes: input.availability.dailyMinutes.reduce((a, b) => a + b, 0),
    periods: specs.length,
    granularity: roadmapGranularity(input),
    minimumMilestones: input.roadmap.topics.length,
    scopeBytes: bytes,
    inputEnvelopeBytes: ROADMAP_LIMITS.inputBytes,
    reasons,
    choices: segment
      ? [
          `Split the confirmed syllabus into smaller, explicitly selected roadmap segments (maximum ${ROADMAP_LIMITS.topics} units each). No automatic rolling expansion.`,
          "Keep the roadmap at unit level rather than listing every topic.",
        ]
      : [
          "Increase weekly availability",
          "Reduce the confirmed scope",
          "Move the target date later",
          "Plan this syllabus across successive roadmap horizons",
        ],
  };
}

export interface MilestoneView {
  ref: string;
  title: string;
  date: string;
  periodRef?: string;
  outcome?: string;
  topicRefs?: string[];
  effortMinutes?: number;
  dependsOn?: string[];
}
export interface RoadmapStructureView {
  topicRefs: string[];
  periods: { ref: string; startDate: string; endDate: string; order: number }[];
  milestones: MilestoneView[];
  hasItems: boolean;
  expansion: boolean;
  /** Unit refs the user excluded by removing every milestone that covered them. */
  removedTopicRefs?: string[];
}

function assertMilestoneGraph(milestones: MilestoneView[]): void {
  const byRef = new Map(milestones.map((milestone) => [milestone.ref, milestone]));
  if (byRef.size !== milestones.length)
    throw new PlannerValidationError("DUPLICATE_KEY");
  const depths = new Map<string, number>();
  const depth = (ref: string, path: Set<string>): number => {
    const cached = depths.get(ref);
    if (cached !== undefined) return cached;
    const milestone = byRef.get(ref);
    if (!milestone) throw new PlannerValidationError("UNKNOWN_REFERENCE");
    if (path.has(ref)) throw new PlannerValidationError("DEPENDENCY_CYCLE");
    const depends = milestone.dependsOn ?? [];
    if (new Set(depends).size !== depends.length)
      throw new PlannerValidationError("DUPLICATE_REFERENCE");
    const next = new Set(path).add(ref);
    const result =
      1 + Math.max(0, ...depends.map((dependency) => depth(dependency, next)));
    depths.set(ref, result);
    return result;
  };
  for (const milestone of milestones) depth(milestone.ref, new Set());
}

/**
 * Structural rules that need no live schedule. Enforced on generation, on every
 * edit and at confirmation; the capacity-aware rules live in
 * `validateRoadmapEffort`, which runs wherever a schedule snapshot is available.
 */
export function validateRoadmapStructure(
  input: RoadmapInput,
  view: RoadmapStructureView,
  /**
   * Recommendation codes waived for this call (see `lib/planner/draft-rules.ts`).
   * The one recommendation-class rule here is the priority *ordering* preference:
   * every structural rule in this function stays a blocker.
   */
  suppress?: ReadonlySet<string>
): void {
  const specs = periodSpecsFor(input);
  if (!view.milestones.length) throw new PlannerValidationError("EMPTY_ROADMAP");
  if (view.milestones.length > ROADMAP_LIMITS.milestones)
    throw new PlannerValidationError("ROADMAP_MILESTONE_LIMIT");
  if (view.expansion) {
    if (!view.hasItems) throw new PlannerValidationError("EMPTY_EXPANSION");
  } else if (view.hasItems) {
    // A strategic roadmap is not an execution plan: daily items appear only when a
    // single period is explicitly expanded.
    throw new PlannerValidationError("ROADMAP_ITEMS_NOT_ALLOWED");
  }
  // Period boundaries are compared positionally, so a stored draft (application
  // keys) and a proposal (model tokens) are held to the same deterministic grid.
  if (view.periods.length !== specs.length)
    throw new PlannerValidationError("ROADMAP_PERIOD_MISMATCH");
  for (const [index, spec] of specs.entries()) {
    const period = view.periods[index];
    if (
      !period ||
      period.startDate !== spec.startDate ||
      period.endDate !== spec.endDate ||
      period.order !== spec.order
    )
      throw new PlannerValidationError("ROADMAP_PERIOD_MISMATCH");
  }
  const periodByRef = new Map(view.periods.map((period) => [period.ref, period]));
  const topicRefs = new Set(view.topicRefs);
  if (topicRefs.size !== view.topicRefs.length)
    throw new PlannerValidationError("DUPLICATE_KEY");
  assertMilestoneGraph(view.milestones);
  const covered = new Set<string>();
  for (const [index, milestone] of view.milestones.entries()) {
    const period = milestone.periodRef
      ? periodByRef.get(milestone.periodRef)
      : undefined;
    if (!period) throw new PlannerValidationError("UNKNOWN_PERIOD");
    if (milestone.date !== period.endDate)
      throw new PlannerValidationError("MILESTONE_PERIOD_MISMATCH");
    if (!milestone.outcome)
      throw new PlannerValidationError("MISSING_MILESTONE_OUTCOME");
    if (milestoneOutcomeIssue(milestone.outcome) !== null)
      throw new PlannerValidationError("INVALID_MILESTONE_OUTCOME");
    const refs = milestone.topicRefs ?? [];
    if (!refs.length)
      throw new PlannerValidationError("MISSING_MILESTONE_SCOPE");
    if (new Set(refs).size !== refs.length)
      throw new PlannerValidationError("DUPLICATE_REFERENCE");
    if (refs.some((topicRef) => !topicRefs.has(topicRef)))
      throw new PlannerValidationError("UNKNOWN_ROADMAP_TOPIC");
    if (milestone.effortMinutes === undefined)
      throw new PlannerValidationError("MISSING_MILESTONE_EFFORT");
    for (const topicRef of refs) covered.add(topicRef);
    for (const dependency of milestone.dependsOn ?? []) {
      const target = view.milestones.find((entry) => entry.ref === dependency);
      if (!target) throw new PlannerValidationError("UNKNOWN_REFERENCE");
      const targetPeriod = target.periodRef
        ? periodByRef.get(target.periodRef)
        : undefined;
      if (!targetPeriod) throw new PlannerValidationError("UNKNOWN_PERIOD");
      if (
        targetPeriod.order > period.order ||
        (targetPeriod.order === period.order &&
          view.milestones.indexOf(target) >= index)
      )
        throw new PlannerValidationError("ROADMAP_DEPENDENCY_ORDER");
    }
  }
  // Every confirmed unit is represented, unless the user excluded it by removing
  // the milestones that covered it (which must then be acknowledged explicitly).
  for (const topicRef of view.topicRefs)
    if (!covered.has(topicRef) && !(view.removedTopicRefs ?? []).includes(topicRef))
      throw new PlannerValidationError("MISSING_ROADMAP_TOPIC");
  const priorityIssue = priorityOrderViolations(input, view)[0];
  if (priorityIssue && !suppress?.has(priorityIssue))
    throw new PlannerValidationError(priorityIssue);
}

/**
 * HIGH priority is treated earlier where the horizon allows. Effort depth is
 * already carried by the shared A1 floor — a HIGH unit's `scopeTopicMinutes`
 * includes its ×1.25 factor — so no second multiplier is applied here.
 */
export function priorityOrderViolations(
  input: RoadmapInput,
  view: RoadmapStructureView
): string[] {
  const issues: string[] = [];
  const periodByRef = new Map(view.periods.map((period) => [period.ref, period]));
  const window = Math.max(1, Math.ceil(view.periods.length / 2));
  input.roadmap.topics.forEach((topic, index) => {
    const topicRef = view.topicRefs[index];
    const covering = view.milestones.filter((milestone) =>
      (milestone.topicRefs ?? []).includes(topicRef)
    );
    if (!covering.length) return;
    const effort = covering.reduce(
      (total, milestone) => total + (milestone.effortMinutes ?? 0),
      0
    );
    // Every unit receives at least its coarse effort floor, which is how a
    // milestone's size reflects the unit's breadth, progress and priority instead
    // of an even split of the topic list.
    if (effort < scopeTopicMinutes(topic, false))
      issues.push(
        priorityLevel(topic) === "HIGH"
          ? "INSUFFICIENT_PRIORITY_ALLOCATION"
          : "INSUFFICIENT_UNIT_ALLOCATION"
      );
    if (priorityLevel(topic) !== "HIGH") return;
    const earliest = Math.min(
      ...covering.map(
        (milestone) => periodByRef.get(milestone.periodRef ?? "")?.order ?? 0
      )
    );
    if (earliest > window - 1) issues.push("PRIORITY_ORDER");
  });
  return issues;
}

/**
 * Capacity-aware rules: each period's planned effort must fit the capacity that
 * period actually has, and every period with capacity must be planned.
 */
export function validateRoadmapEffort(
  input: RoadmapInput,
  state: AvailabilitySnapshot,
  specs: PeriodSpec[],
  milestones: { periodRef?: string; effortMinutes?: number }[],
  /**
   * Periods whose work already exists as confirmed execution (a rebalance only).
   * They count as planned and are never charged against the remaining capacity,
   * because their milestones are history rather than proposal.
   */
  anchoredPeriodRefs: readonly string[] = [],
  /**
   * Recommendation codes waived for this call (see `lib/planner/draft-rules.ts`).
   *
   * An explicit HARD weekly ceiling stays a blocker; a period over its *derived*
   * target, and a period deliberately left free, are recommendations a student may
   * accept while editing their own roadmap.
   */
  suppress?: ReadonlySet<string>
): void {
  const anchored = new Set(anchoredPeriodRefs);
  for (const period of roadmapPeriodCapacity(input, state, specs)) {
    const planned = milestones
      .filter((milestone) => milestone.periodRef === period.spec.ref)
      .reduce((total, milestone) => total + (milestone.effortMinutes ?? 0), 0);
    if (planned > period.ceiling) {
      const code =
        period.weeklyCeiling !== null && period.weeklyCeiling < period.available
          ? "HARD_WEEKLY_LIMIT_EXCEEDED"
          : "INSUFFICIENT_PERIOD_CAPACITY";
      if (!suppress?.has(code)) throw new PlannerValidationError(code);
    }
    if (
      planned === 0 &&
      period.ceiling >= 15 &&
      !anchored.has(period.spec.ref) &&
      !suppress?.has("ROADMAP_PERIOD_UNPLANNED")
    )
      throw new PlannerValidationError("ROADMAP_PERIOD_UNPLANNED");
  }
}

function milestoneEffortView(
  milestones: { periodRef?: string; effortMinutes?: number }[]
) {
  return milestones.map((milestone) => ({
    periodRef: milestone.periodRef,
    effortMinutes: milestone.effortMinutes,
  }));
}

/** Strategic roadmap proposal: structure, capacity and HARD limits, in that order. */
export function validateRoadmapProposal(
  raw: UserInputV1,
  proposal: ModelProposalV1,
  state: AvailabilitySnapshot,
  /**
   * Frozen confirmed milestones (a rebalance only). Already-expanded periods are
   * historical anchors: they satisfy coverage, but their effort is history and is
   * never re-charged against the remaining capacity.
   */
  frozenMilestones: {
    ref: string;
    title: string;
    date: string;
    periodRef: string;
    outcome?: string;
    topicRefs?: string[];
    effortMinutes?: number;
    dependsOn?: string[];
    removed?: boolean;
  }[] = []
): void {
  const input = roadmapInput(raw);
  if (proposal.mode !== "ROADMAP" || proposal.outcome !== input.outcome)
    throw new PlannerValidationError("ROADMAP_MODE_MISMATCH");
  const tokens = scopeTokens(input);
  if (
    proposal.topics.length !== tokens.length ||
    proposal.topics.some(
      (topic, index) =>
        topic.ref !== tokens[index].ref ||
        topic.title !== tokens[index].label ||
        topic.parentRef !== null
    )
  )
    throw new PlannerValidationError("CONFIRMED_SCOPE_MISMATCH");
  // A strategic revision never carries actionable items; an expansion has its own
  // contract and validator.
  if (proposal.items.length)
    throw new PlannerValidationError("ROADMAP_ITEMS_NOT_ALLOWED");
  const specs = periodSpecsFor(input);
  validateRoadmapStructure(input, {
    topicRefs: tokens.map((topic) => topic.ref),
    periods: specs.map((spec) => ({
      ref: spec.ref,
      startDate: spec.startDate,
      endDate: spec.endDate,
      order: spec.order,
    })),
    milestones: [
      ...proposal.milestones.map((milestone) => ({
        ref: milestone.ref,
        title: milestone.title,
        date: milestone.date,
        periodRef: milestone.periodRef,
        outcome: milestone.outcome,
        topicRefs: milestone.topicRefs,
        effortMinutes: milestone.effortMinutes,
        dependsOn: milestone.dependsOn,
      })),
      ...frozenMilestones.map((milestone) => ({
        ref: milestone.ref,
        title: milestone.title,
        date: milestone.date,
        periodRef: milestone.periodRef,
        outcome: milestone.outcome ?? "",
        topicRefs: milestone.topicRefs ?? [],
        // Historical effort counts towards what a unit already received; the
        // capacity check runs on the proposed milestones alone, so an anchor is
        // never charged against the remaining periods.
        effortMinutes: milestone.effortMinutes ?? 0,
        dependsOn: [],
        removed: milestone.removed,
      })),
    ],
    hasItems: false,
    expansion: false,
  });
  validateRoadmapEffort(
    input,
    state,
    specs,
    milestoneEffortView(proposal.milestones),
    // A frozen milestone marks its period as already planned execution.
    [...new Set(frozenMilestones.map((milestone) => milestone.periodRef))]
  );
}

export function excludedRoadmapTopics(draft: RoadmapDraft) {
  return draft.topics.filter((topic) =>
    draft.milestones
      .filter((milestone) => !milestone.removed)
      .every((milestone) => !(milestone.topicKeys ?? []).includes(topic.key))
  );
}

/**
 * The period an anchor belongs to, expressed in this view's own period currency.
 *
 * A stored draft names its periods with keys minted for that revision, so an anchor
 * carried over from an earlier revision still points at the period of *that*
 * revision. The grid itself is deterministic — periods are consecutive, disjoint and
 * compared positionally against the input's specs — so a carried anchor resolves by
 * exact key when the currency matches, by position token (`pN`, the currency every
 * model proposal and every period spec uses), and otherwise by the period whose end
 * date the anchor already sits on, which is the date the structure check requires it
 * to equal. An anchor that resolves to nothing still fails as `UNKNOWN_PERIOD`.
 */
export function resolveAnchorPeriodRef(
  periods: { ref: string; endDate: string }[],
  periodRef: string | undefined,
  date: string
): string | undefined {
  if (periodRef) {
    const exact = periods.find((period) => period.ref === periodRef);
    if (exact) return exact.ref;
    const positional = /^p(\d+)$/.exec(periodRef);
    if (positional) {
      const period = periods[Number(positional[1]) - 1];
      if (period) return period.ref;
    }
  }
  return periods.find((period) => period.endDate === date)?.ref;
}

/**
 * A unit ref an anchor carries, expressed in this view's own scope currency.
 *
 * Units are identified positionally (`tN`, the currency of the confirmed scope and of
 * every proposal) because a stored draft names its units with keys minted for its own
 * revision. A ref that is already this view's own key is passed through untouched, so
 * a genuinely unknown unit still fails as `UNKNOWN_ROADMAP_TOPIC`.
 */
export function resolveAnchorTopicRef(topicRefs: string[], ref: string): string {
  if (topicRefs.includes(ref)) return ref;
  const positional = /^t(\d+)$/.exec(ref);
  if (positional) {
    const topic = topicRefs[Number(positional[1]) - 1];
    if (topic) return topic;
  }
  return ref;
}

export function roadmapDraftView(draft: RoadmapDraft): RoadmapStructureView {
  return {
    // A draft's own identity currency is its keys; the confirmed scope order is
    // already guaranteed, so index alignment with the input still holds.
    topicRefs: draft.topics.map((topic) => topic.key),
    periods: (draft.periods ?? []).map((period) => ({
      ref: period.key,
      startDate: period.startDate,
      endDate: period.endDate,
      order: period.order,
    })),
    milestones: draft.milestones
      .filter((milestone) => !milestone.removed)
      .map((milestone) => ({
        ref: milestone.key,
        title: milestone.title,
        date: milestone.date,
        periodRef: milestone.periodKey,
        outcome: milestone.outcome,
        topicRefs: milestone.topicKeys,
        effortMinutes: milestone.effortMinutes,
        dependsOn: milestone.dependsOn,
      })),
    hasItems: draft.items.some((item) => !item.removed),
    expansion: Boolean(draft.expansion),
    removedTopicRefs: draft.topics
      .filter((topic) => {
        const covering = draft.milestones.filter((milestone) =>
          (milestone.topicKeys ?? []).includes(topic.key)
        );
        return (
          covering.length > 0 &&
          covering.some((milestone) => milestone.removed) &&
          covering.every((milestone) => milestone.removed)
        );
      })
      .map((topic) => topic.key),
  };
}

/**
 * Structural roadmap validation for stored drafts. Returns early unless the input
 * carries roadmap details, so every sealed Phase 1/2 payload stays readable and the
 * shared generic ROADMAP contract fixture keeps working.
 */
export function validateRoadmapDraft(
  raw: UserInputV1,
  draft: ValidatedDraftV1,
  /**
   * Milestones that history has fixed (a strategic rebalance only), in draft-ref
   * currency: they cover their periods and units without being restated.
   */
  frozenMilestones: {
    ref: string;
    title: string;
    date: string;
    periodRef: string;
    outcome?: string;
    topicRefs?: string[];
    effortMinutes?: number;
    dependsOn?: string[];
    removed?: boolean;
  }[] = [],
  /** Recommendation codes waived for this call (see `lib/planner/draft-rules.ts`). */
  suppress?: ReadonlySet<string>
): void {
  if (raw.mode !== "ROADMAP" || !raw.roadmap) return;
  if (draft.mode !== "ROADMAP") throw new PlannerValidationError("MODE_MISMATCH");
  const input = roadmapInput(raw);
  const tokens = scopeTokens(input);
  if (
    draft.topics.length !== tokens.length ||
    draft.topics.some(
      (topic, index) =>
        topic.scopeRef !== tokens[index].ref ||
        topic.title !== tokens[index].label
    )
  )
    throw new PlannerValidationError("CONFIRMED_SCOPE_MISMATCH");
  if (!draft.periods?.length)
    throw new PlannerValidationError("ROADMAP_PERIODS_REQUIRED");
  const view = roadmapDraftView(draft);
  // Anchors describe milestones the draft itself does not hold: a strategic replan
  // writes the editable milestones only, so the periods history has fixed reach it as
  // anchors. An anchor the draft already carries *is* that milestone — a period
  // revision copies the whole strategic structure verbatim — so it is not a second
  // one and must not be counted twice.
  const present = new Set(view.milestones.map((milestone) => milestone.ref));
  const anchors = frozenMilestones.filter(
    (milestone) => !present.has(milestone.ref)
  );
  validateRoadmapStructure(
    input,
    anchors.length
      ? {
          ...view,
          milestones: [
            ...view.milestones,
            ...anchors.map((milestone) => ({
              ref: milestone.ref,
              title: milestone.title,
              date: milestone.date,
              // The anchor names its period in the currency of the revision it came
              // from; resolve it into this draft's currency so an unchanged anchor
              // cannot fail as an unknown period.
              periodRef:
                resolveAnchorPeriodRef(
                  view.periods,
                  milestone.periodRef,
                  milestone.date
                ) ?? milestone.periodRef,
              outcome: milestone.outcome ?? "",
              topicRefs: (milestone.topicRefs ?? []).map((ref) =>
                resolveAnchorTopicRef(view.topicRefs, ref)
              ),
              // The unit floors are a plan-wide statement — a unit has received what
              // history gave it plus what the plan still allocates — so an anchor
              // contributes the effort it actually carried. That effort is still never
              // charged against a period's remaining capacity: anchoring is expressed
              // to `validateRoadmapEffort` as an already-planned period instead.
              effortMinutes: milestone.effortMinutes ?? 0,
              dependsOn: [],
            })),
          ],
        }
      : view,
    suppress
  );
  if (draft.expansion) validateExpansionShape(input, draft, suppress);
}

/**
 * Self-consistency of an expansion draft: every actionable item belongs to the
 * selected milestone and to that milestone's confirmed topic scope. Identity with
 * the parent revision's structure is verified server-side, where the parent is
 * available.
 */
function validateExpansionShape(
  input: RoadmapInput,
  draft: RoadmapDraft,
  /** Accepted for symmetry with the other validators: every rule here is a blocker. */
  suppress?: ReadonlySet<string>
): void {
  void suppress;
  const milestoneKey = draft.expansion!.milestoneKey;
  const milestone = draft.milestones.find((entry) => entry.key === milestoneKey);
  if (!milestone) throw new PlannerValidationError("UNKNOWN_MILESTONE");
  if (milestone.removed) throw new PlannerValidationError("MILESTONE_REMOVED");
  const active = draft.items.filter((item) => !item.removed);
  if (!active.length) throw new PlannerValidationError("EMPTY_EXPANSION");
  const scope = new Set(milestone.topicKeys ?? []);
  for (const item of active) {
    if (item.milestoneKey !== milestoneKey)
      throw new PlannerValidationError("EXPANSION_SCOPE_VIOLATION");
    if (!scope.has(item.topicKey))
      throw new PlannerValidationError("EXPANSION_SCOPE_VIOLATION");
    if (!item.completionCriteria)
      throw new PlannerValidationError("MISSING_COMPLETION_CRITERIA");
    if (item.date < input.startDate || item.date > input.endDate)
      throw new PlannerValidationError("OUTSIDE_HORIZON");
  }
}

/**
 * Stable, canonical view of a roadmap's strategic structure. The server hashes it
 * to prove that an expansion left every neighbouring period untouched; pure
 * modules never touch crypto.
 */
export function roadmapStructureForComparison(draft: RoadmapDraft): unknown {
  return {
    outcome: draft.outcome,
    topics: draft.topics.map((topic) => [topic.key, topic.title, topic.scopeRef ?? null]),
    periods: (draft.periods ?? []).map((period) => [
      period.key,
      period.title,
      period.granularity,
      period.startDate,
      period.endDate,
      period.order,
    ]),
    milestones: draft.milestones.map((milestone) => [
      milestone.key,
      milestone.title,
      milestone.date,
      milestone.periodKey ?? null,
      milestone.outcome ?? null,
      [...(milestone.topicKeys ?? [])].sort(),
      milestone.effortMinutes ?? null,
      milestone.checkpoint ?? null,
      milestone.dependsOn ?? [],
      milestone.locked ?? false,
      milestone.removed ?? false,
    ]),
  };
}

/** Strategic-layer soft preferences: measured, explained, never feasibility-gating. */
export function roadmapSoftViolations(
  input: RoadmapInput,
  specs: PeriodSpec[],
  milestones: {
    periodRef?: string;
    effortMinutes?: number;
    topicRefs?: string[];
  }[]
): SoftViolation[] {
  const violations: SoftViolation[] = [];
  const endOf = (periodRef?: string) =>
    specs.find((spec) => spec.ref === periodRef)?.endDate ?? "";
  const orderOf = (periodRef?: string) =>
    specs.find((spec) => spec.ref === periodRef)?.order ?? 0;
  const effortOf = (periodRef: string) =>
    milestones
      .filter((milestone) => milestone.periodRef === periodRef)
      .reduce((total, milestone) => total + (milestone.effortMinutes ?? 0), 0);
  const total = milestones.reduce(
    (sum, milestone) => sum + (milestone.effortMinutes ?? 0),
    0
  );
  const constraintItems = (
    entries: { periodRef?: string; effortMinutes?: number }[]
  ): ConstraintItem[] =>
    entries.map((entry) => ({
      key: entry.periodRef,
      date: endOf(entry.periodRef),
      minutes: Math.round(entry.effortMinutes ?? 0),
    }));
  for (const constraint of softConstraints(input)) {
    const weight = constraint.preferenceWeight ?? 1;
    if (constraint.kind === "WEEKLY_WORKLOAD_PREFERENCE") {
      const over = specs.filter(
        (spec) =>
          effortOf(spec.ref) > weeklyMinutesForPeriod(constraint.value, spec.days)
      );
      if (over.length)
        violations.push({
          kind: constraint.kind,
          preferenceWeight: weight,
          explanation: `${over.length} period${over.length === 1 ? " is" : "s are"} planned above your preferred ${constraint.value} minutes per week because the confirmed scope needs that time.`,
          items: constraintItems(
            over.map((spec) => ({ periodRef: spec.ref, effortMinutes: effortOf(spec.ref) }))
          ),
          localized: false,
        });
    }
    if (constraint.kind === "PREFER_EARLIER_WORKLOAD" && specs.length > 1) {
      const half = Math.ceil((specs.length * constraint.value) / 100);
      const early = specs
        .slice(0, half)
        .reduce((sum, spec) => sum + effortOf(spec.ref), 0);
      if (total > 0 && early * 100 < total * constraint.value)
        violations.push({
          kind: constraint.kind,
          preferenceWeight: weight,
          explanation: `Only ${Math.round((early / total) * 100)}% of the planned work falls in the first ${half} periods, because prerequisites and your target date decided the order.`,
          items: constraintItems(milestones),
          localized: false,
        });
    }
    if (constraint.kind === "PREFER_BALANCED_PERIODS" && specs.length > 1) {
      const active = specs.filter((spec) => effortOf(spec.ref) > 0);
      const mean = total / Math.max(1, active.length);
      const skewed = active
        .filter(
          (spec) =>
            Math.abs(effortOf(spec.ref) - mean) > (mean * constraint.value) / 100
        )
        .sort(
          (a, b) =>
            Math.abs(effortOf(b.ref) - mean) - Math.abs(effortOf(a.ref) - mean)
        )[0];
      if (skewed)
        violations.push({
          kind: constraint.kind,
          preferenceWeight: weight,
          explanation: `${skewed.title} carries ${effortOf(skewed.ref)} minutes while an evenly sized period would carry about ${Math.round(mean)}, because the confirmed scope and unit order required it.`,
          items: constraintItems(
            milestones.filter((milestone) => milestone.periodRef === skewed.ref)
          ),
          localized: true,
        });
    }
    if (constraint.kind === "PREFER_UNIT_ORDER") {
      const topicRef = `t${constraint.value}`;
      const covering = milestones.filter((milestone) =>
        (milestone.topicRefs ?? []).includes(topicRef)
      );
      const window = Math.max(1, Math.ceil(specs.length / 3));
      const earliest = covering.length
        ? Math.min(...covering.map((milestone) => orderOf(milestone.periodRef)))
        : Number.MAX_SAFE_INTEGER;
      if (!covering.length || earliest > window - 1)
        violations.push({
          kind: constraint.kind,
          preferenceWeight: weight,
          explanation: `The unit you wanted earlier is planned from period ${earliest + 1} rather than the first ${window}, because its prerequisites come first.`,
          items: constraintItems(covering),
          localized: true,
        });
    }
    if (constraint.kind === "PREFER_FEWER_SWITCHES" && specs.length > 1) {
      let sharing = 0;
      for (let index = 1; index < specs.length; index += 1) {
        const previous = new Set(
          milestones
            .filter((milestone) => milestone.periodRef === specs[index - 1].ref)
            .flatMap((milestone) => milestone.topicRefs ?? [])
        );
        const continues = milestones
          .filter((milestone) => milestone.periodRef === specs[index].ref)
          .some((milestone) =>
            (milestone.topicRefs ?? []).some((ref) => previous.has(ref))
          );
        if (continues) sharing += 1;
      }
      const share = Math.round((sharing / (specs.length - 1)) * 100);
      if (share < constraint.value)
        violations.push({
          kind: constraint.kind,
          preferenceWeight: weight,
          explanation: `Only ${share}% of consecutive periods continue an earlier unit, below your preferred ${constraint.value}%, because each block has to be completed in order.`,
          items: [],
          localized: false,
        });
    }
  }
  return violations.sort(
    (a, b) => b.preferenceWeight - a.preferenceWeight || a.kind.localeCompare(b.kind)
  );
}

/** Localized roadmap preferences become bounded, milestone-scoped repair targets. */
export function roadmapSoftPreferenceIssues(
  input: RoadmapInput,
  specs: PeriodSpec[],
  milestones: {
    ref: string;
    periodRef?: string;
    effortMinutes?: number;
    topicRefs?: string[];
  }[]
): PlannerSemanticIssue[] {
  return roadmapSoftViolations(input, specs, milestones)
    .filter((violation) => violation.localized)
    .map((violation) => ({
      issueCode: "PRIORITY_MISS" as const,
      affectedItemRefs: [
        ...new Set(
          milestones
            .filter((milestone) =>
              violation.items.some((item) => item.key === milestone.periodRef)
            )
            .map((milestone) => milestone.ref)
        ),
      ],
      severity: "MEDIUM" as const,
      patchInstruction: `${violation.explanation} Adjust only the referenced milestones so this stated preference is honored wherever the confirmed capacity allows.`,
    }))
    .filter((issue) => issue.affectedItemRefs.length > 0);
}

/** Deterministic, user-facing tradeoffs that follow from the user's own answers. */
export function roadmapPriorityTradeoffNotes(input: RoadmapInput): string[] {
  return input.roadmap.topics
    .filter((topic) => priorityLevel(topic) === "LOW" && isWeak(topic))
    .map(
      (topic) =>
        `"${topic.label}" is lower priority, so it receives bounded coverage rather than the deepest treatment.`
    );
}
