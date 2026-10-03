"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantResponseSchema = void 0;
const zod_1 = require("zod");
const envelope_1 = require("../../contracts/envelope");
const primitives_1 = require("../../contracts/primitives");
const planRefs = zod_1.z.array(primitives_1.LocalIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.targets).superRefine((refs, ctx) => (0, primitives_1.unique)(refs, ctx, []));
/** Model suggestions carry local aliases, never authority to enqueue or apply. */
exports.AssistantResponseSchema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.discriminatedUnion("kind", [
    zod_1.z.strictObject({ kind: zod_1.z.literal("ANSWER"), message: primitives_1.ProseV2Schema }),
    zod_1.z.strictObject({ kind: zod_1.z.literal("QUESTION"), message: primitives_1.ProseV2Schema, questions: zod_1.z.array(primitives_1.SummaryV2Schema).min(1).max(3) }),
    zod_1.z.strictObject({ kind: zod_1.z.literal("SUGGESTED_CHANGE"), message: primitives_1.ProseV2Schema, planRefs, change: primitives_1.SummaryV2Schema }),
    zod_1.z.strictObject({ kind: zod_1.z.literal("PROPOSAL"), message: primitives_1.ProseV2Schema, planRefs: planRefs.refine(refs => refs.length > 0), change: primitives_1.SummaryV2Schema, researchRequested: zod_1.z.boolean() }),
]));
