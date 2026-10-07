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
export const ReviewResponseSchema = withPlannerEnvelope(z.strictObject({
  plans: z.array(z.strictObject({ planRef: LocalIdV2Schema,
    issues: z.array(GroundedFindingSchema).max(E.qualityIssues) })).min(1).max(E.targets),
}));
export const VerificationResponseSchema = withPlannerEnvelope(z.strictObject({
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
  repairInputDigest: DigestV2Schema.optional(), verificationInputDigest: DigestV2Schema.optional(),
  acceptedRepair: z.string().max(32 * 1024).optional(), acceptedRepairDigest: DigestV2Schema.optional(),
  verificationReserve: z.strictObject({ inputTokens: z.number().int().positive(), outputTokens: z.number().int().positive() }).optional(),
  repairAllocationFailure: AllocationReportSchema.optional(),
}).superRefine((support,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message});
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
