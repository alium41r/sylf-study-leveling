import { z } from "zod";
import { AssessmentProfileV2Schema, LocalIdV2Schema, SummaryV2Schema, TitleV2Schema, withPlannerEnvelope } from "../../contracts";

export const assessmentFields = Object.keys(AssessmentProfileV2Schema.shape) as (keyof z.infer<typeof AssessmentProfileV2Schema>)[];
const anchor = z.strictObject({ page:z.number().int().positive().optional(), section:TitleV2Schema.optional() }).refine(a=>a.page!==undefined || !!a.section);
const identity = z.strictObject({ sourceId:LocalIdV2Schema, fields:z.array(z.strictObject({field:z.enum(assessmentFields as [typeof assessmentFields[number],...typeof assessmentFields[number][]]),value:TitleV2Schema,excerpt:z.string().min(1).max(2000),anchor})).max(8) });
export const ResearchExtractionSchema = withPlannerEnvelope(z.strictObject({
  identities:z.array(identity).max(9), claims:z.array(z.strictObject({sourceId:LocalIdV2Schema, statement:SummaryV2Schema, excerpt:z.string().min(1).max(2000),anchor,
    kind:z.enum(["ASSESSED_SCOPE","ASSESSMENT_STRUCTURE","WEIGHTING","COURSE_OUTCOME","RESOURCE","PREREQUISITE_RECOMMENDATION"]) })).max(200),
  completeSourceIds:z.array(LocalIdV2Schema).max(9), gaps:z.array(SummaryV2Schema).max(20),
  followUp:z.strictObject({query:SummaryV2Schema,consequence:SummaryV2Schema}).optional(), answer:z.string().min(1).max(4000),
}));
export const ScopeBindingSchema=z.strictObject({claimId:LocalIdV2Schema,scopeRefs:z.array(LocalIdV2Schema).max(500),disposition:z.enum(["ADD_SCOPE","ANNOTATE_SCOPE","EXCLUDED","RESOURCE_ONLY"])});
const judgment=z.strictObject({support:z.enum(["SUPPORTED","UNSUPPORTED","UNCERTAIN"]),applicability:z.enum(["MATCHED","MISMATCHED","UNCERTAIN"]),reason:SummaryV2Schema});
export const ResearchReviewSchema = withPlannerEnvelope(z.strictObject({
  scopeBindings:z.array(ScopeBindingSchema).max(200).default([]),
  followUpClaims:z.array(z.strictObject({claim:ResearchExtractionSchema.shape.claims.element,review:judgment,scopeRefs:z.array(LocalIdV2Schema).max(500),disposition:ScopeBindingSchema.shape.disposition})).max(60).default([]),
  followUpIdentities:z.array(identity).max(9).default([]),
  claims:z.array(z.strictObject({claimId:LocalIdV2Schema,support:z.enum(["SUPPORTED","UNSUPPORTED","UNCERTAIN"]),applicability:z.enum(["MATCHED","MISMATCHED","UNCERTAIN"]),reason:SummaryV2Schema})).max(200),
  identities:z.array(z.strictObject({sourceId:LocalIdV2Schema,fields:z.array(z.strictObject({field:z.enum(assessmentFields as [typeof assessmentFields[number],...typeof assessmentFields[number][]]),supported:z.boolean()})).max(8)})).max(9),
  completeSourceIds:z.array(LocalIdV2Schema).max(9), conflicts:z.array(SummaryV2Schema).max(20),answer:z.string().min(1).max(4000),
}));
export type ResearchExtraction = z.infer<typeof ResearchExtractionSchema>;
export type ResearchReview = z.infer<typeof ResearchReviewSchema>;
