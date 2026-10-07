"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantPassSchema = exports.QuestionDetailSchema = exports.IntakePatchSchema = void 0;
const zod_1 = require("zod");
const contracts_1 = require("../../contracts");
const assistant_1 = require("./assistant");
const shape = contracts_1.CanonicalIntentV2Schema.shape;
exports.IntakePatchSchema = zod_1.z.strictObject({ title: shape.title.optional(), outcome: shape.outcome.optional(), policy: shape.policy.optional(),
    assessment: shape.assessment, deadline: shape.deadline.optional(), preferences: shape.preferences.optional(),
    scopeSuggestions: zod_1.z.array(contracts_1.TitleV2Schema).max(500).optional(),
    studentNotes: zod_1.z.array(zod_1.z.strictObject({ statement: contracts_1.SummaryV2Schema, scopeRefs: zod_1.z.array(contracts_1.LocalIdV2Schema).max(500) })).max(20).optional() });
exports.QuestionDetailSchema = zod_1.z.strictObject({ question: contracts_1.SummaryV2Schema,
    field: zod_1.z.enum(["outcome", "scope", "deadline", "availability", "priorities", "learningDifficulty", "institution", "qualification", "syllabusCode", "component", "examinationCycle", "programme", "variant", "selectedSubset"]),
    consequence: contracts_1.SummaryV2Schema, basis: zod_1.z.enum(["MISSING", "CONTRADICTORY"]), evidenceRefs: zod_1.z.array(contracts_1.LocalIdV2Schema).max(10) });
exports.AssistantPassSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.discriminatedUnion("pass", [
    zod_1.z.strictObject({ pass: zod_1.z.literal("LOOKUP"), requests: zod_1.z.array(zod_1.z.strictObject({ planRef: contracts_1.LocalIdV2Schema,
            kind: zod_1.z.enum(["SUBJECT_DETAILS", "PRIOR_DECISIONS"]) })).min(1).max(2) }),
    zod_1.z.strictObject({ pass: zod_1.z.literal("RESPONSE"), response: assistant_1.AssistantResponseSchema, questions: zod_1.z.array(exports.QuestionDetailSchema).max(3), intentPatch: exports.IntakePatchSchema.optional() }),
]));
