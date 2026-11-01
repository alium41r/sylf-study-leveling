import { blueprintFixture } from "../contracts/fixtures";
import { compactProposal } from "./compact-blueprint-fixture";
import type { LearningInput, NaturalTranslationResponse } from "@/lib/planner/v2/intelligence/schemas/natural-learning";
import type { StrategyDocument } from "@/lib/planner/v2/intelligence/foundation/contracts";

export const naturalText = "  Your goal is to explain and predict current in a simple circuit, with method selection still uncertain. Completion time is not evidence of mastery.\n\nUse a 6 V source and a 3 Ω resistor: predict the current, justify I = V/R, calculate 2 A, then explain why doubling resistance halves current at fixed voltage. Draw the circuit, annotate units, and correct any discrepancy. Stop when you can explain both predictions without a supplied formula.\n\nIf the independent explanation fails, return to that specific error using the same givens, then try a 12 V source with a 6 Ω resistor. Keep meaningful work and its actual duration if availability changes. Retain uncertainty about transfer to more complex circuits; independent review and confirmation are still pending. 🧠\n  ";

/** Scripted education used only in tests; production receives no specimen. */
export function naturalProposal(input: LearningInput, strategy: StrategyDocument, options: { minutes?: number; empty?: boolean; split?: boolean; replace?: boolean } = {}): Extract<NaturalTranslationResponse, { decision: "TRANSLATE" }> {
  const minutes = options.minutes ?? 30;
  const plans = input.targets.map((target, i) => {
    const blueprint = blueprintFixture(); blueprint.strategy.policy = target.intent.policy;
    blueprint.strategy.recommendedEffort = { lowMinutes: minutes, likelyMinutes: minutes, highMinutes: minutes };
    blueprint.scope = target.allowed.scopeRefs.map(scopeRef => ({ scopeRef, disposition: "INCLUDED", contribution: "Supports the exact accepted goal" }));
    blueprint.activities[0] = { ...blueprint.activities[0], localId: `new_work_${i}`, instructions: naturalText.split("\n\n")[1], timeboxMinutes: minutes,
      effort: { lowMinutes: minutes, likelyMinutes: minutes, highMinutes: minutes }, scopeRefs: target.allowed.scopeRefs.filter(r => !target.allowed.excludedScopeRefs.includes(r)),
      ...(options.split ? { splitPoints: [{ afterMinutes: minutes / 2, completionCriterion: "The first original prediction is explained with its units; resume with the resistance change." }] } : {}) };
    if (options.empty) { blueprint.activities = []; blueprint.strategy.phases = []; }
    return { planRef: target.planRef, blueprint };
  });
  const proposal = compactProposal({ decision: "REVISE", detail: { days: 14, checkpoint: "Explain the two original predictions independently" }, tradeOffExplanation: "Retain the full original educational purpose", plans, sharedDependencies: [] }) as Extract<NaturalTranslationResponse, { decision: "TRANSLATE" }>["proposal"];
  const retention = input.targets.flatMap(t => t.replaceable.map(r => ({ planRef: t.planRef, activityRef: r.activity.localId, disposition: options.replace ? "REPLACE" as const : "KEEP" as const, anchorRefs: [strategy.anchors[0].ref], explanation: "Preserve the approved work or replace it explicitly with the strategy's original example" })));
  const targets = [...proposal.plans.flatMap(p => p.activities.map(a => ({ planRef: p.planRef, kind: "ACTIVITY" as const, ref: a.localId }))),
    ...input.targets.flatMap(t => [...t.kept, ...t.replaceable.filter(() => !options.replace).map(r => r.activity)].map(a => ({ planRef: t.planRef, kind: "ACTIVITY" as const, ref: a.localId })))];
  return { decision: "TRANSLATE", proposal, retention, ambiguities: [], elements: strategy.anchors.map((a, i) => ({ ref: `element_${i}`, anchorRef: a.ref, meaning: i === 1 ? "INSTRUCTION" : "GUIDANCE", disposition: targets.length ? "EXECUTION" : "RETAINED_GUIDANCE", explanation: "The exact original education is represented; guidance remains in the full strategy", targets })) };
}
