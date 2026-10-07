import { z } from "zod";
import { ContextDependenciesV2Schema, QualityReportV2Schema } from "../../contracts/artifacts";
import { LearningBlueprintV2Schema } from "../../contracts/blueprint";
import { PLANNER_V2_ENVELOPE as E, withPlannerEnvelope } from "../../contracts/envelope";
import { AttemptTargetV2Schema } from "../../contracts/operations";
import {
  DigestV2Schema, DurableIdV2Schema, EntityIdV2Schema, LocalIdV2Schema,
  SummaryV2Schema, VersionV2Schema, issue, unique, validateDag,
} from "../../contracts/primitives";
import { ResearchProcessingSchema } from "./research";
import { AllocationReportSchema, SchedulingEnvelopeSchema } from "./scheduling";
import { PlanningSupportSchema } from "./planning";
import { QualitySupportSchema } from "./quality";

export const CompilerBindingSchema = z.strictObject({
  attemptId: DurableIdV2Schema, ownerId: EntityIdV2Schema, requestHash: DigestV2Schema,
  rootRequestId: DurableIdV2Schema, targetAuthorizationDigest: DigestV2Schema,
  targets: z.array(AttemptTargetV2Schema.safeExtend({
    planRef: LocalIdV2Schema, requestedIntentDigest: DigestV2Schema,
    resolvedIntentDigest: DigestV2Schema.nullable(), qualityEvidenceDigest: DigestV2Schema.nullable(),
    context: ContextDependenciesV2Schema.nullable(),
  })).max(E.targets),
  sourceDigests: z.array(z.strictObject({ sourceId: LocalIdV2Schema, contentHash: DigestV2Schema })).max(E.sources),
  envelopeDigest: DigestV2Schema.nullable(),
}).superRefine((binding, ctx) => {
  unique(binding.targets.map(target => target.planId), ctx, ["targets"]);
  unique(binding.targets.map(target => target.planRef), ctx, ["targets"]);
  unique(binding.sourceDigests.map(source => source.sourceId), ctx, ["sourceDigests"]);
  binding.targets.forEach((target, i) => {
    if ((target.resolvedIntentVersionId === null) !== (target.resolvedIntentDigest === null) ||
      (target.resolvedIntentVersionId === null) !== (target.qualityEvidenceDigest === null)) issue(ctx, ["targets", i], "RESOLVED_INTENT_DIGEST_REQUIRED");
    if ((target.contextDigest === null) !== (target.context === null)) issue(ctx, ["targets", i], "CONTEXT_SNAPSHOT_REQUIRED");
    if (target.context && target.context.intentDigest !== target.resolvedIntentDigest) issue(ctx, ["targets", i, "context"], "CONTEXT_INTENT_MISMATCH");
    if (target.resolution === "UNCHANGED" && target.resolvedIntentDigest !== target.requestedIntentDigest) issue(ctx, ["targets", i], "UNCHANGED_INTENT_DIGEST_MISMATCH");
  });
});

const endpoint = z.strictObject({ planRef: LocalIdV2Schema, activityId: LocalIdV2Schema });
export const BlueprintSnapshotSchema = z.strictObject({
  plans: z.array(z.strictObject({ planRef: LocalIdV2Schema, blueprint: LearningBlueprintV2Schema, digest: DigestV2Schema })).min(1).max(E.targets),
  sharedDependencies: z.array(z.strictObject({
    prerequisite: endpoint, dependent: endpoint, strength: z.enum(["HARD", "ADVISORY"]), reason: SummaryV2Schema,
  })).max(E.referencesPerActivity),
}).superRefine((snapshot, ctx) => {
  unique(snapshot.plans.map(plan => plan.planRef), ctx, ["plans"]);
  const keys = new Set(snapshot.plans.flatMap(plan => plan.blueprint.activities.map(activity => `${plan.planRef}/${activity.localId}`)));
  snapshot.sharedDependencies.forEach((dependency, i) => {
    if (!keys.has(`${dependency.prerequisite.planRef}/${dependency.prerequisite.activityId}`) ||
      !keys.has(`${dependency.dependent.planRef}/${dependency.dependent.activityId}`)) issue(ctx, ["sharedDependencies", i], "UNKNOWN_SHARED_ACTIVITY");
  });
  unique(snapshot.sharedDependencies.map(dependency => `${dependency.prerequisite.planRef}/${dependency.prerequisite.activityId}/${dependency.dependent.planRef}/${dependency.dependent.activityId}/${dependency.strength}`), ctx, ["sharedDependencies"]);
  validateDag(snapshot.plans.flatMap(plan => plan.blueprint.activities.map(activity => ({
    id: `${plan.planRef}/${activity.localId}`,
    dependencies: [
      ...activity.hardDependencies.map(id => `${plan.planRef}/${id}`),
      ...(activity.learningWindow?.strength === "HARD" ? [`${plan.planRef}/${activity.learningWindow.anchorActivityId}`] : []),
      ...snapshot.sharedDependencies.filter(dependency => dependency.strength === "HARD" &&
        dependency.dependent.planRef === plan.planRef && dependency.dependent.activityId === activity.localId)
        .map(dependency => `${dependency.prerequisite.planRef}/${dependency.prerequisite.activityId}`),
    ],
  }))), ctx, ["sharedDependencies"]);
});

const education = {
  research: ResearchProcessingSchema.nullable(), envelope: SchedulingEnvelopeSchema,
  blueprints: BlueprintSnapshotSchema,
  planning: PlanningSupportSchema.optional(),
};
const allocated = { ...education, allocation: z.strictObject({ report: AllocationReportSchema, digest: DigestV2Schema }) };
const reviewed = {
  ...allocated, reviewedAllocationDigest: DigestV2Schema,
  quality: z.array(z.strictObject({ planRef: LocalIdV2Schema, report: QualityReportV2Schema })).min(1).max(E.targets),
  reviewSupport: QualitySupportSchema.optional(),
};

/** Supporting worker data in Attempt.payload; this is not a new lifecycle contract. */
export const CompilerCheckpointSchema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  compilerVersion: z.literal(1),
  binding: CompilerBindingSchema,
  adaptations: z.number().int().min(0).max(1), repairs: z.number().int().min(0).max(1),
  repairIssueIds: z.array(LocalIdV2Schema).max(E.qualityIssues),
  payload: z.discriminatedUnion("stage", [
    z.strictObject({ stage: z.literal("RESEARCH"), research: ResearchProcessingSchema }),
    z.strictObject({ stage: z.literal("PREFLIGHT"), research: ResearchProcessingSchema.nullable(), envelope: SchedulingEnvelopeSchema }),
    z.strictObject({ stage: z.literal("BLUEPRINT"), ...education }),
    z.strictObject({ stage: z.literal("ALLOCATION"), ...allocated }),
    z.strictObject({ stage: z.literal("ADAPTATION"), ...allocated }),
    z.strictObject({ stage: z.literal("REVIEW"), ...reviewed }),
    z.strictObject({ stage: z.literal("REPAIR"), ...reviewed }),
    z.strictObject({ stage: z.literal("VERIFICATION"), ...reviewed }),
  ]),
}).superRefine((checkpoint, ctx) => {
  unique(checkpoint.repairIssueIds, ctx, ["repairIssueIds"]);
  if ((checkpoint.repairs === 0) !== (checkpoint.repairIssueIds.length === 0)) issue(ctx, ["repairIssueIds"], "REPAIR_REQUIRES_NAMED_ISSUES");
  const payload = checkpoint.payload;
  const plans = new Set(checkpoint.binding.targets.map(target => target.planRef));
  if (payload.stage !== "RESEARCH") {
    if (!plans.size || !checkpoint.binding.envelopeDigest || checkpoint.binding.targets.some(target => !target.resolvedIntentVersionId || !target.context)) issue(ctx, ["binding"], "COMPILATION_REQUIRES_RESOLVED_CONTEXT");
    if (payload.envelope.targets.length !== plans.size || payload.envelope.targets.some(target => !plans.has(target.planRef))) issue(ctx, ["payload", "envelope"], "ENVELOPE_TARGET_MISMATCH");
    if (checkpoint.binding.targets.some(target => target.context?.capacityDigest !== payload.envelope.capacityDigest)) issue(ctx, ["payload", "envelope"], "CAPACITY_DIGEST_MISMATCH");
  }
  if ("blueprints" in payload) {
    if (payload.blueprints.plans.length !== plans.size || payload.blueprints.plans.some(plan => !plans.has(plan.planRef))) issue(ctx, ["payload", "blueprints"], "BLUEPRINT_TARGET_MISMATCH");
  }
  if ("planning" in payload && payload.planning) {
    const metadata=payload.planning;
    const expectedEnd=new Date(Date.parse(payload.envelope.window.start)+(metadata.detail.days-1)*86400000).toISOString().slice(0,10);
    if(payload.envelope.window.end!==expectedEnd)issue(ctx,["payload","planning","detail"],"DETAILED_WINDOW_MISMATCH");
    unique((metadata.unreviewedPhaseRefs??[]).map(p=>`${p.planRef}/${p.phaseRef}`),ctx,["payload","planning","unreviewedPhaseRefs"]);
    for(const ref of metadata.unreviewedPhaseRefs??[])if(!payload.blueprints.plans.find(p=>p.planRef===ref.planRef)?.blueprint.strategy.phases.some(p=>p.localId===ref.phaseRef))issue(ctx,["payload","planning","unreviewedPhaseRefs"],"UNKNOWN_HISTORICAL_PHASE");
    if((checkpoint.adaptations===0)!==(metadata.adaptation==="NOT_REQUESTED"))issue(ctx,["payload","planning"],"ADAPTATION_RECEIPT_MISMATCH");
    if(metadata.recoveryAdjustment && (checkpoint.adaptations!==1 || metadata.recoveryAdjustment.percent!==payload.envelope.recoveryPercent))issue(ctx,["payload","planning"],"RECOVERY_ADAPTATION_MISMATCH");
    for(const forecast of metadata.forecasts){const plan=payload.blueprints.plans.find(p=>p.planRef===forecast.planRef);if(!plan||forecast.phases.some(f=>!plan.blueprint.strategy.phases.some(p=>p.localId===f.phaseRef)))issue(ctx,["payload","planning","forecasts"],"UNKNOWN_FORECAST_PHASE");}
    for(const split of metadata.splits){const plan=payload.blueprints.plans.find(p=>p.planRef===split.planRef);if(!plan||split.originalActivity.localId!==split.originalRef||plan.blueprint.activities.some(a=>a.localId===split.originalRef)||split.pieceRefs.some(ref=>!plan.blueprint.activities.some(a=>a.localId===ref)))issue(ctx,["payload","planning","splits"],"UNKNOWN_DECLARED_PIECE");}
  }
  if ("allocation" in payload) {
    const activities = new Map(payload.blueprints.plans.flatMap(plan => plan.blueprint.activities.map(activity => [`${plan.planRef}/${activity.localId}`, activity] as const)));
    const tasks = [...payload.allocation.report.placements, ...payload.allocation.report.unscheduled];
    const taskKeys = new Set(tasks.map(task => `${task.planRef}/${task.activityRef}`));
    tasks.forEach((task, i) => {
      const activity = activities.get(`${task.planRef}/${task.activityRef}`);
      if (!activity || activity.commitment.category !== "COMMITTED" || activity.timeboxMinutes !== task.minutes) issue(ctx, ["payload", "allocation", i], "ALLOCATION_EDUCATIONAL_CONTENT_MISMATCH");
    });
    if ([...activities].some(([key, activity]) => activity.commitment.category === "COMMITTED" && !taskKeys.has(key))) issue(ctx, ["payload", "allocation"], "COMMITTED_ACTIVITY_DROPPED");
    if(payload.allocation.report.placements.some(task=>payload.envelope.protectedExecution.some(pin=>pin.planRef===task.planRef&&pin.activityRef===task.activityRef&&pin.date!==task.date)))issue(ctx,["payload","allocation"],"PROTECTED_PLACEMENT_CHANGED");
    const dates = new Set(payload.envelope.days.map(day => day.date));
    if (payload.allocation.report.placements.some(task => !dates.has(task.date) && !payload.envelope.protectedExecution.some(pin=>
      pin.planRef===task.planRef && pin.activityRef===task.activityRef && pin.state==="COMPLETED" && pin.date===task.date))) issue(ctx, ["payload", "allocation"], "PLACEMENT_OUTSIDE_ENVELOPE");
  }
  if ("quality" in payload) {
    unique(payload.quality.map(value => value.planRef), ctx, ["payload", "quality"]);
    if (payload.quality.length !== plans.size || payload.quality.some(value => !plans.has(value.planRef))) issue(ctx, ["payload", "quality"], "QUALITY_TARGET_MISMATCH");
    if (payload.reviewedAllocationDigest !== payload.allocation.digest) issue(ctx, ["payload", "reviewedAllocationDigest"], "REVIEWED_SCHEDULE_MISMATCH");
    const allFindings = payload.quality.flatMap(value => value.report.issues);
    unique(allFindings.map(finding => finding.issueId), ctx, ["payload", "quality"]);
    if (allFindings.length > E.qualityIssues) issue(ctx, ["payload", "quality"], "ROOT_QUALITY_ISSUE_BOUND");
    const findings = new Set(allFindings.map(finding => finding.issueId));
    if (checkpoint.repairIssueIds.some(id => !findings.has(id))) issue(ctx, ["repairIssueIds"], "UNKNOWN_REPAIR_ISSUE");
    payload.quality.forEach((value, i) => {
      if (payload.stage === "REPAIR" && value.report.status === "PASSED") issue(ctx, ["payload", "quality", i], "REPAIR_REQUIRES_VERIFICATION");
      if (payload.stage === "VERIFICATION" && value.report.status === "PASSED" && value.report.issues.some(finding =>
        checkpoint.repairIssueIds.includes(finding.issueId) && (finding.resolution !== "REPAIRED" || finding.verification?.result !== "RESOLVED"))) {
        issue(ctx, ["payload", "quality", i], "NAMED_REPAIR_NOT_VERIFIED");
      }
    });
    if (payload.reviewSupport) {
      const support = payload.reviewSupport;
      unique(support.findings.map(f => f.finding.issueId), ctx, ["payload", "reviewSupport", "findings"]);
      if (support.findings.some(f => !plans.has(f.planRef) || !payload.quality.find(q => q.planRef === f.planRef)?.report.issues.some(i => i.issueId === f.finding.issueId))) issue(ctx, ["payload", "reviewSupport"], "UNKNOWN_GROUNDED_FINDING");
      const pending = ["REVIEW_PENDING", "REPAIR_PENDING", "REPAIR_ACCEPTED", "REPAIRED", "VERIFICATION_PENDING"].includes(support.phase);
      if (pending && payload.quality.some(q => q.report.status === "PASSED")) issue(ctx, ["payload", "reviewSupport"], "PENDING_QUALITY_CANNOT_PASS");
      if (support.phase.startsWith("REPAIR") && payload.stage !== "REPAIR" || support.phase.startsWith("VERIF") && payload.stage !== "VERIFICATION" || support.phase.startsWith("REVIEW") && payload.stage !== "REVIEW") issue(ctx, ["payload", "reviewSupport"], "QUALITY_STAGE_RECEIPT_MISMATCH");
    }
  }
  if (payload.stage === "ADAPTATION" && checkpoint.adaptations !== 1) issue(ctx, ["adaptations"], "ADAPTATION_COUNT_MISMATCH");
  if ((payload.stage === "REPAIR" || payload.stage === "VERIFICATION") && checkpoint.repairs !== 1) issue(ctx, ["repairs"], "REPAIR_COUNT_MISMATCH");
}));

export type CompilerBinding = z.infer<typeof CompilerBindingSchema>;
export type CompilerCheckpoint = z.infer<typeof CompilerCheckpointSchema>;
