import { dateOrdinal } from "./dates";
import { LIMITS } from "./contracts";
import type { PlannerItem, ValidatedDraftV1 } from "./contracts";
import type { AvailabilitySnapshot } from "./capacity";
import {
  REBALANCE_LIMITS,
  type ExecutionClass,
  type RebalanceChange,
  type RebalanceChangeEntry,
  type RebalanceDiff,
  type RebalanceReason,
} from "./rebalance-fields";

/**
 * Pure replanning policy: execution classification, replannable eligibility, the
 * frozen/eligible partition, diff construction and staleness detection.
 *
 * Everything here is a deterministic function of server-read facts. The model never
 * decides whether existing work is protected, never sees a database identifier, and
 * never emits a mutation instruction: it proposes remaining work, and this module
 * decides what that means for the student's Quests.
 */

/** One linked Quest, projected from immutable facts. Never model-supplied. */
export interface ExecutionRow {
  itemKey: string;
  questId: number | null;
  /** `PlannerQuestLink.disposition`: LIVE | DETACHED | DELETED. */
  disposition: string;
  status: string | null;
  scheduledFor: string | null;
  requiredMinutes: number | null;
  elapsedSeconds: number;
  completedAt: string | null;
  /** Sessions recorded against this Quest, including an unfinished one. */
  sessions: number;
  activeSession: boolean;
}

/**
 * Frozen executed history in the *validator's* currency (scope refs, not durable
 * keys). The server translates a stored draft into this view, so a mode validator
 * never has to know about planner keys, and reconciliation never has to guess which
 * scope unit an executed Quest belonged to.
 */
export interface FrozenItemView {
  key: string;
  topicRef: string;
  relatedTopicRefs: string[];
  type: string;
  stage?: string;
  masteryStage?: string;
  title: string;
  description: string;
  date: string;
  minutes: number;
}

/**
 * The single eligibility rule used by detection, generation, review and
 * confirmation. A replan may change an item only when it is provably unstarted,
 * unedited and still live.
 */
export function isPlannerQuestReplannable(
  row: ExecutionRow,
  className: ExecutionClass
): boolean {
  if (row.disposition !== "LIVE") return false;
  if (className !== "PENDING_FUTURE" && className !== "PENDING_OVERDUE")
    return false;
  if (row.questId === null) return false;
  if (row.completedAt !== null) return false;
  if (row.elapsedSeconds > 0) return false;
  return row.sessions === 0 && !row.activeSession;
}

/** History this phase must never rewrite, whatever the model proposes. */
export function isFrozenExecution(className: ExecutionClass): boolean {
  return !(
    className === "PENDING_FUTURE" ||
    className === "PENDING_OVERDUE" ||
    className === "DELETED" ||
    className === "DETACHED"
  );
}

/**
 * Classification order matters and mirrors the database guards: a deleted or
 * detached link is lineage history; completed and failed work is history; anything
 * with recorded time or an open session is in flight; everything else is pending,
 * overdue once its date has passed.
 */
export function classifyExecution(
  row: ExecutionRow,
  today: string
): ExecutionClass {
  if (row.disposition === "DELETED") return "DELETED";
  if (row.disposition === "DETACHED") return "DETACHED";
  if (row.disposition !== "LIVE") return "CONFLICTED";
  if (row.questId === null || row.status === null) return "CONFLICTED";
  if (row.status === "COMPLETED" || row.completedAt !== null) return "COMPLETED";
  if (row.status === "FAILED") return "FAILED";
  if (row.activeSession || row.status === "IN_PROGRESS") return "IN_PROGRESS";
  if (row.sessions > 0 || row.elapsedSeconds > 0) return "STARTED";
  return row.scheduledFor !== null && row.scheduledFor < today
    ? "PENDING_OVERDUE"
    : "PENDING_FUTURE";
}

export interface ExecutionSnapshot {
  rows: (ExecutionRow & { className: ExecutionClass; replannable: boolean })[];
  frozen: (ExecutionRow & { className: ExecutionClass })[];
  eligible: (ExecutionRow & { className: ExecutionClass })[];
  /** Counts by class, for the review summary and content-free telemetry. */
  counts: Record<ExecutionClass, number>;
  /** True when some linked Quest is missing or in an unexpected disposition. */
  conflicted: boolean;
  /** True when in-flight work exists: useful context for the user, not a blocker. */
  hasActiveWork: boolean;
  /** Deterministic digest input for staleness detection. */
  fingerprint: string;
}

/**
 * The frozen/eligible partition. `fingerprint` covers only what a replan depends on,
 * so a confirmation can prove reality has not moved since the proposal was sealed.
 */
export function executionSnapshot(
  rows: ExecutionRow[],
  today: string
): ExecutionSnapshot {
  const counts = {} as Record<ExecutionClass, number>;
  const classified = rows.map((row) => {
    const className = classifyExecution(row, today);
    counts[className] = (counts[className] ?? 0) + 1;
    return { ...row, className, replannable: isPlannerQuestReplannable(row, className) };
  });
  const frozen = classified.filter((row) => isFrozenExecution(row.className));
  const eligible = classified.filter((row) => row.replannable);
  const fingerprint = JSON.stringify(
    [...classified]
      .sort((a, b) => a.itemKey.localeCompare(b.itemKey))
      .map((row) => [
        row.itemKey,
        row.questId,
        row.disposition,
        row.status,
        row.scheduledFor,
        row.requiredMinutes,
        row.elapsedSeconds,
        row.completedAt,
        row.sessions,
        row.activeSession ? 1 : 0,
      ])
  );
  return {
    rows: classified,
    frozen,
    eligible,
    counts,
    conflicted: (counts.CONFLICTED ?? 0) > 0,
    hasActiveWork:
      (counts.IN_PROGRESS ?? 0) + (counts.STARTED ?? 0) > 0,
    fingerprint,
  };
}

/**
 * Which replan reasons the current reality justifies. Detection may only surface an
 * affordance: nothing here calls a provider, spends quota or touches a Quest.
 */
export function detectRebalanceReasons(args: {
  snapshot: ExecutionSnapshot;
  availabilityChanged: boolean;
  deadlineChanged: boolean;
  priorityChanged: boolean;
  scopeChanged: boolean;
  checkNeedsWork: boolean;
  today: string;
}): RebalanceReason[] {
  const reasons: RebalanceReason[] = [];
  const overdue = args.snapshot.counts.PENDING_OVERDUE ?? 0;
  if (args.checkNeedsWork) reasons.push("MASTERY_CHECK_NEEDS_WORK");
  if (args.availabilityChanged) reasons.push("AVAILABILITY_CHANGED");
  if (args.deadlineChanged) reasons.push("DEADLINE_CHANGED");
  if (overdue > 0) reasons.push("OVERDUE_WORK");
  if (args.snapshot.counts.DETACHED || args.snapshot.counts.DELETED)
    reasons.push("EXECUTION_CHANGED");
  if (args.priorityChanged) reasons.push("PRIORITY_CHANGED");
  if (args.scopeChanged) reasons.push("SCOPE_CHANGED");
  return [...new Set(reasons)];
}

export interface RebalanceDiffInput {
  /** The confirmed revision's active items, keyed by durable planner key. */
  baseItems: {
    key: string;
    title: string;
    date: string;
    minutes: number;
    topicKey: string;
    stage: string | null;
  }[];
  snapshot: ExecutionSnapshot;
  /** Proposed remaining work: durable key resolved by the server. */
  proposed: {
    key: string;
    title: string;
    date: string;
    minutes: number;
    topicKey: string;
    stage: string | null;
    /** The eligible item this proposal keeps, when it keeps one. */
    retainedKey: string | null;
  }[];
  topicTitles: Map<string, string>;
}

const samePlan = (
  a: { title: string; date: string; minutes: number },
  b: { title: string; date: string; minutes: number }
) => a.title === b.title && a.date === b.date && a.minutes === b.minutes;

/**
 * The diff the user reviews. Retained work keeps its identity and its Quest;
 * anything else is classified by what actually happens to it, and every reason is
 * phrased for a student rather than for a log.
 */
export function rebalanceDiff(input: RebalanceDiffInput): RebalanceDiff {
  const eligibleKeys = new Map(
    input.snapshot.eligible.map((row) => [row.itemKey, row])
  );
  const base = new Map(input.baseItems.map((item) => [item.key, item]));
  const entries: RebalanceChangeEntry[] = [];
  const counts: Record<RebalanceChange, number> = {
    RETAIN: 0,
    MOVE: 0,
    REPLACE: 0,
    REMOVE: 0,
    ADD: 0,
  };
  const push = (entry: RebalanceChangeEntry) => {
    entries.push(entry);
    counts[entry.change] += 1;
  };
  const titleOf = (topicKey: string) => input.topicTitles.get(topicKey) ?? null;
  const retained = new Set<string>();
  const superseded = new Set<string>();

  for (const proposal of input.proposed) {
    if (!proposal.retainedKey || !eligibleKeys.has(proposal.retainedKey)) {
      // New work. It replaces an eligible item when it covers the same unit.
      if (proposal.retainedKey && !eligibleKeys.has(proposal.retainedKey))
        throw new Error("RETAINED_ITEM_NOT_ELIGIBLE");
      continue;
    }
    const original = base.get(proposal.retainedKey);
    retained.add(proposal.retainedKey);
    if (original && samePlan(original, proposal)) {
      push({
        change: "RETAIN",
        key: proposal.key,
        supersedesKey: null,
        title: proposal.title,
        stage: proposal.stage,
        topicTitle: titleOf(proposal.topicKey),
        fromDate: original.date,
        toDate: proposal.date,
        fromMinutes: original.minutes,
        toMinutes: proposal.minutes,
        reason: "Stays as planned.",
      });
      continue;
    }
    superseded.add(proposal.retainedKey);
    push({
      change: "MOVE",
      key: proposal.key,
      supersedesKey: proposal.retainedKey,
      title: proposal.title,
      stage: proposal.stage,
      topicTitle: titleOf(proposal.topicKey),
      fromDate: original?.date ?? null,
      toDate: proposal.date,
      fromMinutes: original?.minutes ?? null,
      toMinutes: proposal.minutes,
      reason:
        original && original.date !== proposal.date
          ? `Moves from ${original.date} to ${proposal.date}.`
          : "Scheduled differently against your current availability.",
    });
  }

  // Eligible work the proposal does not keep: replaced when new work covers the
  // same unit, otherwise removed.
  const addedByTopic = new Map<string, string[]>();
  for (const proposal of input.proposed) {
    if (proposal.retainedKey && eligibleKeys.has(proposal.retainedKey)) continue;
    addedByTopic.set(proposal.topicKey, [
      ...(addedByTopic.get(proposal.topicKey) ?? []),
      proposal.key,
    ]);
  }
  for (const row of input.snapshot.eligible) {
    if (retained.has(row.itemKey)) continue;
    const original = base.get(row.itemKey);
    if (!original) continue;
    const replacement = addedByTopic.get(original.topicKey)?.shift();
    if (replacement) {
      superseded.add(row.itemKey);
      push({
        change: "REPLACE",
        key: replacement,
        supersedesKey: row.itemKey,
        title: original.title,
        stage: original.stage,
        topicTitle: titleOf(original.topicKey),
        fromDate: original.date,
        toDate:
          input.proposed.find((item) => item.key === replacement)?.date ?? null,
        fromMinutes: original.minutes,
        toMinutes:
          input.proposed.find((item) => item.key === replacement)?.minutes ?? null,
        reason: "Replaced by work that fits the remaining time better.",
      });
      continue;
    }
    superseded.add(row.itemKey);
    push({
      change: "REMOVE",
      key: null,
      supersedesKey: row.itemKey,
      title: original.title,
      stage: original.stage,
      topicTitle: titleOf(original.topicKey),
      fromDate: original.date,
      toDate: null,
      fromMinutes: original.minutes,
      toMinutes: null,
      reason: "No longer part of the remaining plan.",
    });
  }

  // Everything left is genuinely new.
  for (const proposal of input.proposed) {
    if (retained.has(proposal.retainedKey ?? "")) continue;
    const consumed = entries.some(
      (entry) => entry.change === "REPLACE" && entry.key === proposal.key
    );
    if (consumed) continue;
    push({
      change: "ADD",
      key: proposal.key,
      supersedesKey: null,
      title: proposal.title,
      stage: proposal.stage,
      topicTitle: titleOf(proposal.topicKey),
      fromDate: null,
      toDate: proposal.date,
      fromMinutes: null,
      toMinutes: proposal.minutes,
      reason: "New work for what is left.",
    });
  }

  // Frozen history is reported, never changed. A non-zero affected count is a bug
  // the confirmation refuses rather than a trade-off.
  const affectedHistory = entries.filter((entry) => {
    const key = entry.supersedesKey;
    return key !== null && !eligibleKeys.has(key);
  }).length;

  return {
    entries,
    counts,
    frozen: input.snapshot.frozen.length,
    affectedHistory,
  };
}

/**
 * The strategic Roadmap's diff: milestones rather than Quests, because a strategic
 * revision creates no execution. Frozen (already-expanded) milestones are context
 * and are never superseded here.
 */
export function rebalanceMilestoneDiff(args: {
  baseMilestones: {
    key: string;
    title: string;
    date: string;
    topicKeys: string[];
    frozen: boolean;
  }[];
  proposed: {
    key: string;
    title: string;
    date: string;
    topicKeys: string[];
    retainedKey: string | null;
  }[];
  topicTitles: Map<string, string>;
}): RebalanceDiff {
  const base = new Map(args.baseMilestones.map((m) => [m.key, m]));
  const counts: Record<RebalanceChange, number> = {
    RETAIN: 0,
    MOVE: 0,
    REPLACE: 0,
    REMOVE: 0,
    ADD: 0,
  };
  const entries: RebalanceChangeEntry[] = [];
  const push = (entry: RebalanceChangeEntry) => {
    entries.push(entry);
    counts[entry.change] += 1;
  };
  const titleOf = (topicKeys: string[]) =>
    topicKeys.length
      ? args.topicTitles.get(topicKeys[0]) ?? null
      : null;
  const retained = new Set<string>();
  for (const proposal of args.proposed) {
    const original = proposal.retainedKey ? base.get(proposal.retainedKey) : null;
    if (proposal.retainedKey && !original)
      throw new Error("RETAINED_MILESTONE_NOT_ELIGIBLE");
    if (proposal.retainedKey && original?.frozen)
      throw new Error("RETAINED_MILESTONE_FROZEN");
    if (original && proposal.date === original.date && proposal.title === original.title) {
      retained.add(original.key);
      push({
        change: "RETAIN",
        key: proposal.key,
        supersedesKey: null,
        title: proposal.title,
        stage: "MILESTONE",
        topicTitle: titleOf(proposal.topicKeys),
        fromDate: original.date,
        toDate: proposal.date,
        fromMinutes: null,
        toMinutes: null,
        reason: "Stays as planned.",
      });
      continue;
    }
    if (original) {
      retained.add(original.key);
      push({
        change: "MOVE",
        key: proposal.key,
        supersedesKey: original.key,
        title: proposal.title,
        stage: "MILESTONE",
        topicTitle: titleOf(proposal.topicKeys),
        fromDate: original.date,
        toDate: proposal.date,
        fromMinutes: null,
        toMinutes: null,
        // A rename and a reschedule are different changes; say which one happened.
        reason:
          original.date === proposal.date
            ? "Reworded for the remaining roadmap."
            : `Moves from ${original.date} to ${proposal.date}.`,
      });
      continue;
    }
  }
  // Removed milestones: eligible anchors the proposal did not restate.
  for (const original of args.baseMilestones) {
    if (original.frozen || retained.has(original.key)) continue;
    push({
      change: "REMOVE",
      key: null,
      supersedesKey: original.key,
      title: original.title,
      stage: "MILESTONE",
      topicTitle: titleOf(original.topicKeys),
      fromDate: original.date,
      toDate: null,
      fromMinutes: null,
      toMinutes: null,
      reason: "No longer part of the remaining roadmap.",
    });
  }
  for (const proposal of args.proposed) {
    if (proposal.retainedKey) continue;
    push({
      change: "ADD",
      key: proposal.key,
      supersedesKey: null,
      title: proposal.title,
      stage: "MILESTONE",
      topicTitle: titleOf(proposal.topicKeys),
      fromDate: null,
      toDate: proposal.date,
      fromMinutes: null,
      toMinutes: null,
      reason: "New milestone for what is left.",
    });
  }
  return {
    entries,
    counts,
    frozen: args.baseMilestones.filter((m) => m.frozen).length,
    affectedHistory: 0,
  };
}

/** One-line confirmation summary, in the user's words. */
export function rebalanceSummary(diff: RebalanceDiff): string {
  const parts = [
    `${diff.counts.RETAIN} unchanged`,
    `${diff.counts.MOVE} rescheduled`,
    `${diff.counts.REPLACE} replaced`,
    `${diff.counts.ADD} new`,
    `${diff.counts.REMOVE} removed`,
  ];
  return `${parts.join(", ")}. Completed or active work affected: ${diff.affectedHistory}.`;
}

/**
 * Staleness: a sealed replan is only confirmable while the reality it was built
 * from still holds. Nothing is rebased automatically.
 */
export function rebalanceStaleness(args: {
  proposalSnapshotFingerprint: string;
  liveSnapshot: ExecutionSnapshot;
  proposalBaseRevisionId: string;
  liveActiveRevisionId: string | null;
  proposalAvailabilityDigest: string;
  liveAvailabilityDigest: string;
}): string | null {
  if (args.liveActiveRevisionId !== args.proposalBaseRevisionId)
    return "REPLAN_STALE_BASE";
  if (args.proposalSnapshotFingerprint !== args.liveSnapshot.fingerprint)
    return "REPLAN_STALE_EXECUTION";
  if (args.proposalAvailabilityDigest !== args.liveAvailabilityDigest)
    return "REPLAN_STALE_AVAILABILITY";
  if (args.liveSnapshot.conflicted) return "REPLAN_CONFLICTED_EXECUTION";
  return null;
}

/**
 * Progress reconciliation: superseded pending work stops counting as outstanding,
 * while completed history stays completed. Never claims mastery, and never counts
 * the same planned minutes twice.
 */
export function reconcileProgress(args: {
  baseItems: PlannerItem[];
  supersededItemKeys: string[];
  replacementItems: PlannerItem[];
  completedItemKeys: string[];
}): {
  completed: number;
  outstanding: number;
  superseded: number;
  plannedMinutes: number;
  completedMinutes: number;
} {
  const superseded = new Set(args.supersededItemKeys);
  const completed = new Set(args.completedItemKeys);
  const live = args.baseItems.filter((item) => !superseded.has(item.key));
  const replacements = args.replacementItems;
  const outstandingItems = [...live, ...replacements].filter(
    (item) => !item.removed && !completed.has(item.key)
  );
  return {
    completed: completed.size,
    outstanding: outstandingItems.length,
    superseded: superseded.size,
    plannedMinutes: outstandingItems.reduce(
      (total, item) => total + item.minutes,
      0
    ),
    completedMinutes: args.baseItems
      .filter((item) => completed.has(item.key))
      .reduce((total, item) => total + item.minutes, 0),
  };
}

/**
 * A replan's own bound: the metadata is bounded, and the proposal can never carry
 * more items than a plan may hold.
 */
export function assertRebalanceEnvelope(metadata: unknown): void {
  const bytes = new TextEncoder().encode(JSON.stringify(metadata)).byteLength;
  if (bytes > REBALANCE_LIMITS.metadataBytes)
    throw new Error("REBALANCE_METADATA_TOO_LARGE");
}

/** Days between two dates, used to describe a move without inventing reasons. */
export function dayShift(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  return dateOrdinal(to) - dateOrdinal(from);
}

/** True when the confirmed revision's draft can be replanned at all. */
export function rebalanceableDraft(draft: ValidatedDraftV1): boolean {
  return draft.mode === "ROADMAP"
    ? !draft.expansion
    : draft.items.some((item) => !item.removed);
}

/**
 * Whether a replan's scope fits inside one model response.
 *
 * A replan proposal *is* the new plan for its scope: an item it omits is a REMOVE, and one it
 * repeats without `retainRef` loses its durable identity, so every item the student wants to keep
 * must appear in the answer. That answer is a single response, bounded by `LIMITS.proposedItems`.
 *
 * The two bounds are not the same number, and the difference is deliberate rather than an
 * oversight: a plan may hold `LIMITS.items` because plans grow by editing as well as by
 * generation, while one response may carry `LIMITS.proposedItems`. So a plan can legitimately
 * exist that no single replan can cover, and the honest response is to say so before spending a
 * model call instead of failing on a contract error afterwards.
 *
 * Named and exported rather than inlined because it is a rule about two constants, and a rule
 * expressed once can be tested without a database.
 */
export function replanFitsOneResponse(eligibleCount: number): boolean {
  return eligibleCount <= LIMITS.proposedItems;
}

export type {
  AvailabilitySnapshot,
} from "./capacity";
// Re-exported so a caller that works with the policy also gets the shapes it produces.
export type {
  RebalanceChange,
  RebalanceChangeEntry,
  RebalanceDiff,
  RebalanceReason,
} from "./rebalance-fields";
