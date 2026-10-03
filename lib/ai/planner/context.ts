import "server-only";

/**
 * A2/A3 planning context shared by every planner generation path.
 *
 * This is the ONE shape in the codebase: Exam, Mastery, Roadmap, Expansion and
 * Rebalance all pass exactly this object. `preferences` are SOFT learned planning
 * preferences (session length, density, placement, detail, buffer style) and never
 * override the confirmed input or a HARD constraint. `friction` is why the student
 * rejected earlier items, by closed reason code and count. Both are absent when
 * there is nothing to say, so a user with no history produces exactly the payload
 * they did before this context existed.
 */
export interface PlanningContext {
  preferences: { type: string; value: string; source: string }[];
  friction: { reasonCode: string; count: number }[];
}

/**
 * The SOFT-guidance rule, identical across every generation mode. A preference can
 * never override the confirmed input, a HARD constraint or a floor, and it can
 * never make a plan infeasible.
 */
export const SOFT_GUIDANCE_SENTENCE =
  "When the payload carries planningContext, use it as SOFT guidance only: a preference (a usual session length, a density, where demanding work goes, how much detail, buffer style) never overrides the confirmed input, a HARD constraint or a floor, and it must never make this plan infeasible.";

/**
 * Emits the `planningContext` key only when there is something to say, so a user
 * with no learned preferences produces a byte-identical payload to the one before
 * this context existed (the key is absent, not `null`).
 */
export function planningContextBlock(
  context: PlanningContext | undefined
): { planningContext?: PlanningContext } {
  if (!context) return {};
  if (!context.preferences.length && !context.friction.length) return {};
  return {
    planningContext: {
      preferences: context.preferences.map((preference) => ({
        type: preference.type,
        value: preference.value,
        source: preference.source,
      })),
      friction: context.friction.map((entry) => ({
        reasonCode: entry.reasonCode,
        count: entry.count,
      })),
    },
  };
}
