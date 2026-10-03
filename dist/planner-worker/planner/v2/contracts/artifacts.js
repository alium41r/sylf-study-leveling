"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JointLearningBlueprintV2Schema = exports.PlanChangeSetV2Schema = exports.PlannerRevisionV2Schema = exports.ContextDependenciesV2Schema = exports.QualityReportV2Schema = exports.QualityIssueV2Schema = void 0;
exports.validateChangeSetCorrespondenceV2 = validateChangeSetCorrespondenceV2;
const zod_1 = require("zod");
const blueprint_1 = require("./blueprint");
const envelope_1 = require("./envelope");
const execution_1 = require("./execution");
const operations_1 = require("./operations");
const primitives_1 = require("./primitives");
exports.QualityIssueV2Schema = zod_1.z.strictObject({
    issueId: primitives_1.LocalIdV2Schema,
    category: zod_1.z.enum(["STRUCTURAL", "PEDAGOGICAL", "UNREALISTIC_WORKLOAD", "MISSING_PREREQUISITE", "WEAK_CRITERION", "ADVISORY", "UNRESOLVED_UNCERTAINTY"]),
    severity: zod_1.z.enum(["BLOCKING", "WARNING", "ADVISORY"]),
    affectedRefs: zod_1.z.array(primitives_1.LocalIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities),
    evidence: primitives_1.SummaryV2Schema,
    consequence: primitives_1.SummaryV2Schema,
    resolution: zod_1.z.enum(["OPEN", "REPAIRED", "ACKNOWLEDGED", "ACCEPTED_UNCERTAINTY"]),
    verification: zod_1.z.strictObject({
        result: zod_1.z.enum(["RESOLVED", "UNRESOLVED"]),
        verifiedAt: primitives_1.InstantV2Schema,
        explanation: primitives_1.SummaryV2Schema,
    }).nullable(),
}).superRefine((finding, ctx) => {
    if (finding.resolution === "REPAIRED" && finding.verification?.result !== "RESOLVED") {
        (0, primitives_1.issue)(ctx, ["verification"], "Attempted repair is not a verified resolution");
    }
    if (finding.resolution === "ACCEPTED_UNCERTAINTY" && finding.category !== "UNRESOLVED_UNCERTAINTY") {
        (0, primitives_1.issue)(ctx, ["resolution"], "Hard violations cannot be accepted as uncertainty");
    }
    if (finding.severity === "BLOCKING" && finding.resolution === "ACKNOWLEDGED") {
        (0, primitives_1.issue)(ctx, ["resolution"], "Acknowledgment cannot clear a blocker");
    }
    if (finding.severity === "BLOCKING" && finding.resolution === "ACCEPTED_UNCERTAINTY")
        (0, primitives_1.issue)(ctx, ["resolution"], "A severe concrete blocker requires verified repair");
});
exports.QualityReportV2Schema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    reportId: primitives_1.DurableIdV2Schema,
    status: zod_1.z.enum(["PASSED", "BLOCKED", "INCOMPLETE"]),
    evidenceDigest: primitives_1.DigestV2Schema,
    educationalContentDigest: primitives_1.DigestV2Schema,
    issues: zod_1.z.array(exports.QualityIssueV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.qualityIssues),
    requiredAcknowledgements: zod_1.z.array(primitives_1.LocalIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.qualityIssues),
}).superRefine((report, ctx) => {
    (0, primitives_1.unique)(report.issues.map(finding => finding.issueId), ctx, ["issues"]);
    (0, primitives_1.unique)(report.requiredAcknowledgements, ctx, ["requiredAcknowledgements"]);
    const findings = new Map(report.issues.map(finding => [finding.issueId, finding]));
    if (report.status === "PASSED" && report.issues.some(finding => finding.severity === "BLOCKING" &&
        finding.resolution !== "REPAIRED" && finding.resolution !== "ACCEPTED_UNCERTAINTY")) {
        (0, primitives_1.issue)(ctx, ["status"], "Unresolved blockers cannot pass quality");
    }
    report.requiredAcknowledgements.forEach((id, i) => {
        if (!findings.has(id) || findings.get(id)?.severity !== "WARNING")
            (0, primitives_1.issue)(ctx, ["requiredAcknowledgements", i], "Only identified warnings can require acknowledgment");
    });
}));
exports.ContextDependenciesV2Schema = zod_1.z.strictObject({
    intentDigest: primitives_1.DigestV2Schema,
    capacityDigest: primitives_1.DigestV2Schema,
    evidence: zod_1.z.array(zod_1.z.strictObject({ ref: primitives_1.LocalIdV2Schema, digest: primitives_1.DigestV2Schema })).max(envelope_1.PLANNER_V2_ENVELOPE.evidenceRecords),
    quests: zod_1.z.array(zod_1.z.strictObject({ questId: primitives_1.EntityIdV2Schema, contentDigest: primitives_1.DigestV2Schema, executionVersion: zod_1.z.number().int().nonnegative() })).max(envelope_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * envelope_1.PLANNER_V2_ENVELOPE.targets),
    planBases: zod_1.z.array(zod_1.z.strictObject({ planId: primitives_1.DurableIdV2Schema, revisionId: primitives_1.DurableIdV2Schema.nullable(), planningVersion: zod_1.z.number().int().nonnegative() })).max(envelope_1.PLANNER_V2_ENVELOPE.targets),
    externalActivityDependencies: zod_1.z.array(zod_1.z.strictObject({
        dependentActivityRef: primitives_1.LocalIdV2Schema, activityKey: primitives_1.DurableIdV2Schema, planId: primitives_1.DurableIdV2Schema,
        contentDigest: primitives_1.DigestV2Schema, strength: zod_1.z.enum(["HARD", "ADVISORY"]), reason: primitives_1.SummaryV2Schema,
    })).max(envelope_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * envelope_1.PLANNER_V2_ENVELOPE.targets),
}).superRefine((context, ctx) => {
    (0, primitives_1.unique)(context.evidence.map(value => value.ref), ctx, ["evidence"]);
    (0, primitives_1.unique)(context.quests.map(value => String(value.questId)), ctx, ["quests"]);
    (0, primitives_1.unique)(context.planBases.map(value => value.planId), ctx, ["planBases"]);
    (0, primitives_1.unique)(context.externalActivityDependencies.map(value => `${value.dependentActivityRef}/${value.activityKey}`), ctx, ["externalActivityDependencies"]);
});
exports.PlannerRevisionV2Schema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    revisionId: primitives_1.DurableIdV2Schema,
    planId: primitives_1.DurableIdV2Schema,
    ownerId: primitives_1.EntityIdV2Schema,
    attemptId: primitives_1.DurableIdV2Schema,
    requestedIntentVersionId: primitives_1.DurableIdV2Schema,
    resolvedIntentVersionId: primitives_1.DurableIdV2Schema,
    baseActiveRevisionId: primitives_1.DurableIdV2Schema.nullable(),
    sealedAt: primitives_1.InstantV2Schema,
    digest: primitives_1.DigestV2Schema,
    blueprint: blueprint_1.LearningBlueprintV2Schema,
    executable: zod_1.z.array(execution_1.ExecutionTaskSpecV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan),
    context: exports.ContextDependenciesV2Schema,
    quality: exports.QualityReportV2Schema,
    forecast: zod_1.z.array(zod_1.z.strictObject({ phaseRef: primitives_1.LocalIdV2Schema, effort: primitives_1.EffortRangeV2Schema, expectedFinishDate: primitives_1.DateV2Schema.optional() })).max(envelope_1.PLANNER_V2_ENVELOPE.milestones),
}).superRefine((revision, ctx) => {
    (0, primitives_1.unique)(revision.executable.map(spec => spec.activityKey), ctx, ["executable"]);
    (0, primitives_1.unique)(revision.executable.map(spec => spec.blueprintActivityId), ctx, ["executable"]);
    if (revision.executable.some(spec => spec.planId !== revision.planId))
        (0, primitives_1.issue)(ctx, ["executable"], "Every executable activity has one owning Plan");
    if (revision.quality.status !== "PASSED")
        (0, primitives_1.issue)(ctx, ["quality"], "Only cleared proposals can become sealed revisions");
    const phases = new Set(revision.blueprint.strategy.phases.map(phase => phase.localId));
    if (revision.forecast.some(value => !phases.has(value.phaseRef)))
        (0, primitives_1.issue)(ctx, ["forecast"], "UNKNOWN_FORECAST_PHASE");
    const activities = new Map(revision.blueprint.activities.map(activity => [activity.localId, activity]));
    const materialized = new Set(revision.executable.map(spec => spec.blueprintActivityId));
    revision.executable.forEach((spec, i) => {
        const activity = activities.get(spec.blueprintActivityId);
        if (!activity || activity.commitment.category !== "COMMITTED") {
            (0, primitives_1.issue)(ctx, ["executable", i], "Only committed blueprint activities can materialize");
            return;
        }
        if (spec.content.title !== activity.title || spec.content.instructions !== activity.instructions ||
            spec.content.completionCriterion !== activity.completionCriterion || spec.content.purpose !== activity.purpose ||
            spec.content.activityType !== activity.activityType || spec.content.stage !== activity.stage || spec.effort.plannedMinutes !== activity.timeboxMinutes ||
            JSON.stringify([...spec.content.scopeRefs].sort()) !== JSON.stringify([...activity.scopeRefs].sort()) ||
            JSON.stringify([...spec.content.outcomeRefs].sort()) !== JSON.stringify([...activity.outcomeRefs].sort()))
            (0, primitives_1.issue)(ctx, ["executable", i], "Execution must retain the approved educational specification");
        if (JSON.stringify(spec.content.resources.map(resource => resource.ref).sort()) !== JSON.stringify([...(activity.resourceRefs ?? [])].sort()))
            (0, primitives_1.issue)(ctx, ["executable", i], "Resource references cannot drift during compilation");
        const keys = new Map(revision.executable.map(task => [task.blueprintActivityId, task.activityKey]));
        const external = revision.context.externalActivityDependencies.filter(dependency => dependency.dependentActivityRef === activity.localId && dependency.strength === "HARD").map(dependency => dependency.activityKey);
        if (JSON.stringify([...spec.content.hardDependencies].sort()) !== JSON.stringify([...new Set([...activity.hardDependencies.map(ref => keys.get(ref) ?? ref), ...external])].sort()))
            (0, primitives_1.issue)(ctx, ["executable", i], "Hard dependencies must resolve to owned execution keys");
    });
    if (revision.blueprint.activities.some(activity => activity.commitment.category === "COMMITTED" && !materialized.has(activity.localId)))
        (0, primitives_1.issue)(ctx, ["executable"], "Every committed activity must materialize in the detailed segment");
    if ((0, envelope_1.plannerSerializedBytes)(revision.executable) > (0, envelope_1.plannerSerializedBytes)(revision.blueprint) + envelope_1.PLANNER_V2_ENVELOPE.executionOverheadBytes)
        (0, primitives_1.issue)(ctx, ["executable"], "EXECUTION_ASSEMBLY_OVERHEAD_EXCEEDED");
    const metadata = Object.fromEntries(Object.entries(revision).filter(([key]) => key !== "blueprint" && key !== "executable"));
    if ((0, envelope_1.plannerSerializedBytes)(metadata) > envelope_1.PLANNER_V2_ENVELOPE.revisionMetadataBytes)
        (0, primitives_1.issue)(ctx, [], "REVISION_METADATA_BUDGET_EXCEEDED");
}));
exports.PlanChangeSetV2Schema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    changeSetId: primitives_1.DurableIdV2Schema,
    attemptId: primitives_1.DurableIdV2Schema,
    requestDigest: primitives_1.DigestV2Schema,
    targets: zod_1.z.array(zod_1.z.strictObject({
        planId: primitives_1.DurableIdV2Schema,
        requestedIntentVersionId: primitives_1.DurableIdV2Schema,
        resolvedIntentVersionId: primitives_1.DurableIdV2Schema,
        baseActiveRevisionId: primitives_1.DurableIdV2Schema.nullable(),
        planningVersion: zod_1.z.number().int().nonnegative(),
        resolvedPlanningVersion: zod_1.z.number().int().nonnegative(),
        revisionId: primitives_1.DurableIdV2Schema,
        revisionDigest: primitives_1.DigestV2Schema,
    })).min(1).max(envelope_1.PLANNER_V2_ENVELOPE.targets),
    entries: zod_1.z.array(execution_1.SealedSemanticDiffEntryV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * envelope_1.PLANNER_V2_ENVELOPE.targets),
    aggregate: zod_1.z.strictObject({
        maximumCapacityMinutes: zod_1.z.number().int().nonnegative(),
        availableForTargetsMinutes: zod_1.z.number().int().nonnegative(),
        committedTargetMinutes: zod_1.z.number().int().nonnegative(),
        recommendedEffort: primitives_1.EffortRangeV2Schema,
        feasible: zod_1.z.boolean(),
        requiresReestimate: zod_1.z.boolean(),
        compromises: zod_1.z.array(primitives_1.SummaryV2Schema).max(20),
    }),
    quality: exports.QualityReportV2Schema,
    applyReceipt: operations_1.ApplyReceiptV2Schema.nullable(),
}).superRefine((changeSet, ctx) => {
    (0, primitives_1.unique)(changeSet.targets.map(target => target.planId), ctx, ["targets"]);
    (0, primitives_1.unique)(changeSet.targets.map(target => target.revisionId), ctx, ["targets"]);
    (0, primitives_1.unique)(changeSet.entries.map(entry => entry.activityKey), ctx, ["entries"]);
    const plans = new Set(changeSet.targets.map(target => target.planId));
    changeSet.entries.forEach((entry, i) => {
        if (!plans.has(entry.planId))
            (0, primitives_1.issue)(ctx, ["entries", i], "An unselected Plan cannot be modified");
    });
    if (changeSet.entries.filter(entry => entry.changes.includes("ADDED")).length > envelope_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities) {
        (0, primitives_1.issue)(ctx, ["entries"], "NEWLY_MATERIALIZED_ACTIVITY_BOUND");
    }
    if (changeSet.aggregate.availableForTargetsMinutes > changeSet.aggregate.maximumCapacityMinutes)
        (0, primitives_1.issue)(ctx, ["aggregate"], "Available capacity cannot exceed maximum capacity");
    if (!changeSet.aggregate.feasible || changeSet.aggregate.requiresReestimate || changeSet.aggregate.committedTargetMinutes > changeSet.aggregate.availableForTargetsMinutes) {
        (0, primitives_1.issue)(ctx, ["aggregate"], "An applicable change set must be feasible");
    }
    if (changeSet.quality.status !== "PASSED")
        (0, primitives_1.issue)(ctx, ["quality"], "Applicable change sets require cleared quality");
    if (changeSet.applyReceipt) {
        const targets = new Map(changeSet.targets.map(target => [target.planId, target]));
        if (changeSet.applyReceipt.changeSetId !== changeSet.changeSetId || changeSet.applyReceipt.targets.length !== targets.size ||
            changeSet.applyReceipt.targets.some(receipt => {
                const target = targets.get(receipt.planId);
                return !target || target.revisionId !== receipt.revisionId || target.revisionDigest !== receipt.revisionDigest;
            }))
            (0, primitives_1.issue)(ctx, ["applyReceipt"], "Receipt must apply the exact whole change set");
    }
}));
const sharedDependency = zod_1.z.strictObject({
    prerequisite: zod_1.z.strictObject({ planRef: primitives_1.LocalIdV2Schema, activityId: primitives_1.LocalIdV2Schema }),
    dependent: zod_1.z.strictObject({ planRef: primitives_1.LocalIdV2Schema, activityId: primitives_1.LocalIdV2Schema }),
    strength: zod_1.z.enum(["HARD", "ADVISORY"]),
    reason: primitives_1.SummaryV2Schema,
});
exports.JointLearningBlueprintV2Schema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    plans: zod_1.z.array(zod_1.z.strictObject({ planRef: primitives_1.LocalIdV2Schema, blueprint: blueprint_1.ModelLearningBlueprintV2Schema })).length(envelope_1.PLANNER_V2_ENVELOPE.targets),
    sharedDependencies: zod_1.z.array(sharedDependency).max(envelope_1.PLANNER_V2_ENVELOPE.referencesPerActivity),
    tradeOffExplanation: primitives_1.SummaryV2Schema,
}).superRefine((joint, ctx) => {
    (0, primitives_1.unique)(joint.plans.map(plan => plan.planRef), ctx, ["plans"]);
    if (joint.plans.reduce((total, plan) => total + plan.blueprint.activities.length, 0) > envelope_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities)
        (0, primitives_1.issue)(ctx, ["plans"], "The model activity bound is shared across joint targets");
    const activityKeys = new Set(joint.plans.flatMap(plan => plan.blueprint.activities.map(activity => `${plan.planRef}/${activity.localId}`)));
    joint.sharedDependencies.forEach((dependency, i) => {
        for (const endpoint of [dependency.prerequisite, dependency.dependent]) {
            if (!activityKeys.has(`${endpoint.planRef}/${endpoint.activityId}`))
                (0, primitives_1.issue)(ctx, ["sharedDependencies", i], "UNKNOWN_SHARED_ACTIVITY");
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
    (0, primitives_1.validateDag)(nodes, ctx, ["sharedDependencies"]);
}));
/** Shape validation is followed by this correspondence check against owned, digest-verified loads. */
function validateChangeSetCorrespondenceV2(changeSet, attempt, revisions) {
    const errors = [];
    if (attempt.kind === "RESEARCH_ADVICE" || attempt.state !== "SUCCEEDED" || attempt.result?.kind !== "REVISIONS")
        errors.push("ATTEMPT_HAS_NO_APPLICABLE_PLAN_RESULT");
    if (changeSet.attemptId !== attempt.attemptId || changeSet.requestDigest !== attempt.requestHash)
        errors.push("CHANGE_SET_ATTEMPT_REQUEST_MISMATCH");
    if (changeSet.targets.length !== attempt.targets.length || revisions.length !== changeSet.targets.length)
        errors.push("CHANGE_SET_TARGET_CARDINALITY_MISMATCH");
    for (const target of changeSet.targets) {
        const accepted = attempt.targets.find(value => value.planId === target.planId);
        const revision = revisions.find(value => value.planId === target.planId);
        const published = attempt.result?.kind === "REVISIONS" ? attempt.result.revisions.find(value => value.planId === target.planId) : null;
        if (!accepted || accepted.requestedIntentVersionId !== target.requestedIntentVersionId || accepted.resolvedIntentVersionId !== target.resolvedIntentVersionId ||
            accepted.baseActiveRevisionId !== target.baseActiveRevisionId || accepted.planningVersion !== target.planningVersion || accepted.resolvedPlanningVersion !== target.resolvedPlanningVersion)
            errors.push(`CHANGE_SET_TARGET_MISMATCH:${target.planId}`);
        if (!revision || revision.ownerId !== attempt.ownerId || revision.attemptId !== attempt.attemptId || revision.revisionId !== target.revisionId || revision.digest !== target.revisionDigest ||
            revision.requestedIntentVersionId !== target.requestedIntentVersionId || revision.resolvedIntentVersionId !== target.resolvedIntentVersionId || revision.baseActiveRevisionId !== target.baseActiveRevisionId ||
            !published || published.revisionId !== revision.revisionId || published.digest !== revision.digest)
            errors.push(`CHANGE_SET_REVISION_MISMATCH:${target.planId}`);
        const base = revision?.context.planBases.find(value => value.planId === target.planId);
        if (!base || base.revisionId !== target.baseActiveRevisionId || base.planningVersion !== target.resolvedPlanningVersion)
            errors.push(`CHANGE_SET_CONTEXT_BASE_MISMATCH:${target.planId}`);
    }
    if (JSON.stringify(attempt.applyReceipt) !== JSON.stringify(changeSet.applyReceipt))
        errors.push("CHANGE_SET_APPLY_RECEIPT_MISMATCH");
    return [...new Set(errors)];
}
