"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResearchReviewSchema = exports.ScopeBindingSchema = exports.ResearchExtractionSchema = exports.assessmentFields = void 0;
const zod_1 = require("zod");
const contracts_1 = require("../../contracts");
exports.assessmentFields = Object.keys(contracts_1.AssessmentProfileV2Schema.shape);
const anchor = zod_1.z.strictObject({ page: zod_1.z.number().int().positive().optional(), section: contracts_1.TitleV2Schema.optional() }).refine(a => a.page !== undefined || !!a.section);
const identity = zod_1.z.strictObject({ sourceId: contracts_1.LocalIdV2Schema, fields: zod_1.z.array(zod_1.z.strictObject({ field: zod_1.z.enum(exports.assessmentFields), value: contracts_1.TitleV2Schema, excerpt: zod_1.z.string().min(1).max(2000), anchor })).max(8) });
exports.ResearchExtractionSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.strictObject({
    identities: zod_1.z.array(identity).max(9), claims: zod_1.z.array(zod_1.z.strictObject({ sourceId: contracts_1.LocalIdV2Schema, statement: contracts_1.SummaryV2Schema, excerpt: zod_1.z.string().min(1).max(2000), anchor,
        kind: zod_1.z.enum(["ASSESSED_SCOPE", "ASSESSMENT_STRUCTURE", "WEIGHTING", "COURSE_OUTCOME", "RESOURCE", "PREREQUISITE_RECOMMENDATION"]) })).max(200),
    completeSourceIds: zod_1.z.array(contracts_1.LocalIdV2Schema).max(9), gaps: zod_1.z.array(contracts_1.SummaryV2Schema).max(20),
    followUp: zod_1.z.strictObject({ query: contracts_1.SummaryV2Schema, consequence: contracts_1.SummaryV2Schema }).optional(), answer: zod_1.z.string().min(1).max(4000),
}));
exports.ScopeBindingSchema = zod_1.z.strictObject({ claimId: contracts_1.LocalIdV2Schema, scopeRefs: zod_1.z.array(contracts_1.LocalIdV2Schema).max(500), disposition: zod_1.z.enum(["ADD_SCOPE", "ANNOTATE_SCOPE", "EXCLUDED", "RESOURCE_ONLY"]) });
const judgment = zod_1.z.strictObject({ support: zod_1.z.enum(["SUPPORTED", "UNSUPPORTED", "UNCERTAIN"]), applicability: zod_1.z.enum(["MATCHED", "MISMATCHED", "UNCERTAIN"]), reason: contracts_1.SummaryV2Schema });
exports.ResearchReviewSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.strictObject({
    scopeBindings: zod_1.z.array(exports.ScopeBindingSchema).max(200).default([]),
    followUpClaims: zod_1.z.array(zod_1.z.strictObject({ claim: exports.ResearchExtractionSchema.shape.claims.element, review: judgment, scopeRefs: zod_1.z.array(contracts_1.LocalIdV2Schema).max(500), disposition: exports.ScopeBindingSchema.shape.disposition })).max(60).default([]),
    followUpIdentities: zod_1.z.array(identity).max(9).default([]),
    claims: zod_1.z.array(zod_1.z.strictObject({ claimId: contracts_1.LocalIdV2Schema, support: zod_1.z.enum(["SUPPORTED", "UNSUPPORTED", "UNCERTAIN"]), applicability: zod_1.z.enum(["MATCHED", "MISMATCHED", "UNCERTAIN"]), reason: contracts_1.SummaryV2Schema })).max(200),
    identities: zod_1.z.array(zod_1.z.strictObject({ sourceId: contracts_1.LocalIdV2Schema, fields: zod_1.z.array(zod_1.z.strictObject({ field: zod_1.z.enum(exports.assessmentFields), supported: zod_1.z.boolean() })).max(8) })).max(9),
    completeSourceIds: zod_1.z.array(contracts_1.LocalIdV2Schema).max(9), conflicts: zod_1.z.array(contracts_1.SummaryV2Schema).max(20), answer: zod_1.z.string().min(1).max(4000),
}));
