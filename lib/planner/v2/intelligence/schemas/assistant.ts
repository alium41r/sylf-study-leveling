import { z } from "zod";
import { PLANNER_V2_ENVELOPE as E, withPlannerEnvelope } from "../../contracts/envelope";
import { LocalIdV2Schema, ProseV2Schema, SummaryV2Schema, unique } from "../../contracts/primitives";

const planRefs = z.array(LocalIdV2Schema).max(E.targets).superRefine((refs, ctx) => unique(refs, ctx, []));

/** Model suggestions carry local aliases, never authority to enqueue or apply. */
export const AssistantResponseSchema = withPlannerEnvelope(z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ANSWER"), message: ProseV2Schema }),
  z.strictObject({ kind: z.literal("QUESTION"), message: ProseV2Schema, questions: z.array(SummaryV2Schema).min(1).max(3) }),
  z.strictObject({ kind: z.literal("SUGGESTED_CHANGE"), message: ProseV2Schema, planRefs, change: SummaryV2Schema }),
  z.strictObject({ kind: z.literal("PROPOSAL"), message: ProseV2Schema, planRefs: planRefs.refine(refs => refs.length > 0), change: SummaryV2Schema, researchRequested: z.boolean() }),
]));

export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;
