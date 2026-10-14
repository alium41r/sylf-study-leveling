"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompactBlueprintProposalSchema = exports.CompactActivitySchema = exports.CompactPhaseSchema = exports.CompactEffortSchema = void 0;
exports.parseCompactBlueprintResponse = parseCompactBlueprintResponse;
exports.expandCompactEffort = expandCompactEffort;
exports.compactBlueprintResponseContract = compactBlueprintResponseContract;
const zod_1 = require("zod");
const contracts_1 = require("../../contracts");
const checkpoint_1 = require("./checkpoint");
const planning_1 = require("./planning");
/** Ephemeral provider transport, never a stored blueprint or execution contract.
 * Every educational field comes from the canonical shape. Cross-field checks
 * run on the complete canonical artifact, after owned retained work is joined. */
exports.CompactEffortSchema = zod_1.z.tuple([
    contracts_1.EffortRangeV2Schema.shape.lowMinutes,
    contracts_1.EffortRangeV2Schema.shape.likelyMinutes,
    contracts_1.EffortRangeV2Schema.shape.highMinutes,
]);
const blueprint = contracts_1.ModelLearningBlueprintV2Schema.shape;
exports.CompactPhaseSchema = zod_1.z.strictObject({ ...blueprint.strategy.shape.phases.element.shape,
    effort: exports.CompactEffortSchema.optional() });
exports.CompactActivitySchema = zod_1.z.strictObject({ ...blueprint.activities.element.shape, effort: exports.CompactEffortSchema });
const phase = exports.CompactPhaseSchema, activity = exports.CompactActivitySchema;
const strategy = zod_1.z.strictObject({
    outcome: blueprint.strategy.shape.outcome,
    explanation: blueprint.strategy.shape.explanation,
    recommendedEffort: exports.CompactEffortSchema,
    phases: zod_1.z.array(phase).max(contracts_1.PLANNER_V2_ENVELOPE.milestones),
});
const plan = zod_1.z.strictObject({
    planRef: contracts_1.LocalIdV2Schema, strategy, scope: blueprint.scope,
    activities: zod_1.z.array(activity).max(contracts_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities), decisions: blueprint.decisions,
});
exports.CompactBlueprintProposalSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.strictObject({
    detail: planning_1.DetailSchema,
    tradeOffExplanation: contracts_1.SummaryV2Schema,
    plans: zod_1.z.array(plan).min(1).max(contracts_1.PLANNER_V2_ENVELOPE.targets),
    sharedDependencies: checkpoint_1.BlueprintSnapshotSchema.shape.sharedDependencies,
    recoveryAdjustment: planning_1.RecoveryAdjustmentSchema.optional(),
}));
const keep = zod_1.z.strictObject({ decision: zod_1.z.literal("KEEP"), reason: contracts_1.SummaryV2Schema });
/** Select the declared response shape before parsing so malformed replacements
 * retain precise Zod field paths for the existing metered fallback diagnostics. */
function parseCompactBlueprintResponse(value) {
    if (value && typeof value === "object" && "decision" in value && value.decision === "KEEP")
        return keep.parse(value);
    return exports.CompactBlueprintProposalSchema.parse(value);
}
/** No defaults, estimates, prose or reference choices are supplied by assembly. */
function expandCompactEffort([lowMinutes, likelyMinutes, highMinutes]) {
    return { lowMinutes, likelyMinutes, highMinutes };
}
const fields = (object) => ({
    required: Object.entries(object.shape).filter(([, schema]) => !schema.isOptional()).map(([name]) => name),
    optional: Object.entries(object.shape).filter(([, schema]) => schema.isOptional()).map(([name]) => name),
});
const edge = checkpoint_1.BlueprintSnapshotSchema.shape.sharedDependencies.element;
const objects = {
    root: fields(exports.CompactBlueprintProposalSchema), plan: fields(plan), strategy: fields(strategy),
    phase: fields(phase), scope: fields(blueprint.scope.element), activity: fields(activity),
    decisions: fields(blueprint.decisions), detail: fields(planning_1.DetailSchema),
    sharedDependency: fields(edge), endpoint: fields(edge.shape.prerequisite),
    splitPoint: fields(activity.shape.splitPoints.unwrap().element),
    learningWindow: fields(activity.shape.learningWindow.unwrap()),
    commitments: activity.shape.commitment.options.map(option => ({ category: option.shape.category.value, ...fields(option) })),
    trigger: fields(activity.shape.commitment.options[1].shape.trigger),
    recoveryAdjustment: fields(planning_1.RecoveryAdjustmentSchema),
};
/** One schema-derived field inventory; no specimen education or canonical receipts. */
function compactBlueprintResponseContract(selectedPlans, adaptation = false) {
    return {
        instruction: "Return one replacement object using exactly the listed fields. Include required fields; omit unused optional fields. Never use null. All reference lists are arrays. Each selected Plan occurs once and scope covers its entire allowlist. Educational choices are yours.",
        selectedPlans,
        objects: { ...objects, root: { ...objects.root, optional: adaptation ? objects.root.optional : [] } },
        values: {
            effort: "[lowMinutes,likelyMinutes,highMinutes]: three nonnegative integers, low<=likely<=high; required for each activity and recommendedEffort, optional for phases",
            disposition: blueprint.scope.element.shape.disposition.options,
            strength: edge.shape.strength.options,
            cognitiveDemand: activity.shape.cognitiveDemand.unwrap().options,
            detailDays: [14, 28],
        },
        limits: { targets: contracts_1.PLANNER_V2_ENVELOPE.targets, newActivitiesAcrossPlans: contracts_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities,
            scopePerPlan: contracts_1.PLANNER_V2_ENVELOPE.scopeNodes, phasesPerPlan: contracts_1.PLANNER_V2_ENVELOPE.milestones, referencesPerActivity: contracts_1.PLANNER_V2_ENVELOPE.referencesPerActivity,
            timeboxMinutes: [contracts_1.PLANNER_V2_ENVELOPE.timeboxMinMinutes, contracts_1.PLANNER_V2_ENVELOPE.timeboxMaxMinutes], id: "[a-z][a-z0-9_-]*, at most 64 characters",
            title: contracts_1.PLANNER_V2_ENVELOPE.titleCharacters, summaryReasonCriterion: contracts_1.PLANNER_V2_ENVELOPE.summaryCharacters, instructionsExplanation: contracts_1.PLANNER_V2_ENVELOPE.proseCharacters,
            activityType: 80, splitPoints: 12, assumptions: 30, otherDecisionLists: 20 },
        ...(adaptation ? { keep: { decision: "KEEP", reason: "Explain why no valid educational change is needed or possible." },
            recoveryAdjustment: "Only an explicit reduction of the existing soft recovery margin; percent is 0..50, with reason." } : {}),
    };
}
