import { CanonicalIntentV2Schema, ExecutionTaskSpecV2Schema, DateV2Schema, type CanonicalIntentV2 } from "../contracts";
import { hash, reject, rows, type Sql } from "../server/database";
import { ownedPlan, loadIntent } from "../server/intents";
import { loadRevision } from "../server/revisions";
import { civilDate, contentDigest, executionCapacityLedger, liveExecution, loadExecutionContext, mondayIndex, relevantDependencyQuests, weekKey, type ExecutionContext } from "../server/context";
import { SchedulingEnvelopeSchema } from "./schemas/scheduling";

export interface ContextTarget { planId: string; planRef: string; intent: CanonicalIntentV2; activeActivityKeys: readonly string[] }
export interface ContextWindow { start: string; end: string }
export interface ContextOptions { maxBytes?: number; historyExamples?: number; provisionalAvailability?: CanonicalIntentV2["availability"];
  academicSources?: { planId: string; source: NonNullable<ExecutionContext["academicSource"]> }[] }

/** Call only with the owned snapshot loaded by the V2 context owner. The
 * registry stays server-side: models refer to local aliases, never mint IDs. */
export function projectPlannerContext(context: ExecutionContext, targets: readonly ContextTarget[], window: ContextWindow,
  options: ContextOptions = {}) {
  if (!targets.length || targets.length > 2 || new Set(targets.map(t => t.planId)).size !== targets.length ||
    new Set(targets.map(t => t.planRef)).size !== targets.length || targets.some(t => !/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(t.planRef)))
    reject("INVALID_OUTPUT", "Context targets need distinct owned plans and local references.", "PREFLIGHT");
  for (const target of targets) CanonicalIntentV2Schema.parse(target.intent);
  DateV2Schema.parse(window.start); DateV2Schema.parse(window.end);
  const span = (Date.parse(window.end) - Date.parse(window.start)) / 86400000 + 1;
  if (window.start < context.today || span < 1 || span > 500) reject("PAYLOAD_TOO_LARGE", "The detailed context window must contain at most 500 future dates.", "PREFLIGHT");
  const maxBytes = options.maxBytes ?? 128 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 4 * 1024 * 1024) reject("INVALID_OUTPUT", "Invalid model context byte allowance.", "PREFLIGHT");
  const availability = context.globalAvailability ?? options.provisionalAvailability;
  if (!availability || availability.timezone !== context.timezone || !context.globalAvailability && availability.basis !== "DISCLOSED_PROVISIONAL_CEILING")
    reject("CAPACITY_SHORTFALL", "Context needs confirmed availability or an explicitly disclosed provisional ceiling in the student's timezone.", "PREFLIGHT");
  if (context.legacyExceptions.length) reject("CAPACITY_SHORTFALL", "Resolve unknown legacy commitments before projecting capacity.", "PREFLIGHT");
  const targetById = new Map(targets.map(t => [t.planId, t]));
  const specs = new Map(context.quests.filter(q => q.plannerSpec).map(q => [q.id, ExecutionTaskSpecV2Schema.parse(q.plannerSpec)]));
  const relevant = relevantDependencyQuests(context.quests, context.sessions, new Set(targets.flatMap(t => [...t.activeActivityKeys])));
  const registry = relevant.map((q, i) => ({ ref: `execution_${i + 1}`, questId: q.id, activityKey: specs.get(q.id)?.activityKey ?? null }));
  const byQuest = new Map(registry.map(r => [r.questId, r.ref]));
  const byActivity = new Map(registry.filter(r => r.activityKey).map(r => [r.activityKey!, r.ref]));
  const liveSessions = context.sessions.filter(s => !s.endedAt || s.executionState === "RUNNING" || s.executionState === "PAUSED");
  if (liveSessions.some(s => !s.executionState)) reject("PROTECTED_EXECUTION", "An older timer must be explicitly stopped before this context can be used.", "PREFLIGHT");
  const sessionRegistry = liveSessions.map((s,i) => ({ ref: `session_${i+1}`, sessionId: s.id }));
  const runningSessions = liveSessions.map((s,i) => ({ ref: sessionRegistry[i].ref, executionRef: s.questId === null ? null : byQuest.get(s.questId) ?? null,
    state: s.executionState, executionVersion: s.executionVersion, acceptedFocusSeconds: s.durationSeconds, acceptedBreakSeconds: s.breakSeconds,
    actualCivilDate: s.executionContext?.actualCivilDate ?? civilDate(s.startedAt, context.timezone),
    startedAt: s.startedAt.toISOString(), runningSince: s.runningSince?.toISOString() ?? null,
    accounting: "ALREADY_INCLUDED_IN_ACCEPTED_ACTUALS" }));
  const execution = relevant.map(q => {
    const spec = specs.get(q.id);
    if (!spec) {
      const own = context.sessions.filter(s => s.questId === q.id);
      const state = q.status === "COMPLETED" ? "COMPLETED" : own.some(s => s.executionState === "RUNNING") ? "RUNNING" :
        own.some(s => s.executionState === "PAUSED") ? "PAUSED" : q.elapsedSeconds > 0 || own.length > 0 || q.status === "IN_PROGRESS" ? "ENDED_INCOMPLETE" : "UNSTARTED";
      return { ref: byQuest.get(q.id)!, planRef: null, source: "LEGACY_EXECUTION" as const,
        title: q.title, instructions: q.description, state, protected: state !== "UNSTARTED" || q.executionVersion > 0, actualSeconds: q.elapsedSeconds,
        remainingMinutes: q.remainingDisposition === "OPEN" ? Math.max(1, Math.ceil(q.requiredMinutes - q.elapsedSeconds / 60)) : 0,
        date: q.scheduledFor, remainingDisposition: q.remainingDisposition, executionVersion: q.executionVersion };
    }
    const live = liveExecution(q, context.sessions);
    return { ref: byQuest.get(q.id)!, planRef: targetById.get(spec.planId)?.planRef ?? null, source: "V2_EXECUTION" as const,
      ...spec.content, hardDependencies: spec.content.hardDependencies.map(key => byActivity.get(key)!),
      continuesActivityRef: spec.continuesActivityKey ? byActivity.get(spec.continuesActivityKey) ?? null : null,
      contentDigest: contentDigest(spec), state: live.state, actualSeconds: live.actualSeconds,
      remainingMinutes: live.remainingMinutesEstimate, remainingDisposition: live.remainingDisposition,
      requiresReestimate: live.requiresReestimate, executionVersion: live.executionVersion, date: q.scheduledFor,
      estimateBasisActualSeconds: spec.effort.remainingEstimateBasisActualSeconds, plannedMinutes: spec.effort.plannedMinutes };
  });
  const protectedExecution = relevant.flatMap(q => {
    const spec = specs.get(q.id); const target = spec && targetById.get(spec.planId);
    if (!spec || !target) return [];
    const live = liveExecution(q, context.sessions);
    if (live.state === "UNSTARTED") return [];
    return [{ planRef: target.planRef, activityRef: byQuest.get(q.id)!, contentDigest: contentDigest(spec),
      executionVersion: live.executionVersion, actualSeconds: live.actualSeconds, remainingMinutes: live.remainingMinutesEstimate,
      state: live.state, remainingDisposition: live.remainingDisposition, date: q.scheduledFor }];
  });
  const ledger = executionCapacityLedger(context, new Set(targetById.keys()));
  const days = Array.from({ length: span }, (_, i) => {
    const date = new Date(Date.parse(window.start) + i * 86400000).toISOString().slice(0, 10);
    const index = mondayIndex(date); const ceilingMinutes = availability.dailyCeilingMinutes[index];
    const excluded = context.restDays.includes((index + 1) % 7) || context.floatingDates.includes(date) ||
      availability.restWeekdays.includes(index) || availability.blockedDates.includes(date) ||
      targets.every(t => t.intent.deadline.kind === "FIXED" && (date > t.intent.deadline.date || date === t.intent.deadline.date && !t.intent.deadline.examDayStudyAllowed));
    const otherCommittedMinutes = (ledger.otherRemaining.get(date) ?? 0) + Math.ceil((ledger.actualSeconds.get(date) ?? 0) / 60);
    const protectedTargetMinutes = protectedExecution.filter(e => e.date === date).reduce((n, e) => n + e.remainingMinutes, 0);
    const recoveryMinutes = Math.ceil(ceilingMinutes * availability.recoveryPercent / 100);
    return { date, ceilingMinutes, otherCommittedMinutes, protectedTargetMinutes, recoveryMinutes,
      availableMinutes: excluded ? 0 : Math.max(0, ceilingMinutes - otherCommittedMinutes - protectedTargetMinutes - recoveryMinutes), excluded };
  });
  const envelope = SchedulingEnvelopeSchema.parse({ schemaVersion: 2, timezone: context.timezone, today: context.today, window,
    capacityDigest: context.dependencies.capacityDigest, basis: availability.basis,
    weeklyCeilingMinutes: availability.weeklyCeilingMinutes ?? availability.dailyCeilingMinutes.reduce((a, b) => a + b, 0),
    recoveryPercent: availability.recoveryPercent, targets: targets.map(t => ({ planRef: t.planRef, deadline: t.intent.deadline,
      perGoalWeeklyCeilingMinutes: t.intent.availability?.perGoalWeeklyCeilingMinutes ?? null })), days, protectedExecution,
    timeboxRange: { minMinutes: 5, maxMinutes: 240 } });
  const plans = targets.map(t => {
    const { scope, evidence, research, ...intent } = t.intent;
    delete intent.subjectId; delete intent.goalId;
    const scopeRef = new Map(scope.map(s => [s.scopeKey, s.modelRef]));
    const learning = evidence.map(e => ({ ...e, scopeKeys: undefined, scopeRefs: e.scopeKeys.map(key => scopeRef.get(key)!) }));
    // Legacy check item keys cannot be assumed to be V2 activity/scope keys.
    // Keep unresolved provenance visible rather than inventing a scope match.
    const savedChecks = (context.checks ?? []).filter(c => c.planId === t.planId).map((c, i) => {
      const matches = context.quests.filter(q => { const s = specs.get(q.id); return s?.planId === t.planId && s.activityKey === c.itemKey; });
      return { ref: `saved_check_${i + 1}`, source: "CHECK_RESULT", reliability: "SELF_REPORTED", result: c.result,
        observedAt: c.updatedAt.toISOString(), recordedAt: c.createdAt.toISOString(),
        sourceRevisionDigest: hash("check-revision", c.revisionId), sourceItemDigest: hash("check-item", c.itemKey),
        scopeRefs: matches.length === 1 ? specs.get(matches[0].id)!.content.scopeRefs : [],
        scopeResolution: matches.length === 1 ? "MATCHED" : "UNRESOLVED", demonstratesReadiness: false };
    });
    const contradictions = scope.flatMap(s => {
      const scoped = learning.filter(e => e.scopeRefs.includes(s.modelRef));
      return scoped.some(e => e.demonstratesReadiness) && scoped.some(e => !e.demonstratesReadiness && !["ACTIVITY_COMPLETION", "SESSION_PACE"].includes(e.source)) ?
        [{ scopeRef: s.modelRef, evidenceRefs: scoped.map(e => e.evidenceId), resolution: "REQUIRES_EDUCATIONAL_JUDGMENT" }] : [];
    });
    return { planRef: t.planRef, intent, scope: scope.map(s => ({ ref: s.modelRef, title: s.title, parentRef: s.parentKey ? scopeRef.get(s.parentKey)! : null,
      inclusion: s.inclusion, sourceClaimIds: s.sourceClaimIds })), learning, savedChecks, contradictions,
      research: research ? { ...research, sources: research.sources.map(s => ({ ...s, location: s.location.kind === "OWNED_DOCUMENT" ?
        { kind: "OWNED_DOCUMENT", documentRef: `document_${s.sourceId}` } : s.location })) } : null };
  });
  // Local scope aliases are meaningful only within their owned Plan.
  const history = context.quests.filter(q => q.status === "COMPLETED" && specs.has(q.id) && targetById.has(specs.get(q.id)!.planId))
    .sort((a,b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0) || a.id - b.id);
  const historyLimit = Math.max(0, Math.min(20, Math.floor(options.historyExamples ?? 10)));
  const examples = history.filter(q => !byQuest.has(q.id)).slice(-historyLimit || history.length).reverse().map(q => ({
    title: q.title, scopeRefs: specs.get(q.id)!.content.scopeRefs, completedAt: q.completedAt?.toISOString() ?? null,
    actualSeconds: q.elapsedSeconds, demonstratesReadiness: false }));
  if (historyLimit === 0) examples.length = 0;
  const weeks = [...new Set(days.map(d => weekKey(d.date)))].map(week => ({ week,
    // Include actuals/commitments outside the detailed window in the same week.
    otherCommittedMinutes: [...ledger.usage].filter(([date]) => weekKey(date) === week).reduce((sum, [, n]) => sum + n, 0),
    protectedTargetMinutes: protectedExecution.filter(e => weekKey(e.date) === week).reduce((sum, e) => sum + e.remainingMinutes, 0),
    perGoalCommittedMinutes: targets.map(t => ({ planRef: t.planRef, minutes: t.intent.goalId ? ledger.perGoal.get(`${t.intent.goalId}/${week}`) ?? 0 : 0 })) }));
  const view = { schemaVersion: 2, projectedAt: context.now.toISOString(), authority: "EXECUTION_CONTEXT", envelope, weeks, plans, execution, runningSessions,
    actuals: days.map(d => ({ date: d.date, acceptedSeconds: ledger.actualSeconds.get(d.date) ?? 0 })),
    academicSources: (options.academicSources ?? (context.academicSource ? [{ planId: targets[0].planId, source: context.academicSource }] : [])).map(({ planId, source }) => {
      const target = targetById.get(planId); if (!target) reject("REFERENCE_NOT_OWNED", "Academic evidence belongs to another selected target.", "PREFLIGHT");
      const nodes = source.nodes.filter(n => target.intent.scope.some(s => s.title === n.title));
      return { planRef: target.planRef, subject: { name: source.subject.name, code: source.subject.code,
        examBoard: source.subject.examBoard, level: source.subject.level, syllabusNote: source.subject.syllabusNote },
        nodes: nodes.map(n => ({ title: n.title, description: n.description, difficulty: n.difficulty })), nodeSelection: "EXACT_SAVED_TITLE_HINT",
        omittedNodes: source.nodes.length - nodes.length, authority: "SAVED_UNVERIFIED_ASSESSMENT_HINT", sourceDigest: hash("subject-academic-source", source) };
    }),
    history: { source: "ACTIVITY_COMPLETION_AND_ACCEPTED_PACE", reliability: "OBSERVED_EXECUTION",
      sourceDigest: hash("relevant-history", history.map(q => ({ spec: specs.get(q.id), actualSeconds: q.elapsedSeconds, completedAt: q.completedAt, executionVersion: q.executionVersion }))),
      observedAtRange: { first: history[0]?.completedAt?.toISOString() ?? null, last: history.at(-1)?.completedAt?.toISOString() ?? null },
      relevantCompletedCount: history.length, acceptedSeconds: history.reduce((n, q) => n + q.elapsedSeconds, 0),
      byScope: targets.flatMap(t => t.intent.scope.map(s => { const own = history.filter(q => specs.get(q.id)!.planId === t.planId && specs.get(q.id)!.content.scopeRefs.includes(s.modelRef));
        return { planRef: t.planRef, scopeRef: s.modelRef, completedCount: own.length, approvedEstimateMinutes: own.reduce((n, q) => n + specs.get(q.id)!.effort.plannedMinutes, 0),
          acceptedSeconds: own.reduce((n, q) => n + q.elapsedSeconds, 0), demonstratesReadiness: false }; })),
      demonstratesReadiness: false, examples, omittedExamples: history.length - examples.length,
      unrelatedCompletedCount: context.quests.filter(q => q.status === "COMPLETED").length - history.length } };
  // Optional examples can be omitted explicitly. Consequential facts never
  // undergo prefix trimming, even when one note/instruction is very large.
  if (Buffer.byteLength(JSON.stringify(view)) > maxBytes) { view.history.examples = []; view.history.omittedExamples = history.length; }
  const bytes = Buffer.byteLength(JSON.stringify(view));
  if (bytes > maxBytes) reject("PAYLOAD_TOO_LARGE", "Required execution and learning evidence exceed the model context allowance; narrow the request.", "PREFLIGHT");
  return { view, registry, sessionRegistry, bytes, digest: hash("model-context", { ...view, projectedAt: null }) };
}

/** Use within the existing owner-coordinated transaction. Each target keeps its
 * own evidence/dependency seal; joint requests share complete execution facts. */
export async function loadPlannerModelContext(sql: Sql, ownerId: number,
  requested: readonly { planId: string; planRef: string; intentId: string }[], window: ContextWindow, options: Omit<ContextOptions, "academicSources"> = {}) {
  if (!requested.length || requested.length > 2 || new Set(requested.map(t => t.planId)).size !== requested.length)
    reject("INVALID_OUTPUT", "Select one or two distinct context targets.", "PREFLIGHT");
  const plans = [];
  for (const target of [...requested].sort((a,b) => a.planId.localeCompare(b.planId))) plans.push(await ownedPlan(sql, ownerId, target.planId));
  const targets: ContextTarget[] = []; const contexts: { planRef: string; context: ExecutionContext }[] = [];
  const academicSources: NonNullable<ContextOptions["academicSources"]> = [];
  for (const target of requested) {
    const plan = plans.find(p => p.id === target.planId)!; const version = await loadIntent(sql, ownerId, target.intentId);
    if (version.planId !== plan.id || plan.workingIntentVersionId !== version.intentVersionId) reject("STALE_CONTEXT", "The selected context intent is no longer current.", "PREFLIGHT");
    const activeRow = plan.activeRevisionId ? (await rows<{ schemaVersion: number }>(sql, 'SELECT "schemaVersion" FROM "PlannerRevision" WHERE id=$1 AND "planId"=$2', [plan.activeRevisionId, plan.id]))[0] : null;
    if (plan.activeRevisionId && !activeRow) reject("REFERENCE_NOT_OWNED", "The active context revision is unavailable.", "PREFLIGHT");
    const active = activeRow?.schemaVersion === 2 ? await loadRevision(sql, ownerId, plan.activeRevisionId!) : null;
    const legacy = (plan.migrationEvidence as { baselineSpecs?: unknown[] } | null)?.baselineSpecs ?? [];
    targets.push({ planId: plan.id, planRef: target.planRef, intent: version.intent,
      activeActivityKeys: active?.executable.map(s => s.activityKey) ?? legacy.map(s => ExecutionTaskSpecV2Schema.parse(s).activityKey) });
    const context = await loadExecutionContext(sql, ownerId, plans, version.intent);
    contexts.push({ planRef: target.planRef, context });
    if (context.academicSource) academicSources.push({ planId: plan.id, source: context.academicSource });
  }
  return { ...projectPlannerContext(contexts[0].context, targets, window, { ...options, academicSources }), contexts };
}
