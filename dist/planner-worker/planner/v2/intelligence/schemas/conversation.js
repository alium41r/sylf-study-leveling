"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyConversation = exports.ConversationSchema = exports.ConversationTargetSchema = void 0;
const zod_1 = require("zod");
const assistant_1 = require("./assistant");
const contracts_1 = require("../../contracts");
const assistant_intake_1 = require("./assistant-intake");
exports.ConversationTargetSchema = zod_1.z.strictObject({ planId: contracts_1.DurableIdV2Schema, intentId: contracts_1.DurableIdV2Schema, planningVersion: zod_1.z.number().int().nonnegative(), baseRevisionId: contracts_1.DurableIdV2Schema.nullable(), contextDigest: contracts_1.DigestV2Schema });
exports.ConversationSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: zod_1.z.literal(2),
    events: zod_1.z.array(zod_1.z.strictObject({ key: zod_1.z.string().regex(/^[A-Za-z0-9_-]{8,100}$/), requestDigest: contracts_1.DigestV2Schema,
        at: contracts_1.InstantV2Schema, text: contracts_1.ProseV2Schema, response: assistant_1.AssistantResponseSchema, budget: contracts_1.RuntimeBudgetV2Schema,
        targetBindings: zod_1.z.array(exports.ConversationTargetSchema).min(1).max(2), mode: zod_1.z.enum(["ADVICE", "PLAN_ACTION"]), intentPatch: assistant_intake_1.IntakePatchSchema.optional(), questions: zod_1.z.array(assistant_intake_1.QuestionDetailSchema).max(3) })).max(24),
    omittedEvents: zod_1.z.number().int().nonnegative(),
    recommendations: zod_1.z.array(zod_1.z.strictObject({ id: contracts_1.DurableIdV2Schema, eventKey: zod_1.z.string(), change: contracts_1.SummaryV2Schema,
        targets: zod_1.z.array(exports.ConversationTargetSchema).min(1).max(2),
        researchRequested: zod_1.z.boolean() })).max(8),
}), 128 * 1024);
const emptyConversation = () => ({ schemaVersion: 2, events: [], recommendations: [], omittedEvents: 0 });
exports.emptyConversation = emptyConversation;
