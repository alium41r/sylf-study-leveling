import { z } from "zod";
import { CanonicalIntentV2Schema, LocalIdV2Schema, SummaryV2Schema, TitleV2Schema, withPlannerEnvelope } from "../../contracts";
import { AssistantResponseSchema } from "./assistant";
const shape = CanonicalIntentV2Schema.shape;
export const IntakePatchSchema = z.strictObject({ title: shape.title.optional(), outcome: shape.outcome.optional(), policy: shape.policy.optional(),
  assessment: shape.assessment, deadline: shape.deadline.optional(), preferences: shape.preferences.optional(),
  scopeSuggestions: z.array(TitleV2Schema).max(500).optional(),
  studentNotes: z.array(z.strictObject({ statement: SummaryV2Schema, scopeRefs: z.array(LocalIdV2Schema).max(500) })).max(20).optional() });
export const QuestionDetailSchema = z.strictObject({ question: SummaryV2Schema,
  field: z.enum(["outcome", "scope", "deadline", "availability", "priorities", "learningDifficulty", "institution", "qualification", "syllabusCode", "component", "examinationCycle", "programme", "variant", "selectedSubset"]),
  consequence: SummaryV2Schema, basis: z.enum(["MISSING", "CONTRADICTORY"]), evidenceRefs: z.array(LocalIdV2Schema).max(10) });
export const AssistantPassSchema = withPlannerEnvelope(z.discriminatedUnion("pass", [
  z.strictObject({ pass: z.literal("LOOKUP"), requests: z.array(z.strictObject({ planRef: LocalIdV2Schema,
    kind: z.enum(["SUBJECT_DETAILS", "PRIOR_DECISIONS"]) })).min(1).max(2) }),
  z.strictObject({ pass: z.literal("RESPONSE"), response: AssistantResponseSchema, questions: z.array(QuestionDetailSchema).max(3), intentPatch: IntakePatchSchema.optional() }),
]));
export type AssistantPass = z.infer<typeof AssistantPassSchema>;
