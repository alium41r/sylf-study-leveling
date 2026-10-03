"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompilerCheckpointSchema = exports.BlueprintSnapshotSchema = exports.CompilerBindingSchema = void 0;
const zod_1 = require("zod");
const artifacts_1 = require("../../contracts/artifacts");
const blueprint_1 = require("../../contracts/blueprint");
const envelope_1 = require("../../contracts/envelope");
const operations_1 = require("../../contracts/operations");
const primitives_1 = require("../../contracts/primitives");
const research_1 = require("./research");
const scheduling_1 = require("./scheduling");
exports.CompilerBindingSchema = zod_1.z.strictObject({
    attemptId: primitives_1.DurableIdV2Schema, ownerId: primitives_1.EntityIdV2Schema, requestHash: primitives_1.DigestV2Schema,
    rootRequestId: primitives_1.DurableIdV2Schema, targetAuthorizationDigest: primitives_1.DigestV2Schema,
    targets: zod_1.z.array(operations_1.AttemptTargetV2Schema.safeExtend({
        planRef: primitives_1.LocalIdV2Schema, requestedIntentDigest: primitives_1.DigestV2Schema,
        resolvedIntentDigest: primitives_1.DigestV2Schema.nullable(), qualityEvidenceDigest: primitives_1.DigestV2Schema.nullable(),
        context: artifacts_1.ContextDependenciesV2Schema.nullable(),
    })).max(envelope_1.PLANNER_V2_ENVELOPE.targets),
    sourceDigests: zod_1.z.array(zod_1.z.strictObject({ sourceId: primitives_1.LocalIdV2Schema, contentHash: primitives_1.DigestV2Schema })).max(envelope_1.PLANNER_V2_ENVELOPE.sources),
    envelopeDigest: primitives_1.DigestV2Schema.nullable(),
}).superRefine((binding, ctx) => {
    (0, primitives_1.unique)(binding.targets.map(target => target.planId), ctx, ["targets"]);
    (0, primitives_1.unique)(binding.targets.map(target => target.planRef), ctx, ["targets"]);
    (0, primitives_1.unique)(binding.sourceDigests.map(source => source.sourceId), ctx, ["sourceDigests"]);
    binding.targets.forEach((target, i) => {
        if ((target.resolvedIntentVersionId === null) !== (target.resolvedIntentDigest === null) ||
            (target.resolvedIntentVersionId === null) !== (target.qualityEvidenceDigest === null))
            (0, primitives_1.issue)(ctx, ["targets", i], "RESOLVED_INTENT_DIGEST_REQUIRED");
        if ((target.contextDigest === null) !== (target.context === null))
            (0, primitives_1.issue)(ctx, ["targets", i], "CONTEXT_SNAPSHOT_REQUIRED");
        if (target.context && target.context.intentDigest !== target.resolvedIntentDigest)
            (0, primitives_1.issue)(ctx, ["targets", i, "context"], "CONTEXT_INTENT_MISMATCH");
        if (target.resolution === "UNCHANGED" && target.resolvedIntentDigest !== target.requestedIntentDigest)
            (0, primitives_1.issue)(ctx, ["targets", i], "UNCHANGED_INTENT_DIGEST_MISMATCH");
    });
});
const endpoint = zod_1.z.strictObject({ planRef: primitives_1.LocalIdV2Schema, activityId: primitives_1.LocalIdV2Schema });
exports.BlueprintSnapshotSchema = zod_1.z.strictObject({
    plans: zod_1.z.array(zod_1.z.strictObject({ planRef: primitives_1.LocalIdV2Schema, blueprint: blueprint_1.LearningBlueprintV2Schema, digest: primitives_1.DigestV2Schema })).min(1).max(envelope_1.PLANNER_V2_ENVELOPE.targets),
    sharedDependencies: zod_1.z.array(zod_1.z.strictObject({
        prerequisite: endpoint, dependent: endpoint, strength: zod_1.z.enum(["HARD", "ADVISORY"]), reason: primitives_1.SummaryV2Schema,
    })).max(envelope_1.PLANNER_V2_ENVELOPE.referencesPerActivity),
}).superRefine((snapshot, ctx) => {
    (0, primitives_1.unique)(snapshot.plans.map(plan => plan.planRef), ctx, ["plans"]);
    const keys = new Set(snapshot.plans.flatMap(plan => plan.blueprint.activities.map(activity => `${plan.planRef}/${activity.localId}`)));
    snapshot.sharedDependencies.forEach((dependency, i) => {
        if (!keys.has(`${dependency.prerequisite.planRef}/${dependency.prerequisite.activityId}`) ||
            !keys.has(`${dependency.dependent.planRef}/${dependency.dependent.activityId}`))
            (0, primitives_1.issue)(ctx, ["sharedDependencies", i], "UNKNOWN_SHARED_ACTIVITY");
    });
    (0, primitives_1.unique)(snapshot.sharedDependencies.map(dependency => `${dependency.prerequisite.planRef}/${dependency.prerequisite.activityId}/${dependency.dependent.planRef}/${dependency.dependent.activityId}/${dependency.strength}`), ctx, ["sharedDependencies"]);
    (0, primitives_1.validateDag)(snapshot.plans.flatMap(plan => plan.blueprint.activities.map(activity => ({
        id: `${plan.planRef}/${activity.localId}`,
        dependencies: [
            ...activity.hardDependencies.map(id => `${plan.planRef}/${id}`),
            ...snapshot.sharedDependencies.filter(dependency => dependency.strength === "HARD" &&
                dependency.dependent.planRef === plan.planRef && dependency.dependent.activityId === activity.localId)
                .map(dependency => `${dependency.prerequisite.planRef}/${dependency.prerequisite.activityId}`),
        ],
    }))), ctx, ["sharedDependencies"]);
});
const education = {
    research: research_1.ResearchProcessingSchema.nullable(), envelope: scheduling_1.SchedulingEnvelopeSchema,
    blueprints: exports.BlueprintSnapshotSchema,
};
const allocated = { ...education, allocation: zod_1.z.strictObject({ report: scheduling_1.AllocationReportSchema, digest: primitives_1.DigestV2Schema }) };
const reviewed = {
    ...allocated, reviewedAllocationDigest: primitives_1.DigestV2Schema,
    quality: zod_1.z.array(zod_1.z.strictObject({ planRef: primitives_1.LocalIdV2Schema, report: artifacts_1.QualityReportV2Schema })).min(1).max(envelope_1.PLANNER_V2_ENVELOPE.targets),
};
/** Supporting worker data in Attempt.payload; this is not a new lifecycle contract. */
exports.CompilerCheckpointSchema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    compilerVersion: zod_1.z.literal(1),
    binding: exports.CompilerBindingSchema,
    adaptations: zod_1.z.number().int().min(0).max(1), repairs: zod_1.z.number().int().min(0).max(1),
    repairIssueIds: zod_1.z.array(primitives_1.LocalIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.qualityIssues),
    payload: zod_1.z.discriminatedUnion("stage", [
        zod_1.z.strictObject({ stage: zod_1.z.literal("RESEARCH"), research: research_1.ResearchProcessingSchema }),
        zod_1.z.strictObject({ stage: zod_1.z.literal("PREFLIGHT"), research: research_1.ResearchProcessingSchema.nullable(), envelope: scheduling_1.SchedulingEnvelopeSchema }),
        zod_1.z.strictObject({ stage: zod_1.z.literal("BLUEPRINT"), ...education }),
        zod_1.z.strictObject({ stage: zod_1.z.literal("ALLOCATION"), ...allocated }),
        zod_1.z.strictObject({ stage: zod_1.z.literal("ADAPTATION"), ...allocated }),
        zod_1.z.strictObject({ stage: zod_1.z.literal("REVIEW"), ...reviewed }),
        zod_1.z.strictObject({ stage: zod_1.z.literal("REPAIR"), ...reviewed }),
        zod_1.z.strictObject({ stage: zod_1.z.literal("VERIFICATION"), ...reviewed }),
    ]),
}).superRefine((checkpoint, ctx) => {
    (0, primitives_1.unique)(checkpoint.repairIssueIds, ctx, ["repairIssueIds"]);
    if ((checkpoint.repairs === 0) !== (checkpoint.repairIssueIds.length === 0))
        (0, primitives_1.issue)(ctx, ["repairIssueIds"], "REPAIR_REQUIRES_NAMED_ISSUES");
    const payload = checkpoint.payload;
    const plans = new Set(checkpoint.binding.targets.map(target => target.planRef));
    if (payload.stage !== "RESEARCH") {
        if (!plans.size || !checkpoint.binding.envelopeDigest || checkpoint.binding.targets.some(target => !target.resolvedIntentVersionId || !target.context))
            (0, primitives_1.issue)(ctx, ["binding"], "COMPILATION_REQUIRES_RESOLVED_CONTEXT");
        if (payload.envelope.targets.length !== plans.size || payload.envelope.targets.some(target => !plans.has(target.planRef)))
            (0, primitives_1.issue)(ctx, ["payload", "envelope"], "ENVELOPE_TARGET_MISMATCH");
        if (checkpoint.binding.targets.some(target => target.context?.capacityDigest !== payload.envelope.capacityDigest))
            (0, primitives_1.issue)(ctx, ["payload", "envelope"], "CAPACITY_DIGEST_MISMATCH");
    }
    if ("blueprints" in payload) {
        if (payload.blueprints.plans.length !== plans.size || payload.blueprints.plans.some(plan => !plans.has(plan.planRef)))
            (0, primitives_1.issue)(ctx, ["payload", "blueprints"], "BLUEPRINT_TARGET_MISMATCH");
    }
    if ("allocation" in payload) {
        const activities = new Map(payload.blueprints.plans.flatMap(plan => plan.blueprint.activities.map(activity => [`${plan.planRef}/${activity.localId}`, activity])));
        const tasks = [...payload.allocation.report.placements, ...payload.allocation.report.unscheduled];
        const taskKeys = new Set(tasks.map(task => `${task.planRef}/${task.activityRef}`));
        tasks.forEach((task, i) => {
            const activity = activities.get(`${task.planRef}/${task.activityRef}`);
            if (!activity || activity.commitment.category !== "COMMITTED" || activity.timeboxMinutes !== task.minutes)
                (0, primitives_1.issue)(ctx, ["payload", "allocation", i], "ALLOCATION_EDUCATIONAL_CONTENT_MISMATCH");
        });
        if ([...activities].some(([key, activity]) => activity.commitment.category === "COMMITTED" && !taskKeys.has(key)))
            (0, primitives_1.issue)(ctx, ["payload", "allocation"], "COMMITTED_ACTIVITY_DROPPED");
        const dates = new Set(payload.envelope.days.map(day => day.date));
        if (payload.allocation.report.placements.some(task => !dates.has(task.date)))
            (0, primitives_1.issue)(ctx, ["payload", "allocation"], "PLACEMENT_OUTSIDE_ENVELOPE");
    }
    if ("quality" in payload) {
        (0, primitives_1.unique)(payload.quality.map(value => value.planRef), ctx, ["payload", "quality"]);
        if (payload.quality.length !== plans.size || payload.quality.some(value => !plans.has(value.planRef)))
            (0, primitives_1.issue)(ctx, ["payload", "quality"], "QUALITY_TARGET_MISMATCH");
        if (payload.reviewedAllocationDigest !== payload.allocation.digest)
            (0, primitives_1.issue)(ctx, ["payload", "reviewedAllocationDigest"], "REVIEWED_SCHEDULE_MISMATCH");
        const allFindings = payload.quality.flatMap(value => value.report.issues);
        (0, primitives_1.unique)(allFindings.map(finding => finding.issueId), ctx, ["payload", "quality"]);
        if (allFindings.length > envelope_1.PLANNER_V2_ENVELOPE.qualityIssues)
            (0, primitives_1.issue)(ctx, ["payload", "quality"], "ROOT_QUALITY_ISSUE_BOUND");
        const findings = new Set(allFindings.map(finding => finding.issueId));
        if (checkpoint.repairIssueIds.some(id => !findings.has(id)))
            (0, primitives_1.issue)(ctx, ["repairIssueIds"], "UNKNOWN_REPAIR_ISSUE");
        payload.quality.forEach((value, i) => {
            if (payload.stage === "REPAIR" && value.report.status === "PASSED")
                (0, primitives_1.issue)(ctx, ["payload", "quality", i], "REPAIR_REQUIRES_VERIFICATION");
            if (payload.stage === "VERIFICATION" && value.report.status === "PASSED" && value.report.issues.some(finding => checkpoint.repairIssueIds.includes(finding.issueId) && (finding.resolution !== "REPAIRED" || finding.verification?.result !== "RESOLVED"))) {
                (0, primitives_1.issue)(ctx, ["payload", "quality", i], "NAMED_REPAIR_NOT_VERIFIED");
            }
        });
    }
    if (payload.stage === "ADAPTATION" && checkpoint.adaptations !== 1)
        (0, primitives_1.issue)(ctx, ["adaptations"], "ADAPTATION_COUNT_MISMATCH");
    if ((payload.stage === "REPAIR" || payload.stage === "VERIFICATION") && checkpoint.repairs !== 1)
        (0, primitives_1.issue)(ctx, ["repairs"], "REPAIR_COUNT_MISMATCH");
}));
