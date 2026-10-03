import { z } from "zod";
import {
  ScopeSizeSignalSchema,
  TopicPrioritySchema,
  TopicPrioritySourceSchema,
  planMinutes,
  priorityFactor,
  scopeSizeFactor,
} from "./priority";
import { isWeak, needsLearning } from "./preparedness";

/**
 * The shared scope-unit shape used by every Planner Mode.
 *
 * Exam Planner confirmed its topic fields first, and Course Roadmap needs the
 * identical fields: a label, the student's own progress/confidence, and the two
 * user-supplied signals A1 added (priority and scope size). Keeping one definition
 * means the mode validators cannot drift apart and the coarse effort floors are
 * computed in exactly one place.
 *
 * `priority` / `sizeSignal` are only ever set by the user (directly or through a
 * Smart Plan Setup answer). A non-neutral priority must name its source so an
 * inferred or "official" weighting can never enter a plan unnoticed.
 */
export const scopeTopicFields = {
  label: z.string().trim().min(1).max(200),
  /**
   * Preparedness is **nullable**, and `null` means the student has not said.
   *
   * It is never a stand-in for "not covered" or "very weak": see
   * `lib/planner/preparedness.ts` for the policy that every rule now routes
   * through. Existing snapshots carry real booleans and numbers and keep parsing
   * unchanged; this only widens what a *new* input may state.
   */
  covered: z.boolean().nullable(),
  confidence: z.number().int().min(1).max(5).nullable(),
  difficult: z.boolean().nullable(),
  priority: TopicPrioritySchema.optional(),
  prioritySource: TopicPrioritySourceSchema.optional(),
  sizeSignal: ScopeSizeSignalSchema.optional(),
};

export const ScopeTopicSchema = z
  .strictObject(scopeTopicFields)
  .superRefine((topic, ctx) => {
    if (topic.prioritySource && !topic.priority)
      ctx.addIssue({
        code: "custom",
        message: "Priority source requires a priority level",
      });
    if (topic.priority && topic.priority !== "NEUTRAL" && !topic.prioritySource)
      ctx.addIssue({
        code: "custom",
        message: "A non-neutral priority requires an explicit user source",
      });
  });
export type ScopeTopic = z.infer<typeof ScopeTopicSchema>;
/** The same shape without the refinements, for schemas that add their own. */
export const scopeTopicObject = () => z.strictObject(scopeTopicFields);

/**
 * Coarse planning floors, not claims about academic proficiency or mastery.
 * Priority and scope-size answers scale the boundable estimate; NEUTRAL and an
 * unanswered size signal are exactly 1, so an untouched plan is unchanged.
 */
export function scopeTopicMinutes(topic: ScopeTopic, compressed: boolean) {
  // Unstated preparedness takes the learning-required provision (105) because the
  // unit may be entirely new — planning less would assume knowledge the student
  // never claimed. It does *not* take the weak-scaling provision (75) and it is not
  // inflated anywhere else in the planner (see `preparedness.ts`).
  const base = needsLearning(topic) ? 105 : isWeak(topic) ? 75 : 45;
  return planMinutes(
    (base + (topic.difficult ? 30 : 0)) *
      priorityFactor(topic) *
      scopeSizeFactor(topic) *
      (compressed ? 0.7 : 1)
  );
}

/**
 * Priority must change practice allocation, not only initial learning. A
 * high-priority unit is held to a larger practice floor, a low-priority one to a
 * smaller one; confidence and coverage are untouched by this rule.
 */
export function scopeTopicPracticeFloor(topic: ScopeTopic, compressed: boolean) {
  // Practice is owed for any unit that still needs its learning; an explicit
  // "covered" is the only statement that reduces this floor.
  const base =
    (needsLearning(topic) ? 60 : 30) + (topic.difficult === true ? 15 : 0);
  return planMinutes(base * priorityFactor(topic) * (compressed ? 0.7 : 1));
}

/** Labels are confirmed wording: compare case-insensitively for duplicates. */
export function duplicateScopeLabels(topics: { label: string }[]): boolean {
  return (
    new Set(topics.map((topic) => topic.label.toLowerCase())).size !==
    topics.length
  );
}
