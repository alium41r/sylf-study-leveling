import { randomUUID } from "node:crypto";
import { ExecutionTaskSpecV2Schema, PlannerRevisionV2Schema, PlanChangeSetV2Schema,
  QualityReportV2Schema, compareExecutionSpecs, type ExecutionTaskSpecV2,
  type ContextDependenciesV2, type PlannerRevisionV2, type QualityReportV2 } from "../contracts";
import type { BlueprintSnapshot } from "../intelligence/allocator";
import type { CompilerCheckpoint } from "../intelligence/schemas/checkpoint";
import { CompilerIdentitiesSchema, type CompilerIdentity } from "../intelligence/schemas/quality";
import { specDigest, contentDigest, externalActivityAlias } from "./context";
import { hash, reject } from "./database";
import { revisionDigest } from "./revisions";

type Allocated = Extract<CompilerCheckpoint["payload"], { stage: "ALLOCATION" }>;
export interface CompilationTarget { planRef: string; planId: string; goalId: number; context: ContextDependenciesV2;
  sources: readonly { sourceId: string; contentHash: string }[] }

/** Server identities are assigned once before review. No execution is written. */
export function assignCompilerIdentities(snapshot: BlueprintSnapshot, targets: readonly CompilationTarget[],
  live: readonly ExecutionTaskSpecV2[], previous: readonly CompilerIdentity[] = []): CompilerIdentity[] {
  const identities = snapshot.plans.flatMap(plan => plan.blueprint.activities.filter(a => a.commitment.category === "COMMITTED").map(activity => {
    const target = targets.find(t => t.planRef === plan.planRef)!;
    const owned = live.find(s => s.planId === target.planId && s.blueprintActivityId === activity.localId);
    const old = previous.find(i => i.planRef === plan.planRef && i.activityRef === activity.localId);
    if (old && owned && old.activityKey !== owned.activityKey) reject("PROTECTED_EXECUTION", "Retained identity cannot change.", "PERSISTENCE");
    return { planRef: plan.planRef, activityRef: activity.localId, activityKey: owned?.activityKey ?? old?.activityKey ?? randomUUID() };
  }));
  CompilerIdentitiesSchema.parse(identities);
  if (new Set(identities.map(i => i.activityKey)).size !== identities.length) reject("INVALID_OUTPUT", "Compiler identities collide.", "PERSISTENCE");
  return identities;
}

/** Translate the reviewed local graph to owned execution keys; dates and minutes
 * come only from allocation. Kept specifications remain byte-for-byte equal. */
export function compileExecution(payload: Pick<Allocated, "blueprints" | "allocation" | "envelope">,
  targets: readonly CompilationTarget[], live: readonly ExecutionTaskSpecV2[], rawIdentities: readonly CompilerIdentity[]) {
  const identities = CompilerIdentitiesSchema.parse(rawIdentities);
  const required = payload.blueprints.plans.flatMap(p => p.blueprint.activities.filter(a => a.commitment.category === "COMMITTED").map(a => `${p.planRef}/${a.localId}`));
  if (identities.length !== required.length || new Set(identities.map(i => `${i.planRef}/${i.activityRef}`)).size !== identities.length ||
    new Set(identities.map(i => i.activityKey)).size !== identities.length || identities.some(i => !required.includes(`${i.planRef}/${i.activityRef}`)))
    reject("INVALID_OUTPUT", "The execution identity registry must cover the exact committed proposal.", "PERSISTENCE");
  const key = (planRef: string, activityRef: string) => identities.find(i => i.planRef === planRef && i.activityRef === activityRef)?.activityKey;
  const resolve = (planRef: string, ref: string) => key(planRef, ref) ?? live.find(s => externalActivityAlias(s.activityKey) === ref)?.activityKey ??
    reject("REFERENCE_NOT_OWNED", "An execution prerequisite has no owned reference.", "PERSISTENCE");
  const compiled = payload.blueprints.plans.map(plan => {
    const target = targets.find(t => t.planRef === plan.planRef);
    if (!target) reject("REFERENCE_NOT_OWNED", "An unselected Plan cannot compile.", "PERSISTENCE");
    const specs = plan.blueprint.activities.filter(a => a.commitment.category === "COMMITTED").map(activity => {
      const activityKey = key(plan.planRef, activity.localId)!;
      const owned = live.find(s => s.activityKey === activityKey);
      if (owned && (owned.planId !== target.planId || owned.blueprintActivityId !== activity.localId)) reject("PROTECTED_EXECUTION", "Execution identities cannot be repurposed.", "PERSISTENCE");
      const placement = payload.allocation.report.placements.find(p => p.planRef === plan.planRef && p.activityRef === activity.localId);
      if (!placement || placement.minutes !== activity.timeboxMinutes) reject("QUALITY_INCOMPLETE", "Only completely allocated work can seal.", "PERSISTENCE");
      const dependencies = [...activity.hardDependencies.map(ref => resolve(plan.planRef, ref)), ...payload.blueprints.sharedDependencies
        .filter(e => e.strength === "HARD" && e.dependent.planRef === plan.planRef && e.dependent.activityId === activity.localId)
        .map(e => key(e.prerequisite.planRef, e.prerequisite.activityId) ?? reject("REFERENCE_NOT_OWNED", "A shared prerequisite has no owner.", "PERSISTENCE"))];
      const resources = (activity.resourceRefs ?? []).map(ref => {
        const source = target.sources.find(s => s.sourceId === ref);
        if (!source) reject("REFERENCE_NOT_OWNED", "An educational resource lacks accepted provenance.", "PERSISTENCE");
        return { ref, versionDigest: source.contentHash };
      });
      const spec = ExecutionTaskSpecV2Schema.parse({ schemaVersion: 2, activityKey, blueprintActivityId: activity.localId,
        planId: target.planId, goalId: target.goalId,
        content: { title: activity.title, instructions: activity.instructions, completionCriterion: activity.completionCriterion,
          outcomeRefs: activity.outcomeRefs, scopeRefs: activity.scopeRefs, activityType: activity.activityType,
          purpose: activity.purpose, ...(activity.stage ? { stage: activity.stage } : {}), resources,
          hardDependencies: [...new Set(dependencies)] },
        effort: owned?.effort ?? { plannedMinutes: activity.timeboxMinutes, remainingMinutesEstimate: activity.timeboxMinutes, remainingEstimateBasisActualSeconds: 0 },
        placement: { date: placement.date, timezone: payload.envelope.timezone }, ...(owned?.continuesActivityKey ? { continuesActivityKey: owned.continuesActivityKey } : {}) });
      if (owned && specDigest(owned) !== specDigest(spec)) reject("PROTECTED_EXECUTION", "Kept execution must retain its exact approved specification.", "PERSISTENCE");
      return spec;
    });
    return { ...target, specs };
  });
  const all = compiled.flatMap(p => p.specs);
  for (const plan of compiled) {
    const edges = [...plan.context.externalActivityDependencies];
    const add = (dependent: string, activityKey: string, strength: "HARD" | "ADVISORY", reason: string) => {
      const prerequisite = all.find(s => s.activityKey === activityKey) ?? live.find(s => s.activityKey === activityKey);
      if (!prerequisite || prerequisite.planId === plan.planId) reject("REFERENCE_NOT_OWNED", "Use retained local aliases for same-Plan prerequisites.", "PERSISTENCE");
      const edge = { dependentActivityRef: dependent, activityKey, planId: prerequisite.planId, contentDigest: contentDigest(prerequisite), strength, reason };
      const old = edges.find(e => e.dependentActivityRef === dependent && e.activityKey === activityKey);
      if (!old) edges.push(edge);
      else if (old.contentDigest !== edge.contentDigest || old.strength !== strength) reject("PROTECTED_EXECUTION", "A retained shared dependency changed.", "PERSISTENCE");
    };
    for (const spec of plan.specs) for (const dependency of spec.content.hardDependencies) if (!plan.specs.some(s => s.activityKey === dependency)) add(spec.blueprintActivityId, dependency, "HARD", "Use one owned prerequisite without duplicating its commitment");
    for (const edge of payload.blueprints.sharedDependencies.filter(e => e.dependent.planRef === plan.planRef)) add(edge.dependent.activityId, key(edge.prerequisite.planRef, edge.prerequisite.activityId)!, edge.strength, edge.reason);
    plan.context = { ...plan.context, externalActivityDependencies: edges };
  }
  return compiled;
}

export function sealCompilerCandidate(checkpoint: CompilerCheckpoint,
  targets: readonly (CompilationTarget & { requestedIntentVersionId: string; resolvedIntentVersionId: string;
    baseActiveRevisionId: string | null; planningVersion: number; resolvedPlanningVersion: number })[],
  live: readonly ExecutionTaskSpecV2[], baseline: readonly ExecutionTaskSpecV2[], identities: readonly CompilerIdentity[],
  sources: ReadonlyMap<string, readonly { sourceId: string; contentHash: string }[]>, now: string) {
  const p = checkpoint.payload;
  if (!("quality" in p) || !["REVIEW", "VERIFICATION"].includes(p.stage) || p.allocation.report.status !== "FEASIBLE" || p.quality.some(q => q.report.status !== "PASSED"))
    reject("QUALITY_INCOMPLETE", "Only independently cleared, fully allocated education can seal.", "PERSISTENCE");
  const compiled = compileExecution(p, targets, live, identities);
  const revisions: PlannerRevisionV2[] = compiled.map(plan => {
    const target = targets.find(t => t.planRef === plan.planRef)!;
    const blueprint = p.blueprints.plans.find(b => b.planRef === plan.planRef)!.blueprint;
    for (const spec of plan.specs) for (const resource of spec.content.resources) {
      const source = sources.get(plan.planRef)?.find(s => s.sourceId === resource.ref);
      if (!source) reject("REFERENCE_NOT_OWNED", "Resource provenance is absent from accepted intent.", "PERSISTENCE");
      if (resource.versionDigest !== source.contentHash) reject("STALE_CONTEXT", "A compiled resource changed after review.", "PERSISTENCE");
    }
    // Resource versions participate in cross-plan educational content digests;
    // the caller supplies these same versions before the independent review.
    const quality = p.quality.find(q => q.planRef === plan.planRef)!.report;
    const revision = PlannerRevisionV2Schema.parse({ schemaVersion: 2, revisionId: randomUUID(), planId: target.planId,
      ownerId: checkpoint.binding.ownerId, attemptId: checkpoint.binding.attemptId,
      requestedIntentVersionId: target.requestedIntentVersionId, resolvedIntentVersionId: target.resolvedIntentVersionId,
      baseActiveRevisionId: target.baseActiveRevisionId, sealedAt: now, digest: "0".repeat(64), blueprint, executable: plan.specs,
      context: plan.context, quality, forecast: p.planning?.forecasts.find(f => f.planRef === plan.planRef)?.phases
        .filter(f => f.effort && f.status === "PROJECTED").map(f => ({ phaseRef: f.phaseRef, effort: f.effort!, ...(f.likelyFinishDate ? { expectedFinishDate: f.likelyFinishDate } : {}) })) ?? [] });
    revision.digest = revisionDigest(revision); return revision;
  });
  const pointer = (spec: ExecutionTaskSpecV2 | null) => spec ? { specDigest: specDigest(spec), contentDigest: contentDigest(spec), date: spec.placement.date, timezone: spec.placement.timezone, ...spec.effort } : null;
  const entries = [...new Set([...baseline, ...compiled.flatMap(p => p.specs)].map(s => s.activityKey))].map(activityKey => {
    const before = baseline.find(s => s.activityKey === activityKey) ?? null;
    const after = revisions.flatMap(r => r.executable).find(s => s.activityKey === activityKey) ?? null;
    return { activityKey, planId: (after ?? before)!.planId, before: pointer(before), after: pointer(after), changes: compareExecutionSpecs(before, after), reason: "Independently reviewed education and allocated placement" };
  });
  const quality: QualityReportV2 = QualityReportV2Schema.parse({ schemaVersion: 2, reportId: randomUUID(), status: "PASSED",
    evidenceDigest: hash("joint-quality-evidence", p.quality.map(q => q.report.evidenceDigest)),
    educationalContentDigest: hash("joint-quality-content", p.quality.map(q => q.report.educationalContentDigest)),
    issues: p.quality.flatMap(q => q.report.issues), requiredAcknowledgements: p.quality.flatMap(q => q.report.requiredAcknowledgements) });
  const days = p.envelope.days.filter(d => !d.excluded);
  const changeSet = PlanChangeSetV2Schema.parse({ schemaVersion: 2, changeSetId: randomUUID(), attemptId: checkpoint.binding.attemptId,
    requestDigest: checkpoint.binding.requestHash, targets: targets.map(t => { const r = revisions.find(r => r.planId === t.planId)!; return {
      planId: t.planId, requestedIntentVersionId: t.requestedIntentVersionId, resolvedIntentVersionId: t.resolvedIntentVersionId,
      baseActiveRevisionId: t.baseActiveRevisionId, planningVersion: t.planningVersion, resolvedPlanningVersion: t.resolvedPlanningVersion,
      revisionId: r.revisionId, revisionDigest: r.digest }; }), entries, quality, applyReceipt: null,
    aggregate: { maximumCapacityMinutes: days.reduce((n, d) => n + d.ceilingMinutes, 0),
      availableForTargetsMinutes: days.reduce((n, d) => n + Math.min(d.ceilingMinutes, d.availableMinutes + d.protectedTargetMinutes), 0),
      committedTargetMinutes: p.allocation.report.placements.reduce((n, task) => n + (p.envelope.protectedExecution.find(pin => pin.planRef === task.planRef && pin.activityRef === task.activityRef)?.remainingMinutes ?? task.minutes), 0),
      recommendedEffort: revisions.reduce((sum, r) => ({ lowMinutes: sum.lowMinutes + r.blueprint.strategy.recommendedEffort.lowMinutes,
        likelyMinutes: sum.likelyMinutes + r.blueprint.strategy.recommendedEffort.likelyMinutes, highMinutes: sum.highMinutes + r.blueprint.strategy.recommendedEffort.highMinutes }), { lowMinutes: 0, likelyMinutes: 0, highMinutes: 0 }),
      feasible: true, requiresReestimate: false, compromises: p.allocation.report.findings.filter(f => f.consequential).slice(0,20).map(f => f.consequence) } });
  return { revisions, changeSet };
}
