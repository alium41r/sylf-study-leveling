/**
 * Plan-quality metrics (Phase 6 A2/A3 evaluation layer).
 *
 * These are content-free, deterministic, bounded measurements computed ONLY from a
 * validated draft plus the confirmed input and the existing pure helpers. They answer
 * "would a reasonable student actually want to use this plan?" as a *number and a
 * closed issue code*, never as a model judgement, and never by calling a provider.
 *
 * ## Deterministic validation is NOT evaluative quality
 *
 * A quality finding can never fail a plan by itself, and it is structurally unable to:
 *
 * - every `score` here is a number in [0, 1] and every `counts` value is a non-negative
 *   integer; nothing throws, and nothing feeds back into `validateDraft`;
 * - the runner (`evaluate.ts`) calls `validateDraft`/`normalizeProposal` FIRST and only
 *   computes these metrics on a draft that already validated. A finding therefore can
 *   only ever *describe* a validated plan, never reject it;
 * - an invalid draft is reported as `valid: false` with its exact validation code and no
 *   metrics, so a metric can never mask or convert a validation failure.
 *
 * ## Bounded & content-free
 *
 * Scores are closed to [0, 1]. Issue lists use the closed `QUALITY_ISSUE_CODES` and
 * reference only topic scope refs (`tN`), dates, or counts — never item titles,
 * descriptions, or any academic content. The record a runner serializes therefore
 * contains no user content.
 *
 * ## Reused, not reinvented
 *
 * Sequencing/redundancy come from `deterministicSemanticIssues`; workload from
 * `validateCapacity`; rhythm from `intensityAdvisories`; retrieval spacing from
 * `retrievalViolations`; coverage from `coverageMap`; Core/Stretch from
 * `assertCoreSufficient` re-running the mode validators; floors from
 * `scopeTopicMinutes`/`topicMinutes`/`masteryTopicMinutes`; preferences from
 * `softConstraintViolations`/`roadmapSoftViolations`.
 */
import {
  activeItems,
  type PlannerItem,
  type UserInputV1,
  type ValidatedDraftV1,
} from "../contracts";
import { completionCriteriaIssue, milestoneOutcomeIssue } from "../done";
import { validateCapacity, type AvailabilitySnapshot } from "../capacity";
import { softConstraintViolations, softConstraints } from "../constraints";
import {
  deterministicSemanticIssues,
  roadmapSemanticDraft,
  type SemanticDraft,
} from "../semantic";
import { intensityAdvisories } from "../load";
import {
  learningDatesOf,
  retrievalViolations,
  type RetrievalTouchView,
} from "../retrieval";
import { coverageMap } from "../coverage";
import { assertCoreSufficient, isStretch } from "../planner-role";
import { priorityLevel } from "../priority";
import {
  scopeTopicMinutes,
  scopeTopicPracticeFloor,
  type ScopeTopic,
} from "../scope-topic";
import { topicMinutes, topicPracticeFloor } from "../exam-policy";
import { masteryTopicMinutes } from "../mastery-policy";
import {
  periodSpecsFor,
  priorityOrderViolations,
  roadmapDraftView,
  roadmapInput,
  roadmapSoftViolations,
  type RoadmapDraft,
} from "../roadmap-policy";
import { validateExamDraft } from "../exam-policy";
import { validateMasteryDraft } from "../mastery-policy";
import { validateRoadmapDraft } from "../roadmap-policy";

/** Closed evaluative issue vocabulary. Distinct from the critic's codes on purpose. */
export const QUALITY_ISSUE_CODES = [
  "QUALITY_VAGUE_TASK",
  "QUALITY_SEQUENCE_WEAK",
  "QUALITY_WORKLOAD_SPIKE",
  "QUALITY_UNIT_UNDERFLOOR",
  "QUALITY_COVERAGE_GAP",
  "QUALITY_MISSING_RETRIEVAL",
  "QUALITY_RETRIEVAL_UNSPACED",
  "QUALITY_MISSING_PRACTICE",
  "QUALITY_REDUNDANT_PURPOSE",
  "QUALITY_INTENSITY_STACK",
  "QUALITY_CHURN_HIGH",
  "QUALITY_PRIORITY_MISS",
  "QUALITY_PREFERENCE_VIOLATION",
  "QUALITY_STRETCH_HIDES_CORE",
  "QUALITY_WEAK_TERMINAL_CHECK",
] as const;
export type QualityIssueCode = (typeof QUALITY_ISSUE_CODES)[number];

export interface QualityIssue {
  code: QualityIssueCode;
  /** Topic scope refs (`tN`), dates, or empty — never titles, keys, or descriptions. */
  refs: string[];
  /** A short, deterministic, content-free explanation (numbers + rule names only). */
  detail: string;
}

export interface MetricResult {
  /** Closed to [0, 1]; 1 is best. */
  score: number;
  issues: QualityIssue[];
  /** Bounded auxiliary counts, all non-negative integers. */
  counts: Record<string, number>;
  /** False for metrics that do not apply to a given mode/kind (excluded from averages). */
  applicable: boolean;
}

export const METRIC_NAMES = [
  "concrete",
  "sequencing",
  "workload",
  "allocation",
  "coverage",
  "retrieval",
  "redundancy",
  "rhythm",
  "churn",
  "priorities",
  "preferences",
  "coreStretch",
  "terminal",
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];

export interface QualityContext {
  input: UserInputV1;
  draft: ValidatedDraftV1;
  /** Normalized base revision, present only for a REPLAN (churn is measured against it). */
  base?: ValidatedDraftV1;
}

export interface QualityReport {
  metrics: Record<MetricName, MetricResult>;
  issues: QualityIssue[];
  counts: Record<string, number>;
}

/** Description length below which a task is evaluatively "vague" (the semantic gate's own thin floor). */
const NON_TRIVIAL_DESCRIPTION_MIN = 12;
/** Churn ratio at or above which a replan is evaluatively high-churn. */
const CHURN_HIGH_THRESHOLD = 0.5;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** The empty execution snapshot every quality metric shares: no database, no clock. */
export function emptyAvailability(): AvailabilitySnapshot {
  return {
    schemaVersion: 1,
    timezone: "UTC",
    restDays: [],
    floatingDates: [],
    existingWork: [],
    lineageFingerprint: "",
  };
}

function topicsOf(draft: ValidatedDraftV1): { key: string; scopeRef: string; title: string }[] {
  return draft.topics.map((topic) => ({
    key: topic.key,
    scopeRef: topic.scopeRef ?? topic.key,
    title: topic.title,
  }));
}

function topicRefOf(draft: ValidatedDraftV1, topicKey: string): string {
  return draft.topics.find((topic) => topic.key === topicKey)?.scopeRef ?? topicKey;
}

/** The narrowed strategic Roadmap draft (milestones, no items), or undefined. */
function strategicDraft(ctx: QualityContext): RoadmapDraft | undefined {
  const { draft, input } = ctx;
  if (draft.mode === "ROADMAP" && !draft.expansion && input.mode === "ROADMAP" && input.roadmap)
    return draft as RoadmapDraft;
  return undefined;
}

const itemsOf = (draft: ValidatedDraftV1): PlannerItem[] => activeItems(draft.items);

/* ------------------------------------------------------------------ *
 * Confirmed scope topics, narrowed from the input union without re-asserting.
 * ------------------------------------------------------------------ */

function examTopics(input: UserInputV1): ScopeTopic[] {
  return input.mode === "EXAM" && input.exam ? input.exam.topics : [];
}
function masteryTopics(input: UserInputV1): ScopeTopic[] {
  return input.mode === "MASTERY" && input.mastery ? input.mastery.topics : [];
}
function roadmapTopics(input: UserInputV1): ScopeTopic[] {
  return input.mode === "ROADMAP" && input.roadmap ? input.roadmap.topics : [];
}
function scopeIndex(scopeRef: string): number {
  return Number(scopeRef.replace(/^t/, "")) - 1;
}

/* ------------------------------------------------------------------ *
 * Topic floors (reuse the mode policies rather than re-derive them)
 * ------------------------------------------------------------------ */

function topicFloorOf(input: UserInputV1, scopeRef: string): number {
  const index = scopeIndex(scopeRef);
  if (input.mode === "EXAM" && input.exam) {
    const topic = examTopics(input)[index];
    return topic ? topicMinutes(topic, input.exam.approach === "TRIAGE") : 0;
  }
  if (input.mode === "MASTERY" && input.mastery) {
    const topic = masteryTopics(input)[index];
    return topic ? masteryTopicMinutes(topic, input.mastery.desiredDepth) : 0;
  }
  if (input.mode === "ROADMAP" && input.roadmap) {
    const topic = roadmapTopics(input)[index];
    return topic ? scopeTopicMinutes(topic, false) : 0;
  }
  return 0;
}

function practiceFloorOf(input: UserInputV1, scopeRef: string): number {
  const index = scopeIndex(scopeRef);
  if (input.mode === "EXAM" && input.exam) {
    const topic = examTopics(input)[index];
    return topic ? topicPracticeFloor(topic, input.exam.approach === "TRIAGE") : 0;
  }
  if (input.mode === "MASTERY" && input.mastery) {
    const topic = masteryTopics(input)[index];
    return topic && priorityLevel(topic) === "HIGH" ? scopeTopicPracticeFloor(topic, false) : 0;
  }
  return 0;
}

function highPriorityRefs(input: UserInputV1): Set<string> {
  const refs = new Set<string>();
  if (input.mode === "EXAM" && input.exam)
    examTopics(input).forEach((topic, index) => {
      if (priorityLevel(topic) === "HIGH") refs.add(`t${index + 1}`);
    });
  if (input.mode === "MASTERY" && input.mastery)
    masteryTopics(input).forEach((topic, index) => {
      if (priorityLevel(topic) === "HIGH") refs.add(`t${index + 1}`);
    });
  return refs;
}

/* ------------------------------------------------------------------ *
 * A shared semantic view so sequencing/redundancy reuse one call
 * ------------------------------------------------------------------ */

function semanticDraftOf(ctx: QualityContext): SemanticDraft {
  const strategic = strategicDraft(ctx);
  if (strategic) return roadmapSemanticDraft(strategic);
  return {
    topics: ctx.draft.topics.map((topic) => ({ key: topic.key, title: topic.title })),
    items: ctx.draft.items.map((item) => ({
      key: item.key,
      topicKey: item.topicKey,
      type: item.type,
      title: item.title,
      description: item.description,
      date: item.date,
      minutes: item.minutes,
      removed: item.removed,
    })),
  };
}

const unique = <T,>(values: T[]): T[] => [...new Set(values)];

/** Deterministic scope refs for an issue's affected (durable) keys. */
function scopeRefsOfKeys(draft: ValidatedDraftV1, keys: string[]): string[] {
  const refs = keys.map((key) => {
    const item = draft.items.find((entry) => entry.key === key);
    if (item) return topicRefOf(draft, item.topicKey);
    if (draft.mode === "ROADMAP") {
      const milestone = (draft as RoadmapDraft).milestones.find((entry) => entry.key === key);
      if (milestone) return topicRefOf(draft, milestone.topicKeys?.[0] ?? draft.topics[0].key);
    }
    return "";
  });
  return unique(refs.filter(Boolean));
}

/* ------------------------------------------------------------------ *
 * Individual metrics
 * ------------------------------------------------------------------ */

/** A metric that does not apply to the given mode/kind (excluded from averages). */
const notApplicable = (counts: Record<string, number> = {}): MetricResult => ({
  score: 1,
  issues: [],
  counts,
  applicable: false,
});

/** Concrete/actionable tasks: resolved DoD + a non-trivial description. */
export function concrete(ctx: QualityContext): MetricResult {
  const { draft } = ctx;
  const strategic = strategicDraft(ctx);
  type Entry = { ref: string; description: string; doText: string; isMilestone: boolean };
  const entries: Entry[] = strategic
    ? strategic.milestones
        .filter((milestone) => !milestone.removed)
        .map((milestone) => ({
          ref: topicRefOf(draft, milestone.topicKeys?.[0] ?? draft.topics[0].key),
          description: milestone.outcome ?? "",
          doText: milestone.outcome ?? "",
          isMilestone: true,
        }))
    : itemsOf(draft).map((item) => ({
        ref: topicRefOf(draft, item.topicKey),
        description: item.description,
        doText: item.completionCriteria ?? "",
        isMilestone: false,
      }));
  const vague = entries.filter((entry) => {
    const resolvedDoD = entry.isMilestone
      ? milestoneOutcomeIssue(entry.doText) === null
      : completionCriteriaIssue(entry.doText, { type: "ANY", minutes: 15 }) === null;
    const concreteDescription = entry.description.trim().length >= NON_TRIVIAL_DESCRIPTION_MIN;
    return !(resolvedDoD && concreteDescription);
  });
  const score = entries.length ? (entries.length - vague.length) / entries.length : 1;
  return {
    score: round2(score),
    issues: vague.length
      ? [{ code: "QUALITY_VAGUE_TASK", refs: unique(vague.map((entry) => entry.ref)), detail: `${vague.length} task(s) lack a concrete description or a resolved Definition of Done` }]
      : [],
    counts: { tasks: entries.length, vague: vague.length },
    applicable: true,
  };
}

/** Sensible sequencing: soft retrieval-spread findings (hard ordering is already validated). */
export function sequencing(ctx: QualityContext): MetricResult {
  const issues = deterministicSemanticIssues(semanticDraftOf(ctx));
  const weak = issues.filter((issue) => issue.issueCode === "SEQ_WEAK");
  const total = itemsOf(ctx.draft).length || ctx.draft.milestones.length;
  const score = total ? (total - weak.length) / total : 1;
  return {
    score: round2(Math.max(0, score)),
    issues: weak.length
      ? [{ code: "QUALITY_SEQUENCE_WEAK", refs: scopeRefsOfKeys(ctx.draft, weak.flatMap((issue) => issue.affectedItemRefs)), detail: `${weak.length} retrieval touch(es) clustered at the end instead of spread` }]
      : [],
    counts: { seqWeak: weak.length },
    applicable: true,
  };
}

/** Realistic workload: planned minutes vs each day's post-reserve capacity (no new rule). */
export function workload(ctx: QualityContext): MetricResult {
  const { input, draft } = ctx;
  const items = itemsOf(draft);
  const result = validateCapacity(input, emptyAvailability(), items.map((item) => ({ date: item.date, minutes: item.minutes })));
  const reasons = result.feasible ? [] : result.reasons;
  const spikeDates = unique(reasons.map((reason) => reason.date)).sort();
  const daysWithWork = unique(items.map((item) => item.date)).length;
  const score = daysWithWork ? (daysWithWork - spikeDates.length) / daysWithWork : 1;
  return {
    score: round2(Math.max(0, score)),
    issues: spikeDates.length
      ? [{ code: "QUALITY_WORKLOAD_SPIKE", refs: spikeDates, detail: `${spikeDates.length} day(s) planned above the day's confirmed capacity` }]
      : [],
    counts: { daysWithWork, spikes: spikeDates.length },
    applicable: true,
  };
}

/** Per-unit minutes vs floors (Exam/Mastery/strategic Roadmap; skipped for expansions). */
export function allocation(ctx: QualityContext): MetricResult {
  const { input, draft } = ctx;
  if (draft.mode === "ROADMAP" && draft.expansion) return notApplicable({ units: 0, underfloor: 0 });
  const perTopic = new Map<string, number>();
  const strategic = strategicDraft(ctx);
  if (strategic) {
    for (const milestone of strategic.milestones) {
      if (milestone.removed) continue;
      for (const topicKey of milestone.topicKeys ?? []) {
        const ref = topicRefOf(draft, topicKey);
        perTopic.set(ref, (perTopic.get(ref) ?? 0) + (milestone.effortMinutes ?? 0));
      }
    }
  } else {
    for (const item of itemsOf(draft)) {
      const ref = topicRefOf(draft, item.topicKey);
      perTopic.set(ref, (perTopic.get(ref) ?? 0) + item.minutes);
    }
  }
  const topics = topicsOf(draft);
  const underfloor = topics
    .filter((topic) => {
      const floor = topicFloorOf(input, topic.scopeRef);
      return floor > 0 && (perTopic.get(topic.scopeRef) ?? 0) < floor;
    })
    .map((topic) => topic.scopeRef);
  const score = topics.length ? (topics.length - underfloor.length) / topics.length : 1;
  return {
    score: round2(score),
    issues: underfloor.length
      ? [{ code: "QUALITY_UNIT_UNDERFLOOR", refs: underfloor, detail: `${underfloor.length} unit(s) below their confirmed effort floor` }]
      : [],
    counts: { units: topics.length, underfloor: underfloor.length },
    applicable: true,
  };
}

/** Coverage completeness via the shared Coverage Map (traceability, never mastery). */
export function coverage(ctx: QualityContext): MetricResult {
  const { draft } = ctx;
  const units = topicsOf(draft).map((topic) => ({ key: topic.key, title: topic.title }));
  const roadmapMilestones = draft.mode === "ROADMAP" ? (draft as RoadmapDraft).milestones : undefined;
  const map = coverageMap({
    units,
    items: draft.items.map((item) => ({
      key: item.key,
      topicKey: item.topicKey,
      type: item.type,
      stage: item.stage,
      masteryStage: item.masteryStage,
      date: item.date,
      role: item.role,
      removed: item.removed,
    })),
    milestones: roadmapMilestones?.map((milestone) => ({
      key: milestone.key,
      date: milestone.date,
      topicKeys: milestone.topicKeys ?? [],
      removed: milestone.removed,
    })),
  });
  const unscheduled = map.unscheduled.map((key) => topicRefOf(draft, key));
  const score = map.units.length ? (map.units.length - unscheduled.length) / map.units.length : 1;
  return {
    score: round2(score),
    issues: unscheduled.length
      ? [{ code: "QUALITY_COVERAGE_GAP", refs: unscheduled, detail: `${unscheduled.length} unit(s) have no scheduled coverage` }]
      : [],
    counts: { units: map.units.length, unscheduled: unscheduled.length },
    applicable: true,
  };
}

const RETRIEVAL_INTENTS = new Set(["RECALL", "REVIEW"]);
const PRACTICE_INTENTS = new Set(["PRACTICE", "TIMED_PRACTICE", "MISTAKE_REVIEW"]);

/** Meaningful retrieval + practice: presence per unit and spacing of stamped touches. */
export function retrieval(ctx: QualityContext): MetricResult {
  const { input, draft } = ctx;
  if (strategicDraft(ctx)) return notApplicable({ units: 0, missingRetrieval: 0, missingPractice: 0, unspaced: 0 });
  const items = itemsOf(draft);
  // Retrieval/practice are actionable-item properties: only units that actually carry
  // items are held to them (an expansion's other units stay strategic, covered by
  // milestones rather than day-level work).
  const unitsWithWork = new Set(items.map((item) => topicRefOf(draft, item.topicKey)));
  const topics = topicsOf(draft).filter((topic) => unitsWithWork.has(topic.scopeRef));
  const missingRetrieval: string[] = [];
  const missingPractice: string[] = [];
  for (const topic of topics) {
    const work = items.filter((item) => topicRefOf(draft, item.topicKey) === topic.scopeRef);
    if (!work.some((item) => RETRIEVAL_INTENTS.has(item.type))) missingRetrieval.push(topic.scopeRef);
    if (!work.some((item) => PRACTICE_INTENTS.has(item.type))) missingPractice.push(topic.scopeRef);
  }
  const stamped: RetrievalTouchView[] = items
    .filter((item) => Boolean(item.retrievalPurpose))
    .map((item) => ({
      ref: item.key,
      topicRef: topicRefOf(draft, item.topicKey),
      date: item.date,
      purpose: item.retrievalPurpose!,
      minimumGapDays: item.minimumGapDays,
      groupId: item.retrievalGroupId ?? null,
      index: item.retrievalIndex,
    }));
  let unspaced = 0;
  if (stamped.length) {
    const learning = learningDatesOf(
      items
        .filter((item) => !item.retrievalPurpose)
        .map((item) => ({ topicRef: topicRefOf(draft, item.topicKey), type: item.type, date: item.date }))
    );
    unspaced = retrievalViolations({
      startDate: input.startDate,
      endDate: input.endDate,
      retrievals: stamped,
      learningDateOf: (topicRef) => learning.get(topicRef) ?? null,
    }).length;
  }
  const present = topics.length ? (topics.length - missingRetrieval.length) / topics.length : 1;
  const practiced = topics.length ? (topics.length - missingPractice.length) / topics.length : 1;
  const score = unspaced ? 0 : (present + practiced) / 2;
  const issues: QualityIssue[] = [];
  if (missingRetrieval.length)
    issues.push({ code: "QUALITY_MISSING_RETRIEVAL", refs: missingRetrieval, detail: `${missingRetrieval.length} unit(s) have no retrieval touch` });
  if (missingPractice.length)
    issues.push({ code: "QUALITY_MISSING_PRACTICE", refs: missingPractice, detail: `${missingPractice.length} unit(s) have no practice-family work` });
  if (unspaced)
    issues.push({ code: "QUALITY_RETRIEVAL_UNSPACED", refs: [], detail: `${unspaced} stamped retrieval touch(es) violate the spacing invariants` });
  return {
    score: round2(Math.max(0, score)),
    issues,
    counts: { units: topics.length, missingRetrieval: missingRetrieval.length, missingPractice: missingPractice.length, unspaced },
    applicable: true,
  };
}

/** Low redundancy: duplicate (unit, intent, date) purposes, from the deterministic gate. */
export function redundancy(ctx: QualityContext): MetricResult {
  const issues = deterministicSemanticIssues(semanticDraftOf(ctx));
  const redundant = issues.filter((issue) => issue.issueCode === "REDUNDANT_TOUCH");
  const total = itemsOf(ctx.draft).length || ctx.draft.milestones.length;
  const score = total ? (total - redundant.length) / total : 1;
  return {
    score: round2(Math.max(0, score)),
    issues: redundant.length
      ? [{ code: "QUALITY_REDUNDANT_PURPOSE", refs: scopeRefsOfKeys(ctx.draft, redundant.flatMap((issue) => issue.affectedItemRefs)), detail: `${redundant.length} repeated purpose(s) on the same date` }]
      : [],
    counts: { redundant: redundant.length },
    applicable: true,
  };
}

/** Cognitive rhythm via the advisory (never HIGH) intensity stack. */
export function rhythm(ctx: QualityContext): MetricResult {
  const items = itemsOf(ctx.draft);
  const advisories = intensityAdvisories(items);
  const activeDays = unique(items.map((item) => item.date)).length;
  const score = activeDays ? (activeDays - advisories.length) / activeDays : 1;
  return {
    score: round2(Math.max(0, score)),
    issues: advisories.length
      ? [{ code: "QUALITY_INTENSITY_STACK", refs: unique(advisories.map((advisory) => advisory.date)), detail: `${advisories.length} day(s) stack demanding work without lighter work to alternate` }]
      : [],
    counts: { advisories: advisories.length, activeDays },
    applicable: true,
  };
}

interface ChurnItem {
  topic: string;
  intent: string;
  date: string;
  minutes: number;
}

const churnKey = (item: ChurnItem): string => `${item.topic}|${item.intent}|${item.date}|${item.minutes}`;

function churnItemsOf(ctx: QualityContext): ChurnItem[] {
  const { draft } = ctx;
  const strategic = strategicDraft(ctx);
  if (strategic) {
    return strategic.milestones
      .filter((milestone) => !milestone.removed)
      .map((milestone) => ({
        topic: topicRefOf(draft, milestone.topicKeys?.[0] ?? draft.topics[0].key),
        intent: "MILESTONE",
        date: milestone.date,
        minutes: milestone.effortMinutes ?? 0,
      }));
  }
  return itemsOf(draft).map((item) => ({
    topic: topicRefOf(draft, item.topicKey),
    intent: item.type,
    date: item.date,
    minutes: item.minutes,
  }));
}

/**
 * Minimal unnecessary churn (replan only): retained vs moved/replaced/removed/added.
 *
 * Matching is greedy and index-based (each `next` item is consumed at most once), so
 * duplicate (topic, intent, date, minutes) signatures cannot collide the way a set of
 * keys would. `retained` is the exact-signature match; `moved`/`replaced` are a
 * documented best-effort decomposition of the remainder by topic+intent, then topic.
 */
export function churnMetric(base: ChurnItem[], next: ChurnItem[]): MetricResult {
  const matchedNext = new Array(next.length).fill(false);
  let retained = 0;
  let moved = 0;
  let replaced = 0;
  let removed = 0;
  for (const item of base) {
    const exact = next.findIndex((candidate, index) => !matchedNext[index] && churnKey(candidate) === churnKey(item));
    if (exact >= 0) {
      matchedNext[exact] = true;
      retained += 1;
      continue;
    }
    const move = next.findIndex(
      (candidate, index) => !matchedNext[index] && candidate.topic === item.topic && candidate.intent === item.intent
    );
    if (move >= 0) {
      matchedNext[move] = true;
      moved += 1;
      continue;
    }
    const replace = next.findIndex(
      (candidate, index) => !matchedNext[index] && candidate.topic === item.topic
    );
    if (replace >= 0) {
      matchedNext[replace] = true;
      replaced += 1;
      continue;
    }
    removed += 1;
  }
  const added = matchedNext.filter((matched) => !matched).length;
  const total = base.length + next.length;
  const changed = moved + replaced + removed + added;
  const ratio = total ? changed / total : 0;
  return {
    score: round2(1 - ratio),
    issues: ratio >= CHURN_HIGH_THRESHOLD
      ? [{ code: "QUALITY_CHURN_HIGH", refs: [], detail: `${changed} of ${total} item(s) changed (retained ${retained})` }]
      : [],
    counts: { retained, moved, replaced, removed, added, ratio: round2(ratio) },
    applicable: true,
  };
}

/** Explicit priorities: HIGH-priority units' practice floors and ordering windows. */
export function priorities(ctx: QualityContext): MetricResult {
  const { input, draft } = ctx;
  const strategic = strategicDraft(ctx);
  if (strategic) {
    const violations = priorityOrderViolations(roadmapInput(input), roadmapDraftView(strategic));
    return {
      score: violations.length ? 0 : 1,
      issues: violations.length
        ? [{ code: "QUALITY_PRIORITY_MISS", refs: [], detail: `${violations.length} priority-ordering violation(s)` }]
        : [],
      counts: { high: 0, misses: violations.length },
      applicable: true,
    };
  }
  const highRefs = highPriorityRefs(input);
  const misses = [...highRefs].filter((ref) => {
    const practiceMinutes = itemsOf(draft)
      .filter((item) => topicRefOf(draft, item.topicKey) === ref && PRACTICE_INTENTS.has(item.type))
      .reduce((total, item) => total + item.minutes, 0);
    return practiceMinutes < practiceFloorOf(input, ref);
  });
  const score = highRefs.size ? (highRefs.size - misses.length) / highRefs.size : 1;
  return {
    score: round2(score),
    issues: misses.length
      ? [{ code: "QUALITY_PRIORITY_MISS", refs: misses, detail: `${misses.length} high-priority unit(s) below their practice floor` }]
      : [],
    counts: { high: highRefs.size, misses: misses.length },
    applicable: true,
  };
}

/** Applicable preferences: session length/density/roadmap soft preferences, from pure input. */
export function preferences(ctx: QualityContext): MetricResult {
  const { input, draft } = ctx;
  const total = softConstraints(input).length;
  let violated = 0;
  const strategic = strategicDraft(ctx);
  if (strategic) {
    const roadmap = roadmapInput(input);
    const milestones = strategic.milestones
      .filter((milestone) => !milestone.removed)
      .map((milestone) => ({ periodRef: milestone.periodKey, effortMinutes: milestone.effortMinutes, topicRefs: milestone.topicKeys }));
    violated = roadmapSoftViolations(roadmap, periodSpecsFor(roadmap), milestones).length;
  } else {
    const items = itemsOf(draft).map((item) => ({ key: item.key, date: item.date, minutes: item.minutes }));
    violated = softConstraintViolations(input, items).length;
  }
  const score = total ? (total - violated) / total : 1;
  return {
    score: round2(score),
    issues: violated
      ? [{ code: "QUALITY_PREFERENCE_VIOLATION", refs: [], detail: `${violated} stated preference(s) not honored` }]
      : [],
    counts: { total, violated },
    applicable: true,
  };
}

/** Core/Stretch: CORE-only sufficiency re-verified, plus the STRETCH share. */
export function coreStretch(ctx: QualityContext): MetricResult {
  const { input, draft } = ctx;
  const items = itemsOf(draft);
  const stretch = items.filter((item) => isStretch(item)).length;
  let coreOnlyValid = true;
  let detail = "";
  try {
    assertCoreSufficient(draft.items, () => {
      const coreOnly = {
        ...draft,
        items: draft.items.filter((item) => !isStretch(item)),
      } as ValidatedDraftV1;
      validateExamDraft(input, coreOnly, []);
      validateRoadmapDraft(input, coreOnly, []);
      validateMasteryDraft(input, coreOnly, []);
    });
  } catch (error) {
    coreOnlyValid = false;
    detail = error instanceof Error ? error.message : "MODE_RULES";
  }
  return {
    score: coreOnlyValid ? 1 : 0,
    issues: coreOnlyValid
      ? []
      : [{ code: "QUALITY_STRETCH_HIDES_CORE", refs: [], detail }],
    counts: { items: items.length, stretch, share: round2(items.length ? stretch / items.length : 0) },
    applicable: true,
  };
}

/** Terminal check: final readiness (Exam) / Mastery Check presence and placement. */
export function terminal(ctx: QualityContext): MetricResult {
  const { input, draft } = ctx;
  if (draft.mode === "ROADMAP") return notApplicable({});
  const items = itemsOf(draft);
  const issues: QualityIssue[] = [];
  let last: PlannerItem | undefined;
  for (const item of items)
    if (!last || item.date > last.date || (item.date === last.date && items.indexOf(item) > items.indexOf(last))) last = item;
  if (draft.mode === "EXAM") {
    if (!items.some((item) => item.type === "FINAL_REVIEW"))
      issues.push({ code: "QUALITY_WEAK_TERMINAL_CHECK", refs: [], detail: "no FINAL_REVIEW present" });
    else if (!last || last.type !== "FINAL_REVIEW")
      issues.push({ code: "QUALITY_WEAK_TERMINAL_CHECK", refs: [], detail: "plan does not end on FINAL_REVIEW" });
    if (input.mode === "EXAM" && input.exam?.mockMinutes && !items.some((item) => item.type === "MOCK_EXAM" && item.minutes >= input.exam!.mockMinutes!))
      issues.push({ code: "QUALITY_WEAK_TERMINAL_CHECK", refs: [], detail: "requested mock exam is missing" });
  } else if (!items.some((item) => item.masteryStage === "MASTERY_CHECK")) {
    issues.push({ code: "QUALITY_WEAK_TERMINAL_CHECK", refs: [], detail: "no MASTERY_CHECK present" });
  } else if (!last || last.masteryStage !== "MASTERY_CHECK") {
    issues.push({ code: "QUALITY_WEAK_TERMINAL_CHECK", refs: [], detail: "MASTERY_CHECK is not terminal" });
  }
  return { score: issues.length ? 0 : 1, issues, counts: {}, applicable: true };
}

/* ------------------------------------------------------------------ *
 * Combined report
 * ------------------------------------------------------------------ */

const churnFor = (ctx: QualityContext): MetricResult =>
  ctx.base
    ? churnMetric(churnItemsOf({ ...ctx, draft: ctx.base }), churnItemsOf(ctx))
    : notApplicable({ retained: 0, moved: 0, replaced: 0, removed: 0, added: 0, ratio: 0 });

export function evaluateDraft(ctx: QualityContext): QualityReport {
  const metrics: Record<MetricName, MetricResult> = {
    concrete: concrete(ctx),
    sequencing: sequencing(ctx),
    workload: workload(ctx),
    allocation: allocation(ctx),
    coverage: coverage(ctx),
    retrieval: retrieval(ctx),
    redundancy: redundancy(ctx),
    rhythm: rhythm(ctx),
    churn: churnFor(ctx),
    priorities: priorities(ctx),
    preferences: preferences(ctx),
    coreStretch: coreStretch(ctx),
    terminal: terminal(ctx),
  };
  const issues = METRIC_NAMES.flatMap((name) => metrics[name].issues);
  return {
    metrics,
    issues,
    counts: {
      items: itemsOf(ctx.draft).length,
      topics: ctx.draft.topics.length,
      milestones: ctx.draft.milestones.length,
      stretch: itemsOf(ctx.draft).filter((item) => isStretch(item)).length,
      issueCount: issues.length,
    },
  };
}
