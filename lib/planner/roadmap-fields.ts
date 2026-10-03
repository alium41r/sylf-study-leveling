import { z } from "zod";
import { ScopeTopicSchema } from "./scope-topic";

/**
 * Course / Syllabus Roadmap field contract (PRD §8.2, Addendum §9/§10).
 *
 * A roadmap is a strategic layer: periods, milestones and the topics each
 * milestone covers. It deliberately has no daily items — those appear only when a
 * single period is explicitly expanded.
 */
export const RoadmapGranularitySchema = z.enum(["MONTH", "WEEK"]);
export type RoadmapGranularity = z.infer<typeof RoadmapGranularitySchema>;

/**
 * Roadmap-only pilot bounds.
 *
 * `inputBytes` is the authoritative guarantee, not the topic count: a confirmed
 * label is stored twice (in `roadmap.topics[].label` and in the `scope` string,
 * which must equal the labels joined by newlines), so payload size depends on
 * label length and JSON escaping rather than on how many topics there are.
 * Worst case for 60 topics with 200-character ASCII labels, 366 blocked dates and
 * 12 constraints is ~40.4 KiB, which leaves ~8.8 KiB of headroom here and ~16 KiB
 * against the 64 KiB database bound on the stored input snapshot.
 */
export const ROADMAP_LIMITS = {
  inputBytes: 49152,
  topics: 60,
  milestones: 60,
  periods: { MONTH: 13, WEEK: 53 } as Record<RoadmapGranularity, number>,
  /** Horizons at or below this use weeks; longer horizons use calendar months. */
  weekGranularityMaxDays: 84,
  maxEffortMinutes: 20000,
} as const;

export const RoadmapDetailsSchema = z.strictObject({
  subjectName: z.string().trim().min(1).max(200),
  subjectId: z.number().int().positive().nullable(),
  /** Qualification / grade / year label, e.g. "A-Level · Year 13". User-supplied. */
  qualification: z.string().trim().min(1).max(200).nullable(),
  topics: z.array(ScopeTopicSchema).min(1).max(ROADMAP_LIMITS.topics),
  granularity: RoadmapGranularitySchema,
  /** Mirrors Exam Planner: below the 15% reserve needs explicit acceptance. */
  acceptReducedReserve: z.boolean(),
});
export type RoadmapDetails = z.infer<typeof RoadmapDetailsSchema>;
export type RoadmapTopic = RoadmapDetails["topics"][number];

/**
 * Study intents available to expanded roadmap work. `MOCK_EXAM` and
 * `FINAL_REVIEW` are Exam-readiness concepts and are deliberately absent: a course
 * roadmap does not schedule a mock exam unless the scope genuinely contains one.
 */
export const ROADMAP_INTENTS = [
  "LEARN",
  "REVIEW",
  "RECALL",
  "PRACTICE",
  "TIMED_PRACTICE",
  "MISTAKE_REVIEW",
] as const;
export const RoadmapIntentSchema = z.enum(ROADMAP_INTENTS);

const milestoneOutcome = z.string().trim().min(12).max(240);
const checkpoint = z.string().trim().min(3).max(200);

/**
 * Model-supplied milestone fields. Every one is optional so metadata-free ROADMAP
 * payloads (and every sealed Phase 1/2 snapshot) stay valid; the Roadmap
 * validator enforces presence only when the input actually carries roadmap
 * details.
 */
export const roadmapMilestoneMetadata = {
  /**
   * Rebalance-only: the existing milestone this proposal milestone keeps. A
   * plan-local token, so an already-expanded period's anchor milestone cannot be
   * swapped for a look-alike.
   */
  retainRef: z
    .string()
    .regex(/^r[1-9][0-9]*$/)
    .nullable()
    .optional(),
  periodRef: z.string().regex(/^p[1-9][0-9]*$/).optional(),
  outcome: milestoneOutcome.optional(),
  topicRefs: z.array(z.string().min(1).max(60)).max(ROADMAP_LIMITS.topics).optional(),
  effortMinutes: z.number().int().min(0).max(ROADMAP_LIMITS.maxEffortMinutes).optional(),
  checkpoint: checkpoint.optional(),
  dependsOn: z.array(z.string().min(1).max(60)).max(ROADMAP_LIMITS.milestones).optional(),
};

/** The normalized draft counterpart: application-issued keys, lockable. */
export const roadmapMilestoneDraftMetadata = {
  periodKey: z.string().uuid().optional(),
  outcome: milestoneOutcome.optional(),
  topicKeys: z.array(z.string().uuid()).max(ROADMAP_LIMITS.topics).optional(),
  effortMinutes: z.number().int().min(0).max(ROADMAP_LIMITS.maxEffortMinutes).optional(),
  checkpoint: checkpoint.optional(),
  dependsOn: z.array(z.string().uuid()).max(ROADMAP_LIMITS.milestones).optional(),
  locked: z.boolean().optional(),
  /** Explicit removal keeps the milestone's identity and its exclusion auditable. */
  removed: z.boolean().optional(),
};

/** Deterministic period boundaries. Never produced from model prose. */
export const RoadmapPeriodSchema = z.strictObject({
  key: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  granularity: RoadmapGranularitySchema,
  startDate: z.string(),
  endDate: z.string(),
  order: z.number().int().min(0).max(ROADMAP_LIMITS.periods.WEEK),
});
export type RoadmapPeriod = z.infer<typeof RoadmapPeriodSchema>;

/**
 * Present on an EXPAND revision: which milestone the actionable items belong to.
 * The roadmap structure it carries is copied verbatim from the parent revision.
 */
export const RoadmapExpansionSchema = z.strictObject({
  milestoneKey: z.string().uuid(),
});
export type RoadmapExpansion = z.infer<typeof RoadmapExpansionSchema>;
