import { describe, expect, it } from "vitest";
import type { ModelProposalV1 } from "@/lib/planner/contracts";
import { normalizeProposal } from "@/lib/planner/server/core";
import {
  MASTERY_CHECK_STATE_LABEL,
  MASTERY_PLAN_STATES,
  MASTERY_PLAN_STATE_LABEL,
  MASTERY_PROGRESS_NOTE,
  MASTERY_UNIT_STATE_LABEL,
  masteryCheckSummary,
  masteryProgress,
  type MasteryProgressInput,
} from "@/lib/planner/mastery-progress";
import { masteryFixture, masteryProposal } from "./mastery-fixtures";

/** The projection input for a stored mastery draft, with chosen Quest statuses. */
function progressInput(
  completedStages: string[] = [],
  overrides: Partial<MasteryProgressInput> = {}
): MasteryProgressInput {
  const input = masteryFixture();
  const draft = normalizeProposal(input, masteryProposal(input));
  if (draft.mode !== "MASTERY") throw new Error("expected a mastery draft");
  return {
    confirmed: true,
    today: "2030-01-10",
    units: draft.topics.map((topic) => ({ key: topic.key, title: topic.title })),
    items: draft.items.map((item) => ({
      key: item.key,
      topicKey: item.topicKey,
      masteryStage: item.masteryStage,
      type: item.type,
      title: item.title,
      date: item.date,
      minutes: item.minutes,
      relatedTopicKeys: item.relatedTopicKeys,
      removed: item.removed,
    })),
    execution: draft.items.map((item) => ({
      itemKey: item.key,
      status: completedStages.includes(item.masteryStage ?? "")
        ? "COMPLETED"
        : "PENDING",
    })),
    ...overrides,
  };
}

describe("Mastery progress is conservative", () => {
  it("never claims mastery, in any state or label", () => {
    const words = [
      ...Object.values(MASTERY_PLAN_STATE_LABEL),
      ...Object.values(MASTERY_UNIT_STATE_LABEL),
      ...Object.values(MASTERY_CHECK_STATE_LABEL),
      MASTERY_PROGRESS_NOTE,
    ];
    for (const text of words)
      expect(text.toLowerCase()).not.toMatch(
        /\bmastered\b|\bfully understood\b|\byou (?:now )?know\b|\byou are confident\b/
      );
    expect(MASTERY_PLAN_STATES).toEqual([
      "NOT_CONFIRMED",
      "PLANNED",
      "IN_PROGRESS",
      "CHECK_PENDING",
      "CHECK_COMPLETED",
      "PLAN_COMPLETED",
    ]);
  });

  it("reports a draft as unconfirmed and a confirmed untouched plan as planned", () => {
    const draft = masteryProgress(progressInput([], { confirmed: false }));
    expect(draft.state).toBe("NOT_CONFIRMED");
    expect(draft.completedItems).toBe(0);
    const planned = masteryProgress(progressInput());
    expect(planned.state).toBe("PLANNED");
    expect(planned.plannedItems).toBeGreaterThan(0);
    expect(planned.remainingMinutes).toBe(planned.plannedMinutes);
  });

  it("moves through progress, check-pending and completed from Quest status alone", () => {
    const inProgress = masteryProgress(progressInput(["UNDERSTAND"]));
    expect(inProgress.state).toBe("IN_PROGRESS");
    expect(inProgress.completedMinutes).toBeGreaterThan(0);

    // Every item except the check: the plan's planned work is done and its own
    // bounded check is still outstanding.
    const input = progressInput();
    const withCheckPending = masteryProgress({
      ...input,
      execution: input.execution.map((row) => {
        const item = input.items.find((entry) => entry.key === row.itemKey)!;
        return {
          ...row,
          status: item.masteryStage === "MASTERY_CHECK" ? "PENDING" : "COMPLETED",
        };
      }),
    });
    expect(withCheckPending.state).toBe("CHECK_PENDING");
    expect(withCheckPending.check?.state).not.toBe("COMPLETED");

    const completed = masteryProgress({
      ...input,
      execution: input.execution.map((row) => ({ ...row, status: "COMPLETED" })),
    });
    expect(completed.state).toBe("PLAN_COMPLETED");
    expect(completed.check?.state).toBe("COMPLETED");
    expect(completed.completedItems).toBe(completed.plannedItems);
    // The overall sentence still refuses to judge the student.
    expect(masteryCheckSummary(completed.check)).toContain("yours to judge");
  });

  it("reports a completed check without pretending the rest of the plan is done", () => {
    const input = progressInput();
    const checkOnly = masteryProgress({
      ...input,
      execution: input.execution.map((row) => {
        const item = input.items.find((entry) => entry.key === row.itemKey)!;
        return {
          ...row,
          status: item.masteryStage === "MASTERY_CHECK" ? "COMPLETED" : "PENDING",
        };
      }),
    });
    expect(checkOnly.completedItems).toBe(1);
    expect(checkOnly.check?.state).toBe("COMPLETED");
    expect(["CHECK_COMPLETED", "IN_PROGRESS"]).toContain(checkOnly.state);
    expect(checkOnly.state).not.toBe("PLAN_COMPLETED");
  });

  it("shows each unit's own stages without turning completion into an assessment", () => {
    const input = progressInput(["UNDERSTAND", "LEARN", "ACTIVE_RECALL"]);
    const progress = masteryProgress(input);
    const first = progress.units[0];
    expect(first.state).toBe("IN_PROGRESS");
    expect(first.stages.map((group) => group.stage)).toContain("ACTIVE_RECALL");
    expect(first.completed).toBeGreaterThan(0);
    expect(first.completed).toBeLessThanOrEqual(first.planned);
    expect(first.plannedMinutes).toBeGreaterThanOrEqual(first.completedMinutes);
    // Stage groups follow the plan's own progression order.
    const order = first.stages.map((group) => group.stage);
    const expectedOrder = (
      [
        "UNDERSTAND",
        "LEARN",
        "ACTIVE_RECALL",
        "PRACTICE",
        "REVIEW_MISTAKES",
        "MASTERY_CHECK",
      ] as const
    ).filter((stage) => order.includes(stage));
    expect(order).toEqual([...expectedOrder]);
    // The check is a chapter-level stage: units it covers carry no check item of
    // their own, and the projection says nothing about stages a unit "should" have.
    expect(progress.check?.coversUnitKeys.length).toBe(progress.units.length);
    expect(first).not.toHaveProperty("missingStages");
  });

  it("represents the mastery check as one bounded, dated, multi-unit item", () => {
    const progress = masteryProgress(progressInput());
    expect(progress.check).not.toBeNull();
    const check = progress.check!;
    expect(check.minutes).toBeLessThanOrEqual(240);
    expect(check.coversUnitKeys.length).toBeGreaterThanOrEqual(2);
    expect(check.date >= "2030-01-07").toBe(true);
    // A future date is scheduled; a date that has arrived is not claimed as done.
    expect(check.state).toBe("PENDING");
    const due = masteryProgress(progressInput([], { today: check.date }));
    expect(due.check?.state).toBe("DUE");
    expect(MASTERY_CHECK_STATE_LABEL.DUE).toContain("today");
    expect(masteryCheckSummary(due.check)).toContain("does not decide mastery");
  });

  it("ignores removed items, so an excluded unit is not counted as outstanding", () => {
    const input = progressInput(["UNDERSTAND", "LEARN", "ACTIVE_RECALL", "PRACTICE", "REVIEW_MISTAKES"]);
    const unitKey = input.units[0].key;
    const excluded = masteryProgress({
      ...input,
      items: input.items.map((item) =>
        item.topicKey === unitKey ? { ...item, removed: true } : item
      ),
      execution: input.execution,
    });
    expect(excluded.units[0].planned).toBe(0);
    expect(excluded.units[0].state).toBe("NOT_STARTED");
    const remaining = excluded.units.slice(1);
    expect(remaining.every((unit) => unit.planned > 0)).toBe(true);
  });

  it("treats a missing or failed Quest as outstanding rather than done", () => {
    const input = progressInput();
    const failed = masteryProgress({
      ...input,
      execution: input.execution.map((row) => ({ ...row, status: "FAILED" })),
    });
    expect(failed.completedItems).toBe(0);
    expect(failed.state).toBe("PLANNED");
    const survivor = masteryProgress({
      ...input,
      execution: input.execution.slice(1),
    });
    expect(survivor.completedItems).toBe(0);
    expect(survivor.plannedItems).toBe(input.items.length);
  });

  it("has no representation for mastery-check results, because none is stored", () => {
    const progress = masteryProgress(progressInput(["MASTERY_CHECK"]));
    const serialized = JSON.stringify(progress);
    // The projection carries workflow state only: no score, no "mastered" flag, no
    // reflection text. Persisting a check result would need a migration the phase
    // explicitly forbids.
    expect(serialized).not.toMatch(/score|mastered|reflection|result/i);
    expect(Object.keys(progress).sort()).toEqual(
      [
        "check",
        "completedItems",
        "completedMinutes",
        "note",
        "plannedItems",
        "plannedMinutes",
        "remainingMinutes",
        "state",
        "units",
      ].sort()
    );
  });

  it("reads a plan whose items carry no stage as having no check at all", () => {
    const input = progressInput();
    const stripped = masteryProgress({
      ...input,
      items: input.items.map((item) => ({ ...item, masteryStage: undefined })),
    });
    expect(stripped.check).toBeNull();
    expect(masteryCheckSummary(null)).toContain("No mastery check");
    const proposal = masteryProposal() as Extract<
      ModelProposalV1,
      { mode: "MASTERY" }
    >;
    expect(proposal.items.some((item) => item.type === "ASSESS")).toBe(true);
  });
});
