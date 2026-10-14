"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TargetedRepairSchema = void 0;
exports.targetedRepairResponseContract = targetedRepairResponseContract;
const zod_1 = require("zod");
const contracts_1 = require("../../contracts");
const checkpoint_1 = require("./checkpoint");
const blueprint_response_1 = require("./blueprint-response");
/** Supporting transport only. These are educational objects, never JSON paths,
 * execution commands, persistent identities or a second planning artifact. */
const base = { planRef: contracts_1.LocalIdV2Schema, issueIds: zod_1.z.array(contracts_1.LocalIdV2Schema).min(1).max(contracts_1.PLANNER_V2_ENVELOPE.qualityIssues), reason: contracts_1.SummaryV2Schema };
const shape = contracts_1.ModelLearningBlueprintV2Schema.shape;
const strategy = zod_1.z.strictObject({ outcome: shape.strategy.shape.outcome, explanation: shape.strategy.shape.explanation, recommendedEffort: blueprint_response_1.CompactEffortSchema });
const edge = checkpoint_1.BlueprintSnapshotSchema.shape.sharedDependencies.element;
exports.TargetedRepairSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.strictObject({
    corrections: zod_1.z.array(zod_1.z.discriminatedUnion("kind", [
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("ACTIVITY_REPLACE"), activity: blueprint_response_1.CompactActivitySchema }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("ACTIVITY_ADD"), activity: blueprint_response_1.CompactActivitySchema }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("ACTIVITY_REMOVE"), activityRef: contracts_1.LocalIdV2Schema }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("PHASE_REPLACE"), phase: blueprint_response_1.CompactPhaseSchema }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("PHASE_ADD"), phase: blueprint_response_1.CompactPhaseSchema }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("PHASE_REMOVE"), phaseRef: contracts_1.LocalIdV2Schema }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("SCOPE_REPLACE"), scope: shape.scope.element }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("STRATEGY_REPLACE"), strategy }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("DECISIONS_REPLACE"), decisions: shape.decisions }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("CHECKPOINT_REPLACE"), checkpoint: contracts_1.SummaryV2Schema }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("TRADE_OFF_REPLACE"), tradeOffExplanation: contracts_1.SummaryV2Schema }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("SHARED_DEPENDENCY_ADD"), edge }),
        zod_1.z.strictObject({ ...base, kind: zod_1.z.literal("SHARED_DEPENDENCY_REMOVE"), edge }),
    ])).min(1).max(contracts_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities),
}), 32 * 1024);
function targetedRepairResponseContract() {
    const fields = (object) => ({ required: Object.entries(object.shape).filter(([, s]) => !s.isOptional()).map(([n]) => n), optional: Object.entries(object.shape).filter(([, s]) => s.isOptional()).map(([n]) => n) });
    return {
        root: { corrections: "1..60 explicit corrections; omit untouched objects" },
        correctionKinds: exports.TargetedRepairSchema.shape.corrections.element.options.map(o => ({ kind: o.shape.kind.value, ...fields(o) })),
        objects: { activity: fields(blueprint_response_1.CompactActivitySchema), phase: fields(blueprint_response_1.CompactPhaseSchema), strategy: fields(strategy), scope: fields(shape.scope.element), decisions: fields(shape.decisions), edge: fields(edge), endpoint: fields(edge.shape.prerequisite),
            commitment: blueprint_response_1.CompactActivitySchema.shape.commitment.options.map(o => ({ category: o.shape.category.value, ...fields(o) })),
            trigger: fields(blueprint_response_1.CompactActivitySchema.shape.commitment.options[1].shape.trigger), learningWindow: fields(blueprint_response_1.CompactActivitySchema.shape.learningWindow.unwrap()), splitPoint: fields(blueprint_response_1.CompactActivitySchema.shape.splitPoints.unwrap().element) },
        effort: "[low,likely,high] nonnegative integers, low<=likely<=high; required activity/strategy, optional phase",
        values: { disposition: shape.scope.element.shape.disposition.options, strength: edge.shape.strength.options, cognitiveDemand: blueprint_response_1.CompactActivitySchema.shape.cognitiveDemand.unwrap().options },
        limits: { bytes: 32 * 1024, corrections: contracts_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities, newActivitiesAcrossPlans: contracts_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities, references: contracts_1.PLANNER_V2_ENVELOPE.referencesPerActivity, timebox: [contracts_1.PLANNER_V2_ENVELOPE.timeboxMinMinutes, contracts_1.PLANNER_V2_ENVELOPE.timeboxMaxMinutes], title: contracts_1.PLANNER_V2_ENVELOPE.titleCharacters, summaryCriterionReason: contracts_1.PLANNER_V2_ENVELOPE.summaryCharacters, instructionsExplanation: contracts_1.PLANNER_V2_ENVELOPE.proseCharacters },
    };
}
