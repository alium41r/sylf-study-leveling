import type { LearningBlueprintV2 } from '@/lib/planner/v2/contracts';

/** Test adapters express the same education through the new transport. This is
 * deliberately independent of production assembly; repair fixtures stay legacy. */
export function compactProposal(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('decision' in value) || value.decision !== 'REVISE' ||
    !('plans' in value) || !Array.isArray(value.plans)) return value;
  const result = { ...value } as Record<string, unknown>;
  delete result.decision;
  const effort = (range: LearningBlueprintV2['strategy']['recommendedEffort']) =>
    [range.lowMinutes, range.likelyMinutes, range.highMinutes];
  result.plans = (value.plans as { planRef: string; blueprint: LearningBlueprintV2 }[]).map(entry => {
    const plan = { ...entry, ...entry.blueprint } as Record<string, unknown>;
    delete plan.blueprint;
    delete plan.schemaVersion;
    const strategy = { ...entry.blueprint.strategy } as Record<string, unknown>;
    delete strategy.policy;
    strategy.recommendedEffort = effort(entry.blueprint.strategy.recommendedEffort);
    strategy.phases = entry.blueprint.strategy.phases.map(phase =>
      ({ ...phase, ...(phase.effort ? { effort: effort(phase.effort) } : {}) }));
    plan.strategy = strategy;
    plan.activities = entry.blueprint.activities.map(activity => ({ ...activity, effort: effort(activity.effort) }));
    return plan;
  });
  return result;
}
