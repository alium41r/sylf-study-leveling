import {
  activeItems,
  type UserInputV1,
  type ModelProposalV1,
  type ValidatedDraftV1,
  type PlannerItem,
} from "./contracts";
import type { ExamDetails, ExamTopic } from "./exam-fields";
import { dateOrdinal, datesBetween } from "./dates";
import { LIMITS } from "./contracts";
import { validateCapacity, type AvailabilitySnapshot } from "./capacity";
import { PlannerValidationError } from "./errors";
import { isHighPriorityWeak, priorityLevel } from "./priority";
import {
  isStatedCovered,
  isStatedNotCovered,
  isWeak,
  needsLearning,
  needsMistakeReview,
  provisionWeight,
} from "./preparedness";

/**
 * The closed stage→intent pairing Exam enforces.
 *
 * Exported because the generation and replan prompts must state exactly this table:
 * a prompt that paraphrases it is how a well-formed model attempt becomes an
 * `INVALID_EXAM_INTENT_STAGE` rejection.
 */
export const EXAM_STAGE_INTENTS: Record<string, string[]> = {
  COVERAGE: ["LEARN"],
  CONSOLIDATION: ["RECALL", "REVIEW"],
  PRACTICE: ["PRACTICE", "TIMED_PRACTICE", "MISTAKE_REVIEW"],
  EXAM_READINESS: ["MOCK_EXAM", "FINAL_REVIEW", "TIMED_PRACTICE"],
};
import {
  scopeTopicMinutes,
  scopeTopicPracticeFloor,
} from "./scope-topic";
import {
  constraintCapacityInput as sharedConstraintCapacityInput,
  softConstraintViolations,
  validateHardConstraints,
  type ConstraintItem,
} from "./constraints";
import type { PlannerSemanticIssue } from "./semantic";
import type { FrozenItemView } from "./rebalance-policy";

export type ExamInput = Extract<UserInputV1, { mode: "EXAM" }> & {
  exam: ExamDetails;
};
export const EXAM_RESERVE = 15;
export function scopeTopics(input: ExamInput) {
  return input.exam.topics.map((t, i) => ({ ...t, ref: `t${i + 1}` }));
}
export function examInput(raw: UserInputV1): asserts raw is ExamInput {
  if (raw.mode !== "EXAM" || !raw.exam)
    throw new PlannerValidationError("EXAM_DETAILS_REQUIRED");
  if (raw.scope !== raw.exam.topics.map((t) => t.label).join("\n"))
    throw new PlannerValidationError("SCOPE_MISMATCH");
  if (
    new Set(raw.exam.topics.map((t) => t.label.toLowerCase())).size !==
    raw.exam.topics.length
  )
    throw new PlannerValidationError("DUPLICATE_SCOPE_TOPIC");
  if (
    raw.availability.recoveryPercent < EXAM_RESERVE &&
    !raw.exam.acceptReducedReserve
  )
    throw new PlannerValidationError("RESERVE_ACCEPTANCE_REQUIRED");
}
export function examCapacityInput(input: UserInputV1): UserInputV1 {
  if (input.mode !== "EXAM" || !input.exam || input.exam.allowExamDayStudy)
    return input;
  return {
    ...input,
    availability: {
      ...input.availability,
      blockedDates: [
        ...new Set([...input.availability.blockedDates, input.examDate]),
      ],
    },
  };
}
/** Exam-day policy composed with the shared HARD-weekday capacity closure. */
export function constraintCapacityInput(input: UserInputV1): UserInputV1 {
  return sharedConstraintCapacityInput(examCapacityInput(input));
}
/**
 * A supplied soft preference that the plan does not honor becomes a bounded,
 * localized repair target, so a preference influences placement instead of only
 * being reported. A global preference (using fewer study days overall) stays an
 * explanation and never triggers a whole-plan rewrite.
 */
export function softPreferenceIssues(
  input: UserInputV1,
  items: (ConstraintItem & { ref: string })[]
): PlannerSemanticIssue[] {
  return softConstraintViolations(input, items)
    .filter((violation) => violation.localized)
    .map((violation) => ({
      issueCode: "PRIORITY_MISS" as const,
      affectedItemRefs: [
        ...new Set(
          violation.items
            .map((item) => (item as { ref?: string }).ref)
            .filter((ref): ref is string => Boolean(ref))
        ),
      ],
      severity: "MEDIUM" as const,
      patchInstruction: `${violation.explanation} Adjust only the referenced items so this stated preference is honored wherever the confirmed capacity allows.`,
    }))
    .filter((issue) => issue.affectedItemRefs.length > 0);
}

/**
 * The coarse effort floors now live in `scope-topic.ts`, where Course Roadmap uses
 * exactly the same maths. These keep the Exam-facing names Phase 2 and A1 import.
 */
export function topicMinutes(t: ExamTopic, triage: boolean) {
  return scopeTopicMinutes(t, triage);
}
export function topicPracticeFloor(t: ExamTopic, triage: boolean) {
  return scopeTopicPracticeFloor(t, triage);
}
const PRACTICE_TYPES = ["PRACTICE", "TIMED_PRACTICE", "MISTAKE_REVIEW"];
/**
 * Deterministic, user-facing tradeoffs that follow from the user's own priority
 * answers. No academic content beyond the labels the user supplied.
 */
export function priorityTradeoffNotes(input: ExamInput): string[] {
  return input.exam.topics
    .filter((topic) => priorityLevel(topic) === "LOW" && isWeak(topic))
    .map(
      (topic) =>
        `"${topic.label}" is lower priority, so it receives bounded coverage rather than the deepest treatment.`
    );
}
export interface ExamFeasibility {
  status: "POTENTIAL_FIT" | "INFEASIBLE" | "SEGMENT_REQUIRED";
  availableMinutes: number;
  estimatedMinutes: number;
  reserveMinutes: number;
  availableDays: number;
  minimumItems: number;
  reservePercent: number;
  reasons: string[];
  choices: string[];
}
export function examFeasibility(
  input: ExamInput,
  state: AvailabilitySnapshot
): ExamFeasibility {
  examInput(input);
  const days = validateCapacity(constraintCapacityInput(input), state, []).days;
  const available = days.reduce((n, d) => n + Math.max(0, d.remaining), 0);
  const required =
    input.exam.topics.reduce(
      (n, t) => n + topicMinutes(t, input.exam.approach === "TRIAGE"),
      0
    ) +
    (input.exam.mockMinutes ?? 0) +
    15;
  const minimumItems =
    input.exam.topics.reduce(
      (n, t) => n + provisionWeight(t),
      0
    ) +
    1 +
    (input.exam.mockMinutes ? 1 : 0);
  const reasons: string[] = [];
  if (!days.some((d) => d.remaining >= 15)) reasons.push("NO_STUDY_DATES");
  if (required > available) reasons.push("INSUFFICIENT_CAPACITY");
  if (
    input.exam.mockMinutes &&
    !days.some((d) => d.remaining >= input.exam.mockMinutes!)
  )
    reasons.push("MOCK_DOES_NOT_FIT");
  if (minimumItems > LIMITS.items) reasons.push("ITEM_LIMIT_REQUIRES_SEGMENTS");
  if (
    dateOrdinal(input.examDate) - dateOrdinal(input.startDate) <= 1 &&
    input.exam.approach !== "TRIAGE"
  )
    reasons.push("DEADLINE_REQUIRES_EXPLICIT_TRIAGE");
  return {
    status:
      minimumItems > LIMITS.items
        ? "SEGMENT_REQUIRED"
        : reasons.length
          ? "INFEASIBLE"
          : "POTENTIAL_FIT",
    availableMinutes: available,
    estimatedMinutes: required,
    reserveMinutes: days.reduce((n, d) => n + d.reserve, 0),
    availableDays: days.filter((d) => d.remaining >= 15).length,
    minimumItems,
    reservePercent: input.availability.recoveryPercent,
    reasons,
    choices:
      minimumItems > LIMITS.items
        ? [
            "Split the confirmed scope into smaller, explicitly selected Exam plan segments (maximum 60 items each). No automatic rolling expansion.",
          ]
        : [
            "Increase confirmed availability",
            "Reduce the confirmed scope",
            "Change the exam date if appropriate",
            "Explicitly choose a compressed triage plan; the deadline and capacity still apply",
          ],
  };
}
type SemanticItem = {
  key: string;
  topic: string;
  related: string[];
  depends: string[];
  type: string;
  stage?: string;
  rationale?: string;
  relearnReason?: string;
  date: string;
  minutes: number;
};
function checkSemantics(
  input: ExamInput,
  items: SemanticItem[],
  excluded: Set<string>,
  /**
   * Recommendation codes waived for this call (see `lib/planner/draft-rules.ts`).
   *
   * A suppressed code returns instead of throwing, so the checks after it still run
   * and any *blocker* among them is still reported. Only the flexible-edit assessment
   * grants this, and only for codes audited as recommendations; the HARD constraint
   * check lives outside this function and never consults the set.
   */
  suppress?: ReadonlySet<string>
) {
  const fail = (code: string): void => {
    if (suppress?.has(code)) return;
    throw new PlannerValidationError(code);
  };
  const topics = scopeTopics(input).filter((t) => !excluded.has(t.ref));
  if (!topics.length || !items.length) fail("EMPTY_EXAM_PLAN");
  const topicSet = new Set(topics.map((t) => t.ref));
  const itemMap = new Map(items.map((i) => [i.key, i]));
  if (itemMap.size !== items.length) fail("DUPLICATE_KEY");
  const allowed = EXAM_STAGE_INTENTS;
  for (const item of items) {
    if (
      !topicSet.has(item.topic) ||
      item.related.some((r) => !topicSet.has(r)) ||
      new Set(item.related).size !== item.related.length
    )
      fail("UNKNOWN_EXAM_TOPIC");
    if (
      !item.stage ||
      !allowed[item.stage]?.includes(item.type) ||
      !item.rationale
    )
      fail("INVALID_EXAM_INTENT_STAGE");
    if (
      item.date < input.startDate ||
      item.date > input.examDate ||
      (!input.exam.allowExamDayStudy && item.date === input.examDate)
    )
      fail("EXAM_DATE_VIOLATION");
    if (new Set(item.depends).size !== item.depends.length)
      fail("DUPLICATE_REFERENCE");
    for (const key of item.depends) {
      const dep = itemMap.get(key);
      if (
        !dep ||
        dep.date > item.date ||
        (dep.date === item.date && items.indexOf(dep) >= items.indexOf(item))
      )
        fail("EXAM_DEPENDENCY_ORDER");
    }
  }
  const horizon = datesBetween(input.startDate, input.examDate).length;
  const triage = input.exam.approach === "TRIAGE";
  for (const topic of topics) {
    // Per-topic practice and recall cannot be satisfied by one vague mixed task.
    const work = items.filter((i) => i.topic === topic.ref);
    if (!work.length) fail("MISSING_SCOPE_TOPIC");
    const learns = work.filter((i) => i.type === "LEARN");
    const recall = work.filter((i) => ["RECALL", "REVIEW"].includes(i.type));
    const practice = work.filter((i) =>
      ["PRACTICE", "TIMED_PRACTICE"].includes(i.type)
    );
    // Learning is owed unless the student explicitly said the unit is covered;
    // only an explicit "covered" can make new learning unjustified.
    if (needsLearning(topic) && !learns.length) fail("MISSING_COVERAGE");
    if (isStatedCovered(topic) && learns.some((i) => !i.relearnReason))
      fail("UNJUSTIFIED_RELEARNING");
    if (!recall.length || !practice.length)
      fail("MISSING_CONSOLIDATION_OR_PRACTICE");
    if (needsMistakeReview(topic) && !work.some((i) => i.type === "MISTAKE_REVIEW"))
      fail("MISSING_MISTAKE_REVIEW");
    if (learns.length && practice.some((p) => p.date < learns[0].date))
      fail("PRACTICE_BEFORE_COVERAGE");
    if (
      input.exam.approach === "STANDARD" &&
      horizon >= 4 &&
      !recall.some((r) => work.some((i) => i.key !== r.key && i.date < r.date))
    )
      fail("MISSING_SPACED_RECALL");
    if (
      work.reduce((n, i) => n + i.minutes, 0) < topicMinutes(topic, triage)
    )
      fail("INSUFFICIENT_TOPIC_WORK");
    // Priority changes practice allocation, not only initial learning.
    if (
      work
        .filter((i) => PRACTICE_TYPES.includes(i.type))
        .reduce((n, i) => n + i.minutes, 0) < topicPracticeFloor(topic, triage)
    )
      fail("INSUFFICIENT_PRACTICE_ALLOCATION");
    // HIGH priority + LOW confidence is treated earlier where capacity allows.
    // Nothing here can require relearning: that stays with covered/confidence.
    if (!triage && horizon >= 6 && isHighPriorityWeak(topic)) {
      const earliest = [...work].map((i) => i.date).sort()[0];
      if (dateOrdinal(earliest) - dateOrdinal(input.startDate) > Math.ceil(horizon / 3))
        fail("PRIORITY_ORDER");
    }
  }
  if (
    !items.some(
      (i) =>
        i.type === "FINAL_REVIEW" &&
        dateOrdinal(input.examDate) - dateOrdinal(i.date) <= 3
    )
  )
    fail("MISSING_FINAL_REVIEW");
  if (
    input.exam.mockMinutes &&
    !items.some(
      (i) => i.type === "MOCK_EXAM" && i.minutes >= input.exam.mockMinutes!
    )
  )
    fail("MISSING_MOCK_EXAM");
  if (
    topics.length > 1 &&
    horizon >= 7 &&
    !items.some(
      (i) =>
        ["PRACTICE", "TIMED_PRACTICE"].includes(i.type) &&
        i.related.some((t) => t !== i.topic)
    )
  )
    fail("MISSING_MIXED_PRACTICE");
  const coverage = items
    .filter((i) => i.stage === "COVERAGE")
    .map((i) => i.date)
    .sort();
  if (
    // A stated gap counts; an unstated unit is not treated as a gap.
    topics.filter((t) => isStatedNotCovered(t)).length > 1 &&
    horizon >= 7 &&
    !items.some(
      (i) =>
        ["CONSOLIDATION", "PRACTICE"].includes(i.stage!) &&
        i.date <= coverage.at(-1)!
    )
  )
    fail("STAGES_MUST_OVERLAP");
}
export function validateExamProposal(
  input: ExamInput,
  proposal: ModelProposalV1,
  state: AvailabilitySnapshot,
  /**
   * Frozen executed history (a replan only). Those items already happened, so they
   * count towards educational sufficiency but never towards remaining capacity.
   */
  executed: FrozenItemView[] = [],
  /**
   * What to charge against capacity. A replan passes only the items it will actually
   * write: an unchanged item already exists as a Quest and is already counted as
   * existing work, so charging it again would double-count the same minutes.
   */
  capacityItems: typeof proposal.items = proposal.items
) {
  examInput(input);
  if (proposal.mode !== "EXAM" || proposal.examDate !== input.examDate)
    throw new PlannerValidationError("EXAM_MODE_MISMATCH");
  if (
    proposal.milestones.length ||
    proposal.items.some(
      (i) => !/^i[1-9][0-9]*$/.test(i.ref) || i.milestoneRef !== null
    )
  )
    throw new PlannerValidationError("INVALID_EXAM_REFERENCE");
  const expected = scopeTopics(input);
  if (
    proposal.topics.length !== expected.length ||
    proposal.topics.some(
      (t) =>
        !expected.some((e) => e.ref === t.ref && e.label === t.title) ||
        t.parentRef !== null
    ) ||
    new Set(proposal.topics.map((t) => t.ref)).size !== expected.length
  )
    throw new PlannerValidationError("CONFIRMED_SCOPE_MISMATCH");
  checkSemantics(
    input,
    [
      ...proposal.items.map((i) => ({
        ...i,
        key: i.ref,
        topic: i.topicRef,
        related: i.relatedTopicRefs ?? [],
        depends: i.dependsOn,
      })),
      // History is part of the plan's educational intent: a replan must not be
      // forced to recreate coverage that is already complete.
      ...executed.map((i) => ({
        type: i.type,
        // The gate requires a stage on every item it sees, history included.
        stage: i.stage,
        title: i.title,
        description: i.description,
        date: i.date,
        minutes: i.minutes,
        key: `executed:${i.key}`,
        topic: i.topicRef,
        related: i.relatedTopicRefs,
        depends: [],
        // Work that already happened needs no justification; the gate still requires
        // a reason to be present, so history states the only true one.
        rationale: "Completed before this revision.",
      })),
    ],
    new Set()
  );
  if (
    !validateCapacity(constraintCapacityInput(input), state, capacityItems).feasible
  )
    throw new PlannerValidationError("INFEASIBLE_CAPACITY");
  validateHardConstraints(input, capacityItems);
}
export function excludedExamTopics(draft: ValidatedDraftV1) {
  return draft.topics.filter(
    (t) => !draft.items.some((i) => !i.removed && i.topicKey === t.key)
  );
}
export function validateExamDraft(
  input: UserInputV1,
  draft: ValidatedDraftV1,
  frozen: FrozenItemView[] = [],
  suppress?: ReadonlySet<string>
) {
  if (input.mode !== "EXAM" || !input.exam) return; // Immutable Phase 1 snapshots remain readable.
  examInput(input);
  const scope = scopeTopics(input);
  if (
    new Set(draft.topics.map((t) => t.scopeRef)).size !== scope.length ||
    draft.topics.length !== scope.length ||
    draft.topics.some(
      (t) => !scope.some((s) => s.ref === t.scopeRef && s.label === t.title)
    )
  )
    throw new PlannerValidationError("CONFIRMED_SCOPE_MISMATCH");
  const topic = (key: string) =>
    draft.topics.find((t) => t.key === key)?.scopeRef ?? "unknown";
  const excluded = new Set(excludedExamTopics(draft).map((t) => t.scopeRef!));
  // An exclusion is valid only when the user explicitly removed its original items.
  if (
    [...excluded].some(
      (ref) => !draft.items.some((i) => i.removed && topic(i.topicKey) === ref)
    )
  )
    throw new PlannerValidationError("MISSING_SCOPE_TOPIC");
  const active = draft.items.filter((i) => !i.removed);
  checkSemantics(
    input,
    [
      ...active.map((i) => ({
        ...i,
        topic: topic(i.topicKey),
        related: (i.relatedTopicKeys ?? []).map(topic),
        depends: i.dependsOn,
      })),
      ...frozen.map((item) => ({
        type: item.type,
        stage: item.stage,
        title: item.title,
        description: item.description,
        date: item.date,
        minutes: item.minutes,
        key: `executed:${item.key}`,
        topic: item.topicRef,
        related: item.relatedTopicRefs,
        depends: [],
        rationale: "Completed before this revision.",
      })),
    ],
    excluded,
    suppress
  );
}
/** Exam-facing name for the shared active-item projection. */
export const activeExamItems = activeItems;
