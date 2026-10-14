import { z } from "zod";
import { LocalIdV2Schema, ModelLearningBlueprintV2Schema, SummaryV2Schema, PLANNER_V2_ENVELOPE as E, withPlannerEnvelope } from "../../contracts";
import { BlueprintSnapshotSchema } from "./checkpoint";
import { CompactActivitySchema, CompactEffortSchema, CompactPhaseSchema } from "./blueprint-response";

/** Supporting transport only. These are educational objects, never JSON paths,
 * execution commands, persistent identities or a second planning artifact. */
const base = { planRef: LocalIdV2Schema, issueIds: z.array(LocalIdV2Schema).min(1).max(E.qualityIssues), reason: SummaryV2Schema };
const shape = ModelLearningBlueprintV2Schema.shape;
const strategy = z.strictObject({ outcome: shape.strategy.shape.outcome, explanation: shape.strategy.shape.explanation, recommendedEffort: CompactEffortSchema });
const edge = BlueprintSnapshotSchema.shape.sharedDependencies.element;
export const TargetedRepairSchema = withPlannerEnvelope(z.strictObject({
  corrections: z.array(z.discriminatedUnion("kind", [
    z.strictObject({ ...base, kind: z.literal("ACTIVITY_REPLACE"), activity: CompactActivitySchema }),
    z.strictObject({ ...base, kind: z.literal("ACTIVITY_ADD"), activity: CompactActivitySchema }),
    z.strictObject({ ...base, kind: z.literal("ACTIVITY_REMOVE"), activityRef: LocalIdV2Schema }),
    z.strictObject({ ...base, kind: z.literal("PHASE_REPLACE"), phase: CompactPhaseSchema }),
    z.strictObject({ ...base, kind: z.literal("PHASE_ADD"), phase: CompactPhaseSchema }),
    z.strictObject({ ...base, kind: z.literal("PHASE_REMOVE"), phaseRef: LocalIdV2Schema }),
    z.strictObject({ ...base, kind: z.literal("SCOPE_REPLACE"), scope: shape.scope.element }),
    z.strictObject({ ...base, kind: z.literal("STRATEGY_REPLACE"), strategy }),
    z.strictObject({ ...base, kind: z.literal("DECISIONS_REPLACE"), decisions: shape.decisions }),
    z.strictObject({ ...base, kind: z.literal("CHECKPOINT_REPLACE"), checkpoint: SummaryV2Schema }),
    z.strictObject({ ...base, kind: z.literal("TRADE_OFF_REPLACE"), tradeOffExplanation: SummaryV2Schema }),
    z.strictObject({ ...base, kind: z.literal("SHARED_DEPENDENCY_ADD"), edge }),
    z.strictObject({ ...base, kind: z.literal("SHARED_DEPENDENCY_REMOVE"), edge }),
  ])).min(1).max(E.newlyDetailedActivities),
}), 32 * 1024);
export type TargetedRepair = z.infer<typeof TargetedRepairSchema>;

export function targetedRepairResponseContract() {
  const fields = (object: z.ZodObject) => ({ required: Object.entries(object.shape).filter(([, s]) => !s.isOptional()).map(([n]) => n), optional: Object.entries(object.shape).filter(([, s]) => s.isOptional()).map(([n]) => n) });
  return {
    root: { corrections: "1..60 explicit corrections; omit untouched objects" },
    correctionKinds: TargetedRepairSchema.shape.corrections.element.options.map(o => ({ kind: o.shape.kind.value, ...fields(o) })),
    objects: { activity: fields(CompactActivitySchema), phase: fields(CompactPhaseSchema), strategy: fields(strategy), scope: fields(shape.scope.element), decisions: fields(shape.decisions), edge: fields(edge), endpoint: fields(edge.shape.prerequisite),
      commitment: CompactActivitySchema.shape.commitment.options.map(o => ({ category: o.shape.category.value, ...fields(o) })),
      trigger: fields(CompactActivitySchema.shape.commitment.options[1].shape.trigger), learningWindow: fields(CompactActivitySchema.shape.learningWindow.unwrap()), splitPoint: fields(CompactActivitySchema.shape.splitPoints.unwrap().element) },
    effort: "[low,likely,high] nonnegative integers, low<=likely<=high; required activity/strategy, optional phase",
    values: { disposition: shape.scope.element.shape.disposition.options, strength: edge.shape.strength.options, cognitiveDemand: CompactActivitySchema.shape.cognitiveDemand.unwrap().options },
    limits: { bytes: 32 * 1024, corrections: E.newlyDetailedActivities, newActivitiesAcrossPlans: E.newlyDetailedActivities, references: E.referencesPerActivity, timebox: [E.timeboxMinMinutes, E.timeboxMaxMinutes], title: E.titleCharacters, summaryCriterionReason: E.summaryCharacters, instructionsExplanation: E.proseCharacters },
  };
}
