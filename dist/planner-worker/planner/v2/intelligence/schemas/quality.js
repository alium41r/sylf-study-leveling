"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompilerRetrySchema = exports.CompilerIdentitiesSchema = exports.QualitySupportSchema = exports.VerificationResponseSchema = exports.ReviewResponseSchema = exports.GroundedFindingSchema = exports.GroundSchema = void 0;
const zod_1 = require("zod");
const contracts_1 = require("../../contracts");
const scheduling_1 = require("./scheduling");
exports.GroundSchema = zod_1.z.strictObject({ ref: zod_1.z.string().min(1).max(160), excerpt: contracts_1.SummaryV2Schema });
exports.GroundedFindingSchema = zod_1.z.strictObject({
    issueId: contracts_1.LocalIdV2Schema, category: contracts_1.QualityIssueV2Schema.shape.category,
    severity: contracts_1.QualityIssueV2Schema.shape.severity,
    affectedRefs: zod_1.z.array(contracts_1.LocalIdV2Schema).min(1).max(contracts_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities),
    basis: zod_1.z.enum(["CONCRETE_VIOLATION", "REASONABLE_UNCERTAINTY", "PREFERENCE"]),
    grounds: zod_1.z.array(exports.GroundSchema).min(1).max(8), evidence: contracts_1.SummaryV2Schema,
    consequence: contracts_1.SummaryV2Schema, requestedResolution: contracts_1.SummaryV2Schema,
    requiresAcknowledgement: zod_1.z.boolean(),
});
exports.ReviewResponseSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.strictObject({
    plans: zod_1.z.array(zod_1.z.strictObject({ planRef: contracts_1.LocalIdV2Schema,
        issues: zod_1.z.array(exports.GroundedFindingSchema).max(contracts_1.PLANNER_V2_ENVELOPE.qualityIssues) })).min(1).max(contracts_1.PLANNER_V2_ENVELOPE.targets),
}));
exports.VerificationResponseSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.strictObject({
    plans: zod_1.z.array(zod_1.z.strictObject({ planRef: contracts_1.LocalIdV2Schema,
        resolutions: zod_1.z.array(zod_1.z.strictObject({ issueId: contracts_1.LocalIdV2Schema,
            result: zod_1.z.enum(["RESOLVED", "UNRESOLVED"]), explanation: contracts_1.SummaryV2Schema,
            grounds: zod_1.z.array(exports.GroundSchema).min(1).max(8) })).max(contracts_1.PLANNER_V2_ENVELOPE.qualityIssues),
        newIssues: zod_1.z.array(exports.GroundedFindingSchema).max(contracts_1.PLANNER_V2_ENVELOPE.qualityIssues) })).min(1).max(contracts_1.PLANNER_V2_ENVELOPE.targets),
}));
exports.QualitySupportSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.strictObject({
    phase: zod_1.z.enum(["REVIEW_PENDING", "REVIEWED", "REPAIR_PENDING", "REPAIR_ACCEPTED", "REPAIRED", "VERIFICATION_PENDING", "VERIFIED"]),
    reviewInputDigest: contracts_1.DigestV2Schema, identityDigest: contracts_1.DigestV2Schema,
    findings: zod_1.z.array(zod_1.z.strictObject({ planRef: contracts_1.LocalIdV2Schema, finding: exports.GroundedFindingSchema })).max(contracts_1.PLANNER_V2_ENVELOPE.qualityIssues),
    repairInputDigest: contracts_1.DigestV2Schema.optional(), verificationInputDigest: contracts_1.DigestV2Schema.optional(),
    acceptedRepair: zod_1.z.string().max(32 * 1024).optional(), acceptedRepairDigest: contracts_1.DigestV2Schema.optional(),
    verificationReserve: zod_1.z.strictObject({ inputTokens: zod_1.z.number().int().positive(), outputTokens: zod_1.z.number().int().positive() }).optional(),
    repairAllocationFailure: scheduling_1.AllocationReportSchema.optional(),
}).superRefine((support, ctx) => {
    const fail = (message) => ctx.addIssue({ code: 'custom', message });
    if (support.phase === 'REPAIR_ACCEPTED' && (!support.acceptedRepair || !support.acceptedRepairDigest))
        fail('ACCEPTED_REPAIR_RECEIPT_REQUIRED');
    if (support.acceptedRepair && (support.phase !== 'REPAIR_ACCEPTED' || new TextEncoder().encode(support.acceptedRepair).byteLength > 32 * 1024))
        fail('ACCEPTED_REPAIR_BYTE_BOUND');
    if (['REPAIR_PENDING', 'REPAIR_ACCEPTED', 'REPAIRED', 'VERIFICATION_PENDING', 'VERIFIED'].includes(support.phase) && (!support.verificationReserve || !support.repairInputDigest))
        fail('REPAIR_VERIFICATION_RESERVE_REQUIRED');
    if (['VERIFICATION_PENDING', 'VERIFIED'].includes(support.phase) && !support.verificationInputDigest)
        fail('VERIFICATION_INPUT_RECEIPT_REQUIRED');
}));
exports.CompilerIdentitiesSchema = zod_1.z.array(zod_1.z.strictObject({
    planRef: contracts_1.LocalIdV2Schema, activityRef: contracts_1.LocalIdV2Schema, activityKey: contracts_1.DurableIdV2Schema,
})).max(contracts_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * contracts_1.PLANNER_V2_ENVELOPE.targets);
exports.CompilerRetrySchema = zod_1.z.strictObject({ sourceAttemptId: contracts_1.DurableIdV2Schema, sourceCheckpointDigest: contracts_1.DigestV2Schema,
    originalIntents: zod_1.z.array(zod_1.z.strictObject({ planRef: contracts_1.LocalIdV2Schema, intentVersionId: contracts_1.DurableIdV2Schema })).min(1).max(contracts_1.PLANNER_V2_ENVELOPE.targets) }).superRefine((retry, ctx) => {
    if (new Set(retry.originalIntents.map(i => i.planRef)).size !== retry.originalIntents.length)
        ctx.addIssue({ code: 'custom', message: 'RETRY_ORIGINAL_TARGETS_UNIQUE' });
});
