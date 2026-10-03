import { z } from "zod";
import { PLANNER_V2_ENVELOPE as E, withPlannerEnvelope } from "./envelope";
import {
  CriterionV2Schema, EffortRangeV2Schema, LocalIdV2Schema, PolicyV2Schema,
  ProseV2Schema, SummaryV2Schema, TimeboxV2Schema, TitleV2Schema, VersionV2Schema,
  issue, unique, validateDag,
} from "./primitives";

const referenceList = z.array(LocalIdV2Schema).max(E.referencesPerActivity);
const activityCommitment = z.discriminatedUnion("category", [
  z.strictObject({ category: z.literal("COMMITTED") }),
  z.strictObject({
    category: z.literal("CONTINGENT"),
    trigger: z.strictObject({ checkpointActivityId: LocalIdV2Schema, condition: SummaryV2Schema }),
  }),
  z.strictObject({ category: z.literal("OPTIONAL"), reason: SummaryV2Schema }),
]);

export const BlueprintActivityV2Schema = z.strictObject({
  localId: LocalIdV2Schema,
  outcomeRefs: referenceList,
  scopeRefs: referenceList,
  title: TitleV2Schema,
  activityType: z.string().trim().min(1).max(80),
  purpose: SummaryV2Schema,
  instructions: ProseV2Schema,
  completionCriterion: CriterionV2Schema,
  effort: EffortRangeV2Schema,
  timeboxMinutes: TimeboxV2Schema,
  commitment: activityCommitment,
  hardDependencies: referenceList,
  advisoryOrderAfter: referenceList.optional(),
  resourceRefs: referenceList.optional(),
  evidenceRefs: referenceList.optional(),
  stage: TitleV2Schema.optional(),
  cognitiveDemand: z.enum(["LIGHT", "MODERATE", "HEAVY"]).optional(),
  stoppingCondition: SummaryV2Schema.optional(),
  splitPoints: z.array(z.strictObject({
    afterMinutes: z.number().int().positive(),
    completionCriterion: CriterionV2Schema,
  })).max(12).optional(),
  learningWindow: z.strictObject({
    anchorActivityId: LocalIdV2Schema,
    minimumGapDays: z.number().int().nonnegative().optional(),
    preferredGapDays: z.number().int().nonnegative().optional(),
    maximumGapDays: z.number().int().nonnegative().optional(),
    strength: z.enum(["HARD", "ADVISORY"]),
    reason: SummaryV2Schema,
  }).optional(),
}).superRefine((activity, ctx) => {
  for (const field of ["outcomeRefs", "scopeRefs", "hardDependencies", "advisoryOrderAfter", "resourceRefs", "evidenceRefs"] as const) {
    unique(activity[field] ?? [], ctx, [field]);
  }
  if (activity.hardDependencies.includes(activity.localId)) issue(ctx, ["hardDependencies"], "SELF_DEPENDENCY");
  if (activity.splitPoints) {
    unique(activity.splitPoints.map(point => String(point.afterMinutes)), ctx, ["splitPoints"]);
    if (activity.splitPoints.some(point => point.afterMinutes < E.timeboxMinMinutes ||
      activity.timeboxMinutes - point.afterMinutes < E.timeboxMinMinutes)) {
      issue(ctx, ["splitPoints"], "Splits must preserve meaningful bounded timeboxes");
    }
  }
  const window = activity.learningWindow;
  if (window) {
    const gaps = [window.minimumGapDays, window.preferredGapDays, window.maximumGapDays].filter((gap): gap is number => gap !== undefined);
    if (gaps.length === 0 || gaps.some((gap, i) => i > 0 && gap < gaps[i - 1])) {
      issue(ctx, ["learningWindow"], "Learning-window gaps must be present and ordered");
    }
  }
});

function blueprintSchema(activityLimit: number) {
  return withPlannerEnvelope(z.strictObject({
    schemaVersion: VersionV2Schema,
    strategy: z.strictObject({
      policy: PolicyV2Schema,
      outcome: SummaryV2Schema,
      explanation: ProseV2Schema,
      recommendedEffort: EffortRangeV2Schema,
      phases: z.array(z.strictObject({
        localId: LocalIdV2Schema,
        title: TitleV2Schema,
        outcome: SummaryV2Schema,
        effort: EffortRangeV2Schema.optional(),
        readinessCriterion: CriterionV2Schema.optional(),
      })).max(E.milestones),
    }),
    scope: z.array(z.strictObject({
      scopeRef: LocalIdV2Schema,
      disposition: z.enum(["INCLUDED", "VERIFY_FIRST", "CREDITED", "DEFERRED", "EXCLUDED"]),
      contribution: SummaryV2Schema,
      reason: SummaryV2Schema.optional(),
      evidenceRefs: referenceList.optional(),
    })).max(E.scopeNodes),
    activities: z.array(BlueprintActivityV2Schema).max(activityLimit),
    decisions: z.strictObject({
      assumptions: z.array(SummaryV2Schema).max(30),
      tradeOffs: z.array(SummaryV2Schema).max(20),
      unresolvedUncertainty: z.array(SummaryV2Schema).max(20),
      stoppingConditions: z.array(SummaryV2Schema).max(20),
    }),
  }).superRefine((blueprint, ctx) => {
    unique(blueprint.strategy.phases.map(phase => phase.localId), ctx, ["strategy", "phases"]);
    unique(blueprint.scope.map(scope => scope.scopeRef), ctx, ["scope"]);
    unique(blueprint.activities.map(activity => activity.localId), ctx, ["activities"]);
    const phases = new Set(blueprint.strategy.phases.map(phase => phase.localId));
    const scopes = new Set(blueprint.scope.map(scope => scope.scopeRef));
    const activities = new Map(blueprint.activities.map(activity => [activity.localId, activity]));
    blueprint.scope.forEach((scope, i) => {
      if (scope.disposition === "CREDITED" && !scope.evidenceRefs?.length) issue(ctx, ["scope", i, "evidenceRefs"], "Credited scope requires evidence");
      if (["CREDITED", "DEFERRED", "EXCLUDED"].includes(scope.disposition) && !scope.reason) {
        issue(ctx, ["scope", i, "reason"], "Consequential scope decisions require a reason");
      }
    });
    blueprint.activities.forEach((activity, i) => {
      if (activity.outcomeRefs.some(ref => !phases.has(ref))) issue(ctx, ["activities", i, "outcomeRefs"], "UNKNOWN_OUTCOME");
      if (activity.scopeRefs.some(ref => !scopes.has(ref))) issue(ctx, ["activities", i, "scopeRefs"], "UNKNOWN_SCOPE");
      if (activity.scopeRefs.some(ref => blueprint.scope.find(scope => scope.scopeRef === ref)?.disposition === "EXCLUDED")) issue(ctx, ["activities", i, "scopeRefs"], "EXCLUDED_SCOPE_ACTIVITY");
      if (activity.learningWindow?.anchorActivityId === activity.localId) issue(ctx, ["activities", i, "learningWindow"], "SELF_LEARNING_WINDOW");
      if (activity.commitment.category === "CONTINGENT") {
        const checkpoint = activities.get(activity.commitment.trigger.checkpointActivityId);
        if (!checkpoint || checkpoint.commitment.category !== "COMMITTED") {
          issue(ctx, ["activities", i, "commitment", "trigger"], "A contingency requires a committed checkpoint");
        }
      }
      if (activity.commitment.category === "COMMITTED" && activity.hardDependencies.some(ref => {
        const dependency = activities.get(ref);
        return dependency && dependency.commitment.category !== "COMMITTED";
      })) issue(ctx, ["activities", i, "hardDependencies"], "Committed work cannot depend on unscheduled optional or contingent work");
    });
    validateDag(blueprint.activities.map(activity => ({ id: activity.localId, dependencies: activity.hardDependencies })), ctx, ["activities"]);
  }), E.blueprintBytes);
}

/** One shape; bounded model deltas differ from server-assembled stored blueprints only in count. */
export const ModelLearningBlueprintV2Schema = blueprintSchema(E.newlyDetailedActivities);
export const LearningBlueprintV2Schema = blueprintSchema(E.outstandingActivitiesPerPlan);
export type LearningBlueprintV2 = z.infer<typeof LearningBlueprintV2Schema>;

export interface BlueprintReferenceContextV2 {
  scopeRefs: readonly string[];
  excludedScopeRefs: readonly string[];
  evidenceRefs: readonly string[];
  resourceRefs: readonly string[];
  externalActivityRefs?: readonly string[];
}

/** Run after shape validation with the caller's owned, pinned allowlist. */
export function validateBlueprintReferences(blueprint: LearningBlueprintV2, allowed: BlueprintReferenceContextV2): string[] {
  const errors: string[] = [];
  const suppliedScope = new Set(blueprint.scope.map(scope => scope.scopeRef));
  for (const ref of allowed.scopeRefs) if (!suppliedScope.has(ref)) errors.push(`MISSING_SCOPE:${ref}`);
  for (const ref of suppliedScope) if (!allowed.scopeRefs.includes(ref)) errors.push(`UNKNOWN_SCOPE:${ref}`);
  for (const ref of allowed.excludedScopeRefs ?? []) {
    if (blueprint.scope.find(scope => scope.scopeRef === ref)?.disposition !== "EXCLUDED") errors.push(`EXPLICIT_EXCLUSION_CHANGED:${ref}`);
    if (blueprint.activities.some(activity => activity.scopeRefs.includes(ref))) errors.push(`EXCLUDED_SCOPE_ACTIVITY:${ref}`);
  }
  const activities = new Set([...blueprint.activities.map(activity => activity.localId), ...(allowed.externalActivityRefs ?? [])]);
  for (const scope of blueprint.scope) for (const ref of scope.evidenceRefs ?? []) {
    if (!allowed.evidenceRefs.includes(ref)) errors.push(`UNKNOWN_EVIDENCE:${ref}`);
  }
  for (const activity of blueprint.activities) {
    for (const ref of [...activity.hardDependencies, ...(activity.advisoryOrderAfter ?? []), ...(activity.learningWindow ? [activity.learningWindow.anchorActivityId] : [])]) {
      if (!activities.has(ref)) errors.push(`UNKNOWN_ACTIVITY:${ref}`);
    }
    for (const ref of activity.evidenceRefs ?? []) if (!allowed.evidenceRefs.includes(ref)) errors.push(`UNKNOWN_EVIDENCE:${ref}`);
    for (const ref of activity.resourceRefs ?? []) if (!allowed.resourceRefs.includes(ref)) errors.push(`UNKNOWN_RESOURCE:${ref}`);
  }
  return [...new Set(errors)];
}
