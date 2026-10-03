import { intensityAdvisories } from "./load";
import { z } from "zod";

/**
 * Semantic quality vocabulary (Addendum §5.3) plus the bounded review record that
 * is stored inside the versioned revision snapshot.
 *
 * Two layers run under this vocabulary:
 *
 * 1. a deterministic semantic gate that always runs (here), whose HIGH findings
 *    reject a draft and whose lower findings are repair candidates;
 * 2. the bounded AI critic (`lib/ai/planner/critic.ts`) that adds the findings a
 *    deterministic rule cannot express.
 *
 * Internal findings are never shown to the user: they drive repair and
 * content-free telemetry only.
 */
export const SEMANTIC_ISSUE_CODES = [
  "SEQ_WEAK",
  "TASK_VAGUE",
  "DENSITY_SPIKE",
  "REDUNDANT_TOUCH",
  "PRIORITY_MISS",
  "ROBOTIC_PATTERN",
] as const;
export const SemanticIssueCodeSchema = z.enum(SEMANTIC_ISSUE_CODES);
export type SemanticIssueCode = z.infer<typeof SemanticIssueCodeSchema>;

export const SemanticSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type SemanticSeverity = z.infer<typeof SemanticSeveritySchema>;

export interface PlannerSemanticIssue {
  issueCode: SemanticIssueCode;
  /**
   * Item references in the currency of the layer that produced the issue:
   * proposal-local item tokens (i1, i2…) before normalization, durable item keys
   * afterwards.
   */
  affectedItemRefs: string[];
  severity: SemanticSeverity;
  patchInstruction: string;
}

export const CRITIC_STATES = [
  "PASSED",
  "ISSUES_REPAIRED",
  "UNREPAIRED",
  "UNAVAILABLE",
  "DISABLED",
  "NOT_RERUN",
] as const;
export const CriticStateSchema = z.enum(CRITIC_STATES);
export type CriticState = z.infer<typeof CriticStateSchema>;

export const PlannerSemanticReviewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  critic: CriticStateSchema,
  issues: z.number().int().min(0).max(64),
  repaired: z.number().int().min(0).max(60),
  deterministicIssues: z.number().int().min(0).max(64),
  softViolations: z.number().int().min(0).max(12),
});
export type PlannerSemanticReview = z.infer<typeof PlannerSemanticReviewSchema>;

export interface SemanticItem {
  key: string;
  topicKey: string;
  type: string;
  title: string;
  description: string;
  date: string;
  minutes: number;
  removed?: boolean;
}
export interface SemanticDraft {
  items: SemanticItem[];
  topics: { key: string; title: string }[];
}

/**
 * Adapt a pre-normalization proposal (proposal-local `ref` tokens) to the draft
 * view. The returned issue refs are therefore proposal i-tokens, which is exactly
 * what the repair stage and the critic speak in.
 */
export function proposalSemanticDraft(proposal: {
  topics: { ref: string; title: string }[];
  items: {
    ref: string;
    topicRef: string;
    type: string;
    title: string;
    description: string;
    date: string;
    minutes: number;
    removed?: boolean;
  }[];
}): SemanticDraft {
  return {
    topics: proposal.topics.map((topic) => ({
      key: topic.ref,
      title: topic.title,
    })),
    items: proposal.items.map((item) => ({
      key: item.ref,
      topicKey: item.topicRef,
      type: item.type,
      title: item.title,
      description: item.description,
      date: item.date,
      minutes: item.minutes,
      removed: item.removed,
    })),
  };
}

export const MAX_SEMANTIC_ISSUES = 12;
/** Dates at or above this many planned minutes are candidates for a load spike. */
export const DENSITY_ABSOLUTE_FLOOR_MINUTES = 100;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Adapt a roadmap's milestones to the same draft view as plan items, so the
 * deterministic semantic checks are reused rather than reimplemented for Course
 * Roadmap. A milestone's outcome takes the role of a description and its planned
 * effort the role of minutes, which makes DENSITY_SPIKE mean "a period carries far
 * more work than the rest of the plan" and TASK_VAGUE mean "this milestone does not
 * say what being finished looks like". The retrieval-clustering check simply cannot
 * fire for milestone intents.
 */
export function roadmapSemanticDraft(draft: {
  topics: { key: string; title: string }[];
  milestones: {
    key: string;
    title: string;
    date: string;
    outcome?: string;
    topicKeys?: string[];
    effortMinutes?: number;
    removed?: boolean;
  }[];
  expansion?: { milestoneKey: string };
}): SemanticDraft {
  return {
    topics: draft.topics.map((topic) => ({ key: topic.key, title: topic.title })),
    items: draft.milestones
      .filter((milestone) => !milestone.removed)
      .map((milestone) => ({
        key: milestone.key,
        topicKey: milestone.topicKeys?.[0] ?? draft.topics[0].key,
        type: "MILESTONE",
        title: milestone.title,
        description: milestone.outcome ?? "",
        date: milestone.date,
        minutes: milestone.effortMinutes ?? 0,
      })),
  };
}

/**
 * Deterministic semantic findings. These are advisory except for a HIGH finding,
 * which fails the gate closed because the user cannot tell what to do.
 */
export function deterministicSemanticIssues(
  draft: SemanticDraft
): PlannerSemanticIssue[] {
  const items = draft.items.filter((item) => !item.removed);
  const issues: PlannerSemanticIssue[] = [];

  const blank = items.filter((item) => !item.description.trim());
  if (blank.length)
    issues.push({
      issueCode: "TASK_VAGUE",
      affectedItemRefs: blank.map((item) => item.key),
      severity: "HIGH",
      patchInstruction:
        "Write a concrete description of the work to perform for this item.",
    });
  const thin = items.filter(
    (item) => item.description.trim() && item.description.trim().length < 12
  );
  if (thin.length)
    issues.push({
      issueCode: "TASK_VAGUE",
      affectedItemRefs: thin.map((item) => item.key),
      severity: "MEDIUM",
      patchInstruction:
        "Name the specific activity and expected output in the description.",
    });

  const byPurpose = new Map<string, SemanticItem[]>();
  for (const item of items) {
    const signature = `${item.topicKey}|${item.type}|${item.date}`;
    byPurpose.set(signature, [...(byPurpose.get(signature) ?? []), item]);
  }
  const redundant = [...byPurpose.values()].filter((group) => group.length > 1);
  for (const group of redundant)
    issues.push({
      issueCode: "REDUNDANT_TOUCH",
      affectedItemRefs: group.map((item) => item.key),
      severity: "MEDIUM",
      patchInstruction:
        "These items repeat the same learning purpose on the same date; keep one and differentiate the other.",
    });

  const perDate = new Map<string, SemanticItem[]>();
  for (const item of items)
    perDate.set(item.date, [...(perDate.get(item.date) ?? []), item]);
  const totals = [...perDate.values()].map((group) =>
    group
      .filter((item) => item.type !== "MOCK_EXAM")
      .reduce((sum, item) => sum + item.minutes, 0)
  );
  const baseline = median(totals.filter((total) => total > 0));
  for (const group of perDate.values()) {
    const [date] = group;
    const nonMock = group.filter((item) => item.type !== "MOCK_EXAM");
    const total = nonMock.reduce((sum, item) => sum + item.minutes, 0);
    if (
      nonMock.length &&
      total >= DENSITY_ABSOLUTE_FLOOR_MINUTES &&
      total >= 2 * baseline
    )
      issues.push({
        issueCode: "DENSITY_SPIKE",
        affectedItemRefs: nonMock.map((item) => item.key),
        severity: "MEDIUM",
        patchInstruction: `${date} carries far more work than the rest of the plan; move part of it to a lighter date.`,
      });
  }

  const byTitle = new Map<string, SemanticItem[]>();
  for (const item of items) {
    const stem = item.title.trim().toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    byTitle.set(stem, [...(byTitle.get(stem) ?? []), item]);
  }
  for (const group of byTitle.values())
    if (group.length >= 4)
      issues.push({
        issueCode: "ROBOTIC_PATTERN",
        affectedItemRefs: group.map((item) => item.key),
        severity: "LOW",
        patchInstruction:
          "Reword these items so each one reads as its own activity rather than a repeated template.",
      });

  const practice = new Set(["PRACTICE", "TIMED_PRACTICE", "MISTAKE_REVIEW"]);
  const retrieval = new Set(["RECALL", "REVIEW"]);
  for (const topic of draft.topics) {
    const work = items.filter((item) => item.topicKey === topic.key);
    if (work.length < 3) continue;
    const retrievals = work.filter((item) => retrieval.has(item.type));
    const practices = work.filter((item) => practice.has(item.type));
    if (!retrievals.length || !practices.length) continue;
    const lastPractice = practices
      .map((item) => item.date)
      .sort()
      .at(-1)!;
    if (retrievals.every((item) => item.date > lastPractice))
      issues.push({
        issueCode: "SEQ_WEAK",
        affectedItemRefs: [
          ...retrievals.map((item) => item.key),
          practices.find((item) => item.date === lastPractice)!.key,
        ],
        severity: "MEDIUM",
        patchInstruction: `Move one recall or review item for "${topic.title}" earlier so retrieval is spread across the plan instead of clustered at the end.`,
      });
  }

  return issues.slice(0, MAX_SEMANTIC_ISSUES);
}

/**
 * Deterministic advisories the model is never asked to emit.
 *
 * These are findings about the plan that the planner can prove for itself, so they
 * deliberately live OUTSIDE `SEMANTIC_ISSUE_CODES`: those six codes are the critic's
 * closed output vocabulary, and widening it would tell four mode prompts about a code
 * they cannot produce. An advisory is consumed by the review UI and the quality layer
 * instead — never by the repair loop, because a quality preference is not a defect the
 * model must patch.
 */
export const ADVISORY_ISSUE_CODES = ["INTENSITY_SPIKE"] as const;
export const AdvisoryIssueCodeSchema = z.enum(ADVISORY_ISSUE_CODES);
export type AdvisoryIssueCode = z.infer<typeof AdvisoryIssueCodeSchema>;

export interface PlannerAdvisory {
  issueCode: AdvisoryIssueCode;
  /** Durable item keys once normalized; proposal tokens before that. */
  affectedItemRefs: string[];
  /** Never HIGH: minutes stay authoritative for feasibility. */
  severity: "LOW" | "MEDIUM";
  patchInstruction: string;
}

/**
 * Cognitive-rhythm advisories: days that fit their minutes but stack demanding work.
 * `HIGH` severity is not an option here on purpose — a demanding day that fits is a
 * quality finding, not a plan the student cannot run.
 */
export function deterministicAdvisories(draft: SemanticDraft): PlannerAdvisory[] {
  return intensityAdvisories(draft.items)
    .map((advisory) => ({
      issueCode: "INTENSITY_SPIKE" as const,
      affectedItemRefs: advisory.itemKeys.filter(Boolean),
      severity: advisory.severity,
      patchInstruction: advisory.instruction,
    }))
    .filter((advisory) => advisory.affectedItemRefs.length > 0);
}

export function fatalSemanticIssues(
  issues: PlannerSemanticIssue[]
): PlannerSemanticIssue[] {
  return issues.filter((issue) => issue.severity === "HIGH");
}

export function countIssues(issues: PlannerSemanticIssue[]): number {
  return issues.length;
}

/** Only items present in the plan may be patched; unknown references are dropped. */
export function knownItemKeys(draft: SemanticDraft): Set<string> {
  return new Set(draft.items.map((item) => item.key));
}
