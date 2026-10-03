import { z } from "zod";
import { PLANNER_V2_ENVELOPE as E, withPlannerEnvelope } from "./envelope";
import {
  DateV2Schema, DigestV2Schema, DurableIdV2Schema, EntityIdV2Schema,
  InstantV2Schema, LocalIdV2Schema, SummaryV2Schema, TitleV2Schema,
  VersionV2Schema, issue, unique,
} from "./primitives";

export const AssessmentProfileV2Schema = z.strictObject({
  institution: TitleV2Schema.optional(),
  qualification: TitleV2Schema.optional(),
  syllabusCode: TitleV2Schema.optional(),
  component: TitleV2Schema.optional(),
  examinationCycle: TitleV2Schema.optional(),
  programme: TitleV2Schema.optional(),
  variant: TitleV2Schema.optional(),
  selectedSubset: SummaryV2Schema.optional(),
});

export const EvidenceSourceV2Schema = z.strictObject({
  sourceId: LocalIdV2Schema,
  location: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("PUBLIC_URL"), finalUrl: z.url().max(2000) }),
    z.strictObject({ kind: z.literal("OWNED_DOCUMENT"), documentId: DurableIdV2Schema, ownerId: EntityIdV2Schema }),
  ]),
  title: TitleV2Schema,
  issuer: TitleV2Schema.optional(),
  authority: z.enum(["VERIFIED_OFFICIAL", "SECONDARY", "UNKNOWN"]),
  authorityBasis: SummaryV2Schema.optional(),
  retrievedAt: InstantV2Schema,
  documentVersion: TitleV2Schema.optional(),
  documentDate: DateV2Schema.optional(),
  contentHash: DigestV2Schema,
  applicability: AssessmentProfileV2Schema,
  extraction: z.strictObject({
    status: z.enum(["COMPLETE_RELEVANT_SECTIONS", "PARTIAL"]),
    selectedPages: z.array(z.number().int().positive()).max(E.extractedPages),
    ocrPages: z.array(z.number().int().positive()).max(E.ocrPages),
    gaps: z.array(SummaryV2Schema).max(20),
  }),
}).superRefine((source, ctx) => {
  if (source.authority === "VERIFIED_OFFICIAL" && !source.authorityBasis) {
    issue(ctx, ["authorityBasis"], "Verified authority requires a specific basis");
  }
  unique(source.extraction.selectedPages.map(String), ctx, ["extraction", "selectedPages"]);
  unique(source.extraction.ocrPages.map(String), ctx, ["extraction", "ocrPages"]);
  if (source.extraction.ocrPages.some(page => !source.extraction.selectedPages.includes(page))) {
    issue(ctx, ["extraction", "ocrPages"], "OCR pages must be selected pages");
  }
  if (source.extraction.status === "PARTIAL" && source.extraction.gaps.length === 0) {
    issue(ctx, ["extraction", "gaps"], "Partial extraction requires a disclosed gap");
  }
});

export const ResearchClaimV2Schema = z.strictObject({
  claimId: LocalIdV2Schema,
  sourceId: LocalIdV2Schema,
  statement: SummaryV2Schema,
  excerpt: z.string().trim().min(1).max(E.sourceExcerptCharacters),
  anchor: z.strictObject({ page: z.number().int().positive().optional(), section: TitleV2Schema.optional() })
    .refine(value => value.page !== undefined || value.section !== undefined, "An evidence anchor is required"),
  verification: z.strictObject({
    excerpt: z.enum(["VERIFIED", "UNVERIFIED"]),
    support: z.enum(["SUPPORTED", "UNSUPPORTED", "UNCERTAIN"]),
    applicability: z.enum(["MATCHED", "MISMATCHED", "UNCERTAIN"]),
  }),
  kind: z.enum(["ASSESSED_SCOPE", "ASSESSMENT_STRUCTURE", "WEIGHTING", "COURSE_OUTCOME", "RESOURCE", "PREREQUISITE_RECOMMENDATION"]),
  status: z.enum(["CANDIDATE", "ADOPTED", "REJECTED"]),
  uncertainty: SummaryV2Schema.optional(),
}).superRefine((claim, ctx) => {
  if (claim.status === "ADOPTED" && (
    claim.verification.excerpt !== "VERIFIED" || claim.verification.support !== "SUPPORTED" ||
    claim.verification.applicability !== "MATCHED"
  )) issue(ctx, ["status"], "Only supported, applicable, excerpt-verified claims can be adopted");
});

export const ResearchEvidenceV2Schema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  assessment: AssessmentProfileV2Schema,
  sources: z.array(EvidenceSourceV2Schema).max(E.sources),
  claims: z.array(ResearchClaimV2Schema).max(E.claims),
  completeAssessedScope: z.boolean(),
  unresolvedGaps: z.array(SummaryV2Schema).max(20),
}).superRefine((bundle, ctx) => {
  unique(bundle.sources.map(source => source.sourceId), ctx, ["sources"]);
  unique(bundle.claims.map(claim => claim.claimId), ctx, ["claims"]);
  const sources = new Map(bundle.sources.map(source => [source.sourceId, source]));
  bundle.claims.forEach((claim, i) => {
    if (!sources.has(claim.sourceId)) issue(ctx, ["claims", i, "sourceId"], "UNKNOWN_SOURCE");
    const source = sources.get(claim.sourceId);
    if (claim.status === "ADOPTED" && claim.anchor.page !== undefined && source && !source.extraction.selectedPages.includes(claim.anchor.page)) issue(ctx, ["claims", i, "anchor"], "An adopted page claim must come from an extracted page");
  });
  if (bundle.completeAssessedScope && (bundle.unresolvedGaps.length > 0 ||
    !bundle.claims.some(claim => claim.kind === "ASSESSED_SCOPE" && claim.status === "ADOPTED"))) {
    issue(ctx, ["completeAssessedScope"], "Complete scope requires adopted scope evidence and no unresolved gaps");
  }
  if (bundle.completeAssessedScope && bundle.claims.some(claim => claim.kind === "ASSESSED_SCOPE" && claim.status === "ADOPTED" && sources.get(claim.sourceId)?.extraction.status === "PARTIAL")) issue(ctx, ["completeAssessedScope"], "Partial assessed-scope extraction cannot establish completeness");
}), E.researchEvidenceBytes);

export const LearningEvidenceV2Schema = z.strictObject({
  evidenceId: LocalIdV2Schema,
  scopeKeys: z.array(DurableIdV2Schema).max(E.scopeNodes),
  source: z.enum(["SELF_REPORT", "CHECK_RESULT", "ACTIVITY_COMPLETION", "SESSION_PACE", "STUDENT_NOTE"]),
  observedAt: InstantV2Schema,
  reliability: z.enum(["SELF_REPORTED", "OBSERVED_EXECUTION", "SUPPORTED_CHECK"]),
  statement: SummaryV2Schema,
  demonstratesReadiness: z.boolean(),
  resourceRef: LocalIdV2Schema.optional(),
}).superRefine((evidence, ctx) => {
  unique(evidence.scopeKeys, ctx, ["scopeKeys"]);
  if (evidence.demonstratesReadiness && (evidence.source === "ACTIVITY_COMPLETION" || evidence.source === "SESSION_PACE")) {
    issue(ctx, ["demonstratesReadiness"], "Completion or time alone cannot demonstrate readiness");
  }
  if (evidence.reliability === "SUPPORTED_CHECK" && evidence.source !== "CHECK_RESULT") {
    issue(ctx, ["reliability"], "Supported check reliability requires check evidence");
  }
});

export const OwnedReferenceRegistryV2Schema = z.array(z.strictObject({
  ref: LocalIdV2Schema,
  kind: z.enum(["SUBJECT", "GOAL", "QUEST", "STUDY_SESSION", "CHECK", "RESOURCE", "PLAN", "SCOPE"]),
  ownerId: EntityIdV2Schema,
  entityId: z.union([EntityIdV2Schema, DurableIdV2Schema]),
  versionDigest: DigestV2Schema.optional(),
})).max(E.evidenceRecords + E.scopeNodes).superRefine((registry, ctx) => unique(registry.map(ref => ref.ref), ctx, []));

export type AssessmentProfileV2 = z.infer<typeof AssessmentProfileV2Schema>;
export type ResearchEvidenceV2 = z.infer<typeof ResearchEvidenceV2Schema>;
export type LearningEvidenceV2 = z.infer<typeof LearningEvidenceV2Schema>;
export type OwnedReferenceRegistryV2 = z.infer<typeof OwnedReferenceRegistryV2Schema>;

/** The caller still has to load references through authorized database reads. */
export function validateReferenceOwner(registry: OwnedReferenceRegistryV2, ownerId: number): string[] {
  return registry.filter(ref => ref.ownerId !== ownerId).map(ref => ref.ref);
}
