import {
  ExecutionTaskSpecV2Schema, deriveRemainingWorkV2, canonicalExecutionContent,
  type ExecutionTaskSpecV2, type ExecutionStateV2, type CanonicalIntentV2, type ContextDependenciesV2,
  ContextDependenciesV2Schema, DateV2Schema,
  AvailabilityIntentV2Schema,
  PlannerRevisionV2Schema, PLANNER_V2_ENVELOPE,
} from "../contracts";
import { rows, hash, reject, clock, type Sql } from "./database";
import { loadIntent, type PlanRow } from "./intents";
import { TimezoneService } from "../../../timezone-service";

export interface QuestRow {
  id: number; userId: number; title: string; description: string | null; goalId: number | null;
  subjectId: number | null; subjectNodeId: number | null; status: string; completedAt: Date | null; scheduledFor: string;
  targetMinutes: number; requiredMinutes: number; elapsedSeconds: number; plannedMinutes: number | null;
  remainingMinutesEstimate: number | null; remainingEstimateBasisActualSeconds: number | null;
  remainingDisposition: "OPEN" | "COMPLETED" | "WITHDRAWN"; executionVersion: number;
  plannerSpec: unknown; plannerSpecDigest: string | null;
}
export interface SessionRow {
  id: number; userId: number; questId: number | null; subjectId: number | null;
  startedAt: Date; endedAt: Date | null; durationSeconds: number; breakSeconds: number;
  executionState: "RUNNING" | "PAUSED" | "ENDED" | null; executionVersion: number;
  runningSince: Date | null; acceptedFocusAtResume: number; acceptedBreakAtResume: number;
  executionContext: { timezone: string; actualCivilDate: string; toleranceUsedSeconds?: number } | null;
  transitionReceipts: Record<string, { requestHash: string; response: unknown }> | null;
}
export const specDigest = (spec: ExecutionTaskSpecV2): string => hash("execution-spec", {
  ...spec, content: JSON.parse(canonicalExecutionContent(spec)),
});
export const contentDigest = (spec: ExecutionTaskSpecV2): string => hash("execution-content", JSON.parse(canonicalExecutionContent(spec)));
/** The Attempt pins input facts before educational work. Cross-plan edges are
 * derived educational output, sealed by the full Revision digest afterward.
 * Their referenced content/execution facts are already in the pinned registry. */
export const contextInputDigest = (context: ContextDependenciesV2): string => hash("context-dependencies", { ...context, externalActivityDependencies: [] });
export const externalActivityAlias = (activityKey: string): string => `external_${activityKey.replaceAll("-", "")}`;
export function liveExecution(quest: QuestRow, sessions: readonly SessionRow[]): ExecutionStateV2 {
  const spec = ExecutionTaskSpecV2Schema.parse(quest.plannerSpec);
  const own = sessions.filter(session => session.questId === quest.id);
  if (own.some(session => !session.endedAt && !session.executionState)) reject("PROTECTED_EXECUTION", "An older timer must be explicitly stopped before this work can be adopted.");
  const actualSeconds = quest.elapsedSeconds;
  const forecast = deriveRemainingWorkV2(spec.effort, actualSeconds, quest.remainingDisposition);
  const state = quest.status === "COMPLETED" ? "COMPLETED" : own.some(session => session.executionState === "RUNNING") ? "RUNNING" :
    own.some(session => session.executionState === "PAUSED") ? "PAUSED" : actualSeconds > 0 || own.length > 0 || quest.status === "IN_PROGRESS" ? "ENDED_INCOMPLETE" : "UNSTARTED";
  return { schemaVersion: 2, activityKey: spec.activityKey, state, actualSeconds, executionVersion: quest.executionVersion,
    remainingDisposition: quest.remainingDisposition, ...forecast };
}
export function civilDate(date: Date, timezone: string): string {
  return TimezoneService.getUserLocalDate(timezone, date);
}
export const mondayIndex = (date: string): number => (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
export function weekKey(date: string): string {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - mondayIndex(date)); return d.toISOString().slice(0, 10);
}
export interface ExecutionContext {
  now: Date; today: string; timezone: string; restDays: number[]; floatingDates: string[];
  quests: QuestRow[]; sessions: SessionRow[]; dependencies: ContextDependenciesV2;
  requiresReestimate: boolean; legacyExceptions: { questId: number; reason: string }[];
  globalAvailability: CanonicalIntentV2["availability"] | null;
  availabilityIntentVersionId: string | null;
  checks?: SavedLearningCheck[];
  academicSource?: { subject: Record<string, unknown>; nodes: Record<string, unknown>[] };
}
export interface SavedLearningCheck {
  id: string; planId: string; itemKey: string; revisionId: string; result: string; createdAt: Date; updatedAt: Date;
}
export function questDependency(quest: QuestRow) {
  return { questId: quest.id, contentDigest: quest.plannerSpec ? contentDigest(ExecutionTaskSpecV2Schema.parse(quest.plannerSpec)) : hash("legacy-quest", {
    title: quest.title, description: quest.description, requiredMinutes: quest.requiredMinutes, goalId: quest.goalId, subjectId: quest.subjectId,
  }), executionVersion: quest.executionVersion };
}
/** Raw owned execution remains complete. Only the bounded dependency registry is
 * projected; open commitments, current education and their closed prerequisites
 * are never removed to make that registry fit. */
export function relevantDependencyQuests(quests: readonly QuestRow[], sessions: readonly SessionRow[], activeKeys: ReadonlySet<string>, pinnedQuestIds: readonly number[] = []): QuestRow[] {
  const parsed = new Map(quests.filter(quest => quest.plannerSpec).map(quest => [quest.id, ExecutionTaskSpecV2Schema.parse(quest.plannerSpec)]));
  const byKey = new Map(quests.filter(quest => quest.plannerSpec).map(quest => [parsed.get(quest.id)!.activityKey, quest]));
  if (byKey.size !== parsed.size) reject("INVALID_OUTPUT", "Execution activity identity is ambiguous.", "PREFLIGHT");
  const running = new Set(sessions.filter(session => !session.endedAt).map(session => session.questId));
  const pinned = new Set(pinnedQuestIds);
  const selected = new Map(quests.filter(quest => quest.status !== "COMPLETED" && quest.remainingDisposition === "OPEN" || running.has(quest.id) ||
    activeKeys.has(parsed.get(quest.id)?.activityKey ?? "") || pinned.has(quest.id)).map(quest => [quest.id, quest]));
  if (pinnedQuestIds.some(id => !quests.some(quest => quest.id === id))) reject("REFERENCE_NOT_OWNED", "A required execution reference is unavailable.", "PREFLIGHT");
  const queue = [...selected.values()];
  for (let i = 0; i < queue.length; i++) for (const key of [...(parsed.get(queue[i].id)?.content.hardDependencies ?? []),
    ...(parsed.get(queue[i].id)?.continuesActivityKey ? [parsed.get(queue[i].id)!.continuesActivityKey!] : [])]) {
    const prerequisite = byKey.get(key);
    if (!prerequisite) reject("PROTECTED_EXECUTION", "A required prerequisite is unavailable.", "PREFLIGHT");
    if (!selected.has(prerequisite.id)) { selected.set(prerequisite.id, prerequisite); queue.push(prerequisite); }
  }
  if (selected.size > PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * PLANNER_V2_ENVELOPE.targets) reject("PAYLOAD_TOO_LARGE", "Required execution dependencies exceed the bounded Planner context; resolve or narrow the request.", "PREFLIGHT");
  return quests.filter(quest => selected.has(quest.id));
}
export async function loadExecutionContext(sql: Sql, ownerId: number, plans: readonly PlanRow[], intent: CanonicalIntentV2, pinnedQuestIds: readonly number[] = []): Promise<ExecutionContext> {
  const user = (await rows<{ timezone: string; restDays: number[] }>(sql, 'SELECT timezone,"restDays" FROM "User" WHERE id=$1', [ownerId]))[0];
  if (!user) reject("REFERENCE_NOT_OWNED", "Student unavailable.");
  const now = await clock(sql);
  // Availability is a global accepted fact. Derive its latest consequential
  // acceptance from immutable intents, not whichever Plan happens to generate.
  // Repeated copies during unrelated edits/research do not create new events.
  const availabilityEvent = (await rows<{ id: string; availability: unknown }>(sql, `
    SELECT i.id,i.artifact->'intent'->'availability' AS availability FROM "PlannerIntentVersion" i
    LEFT JOIN "PlannerIntentVersion" parent ON parent.id=i."parentId"
    WHERE i."userId"=$1 AND i.artifact->'intent'->'availability' IS NOT NULL
      AND ((i.artifact->'intent'->'availability')-'perGoalWeeklyCeilingMinutes') IS DISTINCT FROM
          ((parent.artifact->'intent'->'availability')-'perGoalWeeklyCeilingMinutes')
    ORDER BY (i.artifact->'intent'->'availability'->>'basis'='CONFIRMED_AVAILABILITY') DESC,
      (i.artifact->>'acceptedAt')::timestamptz DESC,i.id DESC LIMIT 1`, [ownerId]))[0];
  const globalAvailability = availabilityEvent ? AvailabilityIntentV2Schema.parse(availabilityEvent.availability) : null;
  const quests = await rows<QuestRow>(sql, 'SELECT * FROM "Quest" WHERE "userId"=$1 ORDER BY id', [ownerId]);
  const sessions = await rows<SessionRow>(sql, 'SELECT * FROM "StudySession" WHERE "userId"=$1 ORDER BY id', [ownerId]);
  const floatingDates = (await rows<{ dateKey: string }>(sql, 'SELECT "dateKey" FROM "FloatingRestDay" WHERE "userId"=$1 ORDER BY "dateKey"', [ownerId])).map(row => row.dateKey);
  const legacyExceptions: ExecutionContext["legacyExceptions"] = [];
  let requiresReestimate = false;
  const commitments = quests.filter(quest => quest.status !== "COMPLETED").map(quest => {
    if (quest.plannerSpec) {
      const execution = liveExecution(quest, sessions);
      requiresReestimate ||= execution.requiresReestimate;
      return { id: quest.id, date: quest.scheduledFor, remaining: execution.remainingMinutesEstimate, disposition: execution.remainingDisposition,
        contentDigest: contentDigest(ExecutionTaskSpecV2Schema.parse(quest.plannerSpec)), executionVersion: quest.executionVersion };
    }
    const valid = Number.isInteger(quest.requiredMinutes) && quest.requiredMinutes > 0 && DateV2Schema.safeParse(quest.scheduledFor).success;
    if (!valid) legacyExceptions.push({ questId: quest.id, reason: "Legacy duration or placement is unresolved." });
    return { id: quest.id, date: quest.scheduledFor, remaining: valid ? Math.max(1, Math.ceil(quest.requiredMinutes - quest.elapsedSeconds / 60)) : null,
      disposition: quest.remainingDisposition, contentDigest: hash("legacy-quest", { title: quest.title, description: quest.description, requiredMinutes: quest.requiredMinutes, goalId: quest.goalId, subjectId: quest.subjectId }), executionVersion: quest.executionVersion };
  });
  // Accepted actual seconds are attributed to the actual session date, never the Quest placement.
  const actualByDate = new Map<string, number>();
  for (const session of sessions) {
    const date = session.executionContext?.actualCivilDate ?? civilDate(session.startedAt, user.timezone);
    actualByDate.set(date, (actualByDate.get(date) ?? 0) + session.durationSeconds);
  }
  const evidence = intent.evidence.map(value => ({ ref: value.evidenceId, digest: hash("learning-evidence", value) }));
  let academicSource: ExecutionContext["academicSource"];
  // Academic source changes are consequential; cosmetic fields and XP are not.
  // Keep these in the existing evidence projection rather than another version table.
  if (intent.subjectId) {
    const subject = (await rows(sql, 'SELECT id,name,code,"examBoard",level,"syllabusNote","archivedAt" FROM "Subject" WHERE id=$1 AND "userId"=$2', [intent.subjectId, ownerId]))[0];
    if (!subject || subject.archivedAt) reject("REFERENCE_NOT_OWNED", "The selected subject is unavailable.");
    const nodes = await rows(sql, 'SELECT id,"nodeId",title,description,difficulty FROM "SubjectNode" WHERE "subjectId"=$1 ORDER BY id', [intent.subjectId]);
    academicSource = { subject, nodes };
    evidence.push({ ref: `subject_${intent.subjectId}`, digest: hash("subject-academic-source", { subject, nodes }) });
  }
  for (const source of intent.research?.sources ?? []) evidence.push({ ref: `source_${hash("source-ref", source.sourceId).slice(0, 48)}`, digest: hash("research-source", source) });
  const checks = await rows<SavedLearningCheck>(sql, 'SELECT id,"planId","itemKey","revisionId",result,"createdAt","updatedAt" FROM "PlannerCheckResult" WHERE "userId"=$1 AND "planId"=ANY($2::uuid[]) ORDER BY id', [ownerId, plans.map(plan => plan.id)]);
  // Preserve the existing result pin. New model projections separately pin
  // provenance/timestamps so an old sealed artifact is not relabeled.
  if (checks.length) evidence.push({ ref: "saved_checks", digest: hash("saved-checks", checks.map(({ id, planId, itemKey, result }) => ({ id, planId, itemKey, result }))) });
  let dependencyQuests = quests;
  if (quests.length > PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * PLANNER_V2_ENVELOPE.targets || pinnedQuestIds.length) {
    const revisions = await rows<{ v2Artifact: unknown }>(sql, 'SELECT "v2Artifact" FROM "PlannerRevision" WHERE "planId"=ANY($1::uuid[]) AND id=ANY($2::uuid[])', [plans.map(plan => plan.id), plans.map(plan => plan.activeRevisionId).filter(Boolean)]);
    const activeKeys = new Set(revisions.filter(row => row.v2Artifact).flatMap(row => PlannerRevisionV2Schema.parse(row.v2Artifact).executable.map(spec => spec.activityKey)));
    for (const plan of plans) for (const spec of (plan.migrationEvidence as { baselineSpecs?: unknown[] } | null)?.baselineSpecs ?? []) activeKeys.add(ExecutionTaskSpecV2Schema.parse(spec).activityKey);
    dependencyQuests = relevantDependencyQuests(quests, sessions, activeKeys, pinnedQuestIds);
  }
  const planBases = plans.map(plan => ({ planId: plan.id, revisionId: plan.activeRevisionId, planningVersion: plan.version }));
  const checkedDependencies = ContextDependenciesV2Schema.safeParse({
    intentDigest: hash("canonical-intent", intent), capacityDigest: hash("capacity", { timezone: user.timezone, restDays: [...user.restDays].sort(), floatingDates,
      availability: globalAvailability, availabilityIntentVersionId: availabilityEvent?.id ?? null, commitments, actualByDate: [...actualByDate].sort() }), evidence,
    quests: dependencyQuests.map(questDependency),
    planBases, externalActivityDependencies: [],
  });
  if (!checkedDependencies.success) reject("PAYLOAD_TOO_LARGE", "Consequential evidence or execution dependencies exceed the Planner context envelope.", "PREFLIGHT");
  return { now, today: civilDate(now, user.timezone), timezone: user.timezone, restDays: user.restDays, floatingDates, quests, sessions, dependencies: checkedDependencies.data, requiresReestimate, legacyExceptions, globalAvailability, availabilityIntentVersionId: availabilityEvent?.id ?? null, checks, academicSource };
}
/** Live progress/capacity can be revalidated against fixed placements. It cannot
 * waive changes to intent, academic sources, execution generations or Plan bases. */
export function verifyContextCorrespondence(sealed: ContextDependenciesV2, current: ContextDependenciesV2, ownedQuests?: readonly QuestRow[]): void {
  const relevant = (value: ContextDependenciesV2) => ({ intentDigest: value.intentDigest, evidence: [...value.evidence].sort((a, b) => a.ref.localeCompare(b.ref)),
    planBases: [...value.planBases].sort((a, b) => a.planId.localeCompare(b.planId)) });
  if (hash("relevant-context", relevant(sealed)) !== hash("relevant-context", relevant(current))) reject("STALE_CONTEXT", "The goal, academic evidence or active baseline changed.", "APPLY");
  for (const pinned of sealed.quests) {
    const owned = ownedQuests?.find(quest => quest.id === pinned.questId);
    const fresh = current.quests.find(quest => quest.questId === pinned.questId) ?? (owned ? questDependency(owned) : undefined);
    if (!fresh || fresh.contentDigest !== pinned.contentDigest || fresh.executionVersion !== pinned.executionVersion) reject("STALE_CONTEXT", "A reviewed execution dependency changed.", "APPLY");
  }
}
/** Shared by confirmation and model envelopes. Actual time is charged to its
 * session civil date; only open remaining work is added, once. Selected target
 * work is replaced by the proposal, never charged as both old and new. */
export function executionCapacityLedger(context: ExecutionContext, selectedIds: ReadonlySet<string>) {
  const usage = new Map<string, number>(); const perGoal = new Map<string, number>();
  const actualSeconds = new Map<string, number>(); const otherRemaining = new Map<string, number>();
  for (const session of context.sessions) {
    const date = session.executionContext?.actualCivilDate ?? civilDate(session.startedAt, context.timezone);
    actualSeconds.set(date, (actualSeconds.get(date) ?? 0) + session.durationSeconds);
    usage.set(date, (usage.get(date) ?? 0) + session.durationSeconds / 60);
    const goal = context.quests.find(quest => quest.id === session.questId)?.goalId;
    if (goal) perGoal.set(`${goal}/${weekKey(date)}`, (perGoal.get(`${goal}/${weekKey(date)}`) ?? 0) + session.durationSeconds / 60);
  }
  for (const quest of context.quests) {
    if (quest.status === "COMPLETED" || quest.remainingDisposition !== "OPEN") continue;
    const spec = quest.plannerSpec ? ExecutionTaskSpecV2Schema.parse(quest.plannerSpec) : null;
    if (spec && selectedIds.has(spec.planId)) continue;
    const remaining = spec ? liveExecution(quest, context.sessions).remainingMinutesEstimate : Math.max(1, Math.ceil(quest.requiredMinutes - quest.elapsedSeconds / 60));
    otherRemaining.set(quest.scheduledFor, (otherRemaining.get(quest.scheduledFor) ?? 0) + remaining);
    usage.set(quest.scheduledFor, (usage.get(quest.scheduledFor) ?? 0) + remaining);
    if (quest.goalId) perGoal.set(`${quest.goalId}/${weekKey(quest.scheduledFor)}`, (perGoal.get(`${quest.goalId}/${weekKey(quest.scheduledFor)}`) ?? 0) + remaining);
  }
  return { usage, perGoal, actualSeconds, otherRemaining };
}
/** Validate fixed placements; this is not the Phase 2 allocator/compiler. */
export function verifyPlacement(context: ExecutionContext, targets: readonly { plan: PlanRow; intent: CanonicalIntentV2; specs: readonly ExecutionTaskSpecV2[] }[]): void {
  if (context.legacyExceptions.length) reject("CAPACITY_SHORTFALL", "Resolve unknown legacy commitments before confirming new work.", "APPLY");
  if (!targets.length || !context.globalAvailability) reject("CAPACITY_SHORTFALL", "Confirmation needs an accepted availability ceiling.", "APPLY");
  const global = context.globalAvailability;
  const selectedIds = new Set(targets.map(target => target.plan.id));
  for (const quest of context.quests) if (quest.plannerSpec && liveExecution(quest, context.sessions).requiresReestimate) {
    const current = ExecutionTaskSpecV2Schema.parse(quest.plannerSpec);
    const replacement = targets.flatMap(target => target.specs).find(spec => spec.activityKey === current.activityKey);
    if (!selectedIds.has(current.planId) || replacement && deriveRemainingWorkV2(replacement.effort, quest.elapsedSeconds).requiresReestimate)
      reject("CAPACITY_SHORTFALL", "Some unfinished work needs a reviewed remaining estimate.", "APPLY");
  }
  const { usage, perGoal } = executionCapacityLedger(context, selectedIds);
  for (const { plan, intent, specs } of targets) for (const spec of specs) {
    const date = spec.placement.date;
    const quest = context.quests.find(quest => quest.plannerSpec && ExecutionTaskSpecV2Schema.parse(quest.plannerSpec).activityKey === spec.activityKey);
    if (quest?.status === "COMPLETED" || quest?.remainingDisposition !== "OPEN" && quest) continue;
    if (spec.placement.timezone !== context.timezone || global.timezone !== context.timezone || date < context.today ||
      context.restDays.includes((mondayIndex(date) + 1) % 7) || context.floatingDates.includes(date) || global.restWeekdays.includes(mondayIndex(date)) || global.blockedDates.includes(date) ||
      intent.deadline.kind === "FIXED" && (date > intent.deadline.date || date === intent.deadline.date && !intent.deadline.examDayStudyAllowed)) reject("SCHEDULE_CONFLICT", "A reviewed activity conflicts with a date, timezone, rest day or deadline.", "APPLY");
    if (spec.goalId !== (plan.goalId ?? plan.reservedGoalId)) reject("REFERENCE_NOT_OWNED", "An activity does not belong to its plan's goal.", "APPLY");
    const remaining = deriveRemainingWorkV2(spec.effort, quest?.elapsedSeconds ?? 0).remainingMinutesEstimate;
    usage.set(date, (usage.get(date) ?? 0) + remaining);
    perGoal.set(`${spec.goalId}/${weekKey(date)}`, (perGoal.get(`${spec.goalId}/${weekKey(date)}`) ?? 0) + remaining);
  }
  for (const date of new Set(targets.flatMap(target => target.specs.map(spec => spec.placement.date)))) {
    const maximum = global.dailyCeilingMinutes[mondayIndex(date)];
    if ((usage.get(date) ?? 0) > maximum) reject("SCHEDULE_CONFLICT", "The calendar no longer has enough capacity for this proposal.", "APPLY");
    const week = weekKey(date);
    const weeklyUse = [...usage].filter(([day]) => weekKey(day) === week).reduce((sum, [, minutes]) => sum + minutes, 0);
    if (global.weeklyCeilingMinutes !== undefined && weeklyUse > global.weeklyCeilingMinutes) reject("SCHEDULE_CONFLICT", "Weekly availability has been exceeded.", "APPLY");
    for (const target of targets) if (target.intent.availability?.perGoalWeeklyCeilingMinutes !== undefined &&
      (perGoal.get(`${target.plan.goalId ?? target.plan.reservedGoalId}/${week}`) ?? 0) > target.intent.availability.perGoalWeeklyCeilingMinutes) reject("SCHEDULE_CONFLICT", "The goal's accepted weekly ceiling has been exceeded.", "APPLY");
  }
}
export async function contextForPlans(sql: Sql, ownerId: number, plans: readonly PlanRow[]): Promise<ExecutionContext> {
  const intent = (await loadIntent(sql, ownerId, plans[0].workingIntentVersionId!)).intent;
  return loadExecutionContext(sql, ownerId, plans, intent);
}
