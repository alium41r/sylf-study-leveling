import { z } from "zod";
import { CanonicalIntentV2Schema, ResearchEvidenceV2Schema, ContextDependenciesV2Schema, ExecutionTaskSpecV2Schema, LearningBlueprintV2Schema, BlueprintActivityV2Schema, DigestV2Schema, DurableIdV2Schema, LocalIdV2Schema, SummaryV2Schema } from "../../contracts";
import { BlueprintSnapshotSchema } from "./checkpoint";
import { AllocationFactsSchema, PlanningSupportSchema } from "./planning";
import { SchedulingEnvelopeSchema, AllocationReportSchema } from "./scheduling";
import { CompilerIdentitiesSchema } from "./quality";
import { CompactBlueprintProposalSchema } from "./blueprint-response";

const phase = LearningBlueprintV2Schema.shape.strategy.shape.phases.element;
/** Frozen owned projection, not a second evidence or execution authority. */
export const LearningInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  targets: z.array(z.strictObject({ planRef: LocalIdV2Schema, intent: CanonicalIntentV2Schema,
    allowed: z.strictObject({ scopeRefs: z.array(LocalIdV2Schema), excludedScopeRefs: z.array(LocalIdV2Schema), evidenceRefs: z.array(LocalIdV2Schema), resourceRefs: z.array(LocalIdV2Schema), externalActivityRefs: z.array(LocalIdV2Schema) }),
    readiness: z.array(z.strictObject({ scopeRef: LocalIdV2Schema, evidenceRefs: z.array(LocalIdV2Schema) })),
    kept: z.array(BlueprintActivityV2Schema), keptPhases: z.array(phase),
    replaceable: z.array(z.strictObject({ activity: BlueprintActivityV2Schema, phases: z.array(phase), pin: AllocationFactsSchema.shape.pins.element })),
  })).min(1).max(2),
  facts: AllocationFactsSchema,
  compilationTargets: z.array(z.strictObject({ planRef: LocalIdV2Schema, planId: DurableIdV2Schema, goalId: z.number().int().positive(), context: ContextDependenciesV2Schema,
    sources: z.array(z.strictObject({ sourceId: LocalIdV2Schema, contentHash: DigestV2Schema })) })).min(1).max(2),
  liveSpecs: z.array(ExecutionTaskSpecV2Schema), sharedDependencies: BlueprintSnapshotSchema.shape.sharedDependencies,
  resources: z.array(z.strictObject({ ref: LocalIdV2Schema, sourceRef: LocalIdV2Schema, contentHash: DigestV2Schema })),
  retainedResources: z.array(z.strictObject({planRef:LocalIdV2Schema,ref:LocalIdV2Schema,source:ResearchEvidenceV2Schema.shape.sources.element})).optional(),
  evidence: z.array(z.strictObject({ planRef: LocalIdV2Schema, ref: LocalIdV2Schema, batchIndex: z.number().int().nonnegative(), claimRef: LocalIdV2Schema })),
});
export type LearningInput = z.infer<typeof LearningInputSchema>;
export const TranslationElementSchema = z.strictObject({ ref: LocalIdV2Schema, anchorRef: LocalIdV2Schema,
  meaning: z.enum(["INSTRUCTION", "DEPENDENCY", "EVIDENCE", "CRITERION", "CONDITION", "STOP", "UNCERTAINTY", "ESTIMATE", "RESOURCE", "SCOPE", "GUIDANCE"]),
  disposition: z.enum(["EXECUTION", "RETAINED_GUIDANCE", "GAP"]), explanation: SummaryV2Schema,
  targets: z.array(z.strictObject({ planRef: LocalIdV2Schema, kind: z.enum(["ACTIVITY", "SCOPE", "PHASE", "DECISIONS", "STRATEGY"]), ref: LocalIdV2Schema })).max(400),
});
export const RetentionDecisionSchema = z.strictObject({ planRef: LocalIdV2Schema, activityRef: LocalIdV2Schema, disposition: z.enum(["KEEP", "REPLACE"]), anchorRefs: z.array(LocalIdV2Schema).min(1).max(100), explanation: SummaryV2Schema });
export const NaturalTranslationResponseSchema = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("TRANSLATE"), proposal: CompactBlueprintProposalSchema, elements: z.array(TranslationElementSchema).max(10000),
    retention: z.array(RetentionDecisionSchema).max(400), ambiguities: z.array(SummaryV2Schema).max(200) }),
  z.strictObject({ decision: z.literal("INCOMPLETE"), route: z.enum(["RESEARCH", "STRATEGIST", "TRANSLATOR"]), explanation: SummaryV2Schema,
    anchorRefs: z.array(LocalIdV2Schema).max(100000), needsDecision: z.boolean() }),
]);
export type NaturalTranslationResponse = z.infer<typeof NaturalTranslationResponseSchema>;
export const TranslatedLearningSchema = z.strictObject({ blueprints: BlueprintSnapshotSchema, planning: PlanningSupportSchema, facts: AllocationFactsSchema });
export const AllocatedLearningSchema = z.strictObject({
  ...TranslatedLearningSchema.shape, envelope: SchedulingEnvelopeSchema, allocation: AllocationReportSchema, identities: CompilerIdentitiesSchema,
  searchAllowance: z.number().int().min(1).max(100000),
  compiled: z.array(z.strictObject({ planRef: LocalIdV2Schema, planId: DurableIdV2Schema, goalId: z.number().int().positive(), context: ContextDependenciesV2Schema,
    sources: z.array(z.strictObject({ sourceId: LocalIdV2Schema, contentHash: DigestV2Schema })), specs: z.array(ExecutionTaskSpecV2Schema) })).max(2),
});
export type TranslatedLearning = z.infer<typeof TranslatedLearningSchema>;
export type AllocatedLearning = z.infer<typeof AllocatedLearningSchema>;
