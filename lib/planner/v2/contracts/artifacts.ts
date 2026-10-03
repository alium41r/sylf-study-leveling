import { z } from "zod";
import { LearningBlueprintV2Schema, ModelLearningBlueprintV2Schema } from "./blueprint";
import { PLANNER_V2_ENVELOPE as E, plannerSerializedBytes, withPlannerEnvelope } from "./envelope";
import { ExecutionTaskSpecV2Schema, SealedSemanticDiffEntryV2Schema } from "./execution";
import { ApplyReceiptV2Schema, type PlannerAttemptV2 } from "./operations";
import {
  DateV2Schema, DigestV2Schema, DurableIdV2Schema, EffortRangeV2Schema, EntityIdV2Schema,
  InstantV2Schema, LocalIdV2Schema, SummaryV2Schema, VersionV2Schema, issue, unique, validateDag,
} from "./primitives";

export const QualityIssueV2Schema = z.strictObject({
  issueId: LocalIdV2Schema,
  category: z.enum(["STRUCTURAL", "PEDAGOGICAL", "UNREALISTIC_WORKLOAD", "MISSING_PREREQUISITE", "WEAK_CRITERION", "ADVISORY", "UNRESOLVED_UNCERTAINTY"]),
  severity: z.enum(["BLOCKING", "WARNING", "ADVISORY"]),
  affectedRefs: z.array(LocalIdV2Schema).max(E.newlyDetailedActivities),
  evidence: SummaryV2Schema,
  consequence: SummaryV2Schema,
  resolution: z.enum(["OPEN", "REPAIRED", "ACKNOWLEDGED", "ACCEPTED_UNCERTAINTY"]),
  verification: z.strictObject({
    result: z.enum(["RESOLVED", "UNRESOLVED"]),
    verifiedAt: InstantV2Schema,
    explanation: SummaryV2Schema,
  }).nullable(),
}).superRefine((finding, ctx) => {
  if (finding.resolution === "REPAIRED" && finding.verification?.result !== "RESOLVED") {
    issue(ctx, ["verification"], "Attempted repair is not a verified resolution");
  }
  if (finding.resolution === "ACCEPTED_UNCERTAINTY" && finding.category !== "UNRESOLVED_UNCERTAINTY") {
    issue(ctx, ["resolution"], "Hard violations cannot be accepted as uncertainty");
  }
  if (finding.severity === "BLOCKING" && finding.resolution === "ACKNOWLEDGED") {
    issue(ctx, ["resolution"], "Acknowledgment cannot clear a blocker");
  }
  if (finding.severity === "BLOCKING" && finding.resolution === "ACCEPTED_UNCERTAINTY") issue(ctx, ["resolution"], "A severe concrete blocker requires verified repair");
});

export const QualityReportV2Schema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  reportId: DurableIdV2Schema,
  status: z.enum(["PASSED", "BLOCKED", "INCOMPLETE"]),
  evidenceDigest: DigestV2Schema,
  educationalContentDigest: DigestV2Schema,
  issues: z.array(QualityIssueV2Schema).max(E.qualityIssues),
  requiredAcknowledgements: z.array(LocalIdV2Schema).max(E.qualityIssues),
}).superRefine((report, ctx) => {
  unique(report.issues.map(finding => finding.issueId), ctx, ["issues"]);
  unique(report.requiredAcknowledgements, ctx, ["requiredAcknowledgements"]);
  const findings = new Map(report.issues.map(finding => [finding.issueId, finding]));
  if (report.status === "PASSED" && report.issues.some(finding => finding.severity === "BLOCKING" &&
    finding.resolution !== "REPAIRED" && finding.resolution !== "ACCEPTED_UNCERTAINTY")) {
    issue(ctx, ["status"], "Unresolved blockers cannot pass quality");
  }
  report.requiredAcknowledgements.forEach((id, i) => {
    if (!findings.has(id) || findings.get(id)?.severity !== "WARNING") issue(ctx, ["requiredAcknowledgements", i], "Only identified warnings can require acknowledgment");
  });
}));

export const ContextDependenciesV2Schema = z.strictObject({
  intentDigest: DigestV2Schema,
  capacityDigest: DigestV2Schema,
  evidence: z.array(z.strictObject({ ref: LocalIdV2Schema, digest: DigestV2Schema })).max(E.evidenceRecords),
  quests: z.array(z.strictObject({ questId: EntityIdV2Schema, contentDigest: DigestV2Schema, executionVersion: z.number().int().nonnegative() })).max(E.outstandingActivitiesPerPlan * E.targets),
  planBases: z.array(z.strictObject({ planId: DurableIdV2Schema, revisionId: DurableIdV2Schema.nullable(), planningVersion: z.number().int().nonnegative() })).max(E.targets),
  externalActivityDependencies: z.array(z.strictObject({
    dependentActivityRef: LocalIdV2Schema, activityKey: DurableIdV2Schema, planId: DurableIdV2Schema,
    contentDigest: DigestV2Schema, strength: z.enum(["HARD", "ADVISORY"]), reason: SummaryV2Schema,
  })).max(E.outstandingActivitiesPerPlan * E.targets),
}).superRefine((context, ctx) => {
  unique(context.evidence.map(value => value.ref), ctx, ["evidence"]);
  unique(context.quests.map(value => String(value.questId)), ctx, ["quests"]);
  unique(context.planBases.map(value => value.planId), ctx, ["planBases"]);
  unique(context.externalActivityDependencies.map(value => `${value.dependentActivityRef}/${value.activityKey}`), ctx, ["externalActivityDependencies"]);
});

export const PlannerRevisionV2Schema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  revisionId: DurableIdV2Schema,
  planId: DurableIdV2Schema,
  ownerId: EntityIdV2Schema,
  attemptId: DurableIdV2Schema,
  requestedIntentVersionId: DurableIdV2Schema,
  resolvedIntentVersionId: DurableIdV2Schema,
  baseActiveRevisionId: DurableIdV2Schema.nullable(),
  sealedAt: InstantV2Schema,
  digest: DigestV2Schema,
  blueprint: LearningBlueprintV2Schema,
  executable: z.array(ExecutionTaskSpecV2Schema).max(E.outstandingActivitiesPerPlan),
  context: ContextDependenciesV2Schema,
  quality: QualityReportV2Schema,
  forecast: z.array(z.strictObject({ phaseRef: LocalIdV2Schema, effort: EffortRangeV2Schema, expectedFinishDate: DateV2Schema.optional() })).max(E.milestones),
}).superRefine((revision, ctx) => {
  unique(revision.executable.map(spec => spec.activityKey), ctx, ["executable"]);
  unique(revision.executable.map(spec => spec.blueprintActivityId), ctx, ["executable"]);
  if (revision.executable.some(spec => spec.planId !== revision.planId)) issue(ctx, ["executable"], "Every executable activity has one owning Plan");
  if (revision.quality.status !== "PASSED") issue(ctx, ["quality"], "Only cleared proposals can become sealed revisions");
  const phases = new Set(revision.blueprint.strategy.phases.map(phase => phase.localId));
  if (revision.forecast.some(value => !phases.has(value.phaseRef))) issue(ctx, ["forecast"], "UNKNOWN_FORECAST_PHASE");
  const activities = new Map(revision.blueprint.activities.map(activity => [activity.localId, activity]));
  const materialized = new Set(revision.executable.map(spec => spec.blueprintActivityId));
  revision.executable.forEach((spec, i) => {
    const activity = activities.get(spec.blueprintActivityId);
    if (!activity || activity.commitment.category !== "COMMITTED") { issue(ctx, ["executable", i], "Only committed blueprint activities can materialize"); return; }
    if (spec.content.title !== activity.title || spec.content.instructions !== activity.instructions ||
      spec.content.completionCriterion !== activity.completionCriterion || spec.content.purpose !== activity.purpose ||
      spec.content.activityType !== activity.activityType || spec.content.stage !== activity.stage || spec.effort.plannedMinutes !== activity.timeboxMinutes ||
      JSON.stringify([...spec.content.scopeRefs].sort()) !== JSON.stringify([...activity.scopeRefs].sort()) ||
      JSON.stringify([...spec.content.outcomeRefs].sort()) !== JSON.stringify([...activity.outcomeRefs].sort())) issue(ctx, ["executable", i], "Execution must retain the approved educational specification");
    if (JSON.stringify(spec.content.resources.map(resource => resource.ref).sort()) !== JSON.stringify([...(activity.resourceRefs ?? [])].sort())) issue(ctx, ["executable", i], "Resource references cannot drift during compilation");
    const keys = new Map(revision.executable.map(task => [task.blueprintActivityId, task.activityKey]));
    const external = revision.context.externalActivityDependencies.filter(dependency => dependency.dependentActivityRef === activity.localId && dependency.strength === "HARD").map(dependency => dependency.activityKey);
    if (JSON.stringify([...spec.content.hardDependencies].sort()) !== JSON.stringify([...new Set([...activity.hardDependencies.map(ref => keys.get(ref) ?? ref), ...external])].sort())) issue(ctx, ["executable", i], "Hard dependencies must resolve to owned execution keys");
  });
  if (revision.blueprint.activities.some(activity => activity.commitment.category === "COMMITTED" && !materialized.has(activity.localId))) issue(ctx, ["executable"], "Every committed activity must materialize in the detailed segment");
  if (plannerSerializedBytes(revision.executable) > plannerSerializedBytes(revision.blueprint) + E.executionOverheadBytes) issue(ctx, ["executable"], "EXECUTION_ASSEMBLY_OVERHEAD_EXCEEDED");
  const metadata = Object.fromEntries(Object.entries(revision).filter(([key]) => key !== "blueprint" && key !== "executable"));
  if (plannerSerializedBytes(metadata) > E.revisionMetadataBytes) issue(ctx, [], "REVISION_METADATA_BUDGET_EXCEEDED");
}));

export const PlanChangeSetV2Schema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  changeSetId: DurableIdV2Schema,
  attemptId: DurableIdV2Schema,
  requestDigest: DigestV2Schema,
  targets: z.array(z.strictObject({
    planId: DurableIdV2Schema,
    requestedIntentVersionId: DurableIdV2Schema,
    resolvedIntentVersionId: DurableIdV2Schema,
    baseActiveRevisionId: DurableIdV2Schema.nullable(),
    planningVersion: z.number().int().nonnegative(),
    resolvedPlanningVersion: z.number().int().nonnegative(),
    revisionId: DurableIdV2Schema,
    revisionDigest: DigestV2Schema,
  })).min(1).max(E.targets),
  entries: z.array(SealedSemanticDiffEntryV2Schema).max(E.outstandingActivitiesPerPlan * E.targets),
  aggregate: z.strictObject({
    maximumCapacityMinutes: z.number().int().nonnegative(),
    availableForTargetsMinutes: z.number().int().nonnegative(),
    committedTargetMinutes: z.number().int().nonnegative(),
    recommendedEffort: EffortRangeV2Schema,
    feasible: z.boolean(),
    requiresReestimate: z.boolean(),
    compromises: z.array(SummaryV2Schema).max(20),
  }),
  quality: QualityReportV2Schema,
  applyReceipt: ApplyReceiptV2Schema.nullable(),
}).superRefine((changeSet, ctx) => {
  unique(changeSet.targets.map(target => target.planId), ctx, ["targets"]);
  unique(changeSet.targets.map(target => target.revisionId), ctx, ["targets"]);
  unique(changeSet.entries.map(entry => entry.activityKey), ctx, ["entries"]);
  const plans = new Set(changeSet.targets.map(target => target.planId));
  changeSet.entries.forEach((entry, i) => {
    if (!plans.has(entry.planId)) issue(ctx, ["entries", i], "An unselected Plan cannot be modified");
  });
  if (changeSet.entries.filter(entry => entry.changes.includes("ADDED")).length > E.newlyDetailedActivities) {
    issue(ctx, ["entries"], "NEWLY_MATERIALIZED_ACTIVITY_BOUND");
  }
  if (changeSet.aggregate.availableForTargetsMinutes > changeSet.aggregate.maximumCapacityMinutes) issue(ctx, ["aggregate"], "Available capacity cannot exceed maximum capacity");
  if (!changeSet.aggregate.feasible || changeSet.aggregate.requiresReestimate || changeSet.aggregate.committedTargetMinutes > changeSet.aggregate.availableForTargetsMinutes) {
    issue(ctx, ["aggregate"], "An applicable change set must be feasible");
  }
  if (changeSet.quality.status !== "PASSED") issue(ctx, ["quality"], "Applicable change sets require cleared quality");
  if (changeSet.applyReceipt) {
    const targets = new Map(changeSet.targets.map(target => [target.planId, target]));
    if (changeSet.applyReceipt.changeSetId !== changeSet.changeSetId || changeSet.applyReceipt.targets.length !== targets.size ||
      changeSet.applyReceipt.targets.some(receipt => {
        const target = targets.get(receipt.planId);
        return !target || target.revisionId !== receipt.revisionId || target.revisionDigest !== receipt.revisionDigest;
      })) issue(ctx, ["applyReceipt"], "Receipt must apply the exact whole change set");
  }
}));

const sharedDependency = z.strictObject({
  prerequisite: z.strictObject({ planRef: LocalIdV2Schema, activityId: LocalIdV2Schema }),
  dependent: z.strictObject({ planRef: LocalIdV2Schema, activityId: LocalIdV2Schema }),
  strength: z.enum(["HARD", "ADVISORY"]),
  reason: SummaryV2Schema,
});

export const JointLearningBlueprintV2Schema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  plans: z.array(z.strictObject({ planRef: LocalIdV2Schema, blueprint: ModelLearningBlueprintV2Schema })).length(E.targets),
  sharedDependencies: z.array(sharedDependency).max(E.referencesPerActivity),
  tradeOffExplanation: SummaryV2Schema,
}).superRefine((joint, ctx) => {
  unique(joint.plans.map(plan => plan.planRef), ctx, ["plans"]);
  if (joint.plans.reduce((total, plan) => total + plan.blueprint.activities.length, 0) > E.newlyDetailedActivities) issue(ctx, ["plans"], "The model activity bound is shared across joint targets");
  const activityKeys = new Set(joint.plans.flatMap(plan => plan.blueprint.activities.map(activity => `${plan.planRef}/${activity.localId}`)));
  joint.sharedDependencies.forEach((dependency, i) => {
    for (const endpoint of [dependency.prerequisite, dependency.dependent]) {
      if (!activityKeys.has(`${endpoint.planRef}/${endpoint.activityId}`)) issue(ctx, ["sharedDependencies", i], "UNKNOWN_SHARED_ACTIVITY");
    }
  });
  const nodes = joint.plans.flatMap(plan => plan.blueprint.activities.map(activity => ({
    id: `${plan.planRef}/${activity.localId}`,
    dependencies: [
      ...activity.hardDependencies.map(id => `${plan.planRef}/${id}`),
      ...joint.sharedDependencies.filter(dependency => dependency.strength === "HARD" &&
        dependency.dependent.planRef === plan.planRef && dependency.dependent.activityId === activity.localId)
        .map(dependency => `${dependency.prerequisite.planRef}/${dependency.prerequisite.activityId}`),
    ],
  })));
  validateDag(nodes, ctx, ["sharedDependencies"]);
}));

export type QualityReportV2 = z.infer<typeof QualityReportV2Schema>;
export type PlannerRevisionV2 = z.infer<typeof PlannerRevisionV2Schema>;
export type PlanChangeSetV2 = z.infer<typeof PlanChangeSetV2Schema>;
export type ContextDependenciesV2 = z.infer<typeof ContextDependenciesV2Schema>;

/** Shape validation is followed by this correspondence check against owned, digest-verified loads. */
export function validateChangeSetCorrespondenceV2(
  changeSet: PlanChangeSetV2, attempt: PlannerAttemptV2, revisions: readonly PlannerRevisionV2[],
): string[] {
  const errors: string[] = [];
  if (attempt.kind === "RESEARCH_ADVICE" || attempt.state !== "SUCCEEDED" || attempt.result?.kind !== "REVISIONS") errors.push("ATTEMPT_HAS_NO_APPLICABLE_PLAN_RESULT");
  if (changeSet.attemptId !== attempt.attemptId || changeSet.requestDigest !== attempt.requestHash) errors.push("CHANGE_SET_ATTEMPT_REQUEST_MISMATCH");
  if (changeSet.targets.length !== attempt.targets.length || revisions.length !== changeSet.targets.length) errors.push("CHANGE_SET_TARGET_CARDINALITY_MISMATCH");
  for (const target of changeSet.targets) {
    const accepted = attempt.targets.find(value => value.planId === target.planId);
    const revision = revisions.find(value => value.planId === target.planId);
    const published = attempt.result?.kind === "REVISIONS" ? attempt.result.revisions.find(value => value.planId === target.planId) : null;
    if (!accepted || accepted.requestedIntentVersionId !== target.requestedIntentVersionId || accepted.resolvedIntentVersionId !== target.resolvedIntentVersionId ||
      accepted.baseActiveRevisionId !== target.baseActiveRevisionId || accepted.planningVersion !== target.planningVersion || accepted.resolvedPlanningVersion !== target.resolvedPlanningVersion) errors.push(`CHANGE_SET_TARGET_MISMATCH:${target.planId}`);
    if (!revision || revision.ownerId !== attempt.ownerId || revision.attemptId !== attempt.attemptId || revision.revisionId !== target.revisionId || revision.digest !== target.revisionDigest ||
      revision.requestedIntentVersionId !== target.requestedIntentVersionId || revision.resolvedIntentVersionId !== target.resolvedIntentVersionId || revision.baseActiveRevisionId !== target.baseActiveRevisionId ||
      !published || published.revisionId !== revision.revisionId || published.digest !== revision.digest) errors.push(`CHANGE_SET_REVISION_MISMATCH:${target.planId}`);
    const base = revision?.context.planBases.find(value => value.planId === target.planId);
    if (!base || base.revisionId !== target.baseActiveRevisionId || base.planningVersion !== target.resolvedPlanningVersion) errors.push(`CHANGE_SET_CONTEXT_BASE_MISMATCH:${target.planId}`);
  }
  if (JSON.stringify(attempt.applyReceipt) !== JSON.stringify(changeSet.applyReceipt)) errors.push("CHANGE_SET_APPLY_RECEIPT_MISMATCH");
  return [...new Set(errors)];
}
