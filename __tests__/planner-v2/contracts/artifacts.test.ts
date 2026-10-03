import { describe, expect, it } from "vitest";
import { LearningBlueprintV2Schema, PLANNER_V2_ENVELOPE as E, PlanChangeSetV2Schema, PlannerRevisionV2Schema,
  QualityReportV2Schema, plannerSerializedBytes, validateChangeSetCorrespondenceV2 } from "@/lib/planner/v2/contracts";
import { blueprintFixture, changeSetFixture, digest, executionFixture, id, instant, qualityFixture, revisionFixture, successfulAttemptFixture } from "./fixtures";

describe("Planner V2 immutable proposal and quality artifacts", () => {
  it("binds the change set, request, resolved versions, revision and owned context", () => {
    const changeSet = changeSetFixture(); const attempt = successfulAttemptFixture(); const revision = revisionFixture();
    expect(validateChangeSetCorrespondenceV2(changeSet, attempt, [revision])).toEqual([]);
    expect(validateChangeSetCorrespondenceV2({ ...changeSet, requestDigest: digest("c") }, attempt, [revision])).toContain("CHANGE_SET_ATTEMPT_REQUEST_MISMATCH");
    expect(validateChangeSetCorrespondenceV2(changeSet, attempt, [{ ...revision, ownerId: 999 }])).toContain(`CHANGE_SET_REVISION_MISMATCH:${id(1)}`);
    expect(validateChangeSetCorrespondenceV2(changeSet, attempt, [{ ...revision, context: { ...revision.context, planBases: [] } }])).toContain(`CHANGE_SET_CONTEXT_BASE_MISMATCH:${id(1)}`);
  });
  it("forbids modifying unselected plans and accepts only a whole exact receipt", () => {
    const changeSet = changeSetFixture();
    expect(PlanChangeSetV2Schema.safeParse({ ...changeSet, entries: [{ ...changeSet.entries[0], planId: id(9) }] }).success).toBe(false);
    const receipt = { receiptId: id(90), changeSetId: changeSet.changeSetId, confirmedAt: instant, targets: [{ planId: id(1), revisionId: id(3), revisionDigest: digest("b") }] };
    expect(PlanChangeSetV2Schema.safeParse({ ...changeSet, applyReceipt: receipt }).success).toBe(true);
    expect(PlanChangeSetV2Schema.safeParse({ ...changeSet, applyReceipt: { ...receipt, targets: [{ ...receipt.targets[0], revisionDigest: digest("c") }] } }).success).toBe(false);
  });
  it("distinguishes recommended effort from available capacity and blocks false feasibility", () => {
    const changeSet = changeSetFixture();
    expect(changeSet.aggregate.recommendedEffort.likelyMinutes).toBeLessThan(changeSet.aggregate.availableForTargetsMinutes);
    expect(PlanChangeSetV2Schema.safeParse({ ...changeSet, aggregate: { ...changeSet.aggregate, availableForTargetsMinutes: 29 } }).success).toBe(false);
    expect(PlanChangeSetV2Schema.safeParse({ ...changeSet, aggregate: { ...changeSet.aggregate, requiresReestimate: true } }).success).toBe(false);
  });
  it("cannot seal useful-looking content after an unresolved or unverified severe repair", () => {
    const quality = qualityFixture();
    const issue = { issueId: "missing_method", category: "MISSING_PREREQUISITE", severity: "BLOCKING", affectedRefs: ["practice01"], evidence: "Student cannot choose the prerequisite method", consequence: "Timed practice is currently unusable", resolution: "OPEN", verification: null };
    expect(QualityReportV2Schema.safeParse({ ...quality, issues: [issue] }).success).toBe(false);
    expect(QualityReportV2Schema.safeParse({ ...quality, issues: [{ ...issue, resolution: "REPAIRED", verification: { result: "UNRESOLVED", verifiedAt: instant, explanation: "The method is still missing" } }] }).success).toBe(false);
    expect(QualityReportV2Schema.safeParse({ ...quality, issues: [{ ...issue, category: "UNRESOLVED_UNCERTAINTY", resolution: "ACCEPTED_UNCERTAINTY" }] }).success).toBe(false);
    expect(QualityReportV2Schema.safeParse({ ...quality, issues: [{ ...issue, resolution: "REPAIRED", verification: { result: "RESOLVED", verifiedAt: instant, explanation: "Prerequisite diagnosis is now first" } }] }).success).toBe(true);
    expect(PlannerRevisionV2Schema.safeParse({ ...revisionFixture(), quality: { ...quality, status: "INCOMPLETE" } }).success).toBe(false);
  });
  it("materializes committed activities only and never rewrites instructions during compilation", () => {
    const revision = revisionFixture(); const activity = revision.blueprint.activities[0];
    expect(PlannerRevisionV2Schema.safeParse({ ...revision, blueprint: { ...revision.blueprint, activities: [{ ...activity, commitment: { category: "OPTIONAL", reason: "Extra practice only if wanted" } }] } }).success).toBe(false);
    expect(PlannerRevisionV2Schema.safeParse({ ...revision, executable: [{ ...revision.executable[0], content: { ...revision.executable[0].content, instructions: "Generic study topic" } }] }).success).toBe(false);
    expect(PlannerRevisionV2Schema.safeParse({ ...revision, executable: [] }).success).toBe(false);
  });
  it("supports an owned cross-plan prerequisite without duplicate materialization", () => {
    const revision = revisionFixture();
    const shared = { ...revision, executable: [{ ...revision.executable[0], content: { ...revision.executable[0].content, hardDependencies: [id(21)] } }],
      context: { ...revision.context, externalActivityDependencies: [{ dependentActivityRef: "practice01", activityKey: id(21), planId: id(6), contentDigest: digest(), strength: "HARD", reason: "Use the shared method activity in the other exam plan" }] } };
    expect(PlannerRevisionV2Schema.safeParse(shared).success).toBe(true);
    expect(PlannerRevisionV2Schema.safeParse({ ...shared, context: revision.context }).success).toBe(false);
  });
  it("accepts bounded maximum counts with near-limit multilingual content through revision assembly", () => {
    const base = blueprintFixture();
    const blueprint = LearningBlueprintV2Schema.parse({ ...base,
      scope: Array.from({ length: 500 }, (_, i) => ({ scopeRef: `scope_${i}`, disposition: "INCLUDED", contribution: "A distinct assessed skill" })),
      strategy: { ...base.strategy, phases: Array.from({ length: 100 }, (_, i) => ({ localId: `phase_${i}`, title: "Learning milestone", outcome: "Explain and apply the skill" })) },
      activities: Array.from({ length: 200 }, (_, i) => ({ ...base.activities[0], localId: `practice_${i}`, scopeRefs: [`scope_${i}`], outcomeRefs: [`phase_${i % 100}`], instructions: "学".repeat(1100) })),
    });
    expect(plannerSerializedBytes(blueprint)).toBeGreaterThan(750_000);
    const spec = executionFixture();
    const executable = blueprint.activities.map((activity, i) => ({ ...spec, activityKey: id(200 + i), blueprintActivityId: activity.localId,
      content: { ...spec.content, instructions: activity.instructions, scopeRefs: activity.scopeRefs, outcomeRefs: activity.outcomeRefs } }));
    const revision = { ...revisionFixture(), blueprint, executable };
    expect(plannerSerializedBytes(revision)).toBeLessThan(E.serializedBytes);
    expect(PlannerRevisionV2Schema.safeParse(revision).success).toBe(true);
    const tooLarge = { ...blueprint, activities: blueprint.activities.map(activity => ({ ...activity, instructions: "学".repeat(1800) })) };
    expect(LearningBlueprintV2Schema.safeParse(tooLarge).success).toBe(false);
  });
});
