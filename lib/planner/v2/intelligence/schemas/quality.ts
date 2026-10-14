import { z } from "zod";
import { LocalIdV2Schema, SummaryV2Schema, DigestV2Schema, DurableIdV2Schema,
  QualityIssueV2Schema, PLANNER_V2_ENVELOPE as E, withPlannerEnvelope } from "../../contracts";
import { AllocationReportSchema } from "./scheduling";

export const GroundSchema = z.strictObject({ ref: z.string().min(1).max(160), excerpt: SummaryV2Schema });
export const GroundedFindingSchema = z.strictObject({
  issueId: LocalIdV2Schema, category: QualityIssueV2Schema.shape.category,
  severity: QualityIssueV2Schema.shape.severity,
  affectedRefs: z.array(LocalIdV2Schema).min(1).max(E.newlyDetailedActivities),
  basis: z.enum(["CONCRETE_VIOLATION", "REASONABLE_UNCERTAINTY", "PREFERENCE"]),
  grounds: z.array(GroundSchema).min(1).max(8), evidence: SummaryV2Schema,
  consequence: SummaryV2Schema, requestedResolution: SummaryV2Schema,
  requiresAcknowledgement: z.boolean(),
});
/** Only configured validation fallbacks may supply this supporting receipt. */
export const ReviewRecoveryDispositionSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ concernRef: LocalIdV2Schema, outcome: z.literal("CORRECTED"), planRef: LocalIdV2Schema, issueId: LocalIdV2Schema }),
  z.strictObject({ concernRef: LocalIdV2Schema, outcome: z.literal("WITHDRAWN"), explanation: SummaryV2Schema,
    grounds: z.array(GroundSchema).min(2).max(8) }),
]);
const recovery = z.array(ReviewRecoveryDispositionSchema).min(1).max(E.qualityIssues).optional();
const RecoveryConcernSchema = z.strictObject({ concernRef: LocalIdV2Schema, responseDigest: DigestV2Schema,
  findingDigest: DigestV2Schema, sourcePath: z.string().min(1).max(100),
  planRef: LocalIdV2Schema.optional(), issueId: LocalIdV2Schema.optional() });
export const PendingReviewConcernsSchema = z.array(z.strictObject({...RecoveryConcernSchema.shape, rejectedFinding: z.unknown()}))
  .min(1).max(E.qualityIssues).superRefine((concerns,ctx)=>{
    if(new TextEncoder().encode(JSON.stringify({concerns})).byteLength>16*1024 || new Set(concerns.map(c=>c.concernRef)).size!==concerns.length)
      ctx.addIssue({code:"custom",message:"BOUNDED_UNIQUE_REJECTED_REVIEW_CONCERNS_REQUIRED"});
  });
export const ReviewRecoveryReceiptSchema = z.strictObject({
  concerns: z.array(RecoveryConcernSchema).min(1).max(E.qualityIssues),
  dispositions: z.array(ReviewRecoveryDispositionSchema).min(1).max(E.qualityIssues),
}).superRefine((receipt, ctx) => {
  const refs = receipt.concerns.map(c => c.concernRef), dispositions = receipt.dispositions.map(d => d.concernRef);
  if (new Set(refs).size !== refs.length || new Set(dispositions).size !== dispositions.length ||
    refs.length !== dispositions.length || dispositions.some(ref => !refs.includes(ref)))
    ctx.addIssue({code:"custom",message:"REJECTED_CONCERNS_REQUIRE_EXACT_DISPOSITIONS"});
});
export type ReviewRecoveryReceipt = z.infer<typeof ReviewRecoveryReceiptSchema>;
export const ReviewResponseSchema = withPlannerEnvelope(z.strictObject({
  recovery,
  plans: z.array(z.strictObject({ planRef: LocalIdV2Schema,
    issues: z.array(GroundedFindingSchema).max(E.qualityIssues) })).min(1).max(E.targets),
}));
export const VerificationResponseSchema = withPlannerEnvelope(z.strictObject({
  recovery,
  plans: z.array(z.strictObject({ planRef: LocalIdV2Schema,
    resolutions: z.array(z.strictObject({ issueId: LocalIdV2Schema,
      result: z.enum(["RESOLVED", "UNRESOLVED"]), explanation: SummaryV2Schema,
      grounds: z.array(GroundSchema).min(1).max(8) })).max(E.qualityIssues),
    newIssues: z.array(GroundedFindingSchema).max(E.qualityIssues) })).min(1).max(E.targets),
}));
export const QualitySupportSchema = withPlannerEnvelope(z.strictObject({
  phase: z.enum(["REVIEW_PENDING", "REVIEWED", "REPAIR_PENDING", "REPAIR_ACCEPTED", "REPAIRED", "VERIFICATION_PENDING", "VERIFIED"]),
  reviewInputDigest: DigestV2Schema, identityDigest: DigestV2Schema,
  findings: z.array(z.strictObject({ planRef: LocalIdV2Schema, finding: GroundedFindingSchema })).max(E.qualityIssues),
  reviewRecoveryPending: PendingReviewConcernsSchema.optional(), verificationRecoveryPending: PendingReviewConcernsSchema.optional(),
  reviewRecovery: ReviewRecoveryReceiptSchema.optional(), verificationRecovery: ReviewRecoveryReceiptSchema.optional(),
  repairInputDigest: DigestV2Schema.optional(), verificationInputDigest: DigestV2Schema.optional(),
  repairFormat: z.literal("TARGETED_V1").optional(),
  acceptedRepair: z.string().max(32 * 1024).optional(), acceptedRepairDigest: DigestV2Schema.optional(),
  verificationReserve: z.strictObject({ inputTokens: z.number().int().positive(), outputTokens: z.number().int().positive() }).optional(),
  repairAllocationFailure: AllocationReportSchema.optional(),
}).superRefine((support,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message});
  if(support.reviewRecoveryPending && support.phase!=='REVIEW_PENDING' || support.verificationRecoveryPending && support.phase!=='VERIFICATION_PENDING')fail('REJECTED_REVIEW_CONCERNS_REQUIRE_PENDING_STAGE');
  if(support.phase==='REPAIR_ACCEPTED' && (!support.acceptedRepair || !support.acceptedRepairDigest))fail('ACCEPTED_REPAIR_RECEIPT_REQUIRED');
  if(support.acceptedRepair && (support.phase!=='REPAIR_ACCEPTED' || new TextEncoder().encode(support.acceptedRepair).byteLength>32*1024))fail('ACCEPTED_REPAIR_BYTE_BOUND');
  if(['REPAIR_PENDING','REPAIR_ACCEPTED','REPAIRED','VERIFICATION_PENDING','VERIFIED'].includes(support.phase) && (!support.verificationReserve || !support.repairInputDigest))fail('REPAIR_VERIFICATION_RESERVE_REQUIRED');
  if(['VERIFICATION_PENDING','VERIFIED'].includes(support.phase) && !support.verificationInputDigest)fail('VERIFICATION_INPUT_RECEIPT_REQUIRED');
}));
export const CompilerIdentitiesSchema = z.array(z.strictObject({
  planRef: LocalIdV2Schema, activityRef: LocalIdV2Schema, activityKey: DurableIdV2Schema,
})).max(E.outstandingActivitiesPerPlan * E.targets);
export const CompilerRetrySchema = z.strictObject({ sourceAttemptId: DurableIdV2Schema, sourceCheckpointDigest: DigestV2Schema,
  originalIntents: z.array(z.strictObject({ planRef: LocalIdV2Schema, intentVersionId: DurableIdV2Schema })).min(1).max(E.targets) }).superRefine((retry,ctx)=>{
  if(new Set(retry.originalIntents.map(i=>i.planRef)).size!==retry.originalIntents.length)ctx.addIssue({code:'custom',message:'RETRY_ORIGINAL_TARGETS_UNIQUE'});
});
export type CompilerRetry = z.infer<typeof CompilerRetrySchema>;
export type CompilerIdentity = z.infer<typeof CompilerIdentitiesSchema>[number];
export type GroundedFinding = z.infer<typeof GroundedFindingSchema>;
export type QualitySupport = z.infer<typeof QualitySupportSchema>;
