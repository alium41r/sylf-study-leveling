import { z } from "zod";

/**
 * User-approved adaptive replanning — field contract (Phase 5).
 *
 * Adaptive never means autonomous: these types describe a *proposal* the server
 * computes and the user must confirm. Reason codes are operation metadata, not
 * preference-learning input (that is Addendum A3 and is deliberately absent).
 */

/** Closed vocabulary of why a replan may be offered. */
export const REBALANCE_REASONS = [
  "USER_REQUESTED",
  "AVAILABILITY_CHANGED",
  "DEADLINE_CHANGED",
  "MISSED_WORK",
  "OVERDUE_WORK",
  "EXECUTION_CHANGED",
  "PRIORITY_CHANGED",
  "SCOPE_CHANGED",
  "MASTERY_CHECK_NEEDS_WORK",
] as const;
export const RebalanceReasonSchema = z.enum(REBALANCE_REASONS);
export type RebalanceReason = z.infer<typeof RebalanceReasonSchema>;

export const REBALANCE_REASON_LABEL: Record<RebalanceReason, string> = {
  USER_REQUESTED: "You asked to review the plan",
  AVAILABILITY_CHANGED: "Your availability changed",
  DEADLINE_CHANGED: "The target date changed",
  MISSED_WORK: "Some planned work was missed",
  OVERDUE_WORK: "Some planned work is overdue",
  EXECUTION_CHANGED: "Your execution no longer matches the plan",
  PRIORITY_CHANGED: "Your priorities changed",
  SCOPE_CHANGED: "The confirmed scope changed",
  MASTERY_CHECK_NEEDS_WORK: "You reported that the check needs more work",
};

/**
 * Execution classes. These are derived by the server from immutable facts — Quest
 * status, elapsed time, sessions, link disposition and dates — never by the model.
 */
export const EXECUTION_CLASSES = [
  "COMPLETED",
  "IN_PROGRESS",
  "STARTED",
  "PENDING_FUTURE",
  "PENDING_OVERDUE",
  "FAILED",
  "DELETED",
  "DETACHED",
  "CONFLICTED",
] as const;
export type ExecutionClass = (typeof EXECUTION_CLASSES)[number];

export const EXECUTION_CLASS_LABEL: Record<ExecutionClass, string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In progress",
  STARTED: "Started — time recorded",
  PENDING_FUTURE: "Planned, not started",
  PENDING_OVERDUE: "Overdue, not started",
  FAILED: "Recorded as failed",
  DELETED: "Deleted by you",
  DETACHED: "Edited by you since it was planned",
  CONFLICTED: "Needs review before it can be replanned",
};

/** How one planned item changes when a replan is confirmed. */
export const REBALANCE_CHANGES = [
  "RETAIN",
  "MOVE",
  "REPLACE",
  "REMOVE",
  "ADD",
] as const;
export type RebalanceChange = (typeof REBALANCE_CHANGES)[number];

export const REBALANCE_CHANGE_LABEL: Record<RebalanceChange, string> = {
  RETAIN: "Unchanged",
  MOVE: "Rescheduled",
  REPLACE: "Replaced",
  REMOVE: "Removed",
  ADD: "New",
};

/**
 * Hard bounds. The execution snapshot is a bounded projection (never whole plans)
 * and the proposal carries at most one entry per supported plan item.
 */
export const REBALANCE_LIMITS = {
  /**
   * Measured envelope for the stored rebalance metadata.
   *
   * This is a sub-bound of `LIMITS.inputBytes` (32 768), because the metadata is stored *inside*
   * the input snapshot — `beginRebalance` writes `{ ...nextInput, rebalance }` — and the whole
   * snapshot is what gets validated on read-back. So it must be large enough for the widest
   * legitimate metadata and small enough to leave room for the base input beside it.
   *
   * Measured at the item bound of 200, with every item eligible (the largest shape, since an
   * eligible entry carries a `ref` and a `questId` where a frozen key carries only a uuid):
   * **17 144 bytes**. At the previous bound of 60 the same snapshot is about 5 100 bytes, so
   * raising `items` alone would have replaced one rejection with another —
   * `REBALANCE_METADATA_TOO_LARGE` instead of `too_big`. 20 KiB is 19% above the measured
   * maximum, and the widest legitimate base input beside it measures under 10 KiB, leaving the
   * pair comfortably inside `inputBytes`; `rebalance-bounds.test.ts` asserts both halves of that
   * rather than trusting the arithmetic here.
   */
  metadataBytes: 20480,
  /**
   * Items one replan may retain, move, replace or add.
   *
   * This must track `LIMITS.items` in `contracts.ts`, and it is written as a literal rather than
   * an import because `contracts.ts` imports `RebalanceMetadataSchema` from this file — importing
   * back would be a cycle. `rebalance-bounds.test.ts` asserts the two agree, so they cannot drift.
   *
   * They *had* drifted, and the consequence was severe. When `LIMITS.items` was raised from 60 to
   * 200 so that a ninety-day plan could exist at all, this stayed at 60 — and the two bounds
   * describe the same thing, so a plan became creatable but not replannable. `beginRebalance`
   * derives the eligible set and stores it without validating it against this schema, so it
   * accepted an 85-item plan and wrote the snapshot; `finishRebalance` then re-parses that stored
   * snapshot through `UserInputV1Schema`, which applies this bound, and rejected it. The student
   * could open a replan and never complete one, on exactly the large plans §7 of the Phase 5
   * report claims are supported.
   */
  items: 200,
  /** Execution rows read for one plan: the link table is bounded by items already. */
  executionRows: 200,
} as const;

/** Which part of a confirmed plan a replan touches. */
export const RebalanceScopeSchema = z.strictObject({
  /** Set only when revising one expanded Roadmap period. */
  milestoneKey: z.string().uuid().nullable(),
});
export type RebalanceScope = z.infer<typeof RebalanceScopeSchema>;

/**
 * What the user explicitly changes in this replan. Absent means "keep the
 * confirmed input"; nothing is ever inferred from missed work.
 */
export const REBALANCE_INPUT_CHANGES = [
  "AVAILABILITY",
  "DEADLINE",
  "SCOPE",
  "CONSTRAINTS",
  "PRIORITY",
] as const;
export const RebalanceInputChangeSchema = z.enum(REBALANCE_INPUT_CHANGES);
export type RebalanceInputChange = z.infer<typeof RebalanceInputChangeSchema>;

/**
 * Rebalance metadata stored in a REBALANCE revision's input snapshot.
 *
 * It records why the operation ran, what it was based on (a digest of the live
 * execution snapshot), and the plan-local token map that lets a retained item keep
 * its durable identity. No Quest identifiers reach the model: `ref` tokens are
 * plan-local and resolved server-side.
 */
export const RebalanceMetadataSchema = z.strictObject({
  reasonCode: RebalanceReasonSchema,
  inputChanges: z.array(RebalanceInputChangeSchema).max(5),
  baseRevisionId: z.string().uuid(),
  scope: RebalanceScopeSchema,
  /** Digest of the execution snapshot the proposal was generated against. */
  snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
  /** Frozen history, by planner item key: context for the model, never rewritten. */
  frozenItemKeys: z.array(z.string().uuid()).max(REBALANCE_LIMITS.items),
  /** Items eligible to change, with the plan-local token the model may retain. */
  eligible: z
    .array(
      z.strictObject({
        ref: z.string().regex(/^r[1-9][0-9]*$/),
        itemKey: z.string().uuid(),
        questId: z.number().int().positive().nullable(),
      })
    )
    .max(REBALANCE_LIMITS.items),
});
export type RebalanceMetadata = z.infer<typeof RebalanceMetadataSchema>;

/** Item-level rebalance metadata, carried only by a rebalance proposal item. */
export const rebalanceMetadata = {
  /**
   * The eligible item this proposal item keeps. Present means "this replaces
   * nothing and is not new"; absent means new work. Plan-local, never a database id.
   */
  retainRef: z
    .string()
    .regex(/^r[1-9][0-9]*$/)
    .nullable()
    .optional(),
};

/** One user-visible change in a replan proposal. */
export interface RebalanceChangeEntry {
  change: RebalanceChange;
  /** Durable key of the new/existing item, or the milestone key for a strategic replan. */
  key: string | null;
  /** Durable key the change supersedes, when it supersedes one. */
  supersedesKey: string | null;
  title: string;
  stage: string | null;
  topicTitle: string | null;
  fromDate: string | null;
  toDate: string | null;
  fromMinutes: number | null;
  toMinutes: number | null;
  /** One short, translated reason the user can act on. */
  reason: string;
}

export interface RebalanceDiff {
  entries: RebalanceChangeEntry[];
  counts: Record<RebalanceChange, number>;
  /** Frozen execution that this replan does not touch. Always reported. */
  frozen: number;
  /** Completed or active work the proposal would affect. Must be zero to confirm. */
  affectedHistory: number;
}

/** The fixed, user-reported Mastery Check signal. Never an objective score. */
export const MASTERY_CHECK_RESULTS = [
  "NEEDS_MORE_WORK",
  "FELT_OK",
  "READY_TO_MOVE_ON",
] as const;
export const MasteryCheckResultSchema = z.enum(MASTERY_CHECK_RESULTS);
export type MasteryCheckResult = z.infer<typeof MasteryCheckResultSchema>;

export const MASTERY_CHECK_RESULT_LABEL: Record<MasteryCheckResult, string> = {
  NEEDS_MORE_WORK: "Needs more work",
  FELT_OK: "Felt okay",
  READY_TO_MOVE_ON: "Ready to move on",
};

export const MASTERY_CHECK_RESULT_COPY =
  "This is your own assessment. Sylf does not mark the unit as mastered.";

/** Shown while no reflection has been recorded: a projection, never a persisted rating. */
export const MASTERY_CHECK_UNRATED = "COMPLETED_UNRATED" as const;

export function masteryCheckResultLabel(
  result: MasteryCheckResult | null
): string {
  return result
    ? MASTERY_CHECK_RESULT_LABEL[result]
    : "Not rated — the check is complete";
}
