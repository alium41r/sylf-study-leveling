"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningSupportSchema = exports.RecoveryAdjustmentSchema = exports.DetailSchema = exports.AllocationFactsSchema = void 0;
const zod_1 = require("zod");
const contracts_1 = require("../../contracts");
const nonnegative = zod_1.z.number().nonnegative();
exports.AllocationFactsSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.strictObject({
    weeks: zod_1.z.array(zod_1.z.strictObject({ week: contracts_1.DateV2Schema, otherCommittedMinutes: nonnegative, protectedTargetMinutes: nonnegative,
        perGoalCommittedMinutes: zod_1.z.array(zod_1.z.strictObject({ planRef: contracts_1.LocalIdV2Schema, minutes: nonnegative })).max(contracts_1.PLANNER_V2_ENVELOPE.targets) })).max(72),
    pins: zod_1.z.array(zod_1.z.strictObject({ planRef: contracts_1.LocalIdV2Schema, activityRef: contracts_1.LocalIdV2Schema, date: contracts_1.DateV2Schema, completionDate: contracts_1.DateV2Schema.optional(),
        remainingMinutes: zod_1.z.number().int().min(0).max(contracts_1.PLANNER_V2_ENVELOPE.timeboxMaxMinutes), alreadyReserved: zod_1.z.boolean(), contentDigest: contracts_1.DigestV2Schema,
        state: zod_1.z.enum(["UNSTARTED", "RUNNING", "PAUSED", "ENDED_INCOMPLETE", "COMPLETED"]), remainingDisposition: zod_1.z.enum(["OPEN", "WITHDRAWN", "COMPLETED"]),
        actualSeconds: zod_1.z.number().int().nonnegative(), executionVersion: zod_1.z.number().int().nonnegative() })).max(contracts_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * contracts_1.PLANNER_V2_ENVELOPE.targets),
    externalActivities: zod_1.z.array(zod_1.z.strictObject({ ref: contracts_1.LocalIdV2Schema, date: contracts_1.DateV2Schema, available: zod_1.z.boolean(), contentDigest: contracts_1.DigestV2Schema })).max(contracts_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * contracts_1.PLANNER_V2_ENVELOPE.targets),
    preferences: zod_1.z.array(zod_1.z.strictObject({ planRef: contracts_1.LocalIdV2Schema, pacing: zod_1.z.enum(["COMFORTABLE_EARLY", "SPREAD"]), maximumTimeboxMinutes: zod_1.z.number().int().min(5).max(240).optional() })).min(1).max(contracts_1.PLANNER_V2_ENVELOPE.targets),
}));
exports.DetailSchema = zod_1.z.strictObject({ days: zod_1.z.union([zod_1.z.literal(14), zod_1.z.literal(28)]), checkpoint: contracts_1.SummaryV2Schema });
exports.RecoveryAdjustmentSchema = zod_1.z.strictObject({ percent: zod_1.z.number().min(0).max(50), reason: contracts_1.SummaryV2Schema });
exports.PlanningSupportSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.strictObject({
    detail: exports.DetailSchema, tradeOffExplanation: contracts_1.SummaryV2Schema, recoveryAdjustment: exports.RecoveryAdjustmentSchema.optional(),
    unreviewedPhaseRefs: zod_1.z.array(zod_1.z.strictObject({ planRef: contracts_1.LocalIdV2Schema, phaseRef: contracts_1.LocalIdV2Schema })).max(contracts_1.PLANNER_V2_ENVELOPE.milestones * contracts_1.PLANNER_V2_ENVELOPE.targets).optional(),
    splits: zod_1.z.array(zod_1.z.strictObject({ planRef: contracts_1.LocalIdV2Schema, originalRef: contracts_1.LocalIdV2Schema, pieceRefs: zod_1.z.array(contracts_1.LocalIdV2Schema).min(2).max(13), originalActivity: contracts_1.BlueprintActivityV2Schema, requiresReview: zod_1.z.literal(true) })).max(contracts_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities),
    forecasts: zod_1.z.array(zod_1.z.strictObject({ planRef: contracts_1.LocalIdV2Schema, phases: zod_1.z.array(zod_1.z.strictObject({ phaseRef: contracts_1.LocalIdV2Schema, effort: contracts_1.EffortRangeV2Schema.optional(),
            status: zod_1.z.enum(["PROJECTED", "UNKNOWN_EFFORT", "BEYOND_FORECAST_WINDOW", "FORECAST_BLOCKED"]), likelyFinishDate: contracts_1.DateV2Schema.optional(), lowFinishDate: contracts_1.DateV2Schema.optional(), highFinishDate: contracts_1.DateV2Schema.optional(),
            remainingLikelyMinutes: zod_1.z.number().int().nonnegative().optional(), booked: zod_1.z.literal(false) })).max(contracts_1.PLANNER_V2_ENVELOPE.milestones) })).max(contracts_1.PLANNER_V2_ENVELOPE.targets),
    adaptationReason: contracts_1.SummaryV2Schema.optional(),
    adaptation: zod_1.z.enum(["NOT_REQUESTED", "PENDING", "KEPT", "REVISED"]),
}));
