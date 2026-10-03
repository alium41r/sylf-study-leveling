import { z } from "zod";
import { ScopeTopicSchema } from "./scope-topic";

/**
 * Chapter / Unit Mastery field contract (PRD §8.3).
 *
 * Mastery is a small, execution-oriented mode: one bounded chapter, unit or
 * concept cluster taken through a deliberate learning progression. Unlike Course
 * Roadmap its confirmed plan contains actionable items directly.
 */
export const MasteryStageSchema = z.enum([
  "UNDERSTAND",
  "LEARN",
  "ACTIVE_RECALL",
  "PRACTICE",
  "REVIEW_MISTAKES",
  "MASTERY_CHECK",
]);
export type MasteryStage = z.infer<typeof MasteryStageSchema>;

/** Depth the student asked for. Coarse, user-chosen, never inferred. */
export const MasteryDepthSchema = z.enum(["ORIENTATION", "SOLID", "DEEP"]);
export type MasteryDepth = z.infer<typeof MasteryDepthSchema>;

/**
 * Prior exposure. This is the student's own statement about the unit as a whole;
 * per-topic `covered`/`confidence` on the shared scope fields remain authoritative
 * for individual units.
 */
export const MasteryPriorExposureSchema = z.enum(["NEW", "SOME", "MOSTLY"]);
export type MasteryPriorExposure = z.infer<typeof MasteryPriorExposureSchema>;

/** Which kind of final check the student prefers. */
export const MasteryCheckPreferenceSchema = z.enum([
  "MIXED_PRACTICE",
  "RECALL_AND_APPLY",
  "SHORT_SELF_TEST",
  "EXPLAIN_AND_SOLVE",
]);
export type MasteryCheckPreference = z.infer<
  typeof MasteryCheckPreferenceSchema
>;

/**
 * Mastery-only bounds.
 *
 * Deliberately far smaller than Roadmap's: a chapter or unit that needs more than
 * a dozen schedulable units is a course-level problem, and the mode must say so
 * rather than generate a thin plan. The envelope is the authoritative guarantee
 * (measured, not inferred from the unit count).
 */
export const MASTERY_LIMITS = {
  inputBytes: 16384,
  topics: 12,
  items: 60,
  /** A mastery plan is 1–12 weeks; longer belongs to Course Roadmap. */
  horizonDays: 84,
  maxCheckMinutes: 240,
  maxDeeperItemsPerTopic: 12,
} as const;

export const MasteryDetailsSchema = z.strictObject({
  subjectName: z.string().trim().min(1).max(200),
  subjectId: z.number().int().positive().nullable(),
  /** The chapter / unit / concept cluster being worked through. */
  unitTitle: z.string().trim().min(1).max(200),
  topics: z.array(ScopeTopicSchema).min(1).max(MASTERY_LIMITS.topics),
  desiredDepth: MasteryDepthSchema,
  priorExposure: MasteryPriorExposureSchema,
  checkPreference: MasteryCheckPreferenceSchema,
  /** Explicit deadline, or null when the horizon is derived from availability. */
  targetDate: z.string().nullable(),
  /** Mirrors Exam/Roadmap: below the 15% reserve needs explicit acceptance. */
  acceptReducedReserve: z.boolean(),
});
export type MasteryDetails = z.infer<typeof MasteryDetailsSchema>;
export type MasteryTopic = MasteryDetails["topics"][number];

/**
 * Planner-level item metadata. `masteryStage` is planning metadata that is never
 * written to the Quest row: the materialized Quest keeps its ordinary fields and
 * the stage lives in the sealed revision.
 */
export const masteryMetadata = {
  masteryStage: MasteryStageSchema.optional(),
};

/**
 * Intents a mastery item may use. `ASSESS` is the existing generic check intent
 * that the Mastery Check stage pairs with; Exam-only readiness intents
 * (`MOCK_EXAM`, `FINAL_REVIEW`) are deliberately absent.
 */
export const MASTERY_INTENTS = [
  "LEARN",
  "REVIEW",
  "RECALL",
  "PRACTICE",
  "TIMED_PRACTICE",
  "MISTAKE_REVIEW",
  "ASSESS",
] as const;
export const MasteryIntentSchema = z.enum(MASTERY_INTENTS);

export const MASTERY_DEPTH_LABEL: Record<MasteryDepth, string> = {
  ORIENTATION: "Get oriented — know what this unit is about",
  SOLID: "Work through it properly",
  DEEP: "Go deep — thorough understanding and practice",
};
export const MASTERY_PRIOR_EXPOSURE_LABEL: Record<
  MasteryPriorExposure,
  string
> = {
  NEW: "It is new to me",
  SOME: "I have seen some of it",
  MOSTLY: "I have covered most of it",
};
export const MASTERY_CHECK_PREFERENCE_LABEL: Record<
  MasteryCheckPreference,
  string
> = {
  MIXED_PRACTICE: "Mixed representative practice",
  RECALL_AND_APPLY: "Recall and apply",
  SHORT_SELF_TEST: "Short self-test",
  EXPLAIN_AND_SOLVE: "Explain and solve",
};
export const MASTERY_STAGE_LABEL: Record<MasteryStage, string> = {
  UNDERSTAND: "Understand",
  LEARN: "Learn",
  ACTIVE_RECALL: "Active recall",
  PRACTICE: "Practice",
  REVIEW_MISTAKES: "Review mistakes",
  MASTERY_CHECK: "Mastery check",
};
