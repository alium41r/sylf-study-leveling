import { needsLearning, needsMistakeReview } from "@/lib/planner/preparedness";
/**
 * Bounded, synthetic-only plan-quality corpus (Phase 6).
 *
 * Every entry is plain data: a confirmed input plus a proposal built deterministically
 * from the shared fixtures or by the small documented generators in this module. There
 * is no randomness, no clock, and no real user academic content — labels are generic
 * subject placeholders (the same synthetic strings the existing fixtures use).
 *
 * Each entry names its intended `mode`, `kind` and `situation`. The runner normalizes
 * the proposal through the production normalizers and runs the production validators,
 * so a case is either honest valid data or honest invalid data with a real, specific
 * validation code — never a fixture that a rule was weakened to admit.
 *
 * This module is client-safe: it imports only client-safe planner modules and the
 * existing fixtures. The only server boundary is `evaluate.ts`, which calls
 * `normalizeProposal`/`normalizeExpansion`.
 */
import {
  ModelProposalV1Schema,
  UserInputV1Schema,
  type ModelProposalV1,
  type UserInputV1,
} from "../contracts";
import { dateOrdinal, datesBetween, weekday } from "../dates";
import { topicMinutes, topicPracticeFloor } from "../exam-policy";
import { isHighPriorityWeak } from "../priority";
import type { ExpansionItem } from "../expansion-fields";
import type { FrozenItemView } from "../rebalance-policy";
import { masteryInput } from "../mastery-policy";
import { periodSpecsFor, roadmapInput } from "../roadmap-policy";
import { examFixture, examProposal } from "@/__tests__/planner/exam-fixtures";
import {
  longRoadmapFixture,
  roadmapFixture,
  roadmapProposal,
} from "@/__tests__/planner/roadmap-fixtures";
import {
  masteryFixture,
  masteryProposal,
  secureMasteryFixture,
  shortMasteryFixture,
} from "@/__tests__/planner/mastery-fixtures";

export type CorpusKind = "PLAN" | "EXPANSION" | "REPLAN";
export type CorpusMode = "EXAM" | "ROADMAP" | "MASTERY";

export interface CorpusCase {
  /** Stable identifier, e.g. `exam-3day-triage`. */
  id: string;
  mode: CorpusMode;
  kind: CorpusKind;
  /** The named situation this case represents. */
  situation: string;
  /** The confirmed input the proposal is validated against. */
  input: UserInputV1;
  /** PLAN/REPLAN: the (new) proposal to normalize. EXPANSION: null. */
  proposal: ModelProposalV1 | null;
  /** REPLAN only: the previous plan's proposal, normalized for the churn baseline. */
  baseProposal?: ModelProposalV1;
  /** REPLAN only: frozen executed history the draft is validated against. */
  frozen?: FrozenItemView[];
  /** EXPANSION only: the strategic parent plus the selected period's items. */
  expansion?: {
    parentProposal: ModelProposalV1;
    milestoneIndex: number;
    items: ExpansionItem[];
    /** Period-revision baseline: the segment this revision supersedes (churn). */
    baseItems?: ExpansionItem[];
  };
}

/* ------------------------------------------------------------------ *
 * Small, documented input builders (no randomness, no clock)
 * ------------------------------------------------------------------ */

type ScopeTopicFields = {
  label: string;
  covered: boolean;
  confidence: number;
  difficult?: boolean;
  priority?: "NEUTRAL" | "LOW" | "HIGH";
  prioritySource?: "USER_EXPLICIT" | "USER_ASSESSMENT_WEIGHTING" | "USER_TEACHER_EMPHASIS" | "USER_MUST_COVER";
  sizeSignal?: "ONE_UNIT" | "SEVERAL_SUBTOPICS" | "FULL_SECTION";
};

function examInputFor(opts: {
  labels: string[];
  topics: ScopeTopicFields[];
  startDate: string;
  examDate: string;
  dailyMinutes: number[];
  approach?: "STANDARD" | "TRIAGE";
  mockMinutes?: number | null;
}): UserInputV1 {
  return UserInputV1Schema.parse({
    schemaVersion: 1,
    mode: "EXAM",
    title: "Synthetic exam",
    scope: opts.labels.join("\n"),
    startDate: opts.startDate,
    endDate: opts.examDate,
    examDate: opts.examDate,
    availability: {
      dailyMinutes: opts.dailyMinutes,
      recoveryPercent: 15,
      blockedDates: [],
    },
    exam: {
      subjectName: "Synthetic subject",
      subjectId: null,
      topics: opts.topics,
      format: "MIXED",
      preferredMinutes: 45,
      mockMinutes: opts.mockMinutes ?? null,
      allowExamDayStudy: false,
      approach: opts.approach ?? "STANDARD",
      acceptReducedReserve: false,
    },
  });
}

function roadmapInputFor(opts: {
  labels: string[];
  topics: ScopeTopicFields[];
  startDate: string;
  endDate: string;
  dailyMinutes: number[];
}): UserInputV1 {
  return roadmapInput(
    UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "ROADMAP",
      title: "Synthetic course",
      outcome: "Synthetic course",
      scope: opts.labels.join("\n"),
      startDate: opts.startDate,
      endDate: opts.endDate,
      availability: {
        dailyMinutes: opts.dailyMinutes,
        recoveryPercent: 15,
        blockedDates: [],
      },
      roadmap: {
        subjectName: "Synthetic subject",
        subjectId: null,
        qualification: null,
        topics: opts.topics,
        granularity: "MONTH",
        acceptReducedReserve: false,
      },
    })
  );
}

function masteryInputFor(opts: {
  labels: string[];
  topics: ScopeTopicFields[];
  startDate: string;
  endDate: string;
  dailyMinutes: number[];
  desiredDepth?: "ORIENTATION" | "SOLID" | "DEEP";
  priorExposure?: "NEW" | "SOME" | "MOSTLY";
}): UserInputV1 {
  return masteryInput(
    UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "MASTERY",
      title: "Synthetic unit",
      focus: "Synthetic unit",
      scope: opts.labels.join("\n"),
      startDate: opts.startDate,
      endDate: opts.endDate,
      availability: {
        dailyMinutes: opts.dailyMinutes,
        recoveryPercent: 15,
        blockedDates: [],
      },
      mastery: {
        subjectName: "Synthetic subject",
        subjectId: null,
        unitTitle: "Synthetic unit",
        topics: opts.topics,
        desiredDepth: opts.desiredDepth ?? "SOLID",
        priorExposure: opts.priorExposure ?? "SOME",
        checkPreference: "MIXED_PRACTICE",
        targetDate: opts.endDate,
        acceptReducedReserve: false,
      },
    })
  );
}

/** A deterministic, valid proposal for any confirmed input, reusing the shared fixtures' generators. */
function proposalFor(input: UserInputV1): ModelProposalV1 {
  if (input.mode === "EXAM") return examProposalFor(input);
  if (input.mode === "ROADMAP") return roadmapProposal(roadmapInput(input));
  return masteryProposal(masteryInput(input));
}

/* ------------------------------------------------------------------ *
 * Deterministic Exam proposal generator
 * ------------------------------------------------------------------ */

const PRACTICE_FAMILY = new Set(["PRACTICE", "TIMED_PRACTICE", "MISTAKE_REVIEW"]);

/**
 * A deterministic, valid Exam proposal for a confirmed Exam input.
 *
 * The sequence is mechanical: per topic, one COVERAGE pass (unseen units only), an
 * early consolidation recall, practice until both the topic's effort floor and its
 * practice floor are met, and a mistake review where confidence is low. HIGH + low
 * confidence units are emitted first so the priority window is honoured. Dates are
 * assigned in emission order over the usable study dates, then the mixed-practice
 * touch, the requested mock, and a terminal FINAL_REVIEW are appended.
 */
export function examProposalFor(input: UserInputV1): ModelProposalV1 {
  if (input.mode !== "EXAM" || !input.exam)
    throw new Error("examProposalFor requires an EXAM input with exam details");
  const exam = input.exam;
  const triage = exam.approach === "TRIAGE";
  const topics = exam.topics.map((topic, index) => ({ ...topic, ref: `t${index + 1}` }));
  const studyDates = datesBetween(input.startDate, input.examDate).filter((date) => {
    if (input.availability.blockedDates.includes(date)) return false;
    if (input.availability.dailyMinutes[weekday(date)] <= 0) return false;
    if (!exam.allowExamDayStudy && date === input.examDate) return false;
    return true;
  });
  if (!studyDates.length) throw new Error("exam generator needs at least one usable study date");

  interface Built {
    topicRef: string;
    type: string;
    stage: string;
    minutes: number;
    relatedTopicRefs: string[];
    date: string;
  }

  const ordered = [...topics].sort((a, b) => {
    const rank = (topic: (typeof topics)[number]) => (isHighPriorityWeak(topic) ? 0 : 1);
    return rank(a) - rank(b);
  });

  const built: Built[] = [];
  for (const topic of ordered) {
    // Follows the planner's own preparedness policy so the corpus generates plans
    // the engine would accept: unstated is not weak, but learning is still owed.
    const needsLearn = needsLearning(topic);
    const needsMistake = needsMistakeReview(topic);
    const floor = topicMinutes(topic, triage);
    const practiceFloor = topicPracticeFloor(topic, triage);
    let planned = 0;
    let practice = 0;
    const add = (type: string, stage: string, minutes: number) => {
      built.push({ topicRef: topic.ref, type, stage, minutes, relatedTopicRefs: [], date: "" });
      planned += minutes;
      if (PRACTICE_FAMILY.has(type)) practice += minutes;
    };
    if (needsLearn) add("LEARN", "COVERAGE", 45);
    else add("PRACTICE", "PRACTICE", 45);
    add("RECALL", "CONSOLIDATION", 15);
    const mistakeMinutes = needsMistake ? 15 : 0;
    let guard = 0;
    while (planned < floor - mistakeMinutes || practice < practiceFloor - mistakeMinutes) {
      const needed = Math.max(floor - mistakeMinutes - planned, practiceFloor - mistakeMinutes - practice);
      add("PRACTICE", "PRACTICE", Math.max(15, Math.min(45, needed)));
      if ((guard += 1) > 16) break;
    }
    if (needsMistake) add("MISTAKE_REVIEW", "PRACTICE", 15);
  }

  // Round-robin date assignment spreads the work so a short horizon does not pile a
  // whole plan onto its last day. Emission is topic-major, so a topic's recall still
  // lands on a strictly later date than the learning it follows.
  built.forEach((item, index) => {
    item.date = studyDates[index % studyDates.length];
  });

  const horizon = dateOrdinal(input.examDate) - dateOrdinal(input.startDate);
  if (topics.length > 1 && horizon >= 7)
    built.push({
      topicRef: topics[0].ref,
      type: "TIMED_PRACTICE",
      stage: "PRACTICE",
      minutes: 30,
      relatedTopicRefs: [topics[1].ref],
      date: studyDates[Math.floor(studyDates.length / 2)],
    });
  if (exam.mockMinutes)
    built.push({
      topicRef: topics[0].ref,
      type: "MOCK_EXAM",
      stage: "EXAM_READINESS",
      minutes: exam.mockMinutes,
      relatedTopicRefs: topics.length > 1 ? [topics[1].ref] : [],
      date: studyDates[Math.max(0, studyDates.length - 2)],
    });
  built.push({
    topicRef: topics[0].ref,
    type: "FINAL_REVIEW",
    stage: "EXAM_READINESS",
    minutes: 30,
    relatedTopicRefs: topics.length > 1 ? [topics[1].ref] : [],
    date: studyDates[studyDates.length - 1],
  });

  return ModelProposalV1Schema.parse({
    schemaVersion: 1,
    mode: "EXAM",
    examDate: input.examDate,
    assumptions: ["Synthetic scope; deterministic planning estimate."],
    warnings: [],
    topics: topics.map((topic) => ({ ref: topic.ref, title: topic.label, parentRef: null })),
    milestones: [],
    items: built.map((item, index) => ({
      ref: `i${index + 1}`,
      topicRef: item.topicRef,
      relatedTopicRefs: item.relatedTopicRefs,
      milestoneRef: null,
      dependsOn: [],
      type: item.type,
      stage: item.stage,
      title: `${item.type} ${item.topicRef} ${index + 1}`,
      description: "Work through the topic and record the key ideas in your own words.",
      rationale: "Keeps the confirmed topic inside the required stage ordering.",
      date: item.date,
      minutes: item.minutes,
    })),
  });
}

/* ------------------------------------------------------------------ *
 * Deterministic expansion-segment builder (one milestone's units)
 * ------------------------------------------------------------------ */

/** One LEARN + RECALL + PRACTICE touch per unit, spread over the period's dates. */
export function expansionItemsFor(count: number, dates: string[]): ExpansionItem[] {
  const items: ExpansionItem[] = [];
  let sequence = 0;
  for (let unit = 0; unit < count; unit += 1) {
    const ref = `t${unit + 1}`;
    const pushes: { type: ExpansionItem["type"]; date: string }[] = [
      { type: "LEARN", date: dates[sequence % dates.length] },
      { type: "RECALL", date: dates[(sequence + 1) % dates.length] },
      { type: "PRACTICE", date: dates[(sequence + 2) % dates.length] },
    ];
    for (const push of pushes) {
      sequence += 1;
      items.push({
        ref: `i${sequence}`,
        topicRef: ref,
        relatedTopicRefs: [],
        type: push.type,
        title: `${push.type} ${ref} ${sequence}`,
        description: "Work through the planned material and record what you completed.",
        rationale: "Covers the unit with learning, retrieval and practice.",
        completionCriteria: "Complete the planned work and note what remains.",
        date: push.date,
        minutes: 30,
        dependsOn: [],
      });
    }
  }
  return items;
}

/** Frozen executed history for a mastery proposal, in the validator's currency. */
function frozenMasteryItems(proposal: ModelProposalV1, keep: (item: ModelProposalV1["items"][number]) => boolean): FrozenItemView[] {
  if (proposal.mode !== "MASTERY") return [];
  return proposal.items.filter(keep).map((item) => ({
    key: item.ref,
    topicRef: item.topicRef,
    relatedTopicRefs: item.relatedTopicRefs ?? [],
    type: item.type,
    masteryStage: item.masteryStage,
    title: item.title,
    description: item.description,
    date: item.date,
    minutes: item.minutes,
  }));
}

/** A mastery proposal with the learning stages removed (history) and dependencies cleared. */
function remainingMasteryProposal(proposal: ModelProposalV1): ModelProposalV1 {
  if (proposal.mode !== "MASTERY") return proposal;
  return {
    ...proposal,
    items: proposal.items
      .filter((item) => item.masteryStage !== "UNDERSTAND" && item.masteryStage !== "LEARN")
      .map((item) => ({ ...item, dependsOn: [] })),
  };
}

/** Deterministic usable dates inside a roadmap period (from the deterministic period grid). */
function expansionSeed(input: UserInputV1): { parent: ModelProposalV1; topics: number; period: string[] } {
  const parent = roadmapProposal(roadmapInput(input));
  if (parent.mode !== "ROADMAP") throw new Error("roadmap proposal expected");
  const milestone = parent.milestones[0];
  const specs = periodSpecsFor(roadmapInput(input));
  const spec = specs[0];
  const period = datesBetween(spec.startDate, spec.endDate).filter(
    (date) => input.availability.dailyMinutes[weekday(date)] > 0 && !input.availability.blockedDates.includes(date)
  );
  return { parent, topics: (milestone.topicRefs ?? []).length, period };
}

/* ------------------------------------------------------------------ *
 * The corpus
 * ------------------------------------------------------------------ */

const twoWeekExam = examFixture();
const twoWeekProposal = examProposalFor(twoWeekExam);

/** The same chapter as `masteryFixture` but with a reduced weekday availability. */
const reducedMastery: UserInputV1 = {
  ...masteryFixture(),
  availability: {
    ...masteryFixture().availability,
    dailyMinutes: [0, 45, 45, 45, 45, 45, 45],
  },
};

export const PLANNER_QUALITY_CORPUS: CorpusCase[] = [
  /* ------------------------------ EXAM ------------------------------ */
  {
    id: "exam-3day-triage",
    mode: "EXAM",
    kind: "PLAN",
    situation: "three-day triage",
    input: examInputFor({
      labels: ["Topic A", "Topic B"],
      topics: [
        { label: "Topic A", covered: false, confidence: 1, difficult: false },
        { label: "Topic B", covered: true, confidence: 3, difficult: false },
      ],
      startDate: "2030-01-07",
      examDate: "2030-01-10",
      dailyMinutes: [90, 90, 90, 90, 90, 90, 90],
      approach: "TRIAGE",
    }),
    proposal: null,
  },
  {
    id: "exam-2week",
    mode: "EXAM",
    kind: "PLAN",
    situation: "two-week exam with a requested mock",
    input: twoWeekExam,
    proposal: examProposal(),
  },
  {
    id: "exam-2month",
    mode: "EXAM",
    kind: "PLAN",
    situation: "two-month exam",
    input: examInputFor({
      labels: ["Unit one", "Unit two", "Unit three", "Unit four"],
      topics: [
        { label: "Unit one", covered: false, confidence: 2, difficult: false },
        { label: "Unit two", covered: true, confidence: 1, difficult: true },
        { label: "Unit three", covered: false, confidence: 3, difficult: false },
        { label: "Unit four", covered: true, confidence: 5, difficult: false },
      ],
      startDate: "2030-01-07",
      examDate: "2030-03-06",
      dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
    }),
    proposal: null,
  },
  {
    id: "exam-mixed-confidence",
    mode: "EXAM",
    kind: "PLAN",
    situation: "mixed-confidence topics",
    input: examInputFor({
      labels: ["Confident unit", "Weak unit", "Seen unit", "New unit"],
      topics: [
        { label: "Confident unit", covered: true, confidence: 5, difficult: false },
        { label: "Weak unit", covered: true, confidence: 1, difficult: true },
        { label: "Seen unit", covered: true, confidence: 3, difficult: false },
        { label: "New unit", covered: false, confidence: 2, difficult: false },
      ],
      startDate: "2030-01-07",
      examDate: "2030-01-28",
      dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
    }),
    proposal: null,
  },
  {
    id: "exam-high-priority",
    mode: "EXAM",
    kind: "PLAN",
    situation: "high-priority strong topic",
    input: examInputFor({
      labels: ["Must cover", "Reinforce"],
      topics: [
        {
          label: "Must cover",
          covered: false,
          confidence: 2,
          difficult: false,
          priority: "HIGH",
          prioritySource: "USER_MUST_COVER",
        },
        { label: "Reinforce", covered: true, confidence: 5, difficult: false },
      ],
      startDate: "2030-01-07",
      examDate: "2030-02-04",
      dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
    }),
    proposal: null,
  },
  {
    id: "exam-overloaded",
    mode: "EXAM",
    kind: "PLAN",
    situation: "overloaded availability",
    input: examInputFor({
      labels: ["Topic A", "Topic B", "Topic C"],
      topics: [
        { label: "Topic A", covered: false, confidence: 2, difficult: false },
        { label: "Topic B", covered: true, confidence: 2, difficult: false },
        { label: "Topic C", covered: true, confidence: 5, difficult: false },
      ],
      startDate: "2030-01-07",
      examDate: "2030-01-25",
      dailyMinutes: [15, 15, 15, 15, 15, 15, 15],
    }),
    proposal: null,
  },
  {
    id: "exam-missing-final-review",
    mode: "EXAM",
    kind: "PLAN",
    situation: "exam plan that omits its terminal review (honest invalid data)",
    input: twoWeekExam,
    proposal: {
      ...twoWeekProposal,
      items: twoWeekProposal.items.filter((item) => item.type !== "FINAL_REVIEW"),
    },
  },

  /* ----------------------------- ROADMAP ---------------------------- */
  {
    id: "roadmap-3month",
    mode: "ROADMAP",
    kind: "PLAN",
    situation: "three-month roadmap",
    input: roadmapInputFor({
      labels: ["Unit one", "Unit two", "Unit three", "Unit four"],
      topics: [
        { label: "Unit one", covered: false, confidence: 2, difficult: false },
        { label: "Unit two", covered: false, confidence: 1, difficult: true },
        { label: "Unit three", covered: true, confidence: 3, difficult: false },
        { label: "Unit four", covered: false, confidence: 2, difficult: false },
      ],
      startDate: "2030-01-07",
      endDate: "2030-04-06",
      dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
    }),
    proposal: null,
  },
  {
    id: "roadmap-6month",
    mode: "ROADMAP",
    kind: "PLAN",
    situation: "six-month roadmap with partial progress",
    input: roadmapFixture(),
    proposal: null,
  },
  {
    id: "roadmap-12month",
    mode: "ROADMAP",
    kind: "PLAN",
    situation: "twelve-month roadmap",
    input: longRoadmapFixture(),
    proposal: null,
  },
  {
    id: "roadmap-uneven-units",
    mode: "ROADMAP",
    kind: "PLAN",
    situation: "uneven unit sizes",
    input: roadmapInputFor({
      labels: ["Small unit", "Wide unit", "Whole section", "Medium unit"],
      topics: [
        { label: "Small unit", covered: false, confidence: 2, difficult: false, sizeSignal: "ONE_UNIT" },
        { label: "Wide unit", covered: false, confidence: 2, difficult: true, sizeSignal: "SEVERAL_SUBTOPICS" },
        { label: "Whole section", covered: false, confidence: 2, difficult: false, sizeSignal: "FULL_SECTION" },
        { label: "Medium unit", covered: true, confidence: 3, difficult: false },
      ],
      startDate: "2030-01-07",
      endDate: "2030-06-30",
      dailyMinutes: [0, 60, 60, 60, 60, 90, 90],
    }),
    proposal: null,
  },
  {
    id: "roadmap-high-priority",
    mode: "ROADMAP",
    kind: "PLAN",
    situation: "high-priority units",
    input: roadmapInputFor({
      labels: ["Priority one", "Priority two", "Regular"],
      topics: [
        { label: "Priority one", covered: false, confidence: 2, difficult: false, priority: "HIGH", prioritySource: "USER_MUST_COVER" },
        { label: "Priority two", covered: false, confidence: 1, difficult: false, priority: "HIGH", prioritySource: "USER_TEACHER_EMPHASIS" },
        { label: "Regular", covered: false, confidence: 2, difficult: false },
      ],
      startDate: "2030-01-07",
      endDate: "2030-03-31",
      dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
    }),
    proposal: null,
  },
  {
    id: "roadmap-expansion",
    mode: "ROADMAP",
    kind: "EXPANSION",
    situation: "period expansion",
    input: roadmapFixture(),
    proposal: null,
    expansion: {
      parentProposal: expansionSeed(roadmapFixture()).parent,
      milestoneIndex: 0,
      items: expansionItemsFor(expansionSeed(roadmapFixture()).topics, expansionSeed(roadmapFixture()).period),
    },
  },

  /* ----------------------------- MASTERY ---------------------------- */
  {
    id: "mastery-new-chapter",
    mode: "MASTERY",
    kind: "PLAN",
    situation: "new chapter",
    input: masteryInputFor({
      labels: ["Concept one", "Concept two"],
      topics: [
        { label: "Concept one", covered: false, confidence: 1, difficult: false },
        { label: "Concept two", covered: false, confidence: 2, difficult: true },
      ],
      startDate: "2030-01-07",
      endDate: "2030-02-03",
      dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
      priorExposure: "NEW",
    }),
    proposal: null,
  },
  {
    id: "mastery-mostly-known",
    mode: "MASTERY",
    kind: "PLAN",
    situation: "mostly-known chapter",
    input: secureMasteryFixture(),
    proposal: null,
  },
  {
    id: "mastery-mixed-confidence",
    mode: "MASTERY",
    kind: "PLAN",
    situation: "mixed-confidence unit",
    input: masteryFixture(),
    proposal: null,
  },
  {
    id: "mastery-short-horizon",
    mode: "MASTERY",
    kind: "PLAN",
    situation: "short horizon",
    input: shortMasteryFixture(),
    proposal: null,
  },
  {
    id: "mastery-deep",
    mode: "MASTERY",
    kind: "PLAN",
    situation: "deep mastery request",
    input: masteryInputFor({
      labels: ["Concept one", "Concept two", "Concept three"],
      topics: [
        { label: "Concept one", covered: false, confidence: 2, difficult: false },
        { label: "Concept two", covered: true, confidence: 2, difficult: true },
        { label: "Concept three", covered: true, confidence: 5, difficult: false },
      ],
      startDate: "2030-01-07",
      endDate: "2030-02-03",
      dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
      desiredDepth: "DEEP",
    }),
    proposal: null,
  },

  /* ------------------------------ REPLAN ---------------------------- */
  {
    id: "replan-missed-work",
    mode: "EXAM",
    kind: "REPLAN",
    situation: "missed work",
    input: twoWeekExam,
    baseProposal: twoWeekProposal,
    proposal: {
      ...twoWeekProposal,
      items: twoWeekProposal.items.map((item) =>
        item.topicRef === "t1" && item.type === "MISTAKE_REVIEW"
          ? { ...item, date: "2030-01-20" }
          : item
      ),
    },
  },
  {
    id: "replan-reduced-availability",
    mode: "MASTERY",
    kind: "REPLAN",
    situation: "reduced availability",
    input: reducedMastery,
    baseProposal: masteryProposal(masteryFixture()),
    proposal: null,
  },
  {
    id: "replan-increased-availability",
    mode: "EXAM",
    kind: "REPLAN",
    situation: "increased availability",
    input: twoWeekExam,
    baseProposal: twoWeekProposal,
    proposal: {
      ...twoWeekProposal,
      items: [
        ...twoWeekProposal.items,
        {
          ref: `i${twoWeekProposal.items.length + 1}`,
          topicRef: "t1",
          relatedTopicRefs: [],
          milestoneRef: null,
          dependsOn: [],
          type: "RECALL",
          stage: "CONSOLIDATION",
          title: "Extra recall t1",
          description: "Recall the main points again and check the gaps that remain.",
          rationale: "Uses the extra capacity for an additional spaced retrieval touch.",
          date: "2030-01-15",
          minutes: 15,
        },
      ],
    },
  },
  {
    id: "replan-completed-frozen-stages",
    mode: "MASTERY",
    kind: "REPLAN",
    situation: "completed frozen stages",
    input: masteryFixture(),
    baseProposal: masteryProposal(masteryFixture()),
    proposal: remainingMasteryProposal(masteryProposal(masteryFixture())),
    frozen: frozenMasteryItems(
      masteryProposal(masteryFixture()),
      (item) => item.masteryStage === "UNDERSTAND" || item.masteryStage === "LEARN"
    ),
  },
  {
    id: "replan-expanded-period-revision",
    mode: "ROADMAP",
    kind: "EXPANSION",
    situation: "expanded Roadmap period revision",
    input: roadmapFixture(),
    proposal: null,
    expansion: {
      parentProposal: expansionSeed(roadmapFixture()).parent,
      milestoneIndex: 0,
      baseItems: expansionItemsFor(expansionSeed(roadmapFixture()).topics, expansionSeed(roadmapFixture()).period),
      items: expansionItemsFor(expansionSeed(roadmapFixture()).topics, expansionSeed(roadmapFixture()).period).map((item, index) =>
        index === 2 ? { ...item, date: expansionSeed(roadmapFixture()).period[3] } : item
      ),
    },
  },
];

/** Builds the proposal for any PLAN/REPLAN case whose `proposal` is left null (deterministic). */
export function resolveCorpusProposal(caseDef: CorpusCase): ModelProposalV1 {
  if (caseDef.proposal) return caseDef.proposal;
  return proposalFor(caseDef.input);
}
