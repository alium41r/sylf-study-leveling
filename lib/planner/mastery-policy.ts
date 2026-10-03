import type { UserInputV1, ValidatedDraftV1, ModelProposalV1 } from "./contracts";
import type { AvailabilitySnapshot } from "./capacity";
import { validateCapacity } from "./capacity";
import { dateOrdinal, datesBetween, weekday } from "./dates";
import { PlannerValidationError } from "./errors";
import { priorityLevel, planMinutes } from "./priority";
import {
  scopeTopicMinutes,
  scopeTopicPracticeFloor,
  type ScopeTopic,
} from "./scope-topic";
import type { FrozenItemView } from "./rebalance-policy";
import {
  MASTERY_LIMITS,
  type MasteryDepth,
  type MasteryDetails,
  type MasteryStage,
} from "./mastery-fields";
import { requiresLaterRetrieval } from "./retrieval";
import { isSecure, isWeak, needsLearning } from "./preparedness";
import {
  assertConstraintsApplicable,
  constraintCapacityInput,
  constraintsOf,
  hardSessionLimit,
  unavailableWeekdays,
  validateHardConstraints,
  type ConstraintItem,
} from "./constraints";

/** Mastery planning protects the same recovery reserve as every other mode. */
export const MASTERY_RESERVE = 15;
/** Depth scales the coarse effort estimate; it never changes the confirmed scope. */
export const MASTERY_DEPTH_FACTOR: Record<MasteryDepth, number> = {
  ORIENTATION: 0.8,
  SOLID: 1,
  DEEP: 1.25,
};
/** Minimum planned minutes a mastery plan should hold before it is worth doing. */
const MINIMUM_DAILY_MINUTES = 15;

export type MasteryInput = {
  schemaVersion: 1;
  mode: "MASTERY";
  title: string;
  scope: string;
  focus: string;
  startDate: string;
  endDate: string;
  availability: {
    dailyMinutes: number[];
    recoveryPercent: number;
    blockedDates: string[];
  };
  constraints?: ReturnType<typeof constraintsOf>;
  mastery: MasteryDetails;
};
export type MasteryDraft = Extract<ValidatedDraftV1, { mode: "MASTERY" }>;

export const MASTERY_STAGE_ORDER: readonly MasteryStage[] = [
  "UNDERSTAND",
  "LEARN",
  "ACTIVE_RECALL",
  "PRACTICE",
  "REVIEW_MISTAKES",
  "MASTERY_CHECK",
];

/** Stage → the educational intents that stage may use. */
export const MASTERY_STAGE_INTENTS: Record<MasteryStage, readonly string[]> = {
  UNDERSTAND: ["LEARN", "REVIEW"],
  LEARN: ["LEARN"],
  ACTIVE_RECALL: ["RECALL", "REVIEW"],
  PRACTICE: ["PRACTICE", "TIMED_PRACTICE"],
  REVIEW_MISTAKES: ["MISTAKE_REVIEW"],
  // `ASSESS` is the existing generic check intent; the stage carries the meaning.
  MASTERY_CHECK: ["ASSESS"],
};

/** Confirmed scope as `tN` tokens, exactly as the other modes issue them. */
export function masteryTokens(input: MasteryInput) {
  return input.mastery.topics.map((topic, index) => ({
    ...topic,
    ref: `t${index + 1}`,
  }));
}

/** Coarse per-topic effort estimate, scaled by the requested depth. */
export function masteryTopicMinutes(topic: ScopeTopic, depth: MasteryDepth): number {
  return planMinutes(
    scopeTopicMinutes(topic, false) * MASTERY_DEPTH_FACTOR[depth]
  );
}
export function masteryScopeMinutes(
  topics: readonly ScopeTopic[],
  depth: MasteryDepth
): number {
  return topics.reduce(
    (total, topic) => total + masteryTopicMinutes(topic, depth),
    0
  );
}

/**
 * Deterministic horizon when the student has no deadline.
 *
 * It is derived from the confirmed scope, the requested depth and confirmed
 * availability, bounded to 1–12 weeks, and it is shown to the user before
 * generation. There is no open-ended generation: `input.endDate` must equal either
 * the explicit target date or exactly this derived value.
 */
export function deriveMasteryHorizon(
  input: Pick<MasteryInput, "startDate" | "availability"> & {
    mastery: Pick<MasteryDetails, "topics" | "desiredDepth">;
  }
): string {
  const scope = masteryScopeMinutes(
    input.mastery.topics,
    input.mastery.desiredDepth
  );
  const openMinutes = input.availability.dailyMinutes.reduce((a, b) => a + b, 0);
  const weekly = Math.max(
    30,
    Math.floor((openMinutes * (100 - input.availability.recoveryPercent)) / 100)
  );
  const weeks = Math.min(
    MASTERY_LIMITS.horizonDays / 7,
    Math.max(1, Math.ceil(scope / weekly))
  );
  const days = Math.min(
    MASTERY_LIMITS.horizonDays,
    Math.max(7, Math.ceil(weeks) * 7)
  );
  return new Date((dateOrdinal(input.startDate) + days) * 86400000)
    .toISOString()
    .slice(0, 10);
}

export function masteryInput(raw: UserInputV1): MasteryInput {
  if (raw.mode !== "MASTERY") throw new PlannerValidationError("MASTERY_DETAILS_REQUIRED");
  const details = raw.mastery;
  if (!details) throw new PlannerValidationError("MASTERY_DETAILS_REQUIRED");
  if (raw.focus !== details.unitTitle)
    throw new PlannerValidationError("MASTERY_FOCUS_MISMATCH");
  if (raw.scope !== details.topics.map((topic) => topic.label).join("\n"))
    throw new PlannerValidationError("SCOPE_MISMATCH");
  if (
    new Set(details.topics.map((topic) => topic.label.toLowerCase())).size !==
    details.topics.length
  )
    throw new PlannerValidationError("DUPLICATE_SCOPE_TOPIC");
  if (details.topics.length > MASTERY_LIMITS.topics)
    throw new PlannerValidationError("MASTERY_SCOPE_TOO_LARGE");
  if (
    raw.availability.recoveryPercent < MASTERY_RESERVE &&
    !details.acceptReducedReserve
  )
    throw new PlannerValidationError("RESERVE_ACCEPTANCE_REQUIRED");
  assertConstraintsApplicable("MASTERY", constraintsOf(raw));
  const horizon = dateOrdinal(raw.endDate) - dateOrdinal(raw.startDate);
  if (horizon < 0 || horizon > MASTERY_LIMITS.horizonDays)
    throw new PlannerValidationError("MASTERY_HORIZON_TOO_LONG");
  const expected = details.targetDate ?? deriveMasteryHorizon(raw as MasteryInput);
  if (raw.endDate !== expected)
    throw new PlannerValidationError("MASTERY_HORIZON_MISMATCH");
  return { ...raw, mastery: details } as MasteryInput;
}

/** Measured input size; the byte measure, not the unit count, is the guarantee. */
export function masteryInputBytes(value: unknown): number {
  const json = JSON.stringify(value);
  return json ? new TextEncoder().encode(json).byteLength : 0;
}

export function assertMasteryEnvelope(raw: unknown): void {
  if (masteryInputBytes(raw) > MASTERY_LIMITS.inputBytes)
    throw new PlannerValidationError("MASTERY_SCOPE_TOO_LARGE");
}

export interface MasteryFeasibility {
  status: "POTENTIAL_FIT" | "INFEASIBLE" | "SEGMENT_REQUIRED";
  scopeMinutes: number;
  availableMinutes: number;
  horizonDays: number;
  derived: boolean;
  endDate: string;
  minimumItems: number;
  scopeBytes: number;
  inputEnvelopeBytes: number;
  reasons: string[];
  choices: string[];
}

/**
 * Coarse mastery feasibility. It never drops a unit, never removes the mastery
 * check and never rolls work past the horizon; it reports the shortfall and offers
 * explicit choices, including using Course Roadmap for a larger scope.
 */
export function masteryFeasibility(
  raw: UserInputV1,
  state: AvailabilitySnapshot,
  now = new Date()
): MasteryFeasibility {
  const input = masteryInput(raw);
  const tokens = masteryTokens(input);
  const scope = masteryScopeMinutes(tokens, input.mastery.desiredDepth);
  const days = validateCapacity(input, state, []).days;
  const available = days.reduce((total, day) => total + Math.max(0, day.remaining), 0);
  const bytes = masteryInputBytes(input);
  const horizonDays = dateOrdinal(input.endDate) - dateOrdinal(input.startDate);
  const minimumItems =
    tokens.reduce(
      (total, topic) =>
        total + (isSecure(topic) ? 2 : 4),
      0
    ) + 1;
  const oversized =
    input.mastery.topics.length > MASTERY_LIMITS.topics ||
    bytes > MASTERY_LIMITS.inputBytes ||
    horizonDays > MASTERY_LIMITS.horizonDays ||
    minimumItems > MASTERY_LIMITS.items;
  const reasons: string[] = [];
  if (!days.some((day) => day.remaining >= MINIMUM_DAILY_MINUTES))
    reasons.push("NO_STUDY_DATES");
  if (scope > available) reasons.push("INSUFFICIENT_CAPACITY");
  if (input.mastery.topics.length > MASTERY_LIMITS.topics)
    reasons.push("SCOPE_TOO_LARGE");
  if (horizonDays > MASTERY_LIMITS.horizonDays) reasons.push("HORIZON_TOO_LONG");
  if (bytes > MASTERY_LIMITS.inputBytes) reasons.push("SCOPE_BYTES_TOO_LARGE");
  if (minimumItems > MASTERY_LIMITS.items) reasons.push("ITEM_LIMIT_REQUIRES_SEGMENTS");
  void now;
  return {
    status: oversized
      ? "SEGMENT_REQUIRED"
      : reasons.length
        ? "INFEASIBLE"
        : "POTENTIAL_FIT",
    scopeMinutes: scope,
    availableMinutes: available,
    horizonDays,
    derived: input.mastery.targetDate === null,
    endDate: input.endDate,
    minimumItems,
    scopeBytes: bytes,
    inputEnvelopeBytes: MASTERY_LIMITS.inputBytes,
    reasons,
    choices: oversized
      ? [
          `Mastery is for one chapter or unit (up to ${MASTERY_LIMITS.topics} units and ${MASTERY_LIMITS.horizonDays} days).`,
          "Select a smaller unit or chapter to master now.",
          "Use Course / Syllabus Roadmap for a whole course or qualification.",
        ]
      : [
          "Increase your availability",
          "Reduce the confirmed unit scope",
          "Move the target date later",
          "Use Course / Syllabus Roadmap for a longer horizon",
        ],
  };
}

export interface MasteryItemView {
  ref: string;
  topicRef: string;
  related: string[];
  type: string;
  stage?: string;
  date: string;
  minutes: number;
  removed?: boolean;
}
export interface MasteryStructureView {
  topicRefs: string[];
  items: MasteryItemView[];
  /** Unit refs the user excluded by removing every item that covered them. */
  removedTopicRefs?: string[];
}

const unique = <T,>(values: T[]) => [...new Set(values)];

/**
 * The deterministic learning progression.
 *
 * The model proposes sequencing; these rules decide whether the proposal is a
 * mastery plan at all. Every rule states a defensible pedagogical floor, reacts to
 * the student's own coverage and confidence, and never requires relearning
 * material the student has already covered with confidence.
 */
export function validateMasteryStructure(
  input: MasteryInput,
  view: MasteryStructureView,
  /**
   * Recommendation codes waived for this call (see `lib/planner/draft-rules.ts`).
   *
   * Presence of a stage is the mode's architecture and is never suppressed; only the
   * *order* and *depth* rules are audited as recommendations, and only the flexible
   * draft-edit assessment ever grants the waiver.
   */
  suppress?: ReadonlySet<string>
): void {
  const fail = (code: string): void => {
    if (suppress?.has(code)) return;
    throw new PlannerValidationError(code);
  };
  const tokens = masteryTokens(input);
  const byRef = new Map(tokens.map((token) => [token.ref, token]));
  const active = view.items.filter((item) => !item.removed);
  if (!active.length) throw new PlannerValidationError("EMPTY_MASTERY_PLAN");
  if (active.length > MASTERY_LIMITS.items)
    throw new PlannerValidationError("MASTERY_ITEM_LIMIT");
  if (new Set(view.items.map((item) => item.ref)).size !== view.items.length)
    throw new PlannerValidationError("DUPLICATE_KEY");
  const known = new Set(view.topicRefs);
  for (const item of active) {
    if (!known.has(item.topicRef)) throw new PlannerValidationError("UNKNOWN_MASTERY_TOPIC");
    if (item.related.some((ref) => !known.has(ref)))
      throw new PlannerValidationError("UNKNOWN_MASTERY_TOPIC");
    if (!item.stage || !(item.stage in MASTERY_STAGE_INTENTS))
      throw new PlannerValidationError("MISSING_MASTERY_STAGE");
    if (!MASTERY_STAGE_INTENTS[item.stage as MasteryStage].includes(item.type))
      throw new PlannerValidationError("INVALID_MASTERY_INTENT_STAGE");
    if (item.date < input.startDate || item.date > input.endDate)
      throw new PlannerValidationError("OUTSIDE_HORIZON");
  }
  const before = (a: MasteryItemView, b: MasteryItemView) =>
    a.date < b.date || (a.date === b.date && active.indexOf(a) < active.indexOf(b));
  const ofStage = (ref: string, stage: MasteryStage) =>
    active.filter((item) => item.topicRef === ref && item.stage === stage);

  const excluded = new Set(view.removedTopicRefs ?? []);
  let needsMistakeReview = false;
  const horizonDays = dateOrdinal(input.endDate) - dateOrdinal(input.startDate);
  for (const token of tokens) {
    if (excluded.has(token.ref)) continue;
    const topic = byRef.get(token.ref)!;
    const secure = isSecure(topic);
    const work = active.filter((item) => item.topicRef === token.ref);
    if (!work.length) throw new PlannerValidationError("MISSING_SCOPE_TOPIC");
    const understand = ofStage(token.ref, "UNDERSTAND");
    const learn = ofStage(token.ref, "LEARN");
    const recall = ofStage(token.ref, "ACTIVE_RECALL");
    const practice = ofStage(token.ref, "PRACTICE");
    const mistakes = ofStage(token.ref, "REVIEW_MISTAKES");
    // Orientation is required unless the student already knows the unit well.
    if (!secure && !understand.length)
      throw new PlannerValidationError("MISSING_UNDERSTAND");
    // Real gaps are filled; covered, confident material is not re-taught. A unit
    // whose coverage was never stated still needs its learning step.
    if (needsLearning(topic) && !learn.length)
      throw new PlannerValidationError("MISSING_LEARN");
    if (secure && learn.length)
      fail("UNNECESSARY_RELEARNING");
    if (!recall.length) throw new PlannerValidationError("MISSING_ACTIVE_RECALL");
    if (!practice.length) throw new PlannerValidationError("MISSING_PRACTICE");
    // The fixed progression includes REVIEW_MISTAKES for any unit still being
    // learned, so this is the standard progression rather than an escalation: it
    // fires for a unit that must still learn, not merely because confidence was
    // left unanswered.
    if (!secure || needsLearning(topic)) needsMistakeReview = true;
    // Retrieval must follow the learning it retrieves.
    const learning = [...understand, ...learn];
    if (learning.length) {
      const lastLearning = learning.reduce((latest, item) =>
        before(latest, item) ? item : latest
      );
      if (recall.some((item) => before(item, lastLearning)))
        fail("RECALL_BEFORE_LEARNING");
      if (practice.some((item) => before(item, lastLearning)))
        fail("PRACTICE_BEFORE_LEARNING");
    }
    // Mistake review inspects errors that practice produced.
    if (
      mistakes.length &&
      practice.length &&
      mistakes.some((item) => before(item, practice[0]))
    )
      fail("MISTAKE_REVIEW_BEFORE_PRACTICE");
    // Depth of treatment follows the student's own signals.
    const planned = work.reduce((total, item) => total + item.minutes, 0);
    if (planned < masteryTopicMinutes(topic, input.mastery.desiredDepth))
      fail("INSUFFICIENT_TOPIC_WORK");
    if (priorityLevel(topic) === "HIGH") {
      const practiceMinutes = work
        .filter((item) =>
          ["PRACTICE", "TIMED_PRACTICE", "MISTAKE_REVIEW"].includes(item.type)
        )
        .reduce((total, item) => total + item.minutes, 0);
      if (practiceMinutes < scopeTopicPracticeFloor(topic, false))
        fail("INSUFFICIENT_PRIORITY_ALLOCATION");
      const earliest = work.reduce((first, item) =>
        before(item, first) ? item : first
      );
      if (
        horizonDays >= 6 &&
        dateOrdinal(earliest.date) - dateOrdinal(input.startDate) >
          Math.ceil(horizonDays / 2)
      )
        fail("PRIORITY_ORDER");
    }
    // Deliberate later retrieval inside this one plan, when the horizon allows.
    // The RECALL gate is the shared retrieval policy's: `>= 14` days, identical to
    // the fixed floor this mode has always used. The gap floor below stays the
    // mode's own fixed three days — the shared ladder generalises spacing for longer
    // horizons (see `retrieval.ts`), but Mastery's floor is a single deliberate
    // number and is left authoritative here so a longer Mastery plan is not silently
    // re-priced.
    if (requiresLaterRetrieval(horizonDays, "RECALL") && learning.length) {
      const lastLearning = learning.reduce((latest, item) =>
        before(latest, item) ? item : latest
      );
      if (
        !recall.some(
          (item) => dateOrdinal(item.date) - dateOrdinal(lastLearning.date) >= 3
        )
      )
        fail("MISSING_LATER_RETRIEVAL");
    }
  }
  if (needsMistakeReview && !active.some((item) => item.stage === "REVIEW_MISTAKES"))
    fail("MISSING_MISTAKE_REVIEW");
  // A mastery plan ends with its own bounded check.
  const checks = active.filter((item) => item.stage === "MASTERY_CHECK");
  if (!checks.length) throw new PlannerValidationError("MISSING_MASTERY_CHECK");
  if (checks.some((check) => check.type !== "ASSESS"))
    throw new PlannerValidationError("INVALID_MASTERY_INTENT_STAGE");
  const last = active.reduce((latest, item) => (before(latest, item) ? item : latest));
  if (last.stage !== "MASTERY_CHECK")
    throw new PlannerValidationError("MASTERY_CHECK_NOT_TERMINAL");
  if (checks.some((check) => check.minutes > MASTERY_LIMITS.maxCheckMinutes))
    throw new PlannerValidationError("MASTERY_CHECK_TOO_LONG");
  const checkRefs = unique(checks.flatMap((check) => [check.topicRef, ...check.related]));
  if (input.mastery.topics.length >= 2 && checkRefs.length < 2)
    fail("CHECK_SCOPE_TOO_NARROW");
  for (const token of tokens) {
    if (excluded.has(token.ref)) continue;
    if (priorityLevel(byRef.get(token.ref)!) === "HIGH" && !checkRefs.includes(token.ref))
      fail("PRIORITY_MISSED_IN_CHECK");
  }
}

function proposalView(input: MasteryInput, proposal: ModelProposalV1): MasteryStructureView {
  if (proposal.mode !== "MASTERY")
    throw new PlannerValidationError("MASTERY_MODE_MISMATCH");
  return {
    topicRefs: masteryTokens(input).map((topic) => topic.ref),
    items: proposal.items.map((item) => ({
      ref: item.ref,
      topicRef: item.topicRef,
      related: item.relatedTopicRefs ?? [],
      type: item.type,
      stage: item.masteryStage,
      date: item.date,
      minutes: item.minutes,
    })),
  };
}

export function masteryDraftView(draft: MasteryDraft): MasteryStructureView {
  const active = draft.items.filter((item) => !item.removed);
  return {
    topicRefs: draft.topics.map((topic) => topic.scopeRef ?? topic.key),
    items: draft.items.map((item) => ({
      ref: item.key,
      topicRef:
        draft.topics.find((topic) => topic.key === item.topicKey)?.scopeRef ??
        item.topicKey,
      related: (item.relatedTopicKeys ?? []).map(
        (key) => draft.topics.find((topic) => topic.key === key)?.scopeRef ?? key
      ),
      type: item.type,
      stage: item.masteryStage,
      date: item.date,
      minutes: item.minutes,
      removed: item.removed,
    })),
    removedTopicRefs: draft.topics
      .map((topic) => topic.scopeRef ?? topic.key)
      .filter((ref) =>
        active.every((item) => {
          const topicKey = draft.topics.find(
            (topic) => (topic.scopeRef ?? topic.key) === ref
          )?.key;
          return item.topicKey !== topicKey;
        })
      ),
  };
}

export function excludedMasteryTopics(draft: MasteryDraft) {
  const view = masteryDraftView(draft);
  const excluded = new Set(view.removedTopicRefs ?? []);
  return draft.topics.filter((topic) =>
    excluded.has(topic.scopeRef ?? topic.key)
  );
}

/** A mastery revision holds actionable items, so capacity is checked like Exam. */
export function validateMasteryProposal(
  raw: UserInputV1,
  proposal: ModelProposalV1,
  state: AvailabilitySnapshot,
  /**
   * Frozen executed stages (a replan only). A completed stage is history, so it
   * satisfies the progression without being regenerated or re-capacity-checked.
   */
  executed: FrozenItemView[] = [],
  /** Items to charge against capacity: a replan passes only the work it will write. */
  capacityItems: typeof proposal.items = proposal.items
): void {
  const input = masteryInput(raw);
  if (proposal.mode !== "MASTERY" || proposal.focus !== input.focus)
    throw new PlannerValidationError("MASTERY_MODE_MISMATCH");
  const tokens = masteryTokens(input);
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
  if (proposal.milestones.length)
    throw new PlannerValidationError("MASTERY_MILESTONES_NOT_ALLOWED");
  validateMasteryStructure(input, {
    topicRefs: masteryTokens(input).map((topic) => topic.ref),
    items: [
      ...proposalView(input, proposal).items,
      ...executed.map((item) => ({
        ref: `executed:${item.key}`,
        topicRef: item.topicRef,
        related: item.relatedTopicRefs,
        type: item.type,
        stage: item.masteryStage,
        date: item.date,
        minutes: item.minutes,
      })),
    ],
  });
  if (!validateCapacity(constraintCapacityInput(input), state, capacityItems).feasible)
    throw new PlannerValidationError("INFEASIBLE_CAPACITY");
  validateHardConstraints(input, capacityItems);
}

/**
 * Deterministic validation for a stored mastery draft. Returns early unless the
 * input carries mastery details, so every sealed Phase 1–3 payload stays readable.
 */
export function validateMasteryDraft(
  input: UserInputV1,
  draft: ValidatedDraftV1,
  frozen: FrozenItemView[] = [],
  suppress?: ReadonlySet<string>
): void {
  if (input.mode !== "MASTERY" || !input.mastery) return;
  if (draft.mode !== "MASTERY") throw new PlannerValidationError("MODE_MISMATCH");
  const mastery = masteryInput(input);
  const tokens = masteryTokens(mastery);
  if (
    draft.topics.length !== tokens.length ||
    draft.topics.some(
      (topic, index) =>
        topic.scopeRef !== tokens[index].ref || topic.title !== tokens[index].label
    )
  )
    throw new PlannerValidationError("CONFIRMED_SCOPE_MISMATCH");
  if (draft.milestones.length)
    throw new PlannerValidationError("MASTERY_MILESTONES_NOT_ALLOWED");
  const view = masteryDraftView(draft);
  validateMasteryStructure(mastery, {
    topicRefs: view.topicRefs,
    items: [
      ...view.items,
      ...frozen.map((item) => ({
        ref: `executed:${item.key}`,
        topicRef: item.topicRef,
        related: item.relatedTopicRefs,
        type: item.type,
        stage: item.masteryStage,
        date: item.date,
        minutes: item.minutes,
      })),
    ],
    removedTopicRefs: view.removedTopicRefs,
  }, suppress);
}

/** Deterministic, user-facing tradeoffs that follow from the user's own answers. */
export function masteryPriorityTradeoffNotes(input: MasteryInput): string[] {
  return input.mastery.topics
    .filter((topic) => priorityLevel(topic) === "LOW" && isWeak(topic))
    .map(
      (topic) =>
        `"${topic.label}" is lower priority, so it receives bounded practice rather than the deepest treatment.`
    );
}

/** Items shaped for the shared soft-preference evaluator. */
export function masteryConstraintItems(
  items: { ref?: string; date: string; minutes: number; removed?: boolean }[]
): ConstraintItem[] {
  return items
    .filter((item) => !item.removed)
    .map((item) => ({ key: item.ref, date: item.date, minutes: item.minutes }));
}

/** Horizon helpers shared by the UI and the server. */
export function masteryHorizonDates(input: MasteryInput): string[] {
  return datesBetween(input.startDate, input.endDate);
}
export function masteryUnavailableWeekdays(input: MasteryInput): number[] {
  return unavailableWeekdays(input);
}
export function masterySessionLimit(input: MasteryInput): number | null {
  return hardSessionLimit(input);
}
export function isStudyDate(input: MasteryInput, date: string): boolean {
  return (
    !unavailableWeekdays(input).includes(weekday(date)) &&
    !input.availability.blockedDates.includes(date)
  );
}
