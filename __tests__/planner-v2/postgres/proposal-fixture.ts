import { randomUUID } from "node:crypto";
import { revisionFixture, changeSetFixture, blueprintFixture } from "../contracts/fixtures";
import { ownedPlan, loadIntent, type PlanRow } from "@/lib/planner/v2/server/intents";
import { AttemptService, newBudget } from "@/lib/planner/v2/server/attempts";
import { RevisionService, revisionDigest, educationalDigest, qualityEvidenceDigest, loadRevision } from "@/lib/planner/v2/server/revisions";
import { loadExecutionContext, specDigest, contentDigest } from "@/lib/planner/v2/server/context";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";
import { compareExecutionSpecs, ExecutionTaskSpecV2Schema, type PlannerRevisionV2, type ExecutionTaskSpecV2, type SealedSemanticDiffEntryV2 } from "@/lib/planner/v2/contracts";
import { rows } from "@/lib/planner/v2/server/database";

/** Contract-valid trusted compiler stand-in, no AI/provider/prompt. Exercises
 * the real repositories, publication, apply and state correspondence. */
export async function prepareProposal(db: PlannerDatabase, ownerId: number, planIds: string[], mutate?: (specs: ExecutionTaskSpecV2[], planIndex: number) => void, mutateRevision?: (revision: PlannerRevisionV2, planIndex: number) => void) {
  const attempts = new AttemptService(db); const service = new RevisionService(attempts);
  const plans = await db.coordinated(ownerId, async sql => {
    const owned: PlanRow[] = [];
    for (const id of [...planIds].sort()) owned.push(await ownedPlan(sql, ownerId, id));
    return planIds.map(id => owned.find(plan => plan.id === id)!);
  });
  const attempt = await attempts.enqueue(ownerId, { key: randomUUID(), text: "Prepare the selected plans", kind: plans.length === 2 ? "JOINT" : plans[0].activeRevisionId ? "REPLAN" : "PLAN", budget: newBudget("EDUCATIONAL"),
    targets: plans.map(plan => ({ planId: plan.id, intentId: plan.workingIntentVersionId!, planningVersion: plan.version, baseRevisionId: plan.activeRevisionId })) });
  const token = await attempts.claim(`fixture_${randomUUID()}`); if (!token || token.attemptId !== attempt.attemptId) throw new Error("Fixture admission was not isolated");
  await service.resolveUnchanged(token);
  const revisions: PlannerRevisionV2[] = [];
  const entries: SealedSemanticDiffEntryV2[] = [];
  for (const [index, plan] of plans.entries()) {
    const intent = await db.coordinated(ownerId, sql => loadIntent(sql, ownerId, plan.workingIntentVersionId!));
    const context = await db.coordinated(ownerId, sql => loadExecutionContext(sql, ownerId, plans, intent.intent));
    const old = plan.activeRevisionId ? await db.coordinated(ownerId, async sql => {
      const row = (await rows<{ v2Artifact: unknown }>(sql, 'SELECT "v2Artifact" FROM "PlannerRevision" WHERE id=$1', [plan.activeRevisionId]))[0];
      if (row.v2Artifact) return (await loadRevision(sql, ownerId, plan.activeRevisionId!)).executable;
      return ((plan.migrationEvidence as { baselineSpecs: unknown[] }).baselineSpecs).map(spec => ExecutionTaskSpecV2Schema.parse(spec));
    }) : [];
    const revision = revisionFixture();
    Object.assign(revision, { revisionId: randomUUID(), planId: plan.id, ownerId, attemptId: attempt.attemptId, requestedIntentVersionId: intent.intentVersionId, resolvedIntentVersionId: intent.intentVersionId,
      baseActiveRevisionId: plan.activeRevisionId, sealedAt: new Date().toISOString(), context: context.dependencies });
    if (old.length) revision.executable = structuredClone(old);
    else Object.assign(revision.executable[0], { activityKey: randomUUID(), planId: plan.id, goalId: plan.goalId ?? plan.reservedGoalId! });
    mutate?.(revision.executable, index);
    const external = revision.executable.flatMap(spec => spec.content.hardDependencies.filter(key => !revision.executable.some(task => task.activityKey === key)).map(key => {
      const source = context.quests.map(quest => quest.plannerSpec).find(raw => raw && (raw as ExecutionTaskSpecV2).activityKey === key) ?? revisions.flatMap(revision => revision.executable).find(spec => spec.activityKey === key);
      if (!source) throw new Error("Fixture dependency is not owned");
      const prerequisite = ExecutionTaskSpecV2Schema.parse(source);
      return { dependentActivityRef: spec.blueprintActivityId, activityKey: key, planId: prerequisite.planId, contentDigest: contentDigest(prerequisite), strength: "HARD" as const, reason: "Use the owned prerequisite without creating duplicate work" };
    }));
    revision.context.externalActivityDependencies = external;
    const template = blueprintFixture().activities[0];
    revision.blueprint.activities = revision.executable.map(spec => ({ ...structuredClone(template), localId: spec.blueprintActivityId, ...spec.content,
      timeboxMinutes: spec.effort.plannedMinutes, resourceRefs: spec.content.resources.map(resource => resource.ref),
      hardDependencies: spec.content.hardDependencies.map(key => revision.executable.find(task => task.activityKey === key)?.blueprintActivityId).filter((ref): ref is string => ref !== undefined) }));
    // Remove execution-only properties from the educational contract.
    for (const activity of revision.blueprint.activities) { Reflect.deleteProperty(activity, "resources"); }
    mutateRevision?.(revision, index);
    revision.quality.educationalContentDigest = educationalDigest(revision); revision.quality.evidenceDigest = qualityEvidenceDigest(intent.intent);
    revision.digest = revisionDigest(revision); revisions.push(revision);
    const pointer = (spec: ExecutionTaskSpecV2 | null) => spec ? { specDigest: specDigest(spec), contentDigest: contentDigest(spec), date: spec.placement.date, timezone: spec.placement.timezone, ...spec.effort } : null;
    for (const key of new Set([...old, ...revision.executable].map(spec => spec.activityKey))) {
      const before = old.find(spec => spec.activityKey === key) ?? null; const after = revision.executable.find(spec => spec.activityKey === key) ?? null;
      entries.push({ planId: plan.id, activityKey: key, before: pointer(before), after: pointer(after), changes: compareExecutionSpecs(before, after), reason: "Reviewed fixture change" });
    }
  }
  const changeSet = changeSetFixture(); Object.assign(changeSet, { changeSetId: randomUUID(), attemptId: attempt.attemptId, requestDigest: attempt.requestHash, entries, quality: revisions[0].quality });
  changeSet.targets = revisions.map((revision, i) => ({ planId: revision.planId, requestedIntentVersionId: revision.requestedIntentVersionId, resolvedIntentVersionId: revision.resolvedIntentVersionId,
    baseActiveRevisionId: plans[i].activeRevisionId, planningVersion: plans[i].version, resolvedPlanningVersion: plans[i].version, revisionId: revision.revisionId, revisionDigest: revision.digest }));
  changeSet.aggregate.committedTargetMinutes = revisions.reduce((sum, revision) => sum + revision.executable.reduce((n, spec) => n + spec.effort.remainingMinutesEstimate, 0), 0);
  await service.publish(token, revisions, changeSet);
  return { attempt, token, revisions, changeSet, request: { attemptId: attempt.attemptId, changeSetId: changeSet.changeSetId, acknowledgements: [] } };
}
