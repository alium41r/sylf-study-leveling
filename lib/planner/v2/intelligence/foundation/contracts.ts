import { z } from "zod";
import { DigestV2Schema as digest, DurableIdV2Schema as id, InstantV2Schema as instant, LocalIdV2Schema as local, SummaryV2Schema as summary, ProseV2Schema, DateV2Schema, unique, issue } from "../../contracts/primitives";
import { plannerSerializedBytes } from "../../contracts/envelope";
import { CalendarCapacitySchema, CalendarAllocationSchema } from "./calendar";
import { SchedulingEnvelopeSchema, CapacityProofSchema } from "../schemas/scheduling";
import { AllocationFactsSchema } from "../schemas/planning";
import { LearningInputSchema, TranslatedLearningSchema, AllocatedLearningSchema, RetentionDecisionSchema } from "../schemas/natural-learning";
import { CompilerIdentitiesSchema, GroundedFindingSchema } from "../schemas/quality";
import { ReviewedWorkflowSchema, ReviewedCallSchema, RefinementRouteSchema } from "../schemas/reviewed-learning";
import { UnderstandingRunSchema } from "../schemas/understanding";

/** Intelligence versioning is independent of the retained V2 execution contract. */
export const FOUNDATION_VERSION = 1 as const;
export const AI_FIRST_COMPILER_VERSION = 2 as const;
export const FOUNDATION_LIMITS = Object.freeze({ textBytes: 2 * 1024 * 1024, artifactBytes: 4 * 1024 * 1024, archiveBytes: 16 * 1024 * 1024 });
const bounded = <T extends z.ZodType>(schema: T, bytes = FOUNDATION_LIMITS.artifactBytes) => schema.superRefine((value, ctx) => {
  if (plannerSerializedBytes(value) > bytes) issue(ctx, [], "FOUNDATION_PAYLOAD_TOO_LARGE");
});
const refs = z.array(id).max(2).min(1).superRefine((values, ctx) => unique(values, ctx, []));
export const RoleSchema = z.enum(["RESEARCH", "STRATEGIST", "TRANSLATOR", "REVIEWER"]);
export type PlannerRole = z.infer<typeof RoleSchema>;
export const ArtifactRefSchema = z.strictObject({ id, digest });
export const ProducerSchema = z.strictObject({ callId: id, provider: z.string().min(1).max(100), model: z.string().min(1).max(200), effectiveModel: z.string().min(1).max(200), fingerprint: z.string().max(200).nullable(), promptDigest: digest, inputDigest: digest, effort: z.enum(["LOW", "HIGH", "MAX", "DISABLED", "PROVIDER_DEFAULT"]), outputCap: z.number().int().positive(), finishReason: z.literal("STOP") });
const BoundDossierSchema = bounded(z.strictObject({
  schemaVersion: z.literal(1), acceptedInstructionDigest: digest,
  capacity: ArtifactRefSchema,
  targets: z.array(z.strictObject({ planId: id, requestedIntentId: id, resolvedIntentId: id, intentDigest: digest, contextDigest: digest })).min(1).max(2),
  rawEvidenceDigest: digest, adoptedEvidenceDigest: digest, constraintsDigest: digest, calendarDigest: digest,
  sourcePins: z.array(z.strictObject({ ref: local, versionDigest: digest, applicabilityDigest: digest })).max(200),
  unresolved: z.array(z.strictObject({ ref: local, consequential: z.boolean(), explanation: summary })).max(200),
}).superRefine((value, ctx) => { unique(value.targets.map(t => t.planId), ctx, ["targets"]); unique(value.sourcePins.map(s => s.ref), ctx, ["sourcePins"]); }));
/** Research precedes calendar integration. This version cannot seal a candidate
 * until Step 4 appends a new dossier bound to a real capacity artifact. */
export const ResearchDossierSchema = bounded(z.strictObject({ ...BoundDossierSchema.shape, schemaVersion: z.literal(2), capacity: z.null(), calendarDigest: z.null(),
  understanding: UnderstandingRunSchema.refine(run=>run.phase==="COMPLETE" && !run.toolPending && run.pending===null && run.synthesisReview?.supported===true && !run.synthesisReview.issues.some(i=>i.consequential),"RESEARCH_NOT_COMPLETE") }).superRefine((value, ctx) => { unique(value.targets.map(t => t.planId), ctx, ["targets"]); unique(value.sourcePins.map(s => s.ref), ctx, ["sourcePins"]); }));
export const CapacityDossierSchema = bounded(z.strictObject({ ...BoundDossierSchema.shape, schemaVersion: z.literal(3), research: ArtifactRefSchema }).superRefine((value, ctx) => { unique(value.targets.map(t => t.planId), ctx, ["targets"]); unique(value.sourcePins.map(s => s.ref), ctx, ["sourcePins"]); }));
export const DossierSchema = z.union([BoundDossierSchema,ResearchDossierSchema,CapacityDossierSchema]);

export const CapacityResultSchema = bounded(z.strictObject({
  schemaVersion: z.literal(2), research: ArtifactRefSchema, previous: ArtifactRefSchema.nullable(), version: z.number().int().positive(),
  status: z.enum(["READY", "NEEDS_DECISION", "INCOMPLETE", "CAPACITY_SHORTFALL", "ALLOCATION_UNRESOLVED"]),
  window: z.strictObject({ start: DateV2Schema, end: DateV2Schema }),
  currentnessDigest: digest, contextDigests: z.array(digest).min(1).max(2),
  calendar: CalendarCapacitySchema.nullable(), constraints: SchedulingEnvelopeSchema.nullable(), facts: AllocationFactsSchema.nullable(),
  allocation: CalendarAllocationSchema.nullable(), workloadProof: CapacityProofSchema, reasons: z.array(summary).max(200),
}).superRefine((value, ctx) => {
  if ((value.version === 1) !== (value.previous === null)) issue(ctx, [], "CAPACITY_ANCESTRY_REQUIRED");
  if (["READY", "CAPACITY_SHORTFALL", "ALLOCATION_UNRESOLVED"].includes(value.status) && (!value.calendar || !value.constraints || !value.facts || !value.allocation)) issue(ctx, [], "CAPACITY_EVIDENCE_REQUIRED");
  if (value.workloadProof && value.workloadProof.requiredMinutes <= value.workloadProof.availableMinutes) issue(ctx, [], "CAPACITY_BOUND_DOES_NOT_PROVE_SHORTFALL");
  if ((value.status === "CAPACITY_SHORTFALL") !== (value.workloadProof !== null || value.allocation?.status === "CAPACITY_SHORTFALL")) issue(ctx, [], "CAPACITY_STATUS_MISMATCH");
  if (value.status === "ALLOCATION_UNRESOLVED" && value.allocation?.status !== "ALLOCATION_UNRESOLVED") issue(ctx, [], "CAPACITY_SEARCH_MISMATCH");
  if (value.status === "READY" && (value.allocation?.status !== "FEASIBLE" || value.workloadProof || value.reasons.length)) issue(ctx, [], "CAPACITY_NOT_READY");
  if (value.status !== "READY" && !value.reasons.length) issue(ctx, [], "CAPACITY_REASON_REQUIRED");
}));
export type CapacityResult = z.infer<typeof CapacityResultSchema>;

const LegacyStrategyDocumentSchema = bounded(z.strictObject({
  schemaVersion: z.literal(1), dossier: ArtifactRefSchema, parent: ArtifactRefSchema.nullable(),
  version: z.number().int().positive(), producer: ProducerSchema,
  // No trimming, normalization, imposed headings or blueprint prose ceiling.
  text: z.string().min(1).refine(text => text.trim().length > 0, "STRATEGY_EMPTY").refine(text => new TextEncoder().encode(text).byteLength <= FOUNDATION_LIMITS.textBytes, "STRATEGY_TEXT_TOO_LARGE"),
  anchors: z.array(z.strictObject({ ref: local, start: z.number().int().nonnegative(), end: z.number().int().positive(), textDigest: digest })).min(1).max(100000),
}).superRefine(strategyChecks));
function strategyChecks(value: { version: number; parent: unknown; text: string; anchors: {ref:string;start:number;end:number}[] }, ctx: z.RefinementCtx) {
  unique(value.anchors.map(a => a.ref), ctx, ["anchors"]);
  if ((value.version === 1) !== (value.parent === null)) issue(ctx, ["parent"], "STRATEGY_VERSION_ANCESTRY_REQUIRED");
  value.anchors.forEach((anchor, i) => {
    if (anchor.end <= anchor.start || anchor.end > value.text.length || i > 0 && anchor.start < value.anchors[i - 1].end) issue(ctx, ["anchors", i], "INVALID_UTF16_SPAN");
    for (const offset of [anchor.start, anchor.end]) if (offset > 0 && /[\uD800-\uDBFF]/.test(value.text[offset - 1]) && /[\uDC00-\uDFFF]/.test(value.text[offset] ?? "")) issue(ctx, ["anchors", i], "SPLIT_UNICODE_POINT");
  });
}
export const ProducerV2Schema = z.strictObject({ ...ProducerSchema.shape, effectiveModel: z.string().min(1).max(200).nullable() });
export const StrategyDocumentSchema = z.union([LegacyStrategyDocumentSchema, bounded(z.strictObject({ ...LegacyStrategyDocumentSchema.shape, schemaVersion: z.literal(2), input: ArtifactRefSchema, producer: ProducerV2Schema }).superRefine(strategyChecks))]);
export type StrategyDocument = z.infer<typeof StrategyDocumentSchema>;
const LegacyTranslationReceiptSchema = bounded(z.strictObject({
  schemaVersion: z.literal(1), strategies: z.array(ArtifactRefSchema).min(1).max(2), producer: ProducerSchema,
  blueprintDigest: digest,
  elements: z.array(z.strictObject({
    ref: local, strategyId: id, anchorRef: local,
    meaning: z.enum(["INSTRUCTION", "DEPENDENCY", "EVIDENCE", "CRITERION", "CONDITION", "STOP", "UNCERTAINTY", "ESTIMATE", "RESOURCE", "SCOPE", "GUIDANCE"]),
    disposition: z.enum(["EXECUTION", "RETAINED_GUIDANCE", "GAP"]), explanation: summary,
    targets: z.array(z.strictObject({ planId: id, kind: z.enum(["ACTIVITY", "SCOPE", "PHASE", "DECISIONS", "STRATEGY"]), ref: local })).max(400),
  })).max(10000),
  derivations: z.array(z.strictObject({ kind: z.enum(["SERVER_IDENTITY", "EXACT_ARITHMETIC", "DECLARED_SPLIT_DELIVERY"]), explanation: summary })).max(1000),
  ambiguities: z.array(summary).max(200),
}).superRefine(translationChecks));
function translationChecks(value: { strategies: {id:string}[]; elements: {ref:string;disposition:string;targets:unknown[]}[] }, ctx: z.RefinementCtx) {
  unique(value.strategies.map(s => s.id), ctx, ["strategies"]); unique(value.elements.map(e => e.ref), ctx, ["elements"]);
  value.elements.forEach((e, i) => { if ((e.disposition === "EXECUTION") !== (e.targets.length > 0)) issue(ctx, ["elements", i], "TRANSLATION_DISPOSITION_MISMATCH"); });
}
export const TranslationReceiptSchema = z.union([LegacyTranslationReceiptSchema, bounded(z.strictObject({ ...LegacyTranslationReceiptSchema.shape, schemaVersion: z.literal(2), input: ArtifactRefSchema, producer: ProducerV2Schema,
  responseDigest: digest, interpretationDigest: digest, retention: z.array(RetentionDecisionSchema).max(400),
  capacity: ArtifactRefSchema, previous: ArtifactRefSchema.nullable(), version: z.number().int().positive(),
}).superRefine(translationChecks).superRefine((value, ctx) => { if ((value.version === 1) !== (value.previous === null)) issue(ctx, [], "TRANSLATION_ANCESTRY_REQUIRED"); }))]);
export type TranslationReceipt = z.infer<typeof TranslationReceiptSchema>;

const LegacyIssueEventSchema = z.strictObject({
  schemaVersion: z.literal(1), issueId: id, previous: ArtifactRefSchema.nullable(),
  disposition: z.enum(["OPEN", "ADDRESSED", "VERIFIED_RESOLVED", "WITHDRAWN"]),
  severity: z.enum(["BLOCKING", "WARNING", "ADVISORY"]), route: RoleSchema,
  candidateDigest: digest, affected: z.array(ArtifactRefSchema).min(1).max(20),
  requirement: summary, offendingContent: summary, consequence: summary, explanation: summary,
  // Exact original input and proposal quotations remain subject to literal grounding.
  grounds: z.array(z.strictObject({ inputDigest: digest, excerpt: z.string().min(1).max(4000) })).min(2).max(20),
});
export const IssueEventSchema = z.union([LegacyIssueEventSchema, z.strictObject({ ...LegacyIssueEventSchema.shape,
  schemaVersion: z.literal(2), route: RefinementRouteSchema, input: ArtifactRefSchema, producerCallId: id.nullable(),
  allocationCorrection:ArtifactRefSchema.optional(),
  inherited:z.strictObject({attemptId:id,issue:ArtifactRefSchema}).optional(),
  planRef: local, finding: GroundedFindingSchema,
  grounds: z.array(z.strictObject({ inputDigest: digest, ref: z.string().min(1).max(160), excerpt: z.string().min(1).max(4000) })).min(2).max(20),
})]);
export type IssueEvent = z.infer<typeof IssueEventSchema>;
const LegacyCandidateBindingSchema = z.strictObject({
  schemaVersion: z.literal(1), dossier: ArtifactRefSchema, strategies: z.array(ArtifactRefSchema).min(1).max(2), translation: ArtifactRefSchema,
  blueprintDigest: digest, allocationDigest: digest, executionDigest: digest, constraintsDigest: digest,
  calendarDigest: digest, issueHeads: z.array(ArtifactRefSchema).max(1000),
});
export const ReviewedCandidateBindingSchema = z.strictObject({ ...LegacyCandidateBindingSchema.shape, schemaVersion: z.literal(2), allocation: ArtifactRefSchema });
export const CandidateBindingSchema = z.union([LegacyCandidateBindingSchema, ReviewedCandidateBindingSchema]);
export type CandidateBinding = z.infer<typeof CandidateBindingSchema>;
const LegacyReviewSchema = z.strictObject({
  schemaVersion: z.literal(1), candidateDigest: digest, producer: ProducerSchema, verdict: z.enum(["APPROVED", "REVISE", "NEEDS_DECISION", "INCOMPLETE"]),
  completeResultInspected: z.boolean(), issueHeads: z.array(ArtifactRefSchema).max(1000),
  rubricVersion: z.string().min(1).max(100), explanation: summary,
});
export const ReviewSchema = z.union([LegacyReviewSchema, z.strictObject({ ...LegacyReviewSchema.shape,
  schemaVersion: z.literal(2), input: ArtifactRefSchema, producer: ProducerV2Schema,
  binding: ReviewedCandidateBindingSchema, progressDigest: digest, explanation: ProseV2Schema,
})]);
const LegacyFoundationCheckpointSchema = bounded(z.strictObject({
  schemaVersion: z.literal(1), compilerVersion: z.literal(2), previous: ArtifactRefSchema.nullable(),
  requestHash: digest, rootRequestId: id, authorizationDigest: digest, targetsDigest: digest,
  stage: z.enum(["RESEARCH", "STRATEGY", "TRANSLATION", "ALLOCATION", "REVIEW", "REFINEMENT", "READY", "INCOMPLETE", "NEEDS_DECISION"]),
  artifacts: z.array(ArtifactRefSchema).max(1000), resourceSnapshotDigest: digest,
  pendingCall: z.strictObject({ callId: id, role: RoleSchema, inputDigest: digest, state: z.enum(["RESERVED", "DISPATCHED", "RESPONSE_SAVED"]), response: z.string().max(FOUNDATION_LIMITS.textBytes).nullable(), responseDigest: digest.nullable() }).nullable(),
  route: RoleSchema.nullable(), reason: summary,
}).superRefine((value, ctx) => {
  const call = value.pendingCall;
  if (call?.state === "RESPONSE_SAVED" && !call.response?.trim()) issue(ctx, ["pendingCall"], "BLANK_RESPONSE_CANNOT_COMPLETE");
  if (call && ((call.state === "RESPONSE_SAVED") !== (call.response !== null && call.responseDigest !== null) || call.state !== "RESPONSE_SAVED" && (call.response !== null || call.responseDigest !== null))) issue(ctx, ["pendingCall"], "CALL_RESPONSE_CORRESPONDENCE");
  if (value.stage === "READY" && call && call.state !== "RESPONSE_SAVED") issue(ctx, ["stage"], "UNCERTAIN_CALL_CANNOT_PUBLISH");
}));
const NaturalCallSchema = z.strictObject({ protocolVersion: z.literal(1), role: z.enum(["STRATEGIST", "TRANSLATOR"]), key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/), promptDigest: digest, inputDigest: digest, outputCap: z.number().int().positive(),
  systemInstruction: z.string().min(1), responseContract: z.record(z.string(), z.unknown()).nullable() });
export const NaturalLearningStateSchema = z.strictObject({
  dossier: ArtifactRefSchema, capacity: ArtifactRefSchema, input: ArtifactRefSchema.nullable(), snapshot: LearningInputSchema.nullable(),
  strategy: ArtifactRefSchema.nullable(), translation: ArtifactRefSchema.nullable(), call: NaturalCallSchema.nullable(),
  translated: TranslatedLearningSchema.nullable(), allocated: AllocatedLearningSchema.nullable(), identities: CompilerIdentitiesSchema,
});
const NaturalCheckpointSchema = bounded(z.strictObject({ ...LegacyFoundationCheckpointSchema.shape, schemaVersion: z.literal(2), learning: NaturalLearningStateSchema }).superRefine((value, ctx) => {
  if ((value.learning.input === null) !== (value.learning.snapshot !== null) || value.pendingCall !== null) issue(ctx, [], "LEARNING_CHECKPOINT_INPUT_REQUIRED");
  if (value.learning.allocated && (!value.learning.strategy || !value.learning.translation)) issue(ctx, [], "LEARNING_CORRESPONDENCE_REQUIRED");
}));
export const ReviewedCheckpointSchema = bounded(z.strictObject({ ...LegacyFoundationCheckpointSchema.shape,
  schemaVersion: z.literal(3), route: RefinementRouteSchema.nullable(),
  learning: z.strictObject({ ...NaturalLearningStateSchema.shape, call: z.union([NaturalCallSchema, ReviewedCallSchema]).nullable() }),
  workflow: ReviewedWorkflowSchema,
}).superRefine((value, ctx) => {
  if (!value.learning.input || value.learning.snapshot !== null || value.pendingCall !== null) issue(ctx, [], "REVIEWED_CHECKPOINT_RETAINS_OWNED_INPUT");
  if (value.learning.allocated && (!value.learning.strategy || !value.learning.translation)) issue(ctx, [], "LEARNING_CORRESPONDENCE_REQUIRED");
  if (value.stage === "READY" && (!value.workflow.candidate || !value.workflow.assessment || value.learning.call)) issue(ctx, [], "COMPLETE_REVIEW_BEFORE_READY");
}));
export const FoundationCheckpointSchema = z.union([LegacyFoundationCheckpointSchema, NaturalCheckpointSchema, ReviewedCheckpointSchema]);

const envelope = { id, ownerId: z.number().int().positive(), attemptId: id, planIds: refs, createdAt: instant, digest };
export const FoundationArtifactSchema = bounded(z.discriminatedUnion("kind", [
  z.strictObject({ ...envelope, kind: z.literal("CAPACITY"), value: z.union([z.strictObject({ schemaVersion: z.literal(1), calendar: CalendarCapacitySchema, constraints: SchedulingEnvelopeSchema }), CapacityResultSchema]) }),
  z.strictObject({ ...envelope, kind: z.literal("DOSSIER"), value: DossierSchema }),
  z.strictObject({ ...envelope, kind: z.literal("STRATEGY"), value: StrategyDocumentSchema }),
  z.strictObject({ ...envelope, kind: z.literal("TRANSLATION"), value: TranslationReceiptSchema }),
  z.strictObject({ ...envelope, kind: z.literal("ISSUE"), value: IssueEventSchema }),
  z.strictObject({ ...envelope, kind: z.literal("REVIEW"), value: ReviewSchema }),
  z.strictObject({ ...envelope, kind: z.literal("CHECKPOINT"), value: FoundationCheckpointSchema }),
]));
export type FoundationArtifact = z.infer<typeof FoundationArtifactSchema>;
export const FoundationArchiveSchema = bounded(z.strictObject({ schemaVersion: z.literal(1), compilerVersion: z.literal(2), entries: z.record(id, FoundationArtifactSchema) }), FOUNDATION_LIMITS.archiveBytes);
export type FoundationArchive = z.infer<typeof FoundationArchiveSchema>;
const LegacyRevisionIntelligenceBundleSchema = z.strictObject({ schemaVersion: z.literal(1), compilerVersion: z.literal(2), binding: LegacyCandidateBindingSchema, candidateDigest: digest, review: ArtifactRefSchema, archiveAttemptId: id, digest });
export const RevisionIntelligenceBundleSchema = z.union([LegacyRevisionIntelligenceBundleSchema, z.strictObject({ ...LegacyRevisionIntelligenceBundleSchema.shape, schemaVersion: z.literal(2), binding: ReviewedCandidateBindingSchema })]);
