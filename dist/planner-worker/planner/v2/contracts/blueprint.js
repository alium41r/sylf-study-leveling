"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LearningBlueprintV2Schema = exports.ModelLearningBlueprintV2Schema = exports.BlueprintActivityV2Schema = void 0;
exports.validateBlueprintReferences = validateBlueprintReferences;
const zod_1 = require("zod");
const envelope_1 = require("./envelope");
const primitives_1 = require("./primitives");
const referenceList = zod_1.z.array(primitives_1.LocalIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.referencesPerActivity);
const activityCommitment = zod_1.z.discriminatedUnion("category", [
    zod_1.z.strictObject({ category: zod_1.z.literal("COMMITTED") }),
    zod_1.z.strictObject({
        category: zod_1.z.literal("CONTINGENT"),
        trigger: zod_1.z.strictObject({ checkpointActivityId: primitives_1.LocalIdV2Schema, condition: primitives_1.SummaryV2Schema }),
    }),
    zod_1.z.strictObject({ category: zod_1.z.literal("OPTIONAL"), reason: primitives_1.SummaryV2Schema }),
]);
exports.BlueprintActivityV2Schema = zod_1.z.strictObject({
    localId: primitives_1.LocalIdV2Schema,
    outcomeRefs: referenceList,
    scopeRefs: referenceList,
    title: primitives_1.TitleV2Schema,
    activityType: zod_1.z.string().trim().min(1).max(80),
    purpose: primitives_1.SummaryV2Schema,
    instructions: primitives_1.ProseV2Schema,
    completionCriterion: primitives_1.CriterionV2Schema,
    effort: primitives_1.EffortRangeV2Schema,
    timeboxMinutes: primitives_1.TimeboxV2Schema,
    commitment: activityCommitment,
    hardDependencies: referenceList,
    advisoryOrderAfter: referenceList.optional(),
    resourceRefs: referenceList.optional(),
    evidenceRefs: referenceList.optional(),
    stage: primitives_1.TitleV2Schema.optional(),
    cognitiveDemand: zod_1.z.enum(["LIGHT", "MODERATE", "HEAVY"]).optional(),
    stoppingCondition: primitives_1.SummaryV2Schema.optional(),
    splitPoints: zod_1.z.array(zod_1.z.strictObject({
        afterMinutes: zod_1.z.number().int().positive(),
        completionCriterion: primitives_1.CriterionV2Schema,
    })).max(12).optional(),
    learningWindow: zod_1.z.strictObject({
        anchorActivityId: primitives_1.LocalIdV2Schema,
        minimumGapDays: zod_1.z.number().int().nonnegative().optional(),
        preferredGapDays: zod_1.z.number().int().nonnegative().optional(),
        maximumGapDays: zod_1.z.number().int().nonnegative().optional(),
        strength: zod_1.z.enum(["HARD", "ADVISORY"]),
        reason: primitives_1.SummaryV2Schema,
    }).optional(),
}).superRefine((activity, ctx) => {
    for (const field of ["outcomeRefs", "scopeRefs", "hardDependencies", "advisoryOrderAfter", "resourceRefs", "evidenceRefs"]) {
        (0, primitives_1.unique)(activity[field] ?? [], ctx, [field]);
    }
    if (activity.hardDependencies.includes(activity.localId))
        (0, primitives_1.issue)(ctx, ["hardDependencies"], "SELF_DEPENDENCY");
    if (activity.splitPoints) {
        (0, primitives_1.unique)(activity.splitPoints.map(point => String(point.afterMinutes)), ctx, ["splitPoints"]);
        if (activity.splitPoints.some(point => point.afterMinutes < envelope_1.PLANNER_V2_ENVELOPE.timeboxMinMinutes ||
            activity.timeboxMinutes - point.afterMinutes < envelope_1.PLANNER_V2_ENVELOPE.timeboxMinMinutes)) {
            (0, primitives_1.issue)(ctx, ["splitPoints"], "Splits must preserve meaningful bounded timeboxes");
        }
    }
    const window = activity.learningWindow;
    if (window) {
        const gaps = [window.minimumGapDays, window.preferredGapDays, window.maximumGapDays].filter((gap) => gap !== undefined);
        if (gaps.length === 0 || gaps.some((gap, i) => i > 0 && gap < gaps[i - 1])) {
            (0, primitives_1.issue)(ctx, ["learningWindow"], "Learning-window gaps must be present and ordered");
        }
    }
});
function blueprintSchema(activityLimit) {
    return (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
        schemaVersion: primitives_1.VersionV2Schema,
        strategy: zod_1.z.strictObject({
            policy: primitives_1.PolicyV2Schema,
            outcome: primitives_1.SummaryV2Schema,
            explanation: primitives_1.ProseV2Schema,
            recommendedEffort: primitives_1.EffortRangeV2Schema,
            phases: zod_1.z.array(zod_1.z.strictObject({
                localId: primitives_1.LocalIdV2Schema,
                title: primitives_1.TitleV2Schema,
                outcome: primitives_1.SummaryV2Schema,
                effort: primitives_1.EffortRangeV2Schema.optional(),
                readinessCriterion: primitives_1.CriterionV2Schema.optional(),
            })).max(envelope_1.PLANNER_V2_ENVELOPE.milestones),
        }),
        scope: zod_1.z.array(zod_1.z.strictObject({
            scopeRef: primitives_1.LocalIdV2Schema,
            disposition: zod_1.z.enum(["INCLUDED", "VERIFY_FIRST", "CREDITED", "DEFERRED", "EXCLUDED"]),
            contribution: primitives_1.SummaryV2Schema,
            reason: primitives_1.SummaryV2Schema.optional(),
            evidenceRefs: referenceList.optional(),
        })).max(envelope_1.PLANNER_V2_ENVELOPE.scopeNodes),
        activities: zod_1.z.array(exports.BlueprintActivityV2Schema).max(activityLimit),
        decisions: zod_1.z.strictObject({
            assumptions: zod_1.z.array(primitives_1.SummaryV2Schema).max(30),
            tradeOffs: zod_1.z.array(primitives_1.SummaryV2Schema).max(20),
            unresolvedUncertainty: zod_1.z.array(primitives_1.SummaryV2Schema).max(20),
            stoppingConditions: zod_1.z.array(primitives_1.SummaryV2Schema).max(20),
        }),
    }).superRefine((blueprint, ctx) => {
        (0, primitives_1.unique)(blueprint.strategy.phases.map(phase => phase.localId), ctx, ["strategy", "phases"]);
        (0, primitives_1.unique)(blueprint.scope.map(scope => scope.scopeRef), ctx, ["scope"]);
        (0, primitives_1.unique)(blueprint.activities.map(activity => activity.localId), ctx, ["activities"]);
        const phases = new Set(blueprint.strategy.phases.map(phase => phase.localId));
        const scopes = new Set(blueprint.scope.map(scope => scope.scopeRef));
        const activities = new Map(blueprint.activities.map(activity => [activity.localId, activity]));
        blueprint.scope.forEach((scope, i) => {
            if (scope.disposition === "CREDITED" && !scope.evidenceRefs?.length)
                (0, primitives_1.issue)(ctx, ["scope", i, "evidenceRefs"], "Credited scope requires evidence");
            if (["CREDITED", "DEFERRED", "EXCLUDED"].includes(scope.disposition) && !scope.reason) {
                (0, primitives_1.issue)(ctx, ["scope", i, "reason"], "Consequential scope decisions require a reason");
            }
        });
        blueprint.activities.forEach((activity, i) => {
            if (activity.outcomeRefs.some(ref => !phases.has(ref)))
                (0, primitives_1.issue)(ctx, ["activities", i, "outcomeRefs"], "UNKNOWN_OUTCOME");
            if (activity.scopeRefs.some(ref => !scopes.has(ref)))
                (0, primitives_1.issue)(ctx, ["activities", i, "scopeRefs"], "UNKNOWN_SCOPE");
            if (activity.scopeRefs.some(ref => blueprint.scope.find(scope => scope.scopeRef === ref)?.disposition === "EXCLUDED"))
                (0, primitives_1.issue)(ctx, ["activities", i, "scopeRefs"], "EXCLUDED_SCOPE_ACTIVITY");
            if (activity.learningWindow?.anchorActivityId === activity.localId)
                (0, primitives_1.issue)(ctx, ["activities", i, "learningWindow"], "SELF_LEARNING_WINDOW");
            if (activity.commitment.category === "CONTINGENT") {
                const checkpoint = activities.get(activity.commitment.trigger.checkpointActivityId);
                if (!checkpoint || checkpoint.commitment.category !== "COMMITTED") {
                    (0, primitives_1.issue)(ctx, ["activities", i, "commitment", "trigger"], "A contingency requires a committed checkpoint");
                }
            }
            if (activity.commitment.category === "COMMITTED" && activity.hardDependencies.some(ref => {
                const dependency = activities.get(ref);
                return dependency && dependency.commitment.category !== "COMMITTED";
            }))
                (0, primitives_1.issue)(ctx, ["activities", i, "hardDependencies"], "Committed work cannot depend on unscheduled optional or contingent work");
        });
        (0, primitives_1.validateDag)(blueprint.activities.map(activity => ({ id: activity.localId, dependencies: activity.hardDependencies })), ctx, ["activities"]);
    }), envelope_1.PLANNER_V2_ENVELOPE.blueprintBytes);
}
/** One shape; bounded model deltas differ from server-assembled stored blueprints only in count. */
exports.ModelLearningBlueprintV2Schema = blueprintSchema(envelope_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities);
exports.LearningBlueprintV2Schema = blueprintSchema(envelope_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan);
/** Run after shape validation with the caller's owned, pinned allowlist. */
function validateBlueprintReferences(blueprint, allowed) {
    const errors = [];
    const suppliedScope = new Set(blueprint.scope.map(scope => scope.scopeRef));
    for (const ref of allowed.scopeRefs)
        if (!suppliedScope.has(ref))
            errors.push(`MISSING_SCOPE:${ref}`);
    for (const ref of suppliedScope)
        if (!allowed.scopeRefs.includes(ref))
            errors.push(`UNKNOWN_SCOPE:${ref}`);
    for (const ref of allowed.excludedScopeRefs ?? []) {
        if (blueprint.scope.find(scope => scope.scopeRef === ref)?.disposition !== "EXCLUDED")
            errors.push(`EXPLICIT_EXCLUSION_CHANGED:${ref}`);
        if (blueprint.activities.some(activity => activity.scopeRefs.includes(ref)))
            errors.push(`EXCLUDED_SCOPE_ACTIVITY:${ref}`);
    }
    const activities = new Set([...blueprint.activities.map(activity => activity.localId), ...(allowed.externalActivityRefs ?? [])]);
    for (const scope of blueprint.scope)
        for (const ref of scope.evidenceRefs ?? []) {
            if (!allowed.evidenceRefs.includes(ref))
                errors.push(`UNKNOWN_EVIDENCE:${ref}`);
        }
    for (const activity of blueprint.activities) {
        for (const ref of [...activity.hardDependencies, ...(activity.advisoryOrderAfter ?? []), ...(activity.learningWindow ? [activity.learningWindow.anchorActivityId] : [])]) {
            if (!activities.has(ref))
                errors.push(`UNKNOWN_ACTIVITY:${ref}`);
        }
        for (const ref of activity.evidenceRefs ?? [])
            if (!allowed.evidenceRefs.includes(ref))
                errors.push(`UNKNOWN_EVIDENCE:${ref}`);
        for (const ref of activity.resourceRefs ?? [])
            if (!allowed.resourceRefs.includes(ref))
                errors.push(`UNKNOWN_RESOURCE:${ref}`);
    }
    return [...new Set(errors)];
}
