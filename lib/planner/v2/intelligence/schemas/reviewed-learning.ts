import { z } from "zod";
import { DigestV2Schema, DurableIdV2Schema, LocalIdV2Schema, SummaryV2Schema, ProseV2Schema, CanonicalIntentV2Schema } from "../../contracts";
import { GroundSchema, ReviewResponseSchema, PendingReviewConcernsSchema } from "./quality";
import { ResearchQuestionSchema } from "./understanding";
import { NaturalTranslationResponseSchema } from "./natural-learning";

/** Placement is deterministic code, not an additional model/agent role. */
export const RefinementRouteSchema = z.enum(["RESEARCH", "STRATEGIST", "TRANSLATOR", "ALLOCATION", "REVIEWER"]);
const ref = z.strictObject({ id: DurableIdV2Schema, digest: DigestV2Schema });
export const AuthorFeedbackSchema=z.discriminatedUnion("kind",[
  z.strictObject({kind:z.literal("INCOMPLETE"),source:ref,input:ref,responseDigest:DigestV2Schema,progressDigest:DigestV2Schema,response:NaturalTranslationResponseSchema.options[1]}),
  z.strictObject({kind:z.literal("GAPS"),source:ref,input:ref,responseDigest:DigestV2Schema,progressDigest:DigestV2Schema,translation:ref}),
  z.strictObject({kind:z.literal("REJECTED"),source:ref,input:ref,responseDigest:DigestV2Schema,progressDigest:DigestV2Schema,
    validation:z.record(z.string(),z.unknown()),rejectedOutput:z.record(z.string(),z.unknown())}),
]);
export type AuthorFeedback=z.infer<typeof AuthorFeedbackSchema>;
export const ReviewedResearchHandoffSchema=z.strictObject({schemaVersion:z.literal(1),assessment:ref,
  kind:z.enum(["CLARIFICATION","REINVESTIGATION"]),questions:z.array(ResearchQuestionSchema).max(200),
}).superRefine((value,ctx)=>{if((value.kind==="CLARIFICATION")!==(value.questions.length>0))ctx.addIssue({code:"custom",message:"ACTUAL_REVIEW_QUESTIONS_REQUIRED"});});
export type ReviewedResearchHandoff=z.infer<typeof ReviewedResearchHandoffSchema>;
export const CompleteReviewResponseSchema = z.strictObject({
  ...ReviewResponseSchema.shape,
  verdict: z.enum(["APPROVED", "REVISE", "NEEDS_DECISION", "INCOMPLETE"]),
  completeResultInspected: z.boolean(), explanation: ProseV2Schema,
  routes: z.array(z.strictObject({ planRef: LocalIdV2Schema, issueId: LocalIdV2Schema, route: RefinementRouteSchema })).max(60),
  dispositions: z.array(z.strictObject({ issueId: DurableIdV2Schema, outcome: z.enum(["RESOLVED", "UNRESOLVED", "WITHDRAWN"]),
    explanation: SummaryV2Schema, grounds: z.array(GroundSchema).min(2).max(20) })).max(1000),
  next: z.strictObject({ route: RefinementRouteSchema, benefit: SummaryV2Schema }).nullable(),
  questions: z.array(ResearchQuestionSchema).max(200),
}).superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (value.verdict === "APPROVED" && (!value.completeResultInspected || value.next !== null || value.questions.length)) fail("COMPLETE_REVIEW_APPROVAL_REQUIRED");
  if (value.verdict === "REVISE" && (!value.completeResultInspected || !value.next || value.questions.length)) fail("CREDIBLE_REFINEMENT_ROUTE_REQUIRED");
  if (value.verdict === "NEEDS_DECISION" && !value.questions.length) fail("CONSEQUENTIAL_QUESTION_REQUIRED");
  const keys = value.routes.map(r => `${r.planRef}/${r.issueId}`), findings = value.plans.flatMap(p => p.issues.map(i => `${p.planRef}/${i.issueId}`));
  if (new Set(keys).size !== keys.length || keys.length !== findings.length || keys.some(k => !findings.includes(k))) fail("EVERY_FINDING_HAS_ONE_OWNER_ROUTE");
  if (new Set(value.dispositions.map(d => d.issueId)).size !== value.dispositions.length) fail("ISSUE_DISPOSITION_DUPLICATE");
});
export type CompleteReviewResponse = z.infer<typeof CompleteReviewResponseSchema>;

/** Frozen references reconstruct full inputs; raw responses remain in the
 * existing ledger. No copied research/strategy database or new AI transport. */
export const ReviewedWorkflowSchema = z.strictObject({
  schemaVersion: z.literal(1), candidate: ref.nullable(), assessment: ref.nullable(),
  requested: z.array(z.strictObject({ planId: DurableIdV2Schema, intentId: DurableIdV2Schema, intent: CanonicalIntentV2Schema })).min(1).max(2),
  previousStrategy: ref.nullable(), previousTranslation: ref.nullable(), issueHeads: z.array(ref).max(1000),
  history: z.array(ref).max(10000),
  route: RefinementRouteSchema.nullable(), benefit: SummaryV2Schema.nullable(),
  recovery: z.strictObject({ concerns: z.union([z.tuple([]), PendingReviewConcernsSchema]), rejectedCallId: DurableIdV2Schema,
    responseDigest: DigestV2Schema, rejectedOutput: z.record(z.string(), z.unknown()) }).nullable(),
  authorFeedback:AuthorFeedbackSchema.optional(),
});
export const ReviewedCallSchema = z.strictObject({
  protocolVersion: z.literal(2), role: z.enum(["STRATEGIST", "TRANSLATOR", "REVIEWER"]), key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  purpose: z.enum(["BLUEPRINT", "REPAIR", "REVIEW", "VERIFICATION"]), promptDigest: DigestV2Schema, inputDigest: DigestV2Schema,
  outputCap: z.number().int().positive(), systemInstruction: z.string().min(1), responseContract: z.record(z.string(), z.unknown()).nullable(),
}).superRefine((call,ctx)=>{
  const purposes={STRATEGIST:["BLUEPRINT","REPAIR"],TRANSLATOR:["BLUEPRINT","REPAIR"],REVIEWER:["REVIEW","VERIFICATION"]};
  if(!purposes[call.role].includes(call.purpose))ctx.addIssue({code:"custom",message:"ROLE_PURPOSE_MISMATCH"});
});
