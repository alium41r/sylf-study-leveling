import {
  ModelProposalV1Schema,
  UserInputV1Schema,
  type ModelProposalV1,
} from "@/lib/planner/contracts";
import type { AvailabilitySnapshot } from "@/lib/planner/capacity";
import { datesBetween, weekday } from "@/lib/planner/dates";
import {
  masteryInput,
  masteryScopeMinutes,
  masteryTokens,
  masteryTopicMinutes,
  type MasteryInput,
} from "@/lib/planner/mastery-policy";
import type { MasteryStage } from "@/lib/planner/mastery-fields";
import { MASTERY_STAGE_INTENTS } from "@/lib/planner/mastery-policy";
import {
  scopeTopicPracticeFloor,
  type ScopeTopic,
} from "@/lib/planner/scope-topic";
import { priorityLevel } from "@/lib/planner/priority";
import { isSecure } from "@/lib/planner/preparedness";

export function masteryAvailability(): AvailabilitySnapshot {
  return {
    schemaVersion: 1,
    timezone: "UTC",
    restDays: [],
    floatingDates: [],
    existingWork: [],
    lineageFingerprint: "",
  };
}

const LABELS = [
  "Angular displacement and velocity",
  "Centripetal acceleration",
  "Vertical circular motion",
];

/**
 * A representative chapter: three units, four weeks, one unit not covered at all,
 * one covered weakly, one already secure. That mix is what makes the progression
 * rules interesting — the secure unit must not be re-taught, and the uncovered one
 * must be taught.
 */
export function masteryFixture(): MasteryInput {
  return masteryInput(
    UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "MASTERY",
      title: "Circular motion",
      focus: "Chapter 4 · Circular motion",
      scope: LABELS.join("\n"),
      startDate: "2030-01-07",
      endDate: "2030-02-03",
      availability: {
        dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
        recoveryPercent: 15,
        blockedDates: [],
      },
      mastery: {
        subjectName: "Physics",
        subjectId: null,
        unitTitle: "Chapter 4 · Circular motion",
        topics: [
          {
            label: LABELS[0],
            covered: false,
            confidence: 2,
            difficult: false,
          },
          { label: LABELS[1], covered: true, confidence: 2, difficult: true },
          { label: LABELS[2], covered: true, confidence: 5, difficult: false },
        ],
        desiredDepth: "SOLID",
        priorExposure: "SOME",
        checkPreference: "MIXED_PRACTICE",
        targetDate: "2030-02-03",
        acceptReducedReserve: false,
      },
    })
  );
}

/** A short one-unit chapter whose derived horizon is the 7-day minimum. */
export function shortMasteryFixture(): MasteryInput {
  return masteryInput(
    UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "MASTERY",
      title: "One small unit",
      focus: "Unit 1 · Standard form",
      scope: "Standard form",
      startDate: "2030-01-07",
      endDate: "2030-01-14",
      availability: {
        dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
        recoveryPercent: 15,
        blockedDates: [],
      },
      mastery: {
        subjectName: "Maths",
        subjectId: null,
        unitTitle: "Unit 1 · Standard form",
        topics: [
          { label: "Standard form", covered: false, confidence: 1, difficult: true },
        ],
        desiredDepth: "ORIENTATION",
        priorExposure: "NEW",
        checkPreference: "SHORT_SELF_TEST",
        targetDate: "2030-01-14",
        acceptReducedReserve: false,
      },
    })
  );
}

/** A chapter whose units are all already secure: nothing may be re-taught. */
export function secureMasteryFixture(): MasteryInput {
  return masteryInput(
    UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "MASTERY",
      title: "Revision unit",
      focus: "Unit 7 · Vectors",
      scope: "Vector components\nVector addition",
      startDate: "2030-01-07",
      endDate: "2030-01-28",
      availability: {
        dailyMinutes: [0, 45, 45, 45, 45, 45, 45],
        recoveryPercent: 15,
        blockedDates: [],
      },
      mastery: {
        subjectName: "Maths",
        subjectId: null,
        unitTitle: "Unit 7 · Vectors",
        topics: [
          {
            label: "Vector components",
            covered: true,
            confidence: 5,
            difficult: false,
            priority: "HIGH",
            prioritySource: "USER_EXPLICIT",
          },
          { label: "Vector addition", covered: true, confidence: 4, difficult: false },
        ],
        desiredDepth: "SOLID",
        priorExposure: "MOSTLY",
        checkPreference: "RECALL_AND_APPLY",
        targetDate: "2030-01-28",
        acceptReducedReserve: false,
      },
    })
  );
}

/**
 * A valid chapter plan built from the fixture's own signals.
 *
 * Placement is mechanical rather than hand-written, so the fixture cannot drift
 * away from the deterministic rules it is meant to exercise:
 *   phase A — orientation and the real learning for every unit that needs it;
 *   phase A2 — one short recall immediately after that unit's learning;
 *   phase B — each unit's practice, then its mistake review;
 *   phase C — a second, later recall at least three days after the last teaching
 *   item, which is what the mode's spacing rule requires;
 *   last — one bounded check covering the whole chapter.
 * A daily allocator keeps every date inside the confirmed per-day capacity, so the
 * fixture is also feasible rather than merely well-ordered.
 */
/**
 * Stage-specific wording, so the fixture reads like a real plan rather than one
 * template repeated — and so the shared A1 robotic-pattern check has nothing to
 * flag in a plan that is otherwise correct.
 */
const TITLE_LEAD: Record<MasteryStage, string> = {
  UNDERSTAND: "Map the ideas",
  LEARN: "Work through",
  ACTIVE_RECALL: "Recall from memory",
  PRACTICE: "Practise set",
  REVIEW_MISTAKES: "Fix the errors in",
  MASTERY_CHECK: "Mixed check set",
};
const DESCRIPTION_LEAD: Record<MasteryStage, string> = {
  UNDERSTAND: "Sketch the main ideas and note what is still unclear",
  LEARN: "Work through the explanations and worked examples",
  ACTIVE_RECALL: "Write down everything you can recall, then check the gaps",
  PRACTICE: "Complete a bounded practice set and review every incorrect step",
  REVIEW_MISTAKES: "Re-attempt the recorded errors and confirm each corrected step",
  MASTERY_CHECK: "Complete the check unaided and record what was correct",
};

/**
 * A valid chapter plan built from the fixture's own signals.
 *
 * Placement is mechanical rather than hand-written, so the fixture cannot drift
 * away from the deterministic rules it is meant to exercise:
 *   phase A — orientation and the real learning for every unit that needs it;
 *   phase B — each unit's practice until its effort and practice floors are met;
 *   phase C — active recall, at least three days after the last learning item;
 *   last — one bounded check covering the whole chapter.
 * A daily allocator keeps every date inside the confirmed per-day capacity, so the
 * fixture is feasible rather than merely well-ordered.
 */
export function masteryProposal(
  input: MasteryInput = masteryFixture()
): ModelProposalV1 {
  const tokens = masteryTokens(input);
  const days = datesBetween(input.startDate, input.endDate).filter(
    (date) =>
      !input.availability.blockedDates.includes(date) &&
      input.availability.dailyMinutes[weekday(date)] > 0
  );
  if (days.length < 6)
    throw new Error("mastery fixture needs at least six usable days");
  /** Remaining planned minutes on each usable day, after the recovery reserve. */
  const remaining = days.map((date) =>
    Math.floor(
      (input.availability.dailyMinutes[weekday(date)] *
        (100 - input.availability.recoveryPercent)) /
        100
    )
  );
  /** The largest session any single day here can hold. */
  const budget = Math.max(...remaining);
  let cursor = 0;
  const place = (minutes: number): string => {
    while (cursor < days.length - 1 && remaining[cursor] < minutes) cursor += 1;
    if (remaining[cursor] < minutes)
      throw new Error("mastery fixture ran out of daily capacity");
    remaining[cursor] -= minutes;
    return days[cursor];
  };
  const items: {
    ref: string;
    topicRef: string;
    relatedTopicRefs: string[];
    milestoneRef: null;
    type: string;
    masteryStage: MasteryStage;
    title: string;
    description: string;
    rationale: string;
    completionCriteria: string;
    date: string;
    minutes: number;
    dependsOn: string[];
  }[] = [];
  const learning: string[] = [];
  const planned = new Map<string, number>();
  let sequence = 0;
  const practice = new Map<string, number>();
  const push = (
    topic: ScopeTopic & { ref: string },
    stage: MasteryStage,
    type: string,
    minutes: number,
    dependsOn: string[] = []
  ) => {
    const ref = `i${items.length + 1}`;
    sequence += 1;
    items.push({
      ref,
      topicRef: topic.ref,
      relatedTopicRefs: [],
      milestoneRef: null,
      type,
      masteryStage: stage,
      title: `${sequence}. ${TITLE_LEAD[stage]} · ${topic.label}`,
      description: `${DESCRIPTION_LEAD[stage]} for ${topic.label}.`,
      rationale: "Keeps the unit's progression in the required order.",
      completionCriteria:
        stage === "MASTERY_CHECK"
          ? "Complete the check unaided, then record what was correct and what was not."
          : "Complete this step, then note what you could do and what you could not.",
      date: place(minutes),
      minutes,
      dependsOn,
    });
    if (stage === "UNDERSTAND" || stage === "LEARN") learning.push(ref);
    planned.set(topic.ref, (planned.get(topic.ref) ?? 0) + minutes);
    if (["PRACTICE", "TIMED_PRACTICE", "MISTAKE_REVIEW"].includes(type))
      practice.set(topic.ref, (practice.get(topic.ref) ?? 0) + minutes);
    return ref;
  };
  const session = (preferred: number) =>
    Math.max(15, Math.min(preferred, budget));

  const secureOf = (topic: ScopeTopic) => isSecure(topic);
  // Phase A: orientation for anything not already secure, then real learning for
  // anything not covered at all.
  for (const topic of tokens) {
    if (secureOf(topic)) continue;
    push(topic, "UNDERSTAND", "LEARN", session(30));
    if (!topic.covered) push(topic, "LEARN", "LEARN", session(45));
  }
  const lastLearningDay = cursor;
  // Phase A2: one short recall early for every unit. Retrieval belongs on both
  // sides of practice, not only at the very end of the plan.
  for (const topic of tokens) push(topic, "ACTIVE_RECALL", "RECALL", session(20));
  // Phase B: practice until the unit has both reached its effort floor and met the
  // practice floor a HIGH priority unit is owed, then the mistake review.
  for (const topic of tokens) {
    const floor = masteryTopicMinutes(topic, input.mastery.desiredDepth);
    const practiceFloor =
      priorityLevel(topic) === "HIGH" ? scopeTopicPracticeFloor(topic, false) : 0;
    let guard = 0;
    while (
      (planned.get(topic.ref) ?? 0) < floor ||
      (practice.get(topic.ref) ?? 0) < practiceFloor
    ) {
      const owed = Math.max(
        floor - (planned.get(topic.ref) ?? 0),
        practiceFloor - (practice.get(topic.ref) ?? 0)
      );
      push(topic, "PRACTICE", "PRACTICE", session(Math.max(15, owed)));
      if ((guard += 1) > 8)
        throw new Error("mastery fixture could not reach a unit's effort floor");
    }
    if (!secureOf(topic)) push(topic, "REVIEW_MISTAKES", "MISTAKE_REVIEW", session(30));
  }
  // Phase C: deliberate later retrieval, at least three days after the last
  // teaching item, so a unit's recall is genuinely separated from its learning.
  cursor = Math.max(cursor, lastLearningDay + 4);
  if (cursor > days.length - 2)
    throw new Error("mastery fixture horizon is too short for later retrieval");
  for (const topic of tokens) push(topic, "ACTIVE_RECALL", "RECALL", session(20));
  // One bounded check, on the last usable day and last in the plan.
  cursor = days.length - 1;
  items.push({
    ref: `i${items.length + 1}`,
    topicRef: tokens[0].ref,
    relatedTopicRefs: tokens.slice(1).map((topic) => topic.ref),
    milestoneRef: null,
    type: "ASSESS",
    masteryStage: "MASTERY_CHECK",
    title: "Mixed check set 1 · whole chapter",
    description:
      "Complete the check unaided and record what was correct and what was not.",
    rationale: "Ends the plan with one bounded check of the whole chapter.",
    completionCriteria:
      "Complete the check unaided, then record what was correct and what was not.",
    date: place(session(45)),
    minutes: session(45),
    dependsOn: [...learning],
  });

  return ModelProposalV1Schema.parse({
    schemaVersion: 1,
    mode: "MASTERY",
    focus: input.focus,
    assumptions: ["Synthetic chapter; dates are planning estimates."],
    warnings: [],
    topics: tokens.map((topic) => ({
      ref: topic.ref,
      title: topic.label,
      parentRef: null,
    })),
    milestones: [],
    items,
  });
}

/** The fixture's own coarse estimate, so tests can assert real numbers. */
export function fixtureScopeMinutes(input: MasteryInput = masteryFixture()): number {
  return masteryScopeMinutes(masteryTokens(input), input.mastery.desiredDepth);
}

/** Unit refs the plan must not re-teach. */
export function secureTopicRefs(input: MasteryInput = masteryFixture()): string[] {
  return masteryTokens(input)
    .filter((topic) => isSecure(topic))
    .map((topic) => topic.ref);
}

/** Unit refs the plan must teach from scratch. */
export function uncoveredTopicRefs(
  input: MasteryInput = masteryFixture()
): string[] {
  return masteryTokens(input)
    .filter((topic) => !topic.covered)
    .map((topic) => topic.ref);
}

/** Stages a single unit's items use, in plan order. */
export function stagesOf(
  proposal: ModelProposalV1,
  topicRef: string
): MasteryStage[] {
  if (proposal.mode !== "MASTERY") return [];
  return proposal.items
    .filter((item) => item.topicRef === topicRef)
    .map((item) => item.masteryStage as MasteryStage)
    .filter((stage): stage is MasteryStage => Boolean(stage));
}

/** A mastery item's allowed intent, from the application's own stage table. */
export function allowedIntents(stage: MasteryStage): readonly string[] {
  return MASTERY_STAGE_INTENTS[stage];
}

/** Whether the fixture's HIGH priority units exist at all. */
export function highPriorityTopicRefs(
  input: MasteryInput = masteryFixture()
): string[] {
  return masteryTokens(input)
    .filter((topic) => priorityLevel(topic) === "HIGH")
    .map((topic) => topic.ref);
}
