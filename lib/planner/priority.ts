import { z } from "zod";
import { isWeak } from "./preparedness";

/**
 * Topic priority is INDEPENDENT of confidence.
 *
 * Confidence answers "how well do I know this?"; priority answers "how much does
 * this matter?". Sylf never derives one from the other and never invents an
 * official assessment weighting: a level is only ever set from an explicit user
 * answer, and an absent level stays NEUTRAL.
 */
export const TopicPrioritySchema = z.enum(["NEUTRAL", "LOW", "HIGH"]);
export type TopicPriority = z.infer<typeof TopicPrioritySchema>;

/**
 * Provenance of a priority level. Every value is user-supplied; there is no
 * inferred or "official" source. `USER_ASSESSMENT_WEIGHTING` only records that
 * the user, not Sylf, supplied the weighting.
 */
export const TopicPrioritySourceSchema = z.enum([
  "USER_EXPLICIT",
  "USER_ASSESSMENT_WEIGHTING",
  "USER_TEACHER_EMPHASIS",
  "USER_MUST_COVER",
]);
export type TopicPrioritySource = z.infer<typeof TopicPrioritySourceSchema>;

/** Coarse size of a confirmed scope label, answered by the user when unclear. */
export const ScopeSizeSignalSchema = z.enum([
  "ONE_UNIT",
  "SEVERAL_SUBTOPICS",
  "FULL_SECTION",
]);
export type ScopeSizeSignal = z.infer<typeof ScopeSizeSignalSchema>;

export interface PrioritizedTopic {
  priority?: TopicPriority;
  prioritySource?: TopicPrioritySource;
  sizeSignal?: ScopeSizeSignal;
}

export function priorityLevel(topic: PrioritizedTopic): TopicPriority {
  return topic.priority ?? "NEUTRAL";
}

/**
 * Coarse planning multipliers. These are planner heuristics applied to the
 * boundable work floor, not claims about academic difficulty or mastery.
 * NEUTRAL is exactly 1 so priorities never change an untouched plan.
 */
export const PRIORITY_WORK_FACTOR: Record<TopicPriority, number> = {
  HIGH: 1.25,
  NEUTRAL: 1,
  LOW: 0.75,
};

export const SCOPE_SIZE_FACTOR: Record<ScopeSizeSignal, number> = {
  ONE_UNIT: 1,
  SEVERAL_SUBTOPICS: 1.25,
  FULL_SECTION: 1.5,
};

export function priorityFactor(topic: PrioritizedTopic): number {
  return PRIORITY_WORK_FACTOR[priorityLevel(topic)];
}

export function scopeSizeFactor(topic: PrioritizedTopic): number {
  return topic.sizeSignal ? SCOPE_SIZE_FACTOR[topic.sizeSignal] : 1;
}

/** Round a coarse minute estimate up onto the 15-minute planning grid. */
export function planMinutes(value: number): number {
  return Math.ceil(value / 15) * 15;
}

/**
 * HIGH priority + LOW confidence gets earlier and deeper treatment; HIGH with
 * high confidence gets reinforcement instead of relearning. Relearning is never
 * required by priority — that rule stays with the covered/confidence policy.
 */
export function isHighPriorityWeak(
  topic: PrioritizedTopic & { confidence?: number | null }
): boolean {
  // Priority escalates *stated* weakness only. An unanswered confidence is not
  // weakness, so a high-priority unit the student never rated keeps the standard
  // treatment instead of being pulled forward as if it were a struggle.
  return priorityLevel(topic) === "HIGH" && isWeak(topic);
}

export const PRIORITY_LABEL: Record<TopicPriority, string> = {
  HIGH: "Higher priority",
  NEUTRAL: "No preference",
  LOW: "Lower priority",
};
