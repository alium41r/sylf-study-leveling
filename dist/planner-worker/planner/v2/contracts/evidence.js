"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnedReferenceRegistryV2Schema = exports.LearningEvidenceV2Schema = exports.ResearchEvidenceV2Schema = exports.ResearchClaimV2Schema = exports.EvidenceSourceV2Schema = exports.AssessmentProfileV2Schema = void 0;
exports.validateReferenceOwner = validateReferenceOwner;
const zod_1 = require("zod");
const envelope_1 = require("./envelope");
const primitives_1 = require("./primitives");
exports.AssessmentProfileV2Schema = zod_1.z.strictObject({
    institution: primitives_1.TitleV2Schema.optional(),
    qualification: primitives_1.TitleV2Schema.optional(),
    syllabusCode: primitives_1.TitleV2Schema.optional(),
    component: primitives_1.TitleV2Schema.optional(),
    examinationCycle: primitives_1.TitleV2Schema.optional(),
    programme: primitives_1.TitleV2Schema.optional(),
    variant: primitives_1.TitleV2Schema.optional(),
    selectedSubset: primitives_1.SummaryV2Schema.optional(),
});
exports.EvidenceSourceV2Schema = zod_1.z.strictObject({
    sourceId: primitives_1.LocalIdV2Schema,
    location: zod_1.z.discriminatedUnion("kind", [
        zod_1.z.strictObject({ kind: zod_1.z.literal("PUBLIC_URL"), finalUrl: zod_1.z.url().max(2000) }),
        zod_1.z.strictObject({ kind: zod_1.z.literal("OWNED_DOCUMENT"), documentId: primitives_1.DurableIdV2Schema, ownerId: primitives_1.EntityIdV2Schema }),
    ]),
    title: primitives_1.TitleV2Schema,
    issuer: primitives_1.TitleV2Schema.optional(),
    authority: zod_1.z.enum(["VERIFIED_OFFICIAL", "SECONDARY", "UNKNOWN"]),
    authorityBasis: primitives_1.SummaryV2Schema.optional(),
    retrievedAt: primitives_1.InstantV2Schema,
    documentVersion: primitives_1.TitleV2Schema.optional(),
    documentDate: primitives_1.DateV2Schema.optional(),
    contentHash: primitives_1.DigestV2Schema,
    applicability: exports.AssessmentProfileV2Schema,
    extraction: zod_1.z.strictObject({
        status: zod_1.z.enum(["COMPLETE_RELEVANT_SECTIONS", "PARTIAL"]),
        selectedPages: zod_1.z.array(zod_1.z.number().int().positive()).max(envelope_1.PLANNER_V2_ENVELOPE.extractedPages),
        ocrPages: zod_1.z.array(zod_1.z.number().int().positive()).max(envelope_1.PLANNER_V2_ENVELOPE.ocrPages),
        gaps: zod_1.z.array(primitives_1.SummaryV2Schema).max(20),
    }),
}).superRefine((source, ctx) => {
    if (source.authority === "VERIFIED_OFFICIAL" && !source.authorityBasis) {
        (0, primitives_1.issue)(ctx, ["authorityBasis"], "Verified authority requires a specific basis");
    }
    (0, primitives_1.unique)(source.extraction.selectedPages.map(String), ctx, ["extraction", "selectedPages"]);
    (0, primitives_1.unique)(source.extraction.ocrPages.map(String), ctx, ["extraction", "ocrPages"]);
    if (source.extraction.ocrPages.some(page => !source.extraction.selectedPages.includes(page))) {
        (0, primitives_1.issue)(ctx, ["extraction", "ocrPages"], "OCR pages must be selected pages");
    }
    if (source.extraction.status === "PARTIAL" && source.extraction.gaps.length === 0) {
        (0, primitives_1.issue)(ctx, ["extraction", "gaps"], "Partial extraction requires a disclosed gap");
    }
});
exports.ResearchClaimV2Schema = zod_1.z.strictObject({
    claimId: primitives_1.LocalIdV2Schema,
    sourceId: primitives_1.LocalIdV2Schema,
    statement: primitives_1.SummaryV2Schema,
    excerpt: zod_1.z.string().trim().min(1).max(envelope_1.PLANNER_V2_ENVELOPE.sourceExcerptCharacters),
    anchor: zod_1.z.strictObject({ page: zod_1.z.number().int().positive().optional(), section: primitives_1.TitleV2Schema.optional() })
        .refine(value => value.page !== undefined || value.section !== undefined, "An evidence anchor is required"),
    verification: zod_1.z.strictObject({
        excerpt: zod_1.z.enum(["VERIFIED", "UNVERIFIED"]),
        support: zod_1.z.enum(["SUPPORTED", "UNSUPPORTED", "UNCERTAIN"]),
        applicability: zod_1.z.enum(["MATCHED", "MISMATCHED", "UNCERTAIN"]),
    }),
    kind: zod_1.z.enum(["ASSESSED_SCOPE", "ASSESSMENT_STRUCTURE", "WEIGHTING", "COURSE_OUTCOME", "RESOURCE", "PREREQUISITE_RECOMMENDATION"]),
    status: zod_1.z.enum(["CANDIDATE", "ADOPTED", "REJECTED"]),
    uncertainty: primitives_1.SummaryV2Schema.optional(),
}).superRefine((claim, ctx) => {
    if (claim.status === "ADOPTED" && (claim.verification.excerpt !== "VERIFIED" || claim.verification.support !== "SUPPORTED" ||
        claim.verification.applicability !== "MATCHED"))
        (0, primitives_1.issue)(ctx, ["status"], "Only supported, applicable, excerpt-verified claims can be adopted");
});
exports.ResearchEvidenceV2Schema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    assessment: exports.AssessmentProfileV2Schema,
    sources: zod_1.z.array(exports.EvidenceSourceV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.sources),
    claims: zod_1.z.array(exports.ResearchClaimV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.claims),
    completeAssessedScope: zod_1.z.boolean(),
    unresolvedGaps: zod_1.z.array(primitives_1.SummaryV2Schema).max(20),
}).superRefine((bundle, ctx) => {
    (0, primitives_1.unique)(bundle.sources.map(source => source.sourceId), ctx, ["sources"]);
    (0, primitives_1.unique)(bundle.claims.map(claim => claim.claimId), ctx, ["claims"]);
    const sources = new Map(bundle.sources.map(source => [source.sourceId, source]));
    bundle.claims.forEach((claim, i) => {
        if (!sources.has(claim.sourceId))
            (0, primitives_1.issue)(ctx, ["claims", i, "sourceId"], "UNKNOWN_SOURCE");
        const source = sources.get(claim.sourceId);
        if (claim.status === "ADOPTED" && claim.anchor.page !== undefined && source && !source.extraction.selectedPages.includes(claim.anchor.page))
            (0, primitives_1.issue)(ctx, ["claims", i, "anchor"], "An adopted page claim must come from an extracted page");
    });
    if (bundle.completeAssessedScope && (bundle.unresolvedGaps.length > 0 ||
        !bundle.claims.some(claim => claim.kind === "ASSESSED_SCOPE" && claim.status === "ADOPTED"))) {
        (0, primitives_1.issue)(ctx, ["completeAssessedScope"], "Complete scope requires adopted scope evidence and no unresolved gaps");
    }
    if (bundle.completeAssessedScope && bundle.claims.some(claim => claim.kind === "ASSESSED_SCOPE" && claim.status === "ADOPTED" && sources.get(claim.sourceId)?.extraction.status === "PARTIAL"))
        (0, primitives_1.issue)(ctx, ["completeAssessedScope"], "Partial assessed-scope extraction cannot establish completeness");
}), envelope_1.PLANNER_V2_ENVELOPE.researchEvidenceBytes);
exports.LearningEvidenceV2Schema = zod_1.z.strictObject({
    evidenceId: primitives_1.LocalIdV2Schema,
    scopeKeys: zod_1.z.array(primitives_1.DurableIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.scopeNodes),
    source: zod_1.z.enum(["SELF_REPORT", "CHECK_RESULT", "ACTIVITY_COMPLETION", "SESSION_PACE", "STUDENT_NOTE"]),
    observedAt: primitives_1.InstantV2Schema,
    reliability: zod_1.z.enum(["SELF_REPORTED", "OBSERVED_EXECUTION", "SUPPORTED_CHECK"]),
    statement: primitives_1.SummaryV2Schema,
    demonstratesReadiness: zod_1.z.boolean(),
    resourceRef: primitives_1.LocalIdV2Schema.optional(),
}).superRefine((evidence, ctx) => {
    (0, primitives_1.unique)(evidence.scopeKeys, ctx, ["scopeKeys"]);
    if (evidence.demonstratesReadiness && (evidence.source === "ACTIVITY_COMPLETION" || evidence.source === "SESSION_PACE")) {
        (0, primitives_1.issue)(ctx, ["demonstratesReadiness"], "Completion or time alone cannot demonstrate readiness");
    }
    if (evidence.reliability === "SUPPORTED_CHECK" && evidence.source !== "CHECK_RESULT") {
        (0, primitives_1.issue)(ctx, ["reliability"], "Supported check reliability requires check evidence");
    }
});
exports.OwnedReferenceRegistryV2Schema = zod_1.z.array(zod_1.z.strictObject({
    ref: primitives_1.LocalIdV2Schema,
    kind: zod_1.z.enum(["SUBJECT", "GOAL", "QUEST", "STUDY_SESSION", "CHECK", "RESOURCE", "PLAN", "SCOPE"]),
    ownerId: primitives_1.EntityIdV2Schema,
    entityId: zod_1.z.union([primitives_1.EntityIdV2Schema, primitives_1.DurableIdV2Schema]),
    versionDigest: primitives_1.DigestV2Schema.optional(),
})).max(envelope_1.PLANNER_V2_ENVELOPE.evidenceRecords + envelope_1.PLANNER_V2_ENVELOPE.scopeNodes).superRefine((registry, ctx) => (0, primitives_1.unique)(registry.map(ref => ref.ref), ctx, []));
/** The caller still has to load references through authorized database reads. */
function validateReferenceOwner(registry, ownerId) {
    return registry.filter(ref => ref.ownerId !== ownerId).map(ref => ref.ref);
}
