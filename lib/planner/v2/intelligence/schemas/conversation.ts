import { z } from "zod";
import { AssistantResponseSchema } from "./assistant";
import { DurableIdV2Schema, DigestV2Schema, InstantV2Schema, SummaryV2Schema, ProseV2Schema, RuntimeBudgetV2Schema, withPlannerEnvelope } from "../../contracts";
import { IntakePatchSchema, QuestionDetailSchema } from "./assistant-intake";

export const ConversationTargetSchema = z.strictObject({ planId: DurableIdV2Schema, intentId: DurableIdV2Schema, planningVersion: z.number().int().nonnegative(), baseRevisionId: DurableIdV2Schema.nullable(), contextDigest: DigestV2Schema });

export const ConversationSchema = withPlannerEnvelope(z.strictObject({
  schemaVersion: z.literal(2),
  events: z.array(z.strictObject({ key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/), requestDigest: DigestV2Schema,
    at: InstantV2Schema, text: ProseV2Schema, response: AssistantResponseSchema, budget: RuntimeBudgetV2Schema,
    targetBindings: z.array(ConversationTargetSchema).min(1).max(2), mode: z.enum(["ADVICE", "PLAN_ACTION"]), intentPatch: IntakePatchSchema.optional(), questions: z.array(QuestionDetailSchema).max(3) })).max(24),
  omittedEvents: z.number().int().nonnegative(),
  recommendations: z.array(z.strictObject({ id: DurableIdV2Schema, eventKey: z.string(), change: SummaryV2Schema,
    targets: z.array(ConversationTargetSchema).min(1).max(2),
    researchRequested: z.boolean() })).max(8),
}), 128 * 1024);
export type PlannerConversation = z.infer<typeof ConversationSchema>;
export const emptyConversation = (): PlannerConversation => ({ schemaVersion: 2, events: [], recommendations: [], omittedEvents: 0 });
