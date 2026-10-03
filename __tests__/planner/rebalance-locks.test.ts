import { describe, expect, it } from "vitest";
import { normalizeProposal } from "@/lib/planner/server/core";
import type { ValidatedDraftV1 } from "@/lib/planner/contracts";
import {
  executionSnapshot,
  isPlannerQuestReplannable,
  type ExecutionRow,
} from "@/lib/planner/rebalance-policy";
import {
  rebalanceEligible,
  rebalanceLockedItems,
} from "@/lib/planner/rebalance-scope";
import { examFixture, examProposal } from "./exam-fixtures";

const TODAY = "2030-01-08";

/** A live, unstarted Quest: replannable unless the student locked it. */
function row(itemKey: string): ExecutionRow {
  return {
    itemKey,
    questId: 1,
    disposition: "LIVE",
    status: "PENDING",
    scheduledFor: "2030-01-20",
    requiredMinutes: 30,
    elapsedSeconds: 0,
    completedAt: null,
    sessions: 0,
    activeSession: false,
  };
}

function confirmedDraft(): ValidatedDraftV1 {
  return normalizeProposal(examFixture(), examProposal());
}

/**
 * Planner locks are an explicit instruction from the student, so a replan respects
 * them: a locked item is never offered as replannable, and the plan detail reports
 * how many items are held back so the review can say why.
 */
describe("Replanner locks", () => {
  it("excludes a locked item from what a replan may change", () => {
    const draft = confirmedDraft();
    const lockedKey = draft.items[0].key;
    const unlockedKey = draft.items[1].key;
    const withLock: ValidatedDraftV1 = {
      ...draft,
      items: draft.items.map((item) =>
        item.key === lockedKey ? { ...item, locked: true } : item
      ),
    } as ValidatedDraftV1;
    const execution = executionSnapshot(
      withLock.items.map((item) => row(item.key)),
      TODAY
    );
    // The Quest itself is startable and unstarted: only the lock holds it back.
    expect(isPlannerQuestReplannable(row(lockedKey), "PENDING_FUTURE")).toBe(true);
    const eligible = rebalanceEligible(withLock, execution).map((entry) => entry.key);
    expect(eligible).not.toContain(lockedKey);
    expect(eligible).toContain(unlockedKey);
    expect(rebalanceLockedItems(withLock, execution)).toEqual([lockedKey]);
  });

  it("offers the same item once the student unlocks it", () => {
    const draft = confirmedDraft();
    const key = draft.items[0].key;
    const execution = executionSnapshot(
      draft.items.map((item) => row(item.key)),
      TODAY
    );
    expect(rebalanceEligible(draft, execution).map((entry) => entry.key)).toContain(key);
    expect(rebalanceLockedItems(draft, execution)).toEqual([]);
  });

  it("never treats locked work as replannable, even when it is overdue", () => {
    const draft = confirmedDraft();
    const key = draft.items[0].key;
    const withLock = {
      ...draft,
      items: draft.items.map((item) => ({ ...item, locked: true })),
    } as ValidatedDraftV1;
    void key;
    const execution = executionSnapshot(
      withLock.items.map((item) => ({
        ...row(item.key),
        scheduledFor: "2029-12-01",
      })),
      TODAY
    );
    // Overdue is schedule state, not permission to rewrite locked work.
    expect(execution.counts.PENDING_OVERDUE).toBe(withLock.items.length);
    expect(rebalanceEligible(withLock, execution)).toEqual([]);
    expect(rebalanceLockedItems(withLock, execution)).toHaveLength(
      withLock.items.length
    );
  });
});
