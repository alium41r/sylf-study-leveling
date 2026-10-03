import { describe, expect, it } from "vitest";
import {
  assertRebalanceEnvelope,
  classifyExecution,
  dayShift,
  detectRebalanceReasons,
  executionSnapshot,
  isPlannerQuestReplannable,
  rebalanceDiff,
  rebalanceableDraft,
  rebalanceMilestoneDiff,
  rebalanceStaleness,
  rebalanceSummary,
  reconcileProgress,
  type ExecutionRow,
  type ExecutionSnapshot,
  type RebalanceDiffInput,
} from "@/lib/planner/rebalance-policy";
import {
  REBALANCE_LIMITS,
  type RebalanceChange,
  type RebalanceChangeEntry,
  type RebalanceDiff,
} from "@/lib/planner/rebalance-fields";
import {
  ValidatedDraftV1Schema,
  type PlannerItem,
  type ValidatedDraftV1,
} from "@/lib/planner/contracts";

/**
 * Pure replanning policy: the frozen/eligible partition, classification precedence,
 * diff construction and the fail-closed guards around it. Every assertion carries a
 * comment naming the rule it protects, because these functions are the seam between
 * model proposals and student Quests.
 */

const TODAY = "2030-01-15";

/** A well-formed UUID for draft keys; readable strings are used for diff keys. */
const UUID = (n: number): string =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** One linked Quest, projected from immutable facts. Defaults are a live, unstarted future item. */
function executionRow(overrides: Partial<ExecutionRow> = {}): ExecutionRow {
  return {
    itemKey: "item-default",
    questId: 1,
    disposition: "LIVE",
    status: "NOT_STARTED",
    scheduledFor: "2030-01-20",
    requiredMinutes: 30,
    elapsedSeconds: 0,
    completedAt: null,
    sessions: 0,
    activeSession: false,
    ...overrides,
  };
}

/** A stored draft item with the required fields filled in; only what a test overrides varies. */
function plannerItem(n: number, overrides: Partial<PlannerItem> = {}): PlannerItem {
  return {
    key: UUID(n),
    topicKey: UUID(1000 + n),
    milestoneKey: null,
    dependsOn: [],
    type: "LEARN",
    title: `Task ${n}`,
    description: "A bounded study task.",
    date: "2030-01-07",
    minutes: 30,
    ...overrides,
  };
}

/** A snapshot whose eligible rows are the given keys (future) and whose frozen rows are completed. */
function snapshotFor(
  eligibleKeys: string[],
  frozenKeys: string[] = []
): ExecutionSnapshot {
  return executionSnapshot(
    [
      ...eligibleKeys.map((key) => executionRow({ itemKey: key })),
      ...frozenKeys.map((key) => executionRow({ itemKey: key, status: "COMPLETED" })),
    ],
    TODAY
  );
}

/** The single entry of a given change, so a test can assert its exact shape. */
function entryOf(diff: RebalanceDiff, change: RebalanceChange): RebalanceChangeEntry {
  const entry = diff.entries.find((candidate) => candidate.change === change);
  if (!entry) throw new Error(`expected a ${change} entry`);
  return entry;
}

// --- Shared scenario for the Quest diff (sections 5 and 6) --------------------

function scenarioBaseItems(): RebalanceDiffInput["baseItems"] {
  return [
    { key: "item-a", title: "Read chapter 1", date: "2030-01-07", minutes: 30, topicKey: "topic-1", stage: "LEARN" },
    { key: "item-b", title: "Practice set", date: "2030-01-08", minutes: 45, topicKey: "topic-2", stage: "PRACTICE" },
    { key: "item-c", title: "Old review", date: "2030-01-09", minutes: 20, topicKey: "topic-3", stage: "RECALL" },
    { key: "item-e", title: "Old quiz", date: "2030-01-12", minutes: 30, topicKey: "topic-4", stage: "ASSESS" },
  ];
}

function scenarioProposed(): RebalanceDiffInput["proposed"] {
  return [
    { key: "item-a", title: "Read chapter 1", date: "2030-01-07", minutes: 30, topicKey: "topic-1", stage: "LEARN", retainedKey: "item-a" },
    { key: "item-b", title: "Practice set", date: "2030-01-10", minutes: 45, topicKey: "topic-2", stage: "PRACTICE", retainedKey: "item-b" },
    { key: "item-c2", title: "New review", date: "2030-01-11", minutes: 25, topicKey: "topic-3", stage: "RECALL", retainedKey: null },
    { key: "item-f", title: "New topic", date: "2030-01-13", minutes: 40, topicKey: "topic-5", stage: "LEARN", retainedKey: null },
  ];
}

function scenarioTopics(): Map<string, string> {
  return new Map([
    ["topic-1", "Chapter 1"],
    ["topic-2", "Chapter 2"],
    ["topic-3", "Chapter 3"],
    ["topic-4", "Chapter 4"],
    ["topic-5", "Chapter 5"],
  ]);
}

function scenarioDiff(): RebalanceDiff {
  return rebalanceDiff({
    baseItems: scenarioBaseItems(),
    snapshot: snapshotFor(["item-a", "item-b", "item-c", "item-e"], ["item-d"]),
    proposed: scenarioProposed(),
    topicTitles: scenarioTopics(),
  });
}

describe("classifyExecution", () => {
  it("classifies a deleted or detached link before any other signal", () => {
    // Lineage history wins over status, session and Quest presence: a deleted link
    // with no Quest and no status is still DELETED, never CONFLICTED.
    expect(
      classifyExecution(executionRow({ disposition: "DELETED", questId: null, status: null }), TODAY)
    ).toBe("DELETED");
    expect(classifyExecution(executionRow({ disposition: "DETACHED" }), TODAY)).toBe("DETACHED");
  });

  it("classifies any disposition that is neither LIVE nor a known lineage state as CONFLICTED", () => {
    // An unexpected disposition value is refused rather than guessed at.
    expect(classifyExecution(executionRow({ disposition: "ARCHIVED" }), TODAY)).toBe("CONFLICTED");
  });

  it("classifies a missing Quest or a missing status as CONFLICTED", () => {
    // A replan cannot protect work it cannot identify or read.
    expect(classifyExecution(executionRow({ questId: null }), TODAY)).toBe("CONFLICTED");
    expect(classifyExecution(executionRow({ status: null }), TODAY)).toBe("CONFLICTED");
  });

  it("classifies COMPLETED status or a completion timestamp as COMPLETED even with zero elapsed time", () => {
    // A completed Quest stays completed however fast it was recorded.
    expect(classifyExecution(executionRow({ status: "COMPLETED", elapsedSeconds: 0 }), TODAY)).toBe("COMPLETED");
    // A completion timestamp is proof on its own, even if the status field lags.
    expect(classifyExecution(executionRow({ completedAt: "2030-01-14", elapsedSeconds: 0 }), TODAY)).toBe("COMPLETED");
  });

  it("classifies a FAILED status as FAILED", () => {
    expect(classifyExecution(executionRow({ status: "FAILED" }), TODAY)).toBe("FAILED");
  });

  it("classifies an open session as IN_PROGRESS ahead of a pending-looking status", () => {
    // An open session is in-flight work; it must not read as replannable pending.
    expect(classifyExecution(executionRow({ activeSession: true, status: "NOT_STARTED" }), TODAY)).toBe("IN_PROGRESS");
    expect(classifyExecution(executionRow({ status: "IN_PROGRESS" }), TODAY)).toBe("IN_PROGRESS");
  });

  it("classifies recorded sessions or elapsed time as STARTED", () => {
    expect(classifyExecution(executionRow({ sessions: 1 }), TODAY)).toBe("STARTED");
    expect(classifyExecution(executionRow({ elapsedSeconds: 60 }), TODAY)).toBe("STARTED");
  });

  it("classifies remaining pending work as overdue or future by its date", () => {
    expect(classifyExecution(executionRow({ scheduledFor: "2030-01-10" }), TODAY)).toBe("PENDING_OVERDUE");
    expect(classifyExecution(executionRow({ scheduledFor: TODAY }), TODAY)).toBe("PENDING_FUTURE");
    expect(classifyExecution(executionRow({ scheduledFor: "2030-01-20" }), TODAY)).toBe("PENDING_FUTURE");
  });
});

describe("isPlannerQuestReplannable", () => {
  it("allows a live, unstarted pending item — both future and overdue", () => {
    // The single eligibility rule: provably unstarted, unedited and still live.
    const future = executionRow({ itemKey: "future", scheduledFor: "2030-01-20" });
    expect(isPlannerQuestReplannable(future, classifyExecution(future, TODAY))).toBe(true);
    const overdue = executionRow({ itemKey: "overdue", scheduledFor: "2030-01-10" });
    expect(isPlannerQuestReplannable(overdue, classifyExecution(overdue, TODAY))).toBe(true);
  });

  it("refuses every started, active or finished state", () => {
    // A replan may change only work that has not begun; time, sessions and status all close the door.
    const completed = executionRow({ itemKey: "c", status: "COMPLETED" });
    const failed = executionRow({ itemKey: "f", status: "FAILED" });
    const inProgress = executionRow({ itemKey: "p", status: "IN_PROGRESS" });
    const startedSeconds = executionRow({ itemKey: "s1", elapsedSeconds: 1 });
    const startedSession = executionRow({ itemKey: "s2", sessions: 1 });
    const open = executionRow({ itemKey: "o", activeSession: true });
    for (const row of [completed, failed, inProgress, startedSeconds, startedSession, open]) {
      expect(isPlannerQuestReplannable(row, classifyExecution(row, TODAY))).toBe(false);
    }
  });

  it("refuses a detached or deleted link and a missing Quest", () => {
    const detached = executionRow({ itemKey: "d", disposition: "DETACHED" });
    const deleted = executionRow({ itemKey: "x", disposition: "DELETED" });
    const missing = executionRow({ itemKey: "m", questId: null });
    for (const row of [detached, deleted, missing]) {
      expect(isPlannerQuestReplannable(row, classifyExecution(row, TODAY))).toBe(false);
    }
  });

  it("can never treat a FAILED or COMPLETED Quest as replannable", () => {
    // The strongest statement of the rule: regardless of how the class is passed in,
    // these two outcomes are history.
    const failed = executionRow({ itemKey: "f", status: "FAILED" });
    const completed = executionRow({ itemKey: "c", status: "COMPLETED" });
    expect(isPlannerQuestReplannable(failed, "FAILED")).toBe(false);
    expect(isPlannerQuestReplannable(completed, "COMPLETED")).toBe(false);
  });
});

describe("executionSnapshot", () => {
  it("partitions rows into frozen and eligible and counts every class", () => {
    const snapshot = executionSnapshot(
      [
        executionRow({ itemKey: "future" }), // PENDING_FUTURE → eligible
        executionRow({ itemKey: "overdue", scheduledFor: "2030-01-10" }), // PENDING_OVERDUE → eligible
        executionRow({ itemKey: "done", status: "COMPLETED" }), // frozen history
        executionRow({ itemKey: "failed", status: "FAILED" }), // frozen history
        executionRow({ itemKey: "running", activeSession: true }), // in flight
        executionRow({ itemKey: "started", elapsedSeconds: 1 }), // in flight
        executionRow({ itemKey: "detached", disposition: "DETACHED" }), // neither frozen nor eligible
        executionRow({ itemKey: "deleted", disposition: "DELETED" }), // neither frozen nor eligible
        executionRow({ itemKey: "conflicted", disposition: "ARCHIVED" }), // frozen, needs review
      ],
      TODAY
    );
    // The partition is deterministic: detached/deleted are lineage context, not frozen history.
    expect(snapshot.frozen.map((row) => row.itemKey)).toEqual([
      "done",
      "failed",
      "running",
      "started",
      "conflicted",
    ]);
    expect(snapshot.eligible.map((row) => row.itemKey)).toEqual(["future", "overdue"]);
    expect(snapshot.counts).toEqual({
      PENDING_FUTURE: 1,
      PENDING_OVERDUE: 1,
      COMPLETED: 1,
      FAILED: 1,
      IN_PROGRESS: 1,
      STARTED: 1,
      DETACHED: 1,
      DELETED: 1,
      CONFLICTED: 1,
    });
  });

  it("sets conflicted only when a CONFLICTED row exists, and hasActiveWork for in-flight work", () => {
    const busy = executionSnapshot(
      [
        executionRow({ itemKey: "running", activeSession: true }),
        executionRow({ itemKey: "started", sessions: 1 }),
      ],
      TODAY
    );
    expect(busy.conflicted).toBe(false);
    expect(busy.hasActiveWork).toBe(true);
    // Completed history alone is not "active work" and is not a conflict.
    const calm = executionSnapshot(
      [executionRow({ itemKey: "done", status: "COMPLETED" })],
      TODAY
    );
    expect(calm.conflicted).toBe(false);
    expect(calm.hasActiveWork).toBe(false);
    const conflicted = executionSnapshot(
      [executionRow({ itemKey: "bad", disposition: "ARCHIVED" })],
      TODAY
    );
    expect(conflicted.conflicted).toBe(true);
  });

  it("keeps the fingerprint stable across row order", () => {
    const ordered = [
      executionRow({ itemKey: "item-1" }),
      executionRow({ itemKey: "item-2", status: "COMPLETED" }),
      executionRow({ itemKey: "item-3", scheduledFor: "2030-01-10" }),
    ];
    const shuffled = [ordered[2], ordered[0], ordered[1]];
    // The digest sorts by itemKey, so array order can never change what a replan is built on.
    expect(executionSnapshot(ordered, TODAY).fingerprint).toBe(
      executionSnapshot(shuffled, TODAY).fingerprint
    );
  });

  it("changes the fingerprint when any executable fact changes", () => {
    const base = executionRow({ itemKey: "item-x" });
    const reference = executionSnapshot([base], TODAY).fingerprint;
    // Every fact a replan depends on is part of the digest, so staleness can be proven.
    const mutations: Partial<ExecutionRow>[] = [
      { status: "COMPLETED" },
      { scheduledFor: "2030-01-10" },
      { requiredMinutes: 60 },
      { elapsedSeconds: 90 },
      { completedAt: "2030-01-14" },
      { sessions: 1 },
      { activeSession: true },
      { disposition: "DETACHED" },
    ];
    for (const mutation of mutations) {
      expect(executionSnapshot([{ ...base, ...mutation }], TODAY).fingerprint).not.toBe(reference);
    }
  });
});

describe("detectRebalanceReasons", () => {
  const detect = (overrides: {
    snapshot?: ExecutionSnapshot;
    availabilityChanged?: boolean;
    deadlineChanged?: boolean;
    priorityChanged?: boolean;
    scopeChanged?: boolean;
    checkNeedsWork?: boolean;
  }) =>
    detectRebalanceReasons({
      snapshot: overrides.snapshot ?? executionSnapshot([], TODAY),
      availabilityChanged: overrides.availabilityChanged ?? false,
      deadlineChanged: overrides.deadlineChanged ?? false,
      priorityChanged: overrides.priorityChanged ?? false,
      scopeChanged: overrides.scopeChanged ?? false,
      checkNeedsWork: overrides.checkNeedsWork ?? false,
      today: TODAY,
    });

  it("returns no reasons for an untouched snapshot with nothing changed", () => {
    expect(detect({})).toEqual([]);
  });

  it("fires OVERDUE_WORK when pending work is past its date", () => {
    const snapshot = executionSnapshot(
      [executionRow({ itemKey: "overdue", scheduledFor: "2030-01-10" })],
      TODAY
    );
    expect(detect({ snapshot })).toContain("OVERDUE_WORK");
  });

  it("fires EXECUTION_CHANGED once for detached or deleted links, deduplicated", () => {
    const snapshot = executionSnapshot(
      [
        executionRow({ itemKey: "d1", disposition: "DETACHED" }),
        executionRow({ itemKey: "d2", disposition: "DETACHED" }),
        executionRow({ itemKey: "d3", disposition: "DELETED" }),
      ],
      TODAY
    );
    const reasons = detect({ snapshot });
    // The closed vocabulary appears at most once, whatever mix of lineage links exists.
    expect(reasons.filter((reason) => reason === "EXECUTION_CHANGED")).toHaveLength(1);
    expect(reasons).toContain("EXECUTION_CHANGED");
  });

  it("fires each input-change reason in the documented order", () => {
    expect(
      detect({ availabilityChanged: true, deadlineChanged: true, priorityChanged: true, scopeChanged: true })
    ).toEqual([
      "AVAILABILITY_CHANGED",
      "DEADLINE_CHANGED",
      "PRIORITY_CHANGED",
      "SCOPE_CHANGED",
    ]);
  });

  it("fires MASTERY_CHECK_NEEDS_WORK when the check needs more work", () => {
    expect(detect({ checkNeedsWork: true })).toEqual(["MASTERY_CHECK_NEEDS_WORK"]);
  });
});

describe("rebalanceDiff", () => {
  it("classifies every proposal against the eligible set and reports exact counts", () => {
    const diff = scenarioDiff();
    // One of each change, from one scenario: retained, moved, replaced, removed and added.
    expect(diff.counts).toEqual({ RETAIN: 1, MOVE: 1, REPLACE: 1, REMOVE: 1, ADD: 1 });
    expect(diff.frozen).toBe(1);
    // Every superseded key is an eligible row, so no completed/active history is touched.
    expect(diff.affectedHistory).toBe(0);
  });

  it("retains an identical proposal with its identity and its original dates and minutes", () => {
    const retain = entryOf(scenarioDiff(), "RETAIN");
    expect(retain.key).toBe("item-a");
    expect(retain.supersedesKey).toBeNull();
    expect(retain.title).toBe("Read chapter 1");
    expect(retain.fromDate).toBe("2030-01-07");
    expect(retain.toDate).toBe("2030-01-07");
    expect(retain.fromMinutes).toBe(30);
    expect(retain.toMinutes).toBe(30);
    expect(retain.reason).toBe("Stays as planned.");
  });

  it("moves a retained item whose date changed, carrying the superseded key", () => {
    const move = entryOf(scenarioDiff(), "MOVE");
    expect(move.key).toBe("item-b");
    expect(move.supersedesKey).toBe("item-b");
    expect(move.fromDate).toBe("2030-01-08");
    expect(move.toDate).toBe("2030-01-10");
    expect(move.reason).toBe("Moves from 2030-01-08 to 2030-01-10.");
  });

  it("replaces an eligible item when new work targets the same topic, carrying the superseded key", () => {
    const replace = entryOf(scenarioDiff(), "REPLACE");
    expect(replace.key).toBe("item-c2");
    expect(replace.supersedesKey).toBe("item-c");
    expect(replace.title).toBe("Old review");
    expect(replace.topicTitle).toBe("Chapter 3");
    expect(replace.toDate).toBe("2030-01-11");
    expect(replace.toMinutes).toBe(25);
    expect(replace.reason).toBe("Replaced by work that fits the remaining time better.");
  });

  it("removes an eligible item with no new work for its topic", () => {
    const remove = entryOf(scenarioDiff(), "REMOVE");
    expect(remove.key).toBeNull();
    expect(remove.supersedesKey).toBe("item-e");
    expect(remove.toDate).toBeNull();
    expect(remove.toMinutes).toBeNull();
    expect(remove.reason).toBe("No longer part of the remaining plan.");
  });

  it("adds a proposal with no retained key and no matching topic", () => {
    const add = entryOf(scenarioDiff(), "ADD");
    expect(add.key).toBe("item-f");
    expect(add.supersedesKey).toBeNull();
    expect(add.fromDate).toBeNull();
    expect(add.toDate).toBe("2030-01-13");
    expect(add.reason).toBe("New work for what is left.");
  });

  it("moves a retained item whose minutes changed with the availability reason", () => {
    // Same date, different minutes: the move is attributed to availability, not a date change.
    const diff = rebalanceDiff({
      baseItems: [
        { key: "item-x", title: "Same", date: "2030-01-07", minutes: 30, topicKey: "topic-x", stage: null },
      ],
      snapshot: snapshotFor(["item-x"]),
      proposed: [
        { key: "item-x", title: "Same", date: "2030-01-07", minutes: 45, topicKey: "topic-x", stage: null, retainedKey: "item-x" },
      ],
      topicTitles: new Map(),
    });
    const move = entryOf(diff, "MOVE");
    expect(move.reason).toBe("Scheduled differently against your current availability.");
    expect(move.fromMinutes).toBe(30);
    expect(move.toMinutes).toBe(45);
  });

  it("throws RETAINED_ITEM_NOT_ELIGIBLE when a proposal retains an item outside the eligible set", () => {
    expect(() =>
      rebalanceDiff({
        baseItems: [
          { key: "item-a", title: "Read", date: "2030-01-07", minutes: 30, topicKey: "topic-1", stage: null },
        ],
        snapshot: snapshotFor(["item-a"]),
        proposed: [
          { key: "item-x", title: "Read", date: "2030-01-07", minutes: 30, topicKey: "topic-1", stage: null, retainedKey: "item-not-eligible" },
        ],
        topicTitles: new Map(),
      })
    ).toThrow("RETAINED_ITEM_NOT_ELIGIBLE");
  });
});

describe("rebalanceSummary", () => {
  it("renders the exact confirmation sentence including the affected-history count", () => {
    expect(rebalanceSummary(scenarioDiff())).toBe(
      "1 unchanged, 1 rescheduled, 1 replaced, 1 new, 1 removed. Completed or active work affected: 0."
    );
  });

  it("keeps the sentence shape when nothing changes", () => {
    const empty: RebalanceDiff = {
      entries: [],
      counts: { RETAIN: 0, MOVE: 0, REPLACE: 0, REMOVE: 0, ADD: 0 },
      frozen: 0,
      affectedHistory: 0,
    };
    expect(rebalanceSummary(empty)).toBe(
      "0 unchanged, 0 rescheduled, 0 replaced, 0 new, 0 removed. Completed or active work affected: 0."
    );
  });
});

describe("rebalanceMilestoneDiff", () => {
  const baseMilestones = [
    { key: "m1", title: "Block 1", date: "2030-01-31", topicKeys: ["topic-1"], frozen: false },
    { key: "m2", title: "Block 2", date: "2030-02-28", topicKeys: ["topic-2"], frozen: false },
    { key: "m3", title: "Block 3", date: "2030-03-31", topicKeys: ["topic-3"], frozen: false },
    { key: "m-frozen", title: "Expanded block", date: "2030-01-15", topicKeys: ["topic-0"], frozen: true },
  ];
  const proposed = [
    { key: "m1", title: "Block 1", date: "2030-01-31", topicKeys: ["topic-1"], retainedKey: "m1" },
    { key: "m2", title: "Block 2", date: "2030-03-15", topicKeys: ["topic-2"], retainedKey: "m2" },
    { key: "m4", title: "Block 4", date: "2030-04-30", topicKeys: ["topic-4"], retainedKey: null },
  ];
  const topicTitles = new Map([
    ["topic-1", "Chapter 1"],
    ["topic-2", "Chapter 2"],
    ["topic-3", "Chapter 3"],
    ["topic-4", "Chapter 4"],
  ]);

  it("retains, moves, removes and adds strategic milestones while frozen anchors are untouched", () => {
    const diff = rebalanceMilestoneDiff({ baseMilestones, proposed, topicTitles });
    expect(diff.counts).toEqual({ RETAIN: 1, MOVE: 1, REPLACE: 0, REMOVE: 1, ADD: 1 });
    // Only the already-expanded anchor counts as frozen history.
    expect(diff.frozen).toBe(1);
    expect(diff.affectedHistory).toBe(0);

    const retain = entryOf(diff, "RETAIN");
    expect(retain.key).toBe("m1");
    expect(retain.supersedesKey).toBeNull();
    expect(retain.stage).toBe("MILESTONE");
    expect(retain.reason).toBe("Stays as planned.");

    const move = entryOf(diff, "MOVE");
    expect(move.supersedesKey).toBe("m2");
    expect(move.reason).toBe("Moves from 2030-02-28 to 2030-03-15.");

    const remove = entryOf(diff, "REMOVE");
    expect(remove.key).toBeNull();
    expect(remove.supersedesKey).toBe("m3");
    expect(remove.reason).toBe("No longer part of the remaining roadmap.");

    const add = entryOf(diff, "ADD");
    expect(add.key).toBe("m4");
    expect(add.supersedesKey).toBeNull();
    expect(add.reason).toBe("New milestone for what is left.");
  });

  it("fails closed when a proposal retains a milestone that is not in the base set", () => {
    expect(() =>
      rebalanceMilestoneDiff({
        baseMilestones,
        proposed: [{ key: "m5", title: "New", date: "2030-05-01", topicKeys: [], retainedKey: "missing" }],
        topicTitles,
      })
    ).toThrow("RETAINED_MILESTONE_NOT_ELIGIBLE");
  });

  it("fails closed when a proposal retains a frozen, already-expanded milestone", () => {
    expect(() =>
      rebalanceMilestoneDiff({
        baseMilestones,
        proposed: [
          { key: "m-frozen", title: "Expanded block", date: "2030-01-15", topicKeys: ["topic-0"], retainedKey: "m-frozen" },
        ],
        topicTitles,
      })
    ).toThrow("RETAINED_MILESTONE_FROZEN");
  });
});

describe("rebalanceStaleness", () => {
  const snapshot = executionSnapshot([executionRow({ itemKey: "item-a" })], TODAY);

  const staleness = (overrides: {
    proposalSnapshotFingerprint?: string;
    liveSnapshot?: ExecutionSnapshot;
    proposalBaseRevisionId?: string;
    liveActiveRevisionId?: string | null;
    proposalAvailabilityDigest?: string;
    liveAvailabilityDigest?: string;
  }) =>
    rebalanceStaleness({
      proposalSnapshotFingerprint: overrides.proposalSnapshotFingerprint ?? snapshot.fingerprint,
      liveSnapshot: overrides.liveSnapshot ?? snapshot,
      proposalBaseRevisionId: overrides.proposalBaseRevisionId ?? "rev-1",
      liveActiveRevisionId: overrides.liveActiveRevisionId ?? "rev-1",
      proposalAvailabilityDigest: overrides.proposalAvailabilityDigest ?? "avail-1",
      liveAvailabilityDigest: overrides.liveAvailabilityDigest ?? "avail-1",
    });

  it("returns null when base revision, execution and availability all match", () => {
    expect(staleness({})).toBeNull();
  });

  it("reports a stale base when the active revision has moved", () => {
    expect(staleness({ liveActiveRevisionId: "rev-2" })).toBe("REPLAN_STALE_BASE");
  });

  it("reports stale execution when the snapshot fingerprint has moved", () => {
    expect(staleness({ proposalSnapshotFingerprint: "different" })).toBe("REPLAN_STALE_EXECUTION");
  });

  it("reports stale availability when the availability digest has moved", () => {
    expect(staleness({ liveAvailabilityDigest: "avail-2" })).toBe("REPLAN_STALE_AVAILABILITY");
  });

  it("reports a conflicted execution even when every digest matches", () => {
    const conflicted = executionSnapshot(
      [executionRow({ itemKey: "item-a", disposition: "ARCHIVED" })],
      TODAY
    );
    expect(
      staleness({ liveSnapshot: conflicted, proposalSnapshotFingerprint: conflicted.fingerprint })
    ).toBe("REPLAN_CONFLICTED_EXECUTION");
  });
});

describe("reconcileProgress", () => {
  it("keeps completed old items completed and still counts their completed minutes", () => {
    const result = reconcileProgress({
      baseItems: [
        plannerItem(1, { minutes: 30 }), // live, untouched
        plannerItem(2, { minutes: 20 }), // completed, still counted
        plannerItem(3, { minutes: 40 }), // completed AND superseded: still completed
      ],
      supersededItemKeys: [UUID(3)],
      replacementItems: [],
      completedItemKeys: [UUID(2), UUID(3)],
    });
    expect(result.completed).toBe(2);
    // Completed minutes come from the base items the completion set names, superseded or not.
    expect(result.completedMinutes).toBe(60);
  });

  it("stops counting superseded pending items and counts replacements once without double-counting minutes", () => {
    const result = reconcileProgress({
      baseItems: [
        plannerItem(1, { minutes: 30 }), // live pending
        plannerItem(2, { minutes: 45 }), // superseded pending: leaves outstanding
        plannerItem(3, { minutes: 60, removed: true }), // removed: never outstanding
      ],
      supersededItemKeys: [UUID(2)],
      replacementItems: [plannerItem(4, { minutes: 25 })],
      completedItemKeys: [],
    });
    expect(result.outstanding).toBe(2);
    expect(result.superseded).toBe(1);
    // Only the live item and its replacement contribute; nothing is added twice.
    expect(result.plannedMinutes).toBe(55);
  });

  it("never emits a field that suggests mastery", () => {
    const result = reconcileProgress({
      baseItems: [],
      supersededItemKeys: [],
      replacementItems: [],
      completedItemKeys: [],
    });
    // The output vocabulary is bounded: no projection, rating or "mastered" claim escapes.
    expect(Object.keys(result).sort()).toEqual([
      "completed",
      "completedMinutes",
      "outstanding",
      "plannedMinutes",
      "superseded",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/master/i);
  });
});

describe("assertRebalanceEnvelope, dayShift and rebalanceableDraft", () => {
  it("binds the rebalance metadata to its measured byte envelope", () => {
    expect(() => assertRebalanceEnvelope({ note: "small" })).not.toThrow();
    // A payload at the byte bound, plus the JSON wrapper, is over the envelope.
    expect(() => assertRebalanceEnvelope({ blob: "x".repeat(REBALANCE_LIMITS.metadataBytes) })).toThrow(
      "REBALANCE_METADATA_TOO_LARGE"
    );
  });

  it("reports a signed day difference and null when either date is missing", () => {
    expect(dayShift("2030-01-07", "2030-01-10")).toBe(3);
    expect(dayShift("2030-01-10", "2030-01-07")).toBe(-3);
    expect(dayShift(null, "2030-01-10")).toBeNull();
    expect(dayShift("2030-01-07", null)).toBeNull();
    expect(dayShift(null, null)).toBeNull();
  });

  it("allows a strategic roadmap or a draft with active items, but not an expansion", () => {
    const examDraft = (items: PlannerItem[]): ValidatedDraftV1 =>
      ValidatedDraftV1Schema.parse({
        schemaVersion: 1,
        mode: "EXAM",
        examDate: "2030-01-11",
        assumptions: [],
        warnings: [],
        topics: [{ key: UUID(900), title: "Algebra", parentKey: null }],
        milestones: [],
        items,
      });
    const roadmapDraft = (expansion: boolean): ValidatedDraftV1 =>
      ValidatedDraftV1Schema.parse({
        schemaVersion: 1,
        mode: "ROADMAP",
        outcome: "A-Level Physics",
        assumptions: [],
        warnings: [],
        topics: [{ key: UUID(910), title: "Dynamics", parentKey: null }],
        milestones: [],
        items: [],
        ...(expansion ? { expansion: { milestoneKey: UUID(920) } } : {}),
      });

    // A strategic roadmap (no expansion) carries the whole plan and can be replanned.
    expect(rebalanceableDraft(roadmapDraft(false))).toBe(true);
    // An expansion revises one period's segment, so it is not a replan target.
    expect(rebalanceableDraft(roadmapDraft(true))).toBe(false);
    // A non-roadmap draft is replannable while it still has at least one active item.
    expect(rebalanceableDraft(examDraft([plannerItem(1)]))).toBe(true);
    expect(rebalanceableDraft(examDraft([plannerItem(1, { removed: true })]))).toBe(false);
  });
});
