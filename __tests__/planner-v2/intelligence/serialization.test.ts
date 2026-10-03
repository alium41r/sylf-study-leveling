// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LearningBlueprintV2Schema, ModelLearningBlueprintV2Schema, JointLearningBlueprintV2Schema,
  PlannerRevisionV2Schema, PlanChangeSetV2Schema, validateChangeSetCorrespondenceV2, validateSealedDiffCorrespondenceV2,
} from "@/lib/planner/v2/contracts";
import { PLANNER_V2_ENVELOPE as E, plannerSerializedBytes } from "@/lib/planner/v2/contracts/envelope";
import { CompilerCheckpointSchema } from "@/lib/planner/v2/intelligence/schemas/checkpoint";
import { ResearchProcessingSchema } from "@/lib/planner/v2/intelligence/schemas/research";
import { readCompilerCheckpoint } from "@/lib/planner/v2/intelligence/checkpoints";
import { hash } from "@/lib/planner/v2/server/database";
import { revisionDigest, educationalDigest } from "@/lib/planner/v2/server/revisions";
import { blueprintFixture, changeSetFixture, executionFixture, id, instant } from "../contracts/fixtures";
import { checkpointAttempt, checkpointFixture, researchFixture } from "./fixtures";

const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("shared artifact transport envelope", () => {
  it("retains maximum stored activity/scope/phase counts through checkpoint, revision, read and apply receipt shapes", () => {
    const checkpoint = checkpointFixture();
    if (!("quality" in checkpoint.payload)) throw new Error("fixture stage");
    const payload = checkpoint.payload;
    const template = blueprintFixture();
    const scope = Array.from({ length: E.scopeNodes }, (_, i) => ({ ...template.scope[0], scopeRef: i === 0 ? "scope_electricity" : `scope_${i}` }));
    const phases = Array.from({ length: E.milestones }, (_, i) => ({ ...template.strategy.phases[0], localId: i === 0 ? "phase_practice" : `phase_${i}` }));
    const activities = Array.from({ length: E.outstandingActivitiesPerPlan }, (_, i) => ({
      ...template.activities[0], localId: `activity_${i}`, instructions: `Solve and explain circuit ${i}. ${"x".repeat(2800)}`,
      completionCriterion: `Check the selected circuit law. ${"y".repeat(600)}`, timeboxMinutes: 5,
      effort: { lowMinutes: 5, likelyMinutes: 5, highMinutes: 10 },
    }));
    const blueprint = LearningBlueprintV2Schema.parse({ ...template, scope, activities, strategy: { ...template.strategy, phases } });
    checkpoint.binding.targets.push({ ...structuredClone(checkpoint.binding.targets[0]), planRef: "maths", planId: id(101), requestedIntentVersionId: id(102), resolvedIntentVersionId: id(102) });
    checkpoint.binding.targets.forEach((target, i) => {
      target.baseActiveRevisionId = id(201 + i);
      target.context!.planBases = [{ planId: target.planId, revisionId: target.baseActiveRevisionId, planningVersion: 0 }];
    });
    payload.envelope.targets.push({ ...payload.envelope.targets[0], planRef: "maths" });
    payload.envelope.protectedExecution = [];
    payload.envelope.days.forEach(day => Object.assign(day, { ceilingMinutes: 1440, protectedTargetMinutes: 0, availableMinutes: 1402 }));
    payload.envelope.weeklyCeilingMinutes = 10080;
    checkpoint.binding.envelopeDigest = hash("scheduling-envelope", payload.envelope);
    payload.blueprints.plans = checkpoint.binding.targets.map(target => ({ planRef: target.planRef, blueprint: structuredClone(blueprint), digest: hash("blueprint", blueprint) }));
    payload.allocation.report.placements = payload.blueprints.plans.flatMap((plan, p) => plan.blueprint.activities.map(activity => ({ planRef: plan.planRef, activityRef: activity.localId, date: payload.envelope.days[p].date, minutes: activity.timeboxMinutes })));
    payload.allocation.report.committedMinutes = 2000;
    payload.allocation.digest = hash("allocation", payload.allocation.report);
    payload.reviewedAllocationDigest = payload.allocation.digest;
    payload.quality = checkpoint.binding.targets.map((target, i) => ({ planRef: target.planRef, report: { ...payload.quality[0].report, reportId: id(160 + i), educationalContentDigest: hash("educational-content", { blueprint, externalDependencies: [] }) } }));
    payload.research = researchFixture();
    payload.research.evidence!.claims = Array.from({ length: E.claims }, (_, i) => ({ ...payload.research!.evidence!.claims[0], claimId: `claim_${i}`, excerpt: "e".repeat(E.sourceExcerptCharacters), statement: "s".repeat(E.summaryCharacters) }));
    checkpoint.binding.sourceDigests = [{ sourceId: "syllabus", contentHash: payload.research.selectedSources[0].contentHash }];

    const parsed = CompilerCheckpointSchema.parse(roundTrip(checkpoint));
    expect(readCompilerCheckpoint(roundTrip(parsed), checkpointAttempt(parsed), parsed.binding).ok).toBe(true);
    const attemptBytes = plannerSerializedBytes({ artifact: checkpointAttempt(parsed), payload: { checkpoint: parsed, researchEvidence: payload.research.evidence, calls: [], quota: null } });
    expect(attemptBytes).toBeLessThanOrEqual(E.serializedBytes);

    const revisions = payload.blueprints.plans.map((plan, p) => {
      const target = checkpoint.binding.targets[p];
      const executable = plan.blueprint.activities.map((activity, i) => {
        const spec = executionFixture();
        return { ...spec, activityKey: id(1000 + p * E.outstandingActivitiesPerPlan + i), blueprintActivityId: activity.localId, planId: target.planId,
          content: { ...spec.content, title: activity.title, instructions: activity.instructions, completionCriterion: activity.completionCriterion },
          effort: { ...spec.effort, plannedMinutes: 5, remainingMinutesEstimate: 5 }, placement: { ...spec.placement, date: payload.envelope.days[p].date } };
      });
      const revision = PlannerRevisionV2Schema.parse({ schemaVersion: 2, revisionId: id(300 + p), planId: target.planId, ownerId: checkpoint.binding.ownerId,
        attemptId: checkpoint.binding.attemptId, requestedIntentVersionId: target.requestedIntentVersionId, resolvedIntentVersionId: target.resolvedIntentVersionId,
        baseActiveRevisionId: target.baseActiveRevisionId, sealedAt: instant, digest: plan.digest, blueprint: plan.blueprint, executable, context: target.context,
        quality: payload.quality[p].report, forecast: phases.map(phase => ({ phaseRef: phase.localId, effort: { lowMinutes: 5, likelyMinutes: 5, highMinutes: 10 } })) });
      revision.quality.educationalContentDigest = educationalDigest(revision);
      revision.digest = revisionDigest(revision);
      expect(PlannerRevisionV2Schema.parse(roundTrip(revision))).toEqual(revision);
      expect(revisionDigest(roundTrip(revision))).toBe(revision.digest);
      return revision;
    });
    const changeSet = changeSetFixture();
    changeSet.targets = revisions.map((revision, p) => ({ ...changeSet.targets[0], planId: revision.planId, requestedIntentVersionId: revision.requestedIntentVersionId,
      resolvedIntentVersionId: revision.resolvedIntentVersionId, revisionId: revision.revisionId, revisionDigest: revision.digest,
      baseActiveRevisionId: revision.baseActiveRevisionId,
      planningVersion: checkpoint.binding.targets[p].planningVersion, resolvedPlanningVersion: checkpoint.binding.targets[p].resolvedPlanningVersion! }));
    changeSet.entries = revisions.flatMap(revision => revision.executable.map((spec, i) => {
      const after = { ...changeSet.entries[0].after!, specDigest: hash("spec", spec), contentDigest: hash("spec-content", spec.content), date: spec.placement.date, ...spec.effort };
      const entry = { ...changeSet.entries[0], activityKey: spec.activityKey, planId: spec.planId,
        after, changes: [i < 30 ? "ADDED" as const : "KEPT" as const], before: i < 30 ? null : { ...after } };
      const pointer = { spec, specDigest: after.specDigest, contentDigest: after.contentDigest };
      expect(validateSealedDiffCorrespondenceV2(entry, i < 30 ? null : pointer, pointer)).toEqual([]);
      return entry;
    }));
    changeSet.aggregate = { ...changeSet.aggregate, maximumCapacityMinutes: 2880, availableForTargetsMinutes: 2804, committedTargetMinutes: 2000 };
    // Older detailed work is retained; only 60 newly detailed activities are added.
    expect(changeSet.entries.filter(entry => entry.changes.includes("ADDED"))).toHaveLength(E.newlyDetailedActivities);
    const publishedAttempt = { ...checkpointAttempt(checkpoint), state: "SUCCEEDED" as const, stage: "PERSISTENCE" as const,
      result: { kind: "REVISIONS" as const, revisions: revisions.map(revision => ({ planId: revision.planId, revisionId: revision.revisionId, digest: revision.digest })) } };
    expect(validateChangeSetCorrespondenceV2(changeSet, publishedAttempt, revisions)).toEqual([]);
    changeSet.applyReceipt = { receiptId: id(400), changeSetId: changeSet.changeSetId, confirmedAt: instant,
      targets: changeSet.targets.map(target => ({ planId: target.planId, revisionId: target.revisionId, revisionDigest: target.revisionDigest })) };
    expect(PlanChangeSetV2Schema.parse(roundTrip(changeSet)).applyReceipt).toEqual(changeSet.applyReceipt);

    const evidence = { boundary: "Pure serialization and frozen correspondence; no database publish/read/apply transaction executed.",
      plans: revisions.length, storedActivitiesPerPlan: E.outstandingActivitiesPerPlan, scopeNodesPerPlan: E.scopeNodes, phasesPerPlan: E.milestones,
      newActivities: E.newlyDetailedActivities, researchClaims: E.claims, checkpointBytes: plannerSerializedBytes(parsed), attemptTransportBytes: attemptBytes,
      blueprintBytes: plannerSerializedBytes(blueprint), revisionBytes: revisions.map(plannerSerializedBytes), changeSetBytes: plannerSerializedBytes(changeSet), envelopeBytes: E.serializedBytes };
    const directory = "documentation/planner/reports/2026-10-03-phase-2/evidence";
    mkdirSync(directory, { recursive: true });
    writeFileSync(`${directory}/step1-serialization.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  });

  it("keeps the new-generation bound separate from retained detailed work", () => {
    const blueprint = blueprintFixture();
    blueprint.activities = Array.from({ length: 31 }, (_, i) => ({ ...blueprint.activities[0], localId: `activity_${i}` }));
    expect(ModelLearningBlueprintV2Schema.safeParse(blueprint).success).toBe(true);
    expect(JointLearningBlueprintV2Schema.safeParse({ schemaVersion: 2, plans: [{ planRef: "physics", blueprint }, { planRef: "maths", blueprint }], sharedDependencies: [], tradeOffExplanation: "Share the available study capacity." }).success).toBe(false);
  });

  it("rejects excessive combined bytes without truncating required context", () => {
    const checkpoint = checkpointFixture();
    if (!("blueprints" in checkpoint.payload)) throw new Error("fixture stage");
    const payload = checkpoint.payload;
    const blueprint = blueprintFixture();
    blueprint.activities = Array.from({ length: 200 }, (_, i) => ({ ...blueprint.activities[0], localId: `activity_${i}`, instructions: "x".repeat(3900) }));
    expect(LearningBlueprintV2Schema.safeParse(blueprint).success).toBe(true);
    checkpoint.binding.targets.push({ ...structuredClone(checkpoint.binding.targets[0]), planId: id(101), planRef: "maths" });
    checkpoint.binding.targets.forEach(target => {
      target.context!.externalActivityDependencies = Array.from({ length: 400 }, (_, i) => ({
        dependentActivityRef: "activity_0", activityKey: id(1000 + i), planId: id(500), contentDigest: target.contextDigest!, strength: "HARD", reason: "🌱".repeat(500),
      }));
    });
    payload.envelope.targets.push({ ...payload.envelope.targets[0], planRef: "maths" });
    const research = researchFixture();
    research.evidence!.claims = Array.from({ length: 200 }, (_, i) => ({ ...research.evidence!.claims[0], claimId: `claim_${i}`, statement: "🌱".repeat(500), excerpt: "e".repeat(2000) }));
    expect(ResearchProcessingSchema.safeParse(research).success).toBe(true);
    checkpoint.payload = { stage: "BLUEPRINT", envelope: payload.envelope, research,
      blueprints: { plans: [{ planRef: "physics", blueprint, digest: payload.blueprints.plans[0].digest }, { planRef: "maths", blueprint, digest: payload.blueprints.plans[0].digest }], sharedDependencies: [] } };
    expect(plannerSerializedBytes(checkpoint)).toBeGreaterThan(E.serializedBytes);
    const before = JSON.stringify(checkpoint);
    const result = CompilerCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.message === "PAYLOAD_TOO_LARGE")).toBe(true);
    expect(JSON.stringify(checkpoint)).toBe(before);
  });
});
