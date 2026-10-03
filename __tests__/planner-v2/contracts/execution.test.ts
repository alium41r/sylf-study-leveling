import { describe, expect, it } from "vitest";
import {
  compareExecutionSpecs, deriveRemainingWorkV2, ExecutionStateV2Schema, ExecutionTaskSpecV2Schema,
  SemanticDiffEntryV2Schema, validateExecutionDurationV2, validateProtectedExecutionChange, validateSealedDiffCorrespondenceV2,
} from "@/lib/planner/v2/contracts";
import { changeSetFixture, digest, executionFixture, id } from "./fixtures";

describe("Planner V2 execution correspondence", () => {
  it("does not call changed instructions unchanged just because title/date/minutes match", () => {
    const before = executionFixture();
    const after = { ...before, content: { ...before.content, instructions: "Solve unseen questions without looking at worked answers." } };
    expect(compareExecutionSpecs(before, after)).toEqual(["CHANGED"]);
    expect(SemanticDiffEntryV2Schema.safeParse({ activityKey: before.activityKey, before, after, changes: ["KEPT"], reason: "Same workload" }).success).toBe(false);
  });
  it.each(["completionCriterion", "activityType", "stage"] as const)("includes %s in executable content equality", field => {
    const before = executionFixture();
    expect(compareExecutionSpecs(before, { ...before, content: { ...before.content, [field]: "Changed content" } })).toEqual(["CHANGED"]);
  });
  it("detects resources, outcomes and hard dependencies", () => {
    const before = executionFixture();
    const changed = [{ resources: [{ ref: "paper03", versionDigest: digest() }] }, { outcomeRefs: ["phase_transfer"] }, { hardDependencies: [id(21)] }];
    changed.forEach(content => expect(compareExecutionSpecs(before, { ...before, content: { ...before.content, ...content } })).toEqual(["CHANGED"]));
  });
  it("produces combined placement/effort/content labels", () => {
    const before = executionFixture();
    const after = { ...before, placement: { ...before.placement, date: "2026-10-06" }, effort: { ...before.effort, plannedMinutes: 20, remainingMinutesEstimate: 20 },
      content: { ...before.content, completionCriterion: "Solve two questions unaided and identify the error type." } };
    expect(compareExecutionSpecs(before, after)).toEqual(["MOVED", "SHORTENED", "CHANGED"]);
  });
  it("treats reference order as a set but content prose as exact", () => {
    const before = executionFixture(); before.content.scopeRefs = ["a", "b"];
    expect(compareExecutionSpecs(before, { ...before, content: { ...before.content, scopeRefs: ["b", "a"] } })).toEqual(["KEPT"]);
    expect(compareExecutionSpecs(before, { ...before, content: { ...before.content, instructions: `${before.content.instructions} Explain why.` } })).toEqual(["CHANGED"]);
  });
  it("keeps stable identities and represents replacements separately", () => {
    const before = executionFixture();
    expect(compareExecutionSpecs(before, before)).toEqual(["KEPT"]);
    expect(compareExecutionSpecs(null, before)).toEqual(["ADDED"]);
    expect(compareExecutionSpecs(before, null)).toEqual(["REMOVED"]);
    expect(() => compareExecutionSpecs(before, { ...before, activityKey: id(21) })).toThrow("Replacement identities");
  });
  it.each([0, 4, 241, 5.5])("rejects new timebox %s without a legacy escape hatch", plannedMinutes => {
    const spec = executionFixture();
    expect(ExecutionTaskSpecV2Schema.safeParse({ ...spec, effort: { ...spec.effort, plannedMinutes } }).success).toBe(false);
  });
  it("rejects duration aliases and caller-selected reward fields", () => {
    expect(ExecutionTaskSpecV2Schema.safeParse({ ...executionFixture(), requiredMinutes: 40 }).success).toBe(false);
    expect(ExecutionTaskSpecV2Schema.safeParse({ ...executionFixture(), xpReward: 500 }).success).toBe(false);
  });
  it("subtracts newly accepted actual study from the estimate's own basis", () => {
    const effort = { plannedMinutes: 30, remainingMinutesEstimate: 10, remainingEstimateBasisActualSeconds: 1200 };
    expect(deriveRemainingWorkV2(effort, 1500)).toEqual({ remainingMinutesEstimate: 5, requiresReestimate: false });
    expect(deriveRemainingWorkV2(effort, 1799)).toEqual({ remainingMinutesEstimate: 1, requiresReestimate: false });
    expect(deriveRemainingWorkV2(effort, 1800)).toEqual({ remainingMinutesEstimate: 1, requiresReestimate: true });
    expect(deriveRemainingWorkV2(effort, 2400)).toEqual({ remainingMinutesEstimate: 1, requiresReestimate: true });
    expect(() => deriveRemainingWorkV2(effort, 1199)).toThrow("ACTUAL_TIME_CANNOT_PRECEDE");
  });
  it("closed work reserves zero without awarding completion to a withdrawal", () => {
    expect(deriveRemainingWorkV2(executionFixture().effort, 0, "WITHDRAWN").remainingMinutesEstimate).toBe(0);
    expect(ExecutionStateV2Schema.safeParse({ schemaVersion: 2, activityKey: id(20), state: "UNSTARTED", remainingDisposition: "COMPLETED", actualSeconds: 0, executionVersion: 0, remainingMinutesEstimate: 0, requiresReestimate: false }).success).toBe(false);
  });
  it("an unstarted reserve equals its reviewed timebox and zero-second starts protect work", () => {
    const spec = executionFixture();
    const state = ExecutionStateV2Schema.parse({ schemaVersion: 2, activityKey: spec.activityKey, state: "UNSTARTED", remainingDisposition: "OPEN", actualSeconds: 0, executionVersion: 0, remainingMinutesEstimate: 30, requiresReestimate: false });
    expect(validateExecutionDurationV2(spec, state)).toEqual([]);
    expect(validateExecutionDurationV2(spec, { ...state, remainingMinutesEstimate: 20 })).toContain("UNSTARTED_RESERVE_MUST_EQUAL_APPROVED_TIMEBOX");
    expect(validateProtectedExecutionChange(spec, spec, { ...state, state: "RUNNING" }, "UPDATE")).toEqual(["RUNNING_EXECUTION_PROTECTED"]);
  });
  it("paused/ended incomplete work can move but cannot rewrite its purpose", () => {
    const before = executionFixture(); const after = { ...before, placement: { ...before.placement, date: "2026-10-06" } };
    for (const state of ["PAUSED", "ENDED_INCOMPLETE"] as const) {
      const execution = ExecutionStateV2Schema.parse({ schemaVersion: 2, activityKey: before.activityKey, state, remainingDisposition: "OPEN", actualSeconds: 0, executionVersion: 1, remainingMinutesEstimate: 30, requiresReestimate: false });
      expect(validateProtectedExecutionChange(before, after, execution, "UPDATE")).toEqual([]);
      expect(validateProtectedExecutionChange(before, { ...after, content: { ...after.content, instructions: "New purpose" } }, execution, "UPDATE")).toEqual(["STARTED_CONTENT_PROTECTED"]);
      expect(validateProtectedExecutionChange(before, null, execution, "REMOVE")).toEqual(["STARTED_HISTORY_CANNOT_BE_DELETED"]);
      expect(validateProtectedExecutionChange(before, null, execution, "WITHDRAW")).toEqual([]);
    }
  });
  it("validates compact diff pointers against their owned immutable specifications", () => {
    const entry = changeSetFixture().entries[0];
    expect(validateSealedDiffCorrespondenceV2(entry, null, { spec: executionFixture(), specDigest: digest("b"), contentDigest: digest() })).toEqual([]);
    expect(validateSealedDiffCorrespondenceV2(entry, null, { spec: executionFixture(), specDigest: digest("c"), contentDigest: digest() })).toContain("DIFF_SPECIFICATION_MISMATCH:after");
  });
});
