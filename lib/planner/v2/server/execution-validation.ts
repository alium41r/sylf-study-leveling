import { ExecutionTaskSpecV2Schema, canonicalExecutionContent, validateExecutionDurationV2,
  type ExecutionTaskSpecV2, type PlannerRevisionV2 } from "../contracts";
import { reject } from "./database";
import { civilDate, liveExecution, contentDigest, externalActivityAlias, type ExecutionContext } from "./context";

/** Validate the fixed execution proposal, never invent educational sequencing. */
export function verifyExecutionGraph(context: ExecutionContext, revisions: readonly PlannerRevisionV2[]): void {
  const selected = new Set(revisions.map(revision => revision.planId));
  const proposed = new Map(revisions.flatMap(revision => revision.executable.map(spec => [spec.activityKey, spec] as const)));
  const live = new Map(context.quests.filter(quest => quest.plannerSpec).map(quest => {
    const spec = ExecutionTaskSpecV2Schema.parse(quest.plannerSpec);
    return [spec.activityKey, { spec, quest, execution: liveExecution(quest, context.sessions) }] as const;
  }));
  const graph = new Map<string, ExecutionTaskSpecV2>();
  for (const [key, value] of live) if (!selected.has(value.spec.planId) && value.execution.remainingDisposition === "OPEN") graph.set(key, value.spec);
  for (const [key, spec] of proposed) graph.set(key, spec);
  for (const revision of revisions) for (const dependency of revision.context.externalActivityDependencies) {
    const dependent = revision.blueprint.activities.find(activity => activity.localId === dependency.dependentActivityRef);
    const reference = proposed.get(dependency.activityKey) ?? live.get(dependency.activityKey)?.spec;
    if (!dependent || !reference || reference.planId !== dependency.planId || reference.planId === revision.planId || contentDigest(reference) !== dependency.contentDigest)
      reject("REFERENCE_NOT_OWNED", "A cross-plan dependency does not match its owned educational source.", "APPLY");
    // A live reference must be part of the preflight registry. New joint work
    // instead belongs to an explicitly selected, owned target in this proposal.
    const existing = live.get(dependency.activityKey);
    if (!proposed.has(dependency.activityKey) && (!existing || !revision.context.quests.some(quest => quest.questId === existing.quest.id && quest.contentDigest === dependency.contentDigest)))
      reject("STALE_CONTEXT", "A cross-plan source was not pinned by this operation.", "APPLY");
  }
  for (const [key, spec] of proposed) {
    const existing = live.get(key);
    if (!existing && (spec.effort.remainingEstimateBasisActualSeconds !== 0 || spec.effort.remainingMinutesEstimate !== spec.effort.plannedMinutes)) reject("INVALID_OUTPUT", "New work must reserve its approved timebox from a zero actual-time basis.", "APPLY");
    if (existing && validateExecutionDurationV2(existing.spec, existing.execution).length) reject("INVALID_OUTPUT", "Live duration correspondence is invalid.", "APPLY");
    if (spec.continuesActivityKey) {
      const original = live.get(spec.continuesActivityKey);
      if (!original || original.execution.state === "UNSTARTED" || original.execution.state === "RUNNING" || original.execution.state === "COMPLETED" ||
        original.spec.planId !== spec.planId || proposed.has(original.spec.activityKey) && original.execution.remainingDisposition !== "WITHDRAWN") reject("PROTECTED_EXECUTION", "A continuation requires its owned, stopped original and reviewed withdrawal of unfinished work.", "APPLY");
    }
  }
  for (const [key, spec] of graph) for (const dependencyKey of spec.content.hardDependencies) {
    const historical = live.get(dependencyKey);
    const prerequisite = graph.get(dependencyKey);
    if (!prerequisite && historical?.execution.state !== "COMPLETED") reject("STALE_CONTEXT", "An unfinished prerequisite was removed or withdrawn.", "APPLY");
    if (!selected.has(spec.planId) && selected.has(historical?.spec.planId ?? "") &&
      (!prerequisite || canonicalExecutionContent(prerequisite) !== canonicalExecutionContent(historical!.spec))) reject("PROTECTED_EXECUTION", "Another plan depends on this educational content. Include both plans or retain the prerequisite.", "APPLY");
    const prerequisiteDate = historical?.execution.state === "COMPLETED" && historical.quest.completedAt ? civilDate(historical.quest.completedAt, context.timezone) : prerequisite?.placement.date;
    if (prerequisiteDate && prerequisiteDate > spec.placement.date) reject("SCHEDULE_CONFLICT", "A required prerequisite finishes after its dependent activity.", "APPLY");
    if (dependencyKey === key) reject("INVALID_OUTPUT", "An activity cannot depend on itself.", "APPLY");
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const walk = (key: string): void => {
    if (visiting.has(key)) reject("INVALID_OUTPUT", "The owned hard-dependency graph contains a cycle.", "APPLY");
    if (visited.has(key)) return;
    visiting.add(key); for (const dependency of graph.get(key)?.content.hardDependencies ?? []) if (graph.has(dependency)) walk(dependency);
    visiting.delete(key); visited.add(key);
  };
  for (const key of graph.keys()) walk(key);
  for (const revision of revisions) for (const activity of revision.blueprint.activities) {
    const window = activity.learningWindow;
    if (!window || window.strength !== "HARD" || activity.commitment.category !== "COMMITTED") continue;
    const task = revision.executable.find(spec => spec.blueprintActivityId === activity.localId)!;
    const external = revision.context.externalActivityDependencies.find(dependency => dependency.dependentActivityRef === activity.localId && externalActivityAlias(dependency.activityKey) === window.anchorActivityId);
    const anchor = revision.executable.find(spec => spec.blueprintActivityId === window.anchorActivityId) ??
      (external ? proposed.get(external.activityKey) ?? live.get(external.activityKey)?.spec : undefined);
    if (!anchor) reject("REFERENCE_NOT_OWNED", "The hard learning window has no owned scheduled anchor.", "APPLY");
    const historicalAnchor = live.get(anchor.activityKey);
    const anchorDate = historicalAnchor?.execution.state === "COMPLETED" && historicalAnchor.quest.completedAt
      ? civilDate(historicalAnchor.quest.completedAt, context.timezone) : anchor.placement.date;
    const gap = (Date.parse(task.placement.date) - Date.parse(anchorDate)) / 86_400_000;
    if (window.minimumGapDays !== undefined && gap < window.minimumGapDays || window.maximumGapDays !== undefined && gap > window.maximumGapDays) reject("SCHEDULE_CONFLICT", "A hard learning interval is outside the reviewed bounds.", "APPLY");
  }
}
