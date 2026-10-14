import { z } from "zod";
import {
  EffortRangeV2Schema, LocalIdV2Schema, ModelLearningBlueprintV2Schema,
  PLANNER_V2_ENVELOPE as E, SummaryV2Schema, withPlannerEnvelope,
} from "../../contracts";
import { BlueprintSnapshotSchema } from "./checkpoint";
import { DetailSchema, RecoveryAdjustmentSchema } from "./planning";

/** Ephemeral provider transport, never a stored blueprint or execution contract.
 * Every educational field comes from the canonical shape. Cross-field checks
 * run on the complete canonical artifact, after owned retained work is joined. */
export const CompactEffortSchema = z.tuple([
  EffortRangeV2Schema.shape.lowMinutes,
  EffortRangeV2Schema.shape.likelyMinutes,
  EffortRangeV2Schema.shape.highMinutes,
]);
const blueprint = ModelLearningBlueprintV2Schema.shape;
export const CompactPhaseSchema = z.strictObject({ ...blueprint.strategy.shape.phases.element.shape,
  effort: CompactEffortSchema.optional() });
export const CompactActivitySchema = z.strictObject({ ...blueprint.activities.element.shape, effort: CompactEffortSchema });
const phase = CompactPhaseSchema, activity = CompactActivitySchema;
const strategy = z.strictObject({
  outcome: blueprint.strategy.shape.outcome,
  explanation: blueprint.strategy.shape.explanation,
  recommendedEffort: CompactEffortSchema,
  phases: z.array(phase).max(E.milestones),
});
const plan = z.strictObject({
  planRef: LocalIdV2Schema, strategy, scope: blueprint.scope,
  activities: z.array(activity).max(E.newlyDetailedActivities), decisions: blueprint.decisions,
});
export const CompactBlueprintProposalSchema = withPlannerEnvelope(z.strictObject({
  detail: DetailSchema,
  tradeOffExplanation: SummaryV2Schema,
  plans: z.array(plan).min(1).max(E.targets),
  sharedDependencies: BlueprintSnapshotSchema.shape.sharedDependencies,
  recoveryAdjustment: RecoveryAdjustmentSchema.optional(),
}));
const keep = z.strictObject({ decision: z.literal("KEEP"), reason: SummaryV2Schema });
/** Select the declared response shape before parsing so malformed replacements
 * retain precise Zod field paths for the existing metered fallback diagnostics. */
export function parseCompactBlueprintResponse(value: unknown) {
  if (value && typeof value === "object" && "decision" in value && value.decision === "KEEP") return keep.parse(value);
  return CompactBlueprintProposalSchema.parse(value);
}
export type CompactBlueprintProposal = z.infer<typeof CompactBlueprintProposalSchema>;

/** No defaults, estimates, prose or reference choices are supplied by assembly. */
export function expandCompactEffort([lowMinutes, likelyMinutes, highMinutes]: z.infer<typeof CompactEffortSchema>) {
  return { lowMinutes, likelyMinutes, highMinutes };
}

const fields = (object: z.ZodObject) => ({
  required: Object.entries(object.shape).filter(([, schema]) => !schema.isOptional()).map(([name]) => name),
  optional: Object.entries(object.shape).filter(([, schema]) => schema.isOptional()).map(([name]) => name),
});
const edge = BlueprintSnapshotSchema.shape.sharedDependencies.element;
const objects = {
  root: fields(CompactBlueprintProposalSchema), plan: fields(plan), strategy: fields(strategy),
  phase: fields(phase), scope: fields(blueprint.scope.element), activity: fields(activity),
  decisions: fields(blueprint.decisions), detail: fields(DetailSchema),
  sharedDependency: fields(edge), endpoint: fields(edge.shape.prerequisite),
  splitPoint: fields(activity.shape.splitPoints.unwrap().element),
  learningWindow: fields(activity.shape.learningWindow.unwrap()),
  commitments: activity.shape.commitment.options.map(option => ({ category: option.shape.category.value, ...fields(option) })),
  trigger: fields(activity.shape.commitment.options[1].shape.trigger),
  recoveryAdjustment: fields(RecoveryAdjustmentSchema),
};

/** One schema-derived field inventory; no specimen education or canonical receipts. */
export function compactBlueprintResponseContract(selectedPlans: readonly string[], adaptation = false) {
  return {
    instruction: "Return one replacement object using exactly the listed fields. Include required fields; omit unused optional fields. Never use null. All reference lists are arrays. Each selected Plan occurs once and scope covers its entire allowlist. Educational choices are yours.",
    selectedPlans,
    objects: { ...objects, root: { ...objects.root, optional: adaptation ? objects.root.optional : [] } },
    values: {
      effort: "[lowMinutes,likelyMinutes,highMinutes]: three nonnegative integers, low<=likely<=high; required for each activity and recommendedEffort, optional for phases",
      disposition: blueprint.scope.element.shape.disposition.options,
      strength: edge.shape.strength.options,
      cognitiveDemand: activity.shape.cognitiveDemand.unwrap().options,
      detailDays: [14, 28],
    },
    limits: { targets: E.targets, newActivitiesAcrossPlans: E.newlyDetailedActivities,
      scopePerPlan: E.scopeNodes, phasesPerPlan: E.milestones, referencesPerActivity: E.referencesPerActivity,
      timeboxMinutes: [E.timeboxMinMinutes, E.timeboxMaxMinutes], id: "[a-z][a-z0-9_-]*, at most 64 characters",
      title: E.titleCharacters, summaryReasonCriterion: E.summaryCharacters, instructionsExplanation: E.proseCharacters,
      activityType: 80, splitPoints: 12, assumptions: 30, otherDecisionLists: 20 },
    ...(adaptation ? { keep: { decision: "KEEP", reason: "Explain why no valid educational change is needed or possible." },
      recoveryAdjustment: "Only an explicit reduction of the existing soft recovery margin; percent is 0..50, with reason." } : {}),
  };
}
