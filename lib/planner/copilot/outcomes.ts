import type { CopilotIntent } from "./contracts";

/**
 * The Copilot's own small vocabularies: what a response turned into, and what the server
 * requires before a change may be applied.
 *
 * Kept separate from `contracts.ts` because these are *server* decisions rather than wire
 * shapes: the client sees their consequences (a proposal that needs confirming, an
 * acknowledgement list) but never chooses them.
 */

/** How a turn ended, as a closed code. Content-free by construction. */
export const COPILOT_OUTCOMES = ["ANSWERED", "PROPOSED", "ROUTED", "REFUSED"] as const;
export type CopilotOutcome = (typeof COPILOT_OUTCOMES)[number];

/**
 * What a proposal asks the student to confirm before it can run.
 *
 * Each value names a *reason for asking*, not a command: it is the difference between an
 * ordinary reversible edit and a decision with a consequence the student should see first.
 */
export const COPILOT_CONFIRMATION_CODES = [
  "MULTI_COMMAND",
  "HARD_CONSTRAINT",
  "SCOPE_REMOVAL",
  "RESEARCH",
  "DRAFT_EDIT",
  "REPLAN",
  "RELEASE",
  "LOW_CONFIDENCE",
] as const;
export type CopilotConfirmationCode = (typeof COPILOT_CONFIRMATION_CODES)[number];

/**
 * The intents whose commands are only available in one lifecycle.
 *
 * Written as data so the router and the tests read the same table: a command that cannot
 * legally run in the current state is refused with `COMMAND_NOT_ALLOWED_IN_STATE` rather
 * than offered and then failed.
 */
export const COPILOT_INTENT_LIFECYCLE: Record<
  CopilotIntent,
  readonly ("PRE_GENERATION" | "DRAFT_REVIEW" | "CONFIRMED")[]
> = {
  INTAKE_UPDATE: ["PRE_GENERATION"],
  SCOPE_UPDATE: ["PRE_GENERATION"],
  PREPAREDNESS_UPDATE: ["PRE_GENERATION"],
  BACKGROUND_UPDATE: ["PRE_GENERATION"],
  AVAILABILITY_UPDATE: ["PRE_GENERATION"],
  PREFERENCE_UPDATE: ["PRE_GENERATION"],
  CONSTRAINT_UPDATE: ["PRE_GENERATION"],
  RESEARCH_REQUEST: ["PRE_GENERATION"],
  COMPARISON_REQUEST: ["PRE_GENERATION"],
  // Explaining is legal everywhere: it changes nothing.
  EXPLAIN: ["PRE_GENERATION", "DRAFT_REVIEW", "CONFIRMED"],
  DRAFT_EDIT: ["DRAFT_REVIEW"],
  CONFIRMED_PLAN_CHANGE: ["CONFIRMED"],
  RELEASE_GENERATED_ITEM: ["CONFIRMED", "DRAFT_REVIEW"],
  REPLAN_REQUEST: ["CONFIRMED"],
  UNKNOWN: ["PRE_GENERATION", "DRAFT_REVIEW", "CONFIRMED"],
};
