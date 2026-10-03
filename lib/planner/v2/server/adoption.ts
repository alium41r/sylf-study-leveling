import { randomUUID } from "node:crypto";
import { CanonicalIntentV2Schema, ExecutionTaskSpecV2Schema, PLANNER_V2_ENVELOPE, plannerSerializedBytes,
  type ExecutionTaskSpecV2 } from "../contracts";
import { PlannerDatabase, rows, hash, clock, reject, type Sql } from "./database";
import { appendIntent, ownedPlan, type PlanRow } from "./intents";
import { civilDate, specDigest, type QuestRow, type SessionRow } from "./context";

interface LegacyLink { id: string; itemKey: string; questId: number | null; disposition: string; createdRevisionId: string; appliedRevisionId: string; baseline: unknown }
export interface AdoptionReview { questId: number; purpose: string; completionCriterion?: string; remainingMinutesEstimate?: number; adoptDetached?: boolean }
export interface AdoptionIssue { questId: number | null; code: string; blocksFuture: boolean }
export interface AdoptionInspection {
  liveDigest: string; planId: string | null; goalId: number | null;
  quests: QuestRow[]; sessions: SessionRow[]; links: LegacyLink[]; issues: AdoptionIssue[];
  timezone: string;
}
interface MigrationReceipt { planId: string; intentVersionId: string; baselineDigest: string; questIds: number[]; adoptedAt: string; requestKey: string }

async function inspect(sql: Sql, ownerId: number, target: { planId?: string; goalId?: number }): Promise<AdoptionInspection> {
  if (Boolean(target.planId) === Boolean(target.goalId)) reject("INVALID_OUTPUT", "Choose one owned legacy plan or Classic goal.");
  const plan = target.planId ? await ownedPlan(sql, ownerId, target.planId) : null;
  const goalId = plan?.goalId ?? target.goalId ?? null;
  if (goalId && !(await rows(sql, 'SELECT id FROM "Goal" WHERE id=$1 AND "userId"=$2', [goalId, ownerId])).length) reject("REFERENCE_NOT_OWNED", "The legacy goal is unavailable.");
  const links = plan ? await rows<LegacyLink>(sql, 'SELECT * FROM "PlannerQuestLink" WHERE "planId"=$1 ORDER BY "itemKey"', [plan.id]) : [];
  const quests = plan ? await rows<QuestRow>(sql, 'SELECT q.* FROM "Quest" q WHERE q."userId"=$2 AND (q."goalId"=$3 OR EXISTS (SELECT 1 FROM "PlannerQuestLink" l WHERE l."questId"=q.id AND l."planId"=$1)) ORDER BY q.id', [plan.id, ownerId, goalId]) :
    await rows<QuestRow>(sql, 'SELECT * FROM "Quest" WHERE "goalId"=$1 AND "userId"=$2 ORDER BY id', [goalId, ownerId]);
  const sessions = await rows<SessionRow>(sql, 'SELECT * FROM "StudySession" WHERE "userId"=$1 AND "questId"=ANY($2::int[]) ORDER BY id', [ownerId, quests.map(quest => quest.id)]);
  const revisions = plan ? await rows(sql, 'SELECT id,"operationState","confirmationReceipt",digest FROM "PlannerRevision" WHERE "planId"=$1 ORDER BY sequence', [plan.id]) : [];
  const timezone = (await rows<{ timezone: string }>(sql, 'SELECT timezone FROM "User" WHERE id=$1', [ownerId]))[0].timezone;
  const issues: AdoptionIssue[] = [];
  if (revisions.some(revision => revision.operationState === "PREPARING")) issues.push({ questId: null, code: "LEGACY_OPERATION_MUST_QUIESCE", blocksFuture: true });
  for (const quest of quests) {
    const future = quest.status !== "COMPLETED";
    if (!Number.isInteger(quest.requiredMinutes) || quest.requiredMinutes < PLANNER_V2_ENVELOPE.timeboxMinMinutes || quest.requiredMinutes > PLANNER_V2_ENVELOPE.timeboxMaxMinutes) issues.push({ questId: quest.id, code: "INVALID_EXECUTION_TIMEBOX", blocksFuture: future });
    if (quest.targetMinutes !== quest.requiredMinutes) issues.push({ questId: quest.id, code: "DURATION_ALIAS_CONFLICT", blocksFuture: false });
    const date = new Date(`${quest.scheduledFor}T00:00:00Z`);
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== quest.scheduledFor) issues.push({ questId: quest.id, code: "INVALID_CIVIL_DATE", blocksFuture: future });
    const ownSessions = sessions.filter(session => session.questId === quest.id);
    if (ownSessions.some(session => !session.endedAt)) issues.push({ questId: quest.id, code: "OPEN_TIMER_MUST_DRAIN", blocksFuture: true });
    if (ownSessions.some(session => !Number.isInteger(session.durationSeconds) || session.durationSeconds < 0) || ownSessions.reduce((sum, session) => sum + session.durationSeconds, 0) !== quest.elapsedSeconds) issues.push({ questId: quest.id, code: "ACTUAL_HISTORY_MISMATCH", blocksFuture: future });
    if (links.find(link => link.questId === quest.id)?.disposition === "DETACHED") issues.push({ questId: quest.id, code: "DETACHED_REQUIRES_EXPLICIT_ADOPTION", blocksFuture: future });
    if (goalId && quest.goalId !== goalId) issues.push({ questId: quest.id, code: "LIVE_GOAL_CORRESPONDENCE", blocksFuture: future });
  }
  return { planId: plan?.id ?? null, goalId, quests, sessions, links, issues, timezone,
    liveDigest: hash("legacy-adoption-inventory", { plan, quests, sessions, links, revisions, timezone }) };
}

/** Staged, reviewed baseline adoption. Does not regenerate, move sessions,
 * normalize economic history, guess pause state, or attest historical quality. */
export class AdoptionService {
  constructor(readonly db: PlannerDatabase, readonly enabled = false, private readonly boundary?: (sql: Sql) => Promise<void>) {}
  inspect(ownerId: number, target: { planId?: string; goalId?: number }): Promise<AdoptionInspection> {
    return this.db.coordinated(ownerId, sql => inspect(sql, ownerId, target));
  }
  async adopt(ownerId: number, request: { key: string; planId?: string; goalId?: number; expectedLiveDigest: string; intent: unknown; review: AdoptionReview[] }): Promise<MigrationReceipt> {
    if (!this.enabled) reject("WORKER_UNAVAILABLE", "Durable-core adoption is disabled in this deployment.");
    if (!/^[A-Za-z0-9_-]{8,90}$/.test(request.key)) reject("INVALID_OUTPUT", "Invalid adoption identity.");
    const intent = CanonicalIntentV2Schema.parse(request.intent);
    const requestHash = hash("adoption-request", { ...request, intent });
    return this.db.coordinated(ownerId, async sql => {
      const existing = request.planId ? await ownedPlan(sql, ownerId, request.planId) : (await rows<PlanRow>(sql, 'SELECT * FROM "PlannerPlan" WHERE "userId"=$1 AND "creationKey"=$2 FOR UPDATE', [ownerId, `adopt_${request.key}`]))[0];
      if (existing?.contractVersion === 2) {
        const migration = existing.migrationEvidence as { requestHash?: string; receipt?: MigrationReceipt } | null;
        if (migration?.requestHash !== requestHash || !migration.receipt) reject("IDEMPOTENCY_MISMATCH", "This plan was adopted from a different reviewed baseline.");
        return migration.receipt;
      }
      const inventory = await inspect(sql, ownerId, request);
      if (inventory.liveDigest !== request.expectedLiveDigest) reject("STALE_CONTEXT", "Legacy execution changed after the adoption inventory was reviewed.");
      if ((await rows(sql, 'SELECT id FROM "PlannerQuestLink" WHERE "questId"=ANY($1::int[]) AND "planId" IS DISTINCT FROM $2::uuid', [inventory.quests.map(quest=>quest.id), inventory.planId])).length)
        reject("INTENT_CONFLICT", "A live activity belongs to another Plan; resolve its migration lineage before adoption.");
      if (existing?.state === "ARCHIVED") reject("INTENT_CONFLICT", "Archived history remains inspectable; it is not an active adoption target.");
      if (request.review.length !== inventory.quests.length || new Set(request.review.map(review => review.questId)).size !== request.review.length || inventory.quests.some(quest => !request.review.some(review => review.questId === quest.id))) reject("INVALID_OUTPUT", "The review must account for every live Quest, including completed history.");
      const blocking = inventory.issues.filter(issue => issue.blocksFuture && !(issue.code === "DETACHED_REQUIRES_EXPLICIT_ADOPTION" && request.review.find(review => review.questId === issue.questId)?.adoptDetached));
      if (blocking.length) reject("PROTECTED_EXECUTION", `Adoption requires resolution: ${[...new Set(blocking.map(issue => issue.code))].join(", ")}`);
      // Lock authoritative sessions before Quests. No external/provider work is
      // performed while holding this transaction.
      await sql.query('SELECT id FROM "StudySession" WHERE "userId"=$1 ORDER BY id FOR UPDATE', [ownerId]);
      await sql.query('SELECT id FROM "Quest" WHERE "userId"=$1 ORDER BY id FOR UPDATE', [ownerId]);
      let plan = existing;
      const goalId = inventory.goalId ?? Number((await rows<{ id: string }>(sql, `SELECT nextval(pg_get_serial_sequence('"Goal"','id')) AS id`))[0].id);
      if (intent.goalId && intent.goalId !== goalId) reject("INTENT_CONFLICT", "Adoption cannot reassign the execution goal.");
      if (!inventory.goalId) await sql.query('INSERT INTO "Goal" (id,"userId",title,description,"targetWeeks") VALUES ($1,$2,$3,$4,1)', [goalId, ownerId, intent.title, intent.outcome]);
      if (!plan) {
        if ((await rows(sql, 'SELECT id FROM "PlannerPlan" WHERE "userId"=$1 AND "goalId"=$2', [ownerId, goalId])).length || (await rows(sql, 'SELECT id FROM "PlannerQuestLink" WHERE "questId"=ANY($1::int[])', [inventory.quests.map(quest => quest.id)])).length) reject("INTENT_CONFLICT", "This Classic goal already has modern lineage; adopt its existing Plan instead.");
        const planId = randomUUID();
        await sql.query('INSERT INTO "PlannerPlan" (id,"userId",mode,title,state,"goalId","subjectId","creationKey","creationHash","updatedAt") VALUES ($1,$2,$3,$4,\'DRAFT\',$5,$6,$7,$8,clock_timestamp())', [planId, ownerId, intent.policy, intent.title, goalId, intent.subjectId ?? null, `adopt_${request.key}`, requestHash]);
        plan = await ownedPlan(sql, ownerId, planId);
      }
      const timezone = (await rows<{ timezone: string }>(sql, 'SELECT timezone FROM "User" WHERE id=$1', [ownerId]))[0].timezone;
      const baselineSpecs: ExecutionTaskSpecV2[] = []; const legacyDescriptions: Record<string, string | null> = {};
      const historyOnly: number[] = [];
      for (const quest of inventory.quests) {
        const review = request.review.find(review => review.questId === quest.id)!;
        const linked = inventory.links.find(link => link.questId === quest.id);
        const ownSessions = inventory.sessions.filter(session => session.questId === quest.id);
        const started = quest.elapsedSeconds > 0 || ownSessions.length > 0 || quest.status === "IN_PROGRESS";
        const completed = quest.status === "COMPLETED";
        const marker = quest.description?.lastIndexOf("\n\nDone when: ") ?? -1;
        const instructions = marker >= 0 ? quest.description!.slice(0, marker) : quest.description;
        const criterion = marker >= 0 ? quest.description!.slice(marker + "\n\nDone when: ".length) : review.completionCriterion;
        if (started && !completed && review.remainingMinutesEstimate === undefined) reject("PROTECTED_EXECUTION", "Started unfinished work needs an explicitly reviewed remaining estimate.");
        const parsed = ExecutionTaskSpecV2Schema.safeParse({ schemaVersion: 2, activityKey: linked?.itemKey ?? randomUUID(), blueprintActivityId: `legacy_${quest.id}`, planId: plan.id, goalId,
          content: { title: quest.title, instructions, completionCriterion: criterion, outcomeRefs: [], scopeRefs: [], activityType: "LEGACY_IMPORTED", purpose: review.purpose, resources: [], hardDependencies: [] },
          effort: { plannedMinutes: quest.requiredMinutes, remainingMinutesEstimate: completed ? 0 : started ? review.remainingMinutesEstimate : quest.requiredMinutes,
            remainingEstimateBasisActualSeconds: quest.elapsedSeconds }, placement: { date: quest.scheduledFor, timezone } });
        if (!parsed.success || inventory.issues.some(issue => issue.questId === quest.id && ["ACTUAL_HISTORY_MISMATCH", "LIVE_GOAL_CORRESPONDENCE"].includes(issue.code))) {
          if (!completed) reject("INVALID_OUTPUT", "Future work cannot satisfy the V2 baseline contract; resolve its migration exception explicitly.");
          historyOnly.push(quest.id); continue;
        }
        baselineSpecs.push(parsed.data); legacyDescriptions[parsed.data.activityKey] = quest.description;
      }
      let baselineRevisionId = plan.activeRevisionId;
      if (!baselineRevisionId && baselineSpecs.length) {
        baselineRevisionId = randomUUID(); const output = { kind: "LEGACY_IMPORTED", quality: "LEGACY_UNREVIEWED", sourceQuestIds: inventory.quests.map(quest => quest.id) };
        const sequence = (await rows<{ sequence: number }>(sql, 'SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM "PlannerRevision" WHERE "planId"=$1', [plan.id]))[0].sequence;
        await sql.query(`INSERT INTO "PlannerRevision" (id,"planId",sequence,source,"baseVersion","inputSnapshot","availabilitySnapshot","outputSnapshot",digest,"operationKey","operationHash","operationState","sealedAt","confirmationKey","confirmationHash","confirmationReceipt","confirmedAt","updatedAt")
          VALUES ($1,$2,$3,'GENERATE',$4,$5,'{}',$6,$7,$8,$9,'SEALED',clock_timestamp(),$8,$9,$10,clock_timestamp(),clock_timestamp())`,
          [baselineRevisionId, plan.id, sequence, plan.version, { kind: "LEGACY_BASELINE", quality: "LEGACY_UNREVIEWED" }, output, hash("legacy-baseline-history", output), `adopt_${request.key}`, requestHash, { kind: "LEGACY_BASELINE", sourceQuestIds: inventory.quests.map(quest => quest.id) }]);
      }
      await sql.query('UPDATE "PlannerPlan" SET "contractVersion"=2,"reservedGoalId"=$2,"goalId"=$2,"latestDraftRevisionId"=NULL,"activeRevisionId"=$3,state=$4 WHERE id=$1', [plan.id, goalId, baselineRevisionId, baselineRevisionId ? "ACTIVE" : "DRAFT"]);
      plan = await ownedPlan(sql, ownerId, plan.id);
      const accepted = await appendIntent(sql, plan, { ...intent, goalId }, "MIGRATION");
      await sql.query("SELECT set_config('sylf.planner_v2_apply_owner',$1,true)", [String(ownerId)]);
      // Freeze the accepted civil-date attribution without moving the original
      // instants or claiming knowledge of a historical timezone we do not have.
      const dates = inventory.sessions.filter(session => !session.executionContext).map(session => ({ id: session.id,
        context: { timezone: inventory.timezone, actualCivilDate: civilDate(session.startedAt, inventory.timezone) } }));
      if (dates.length) await sql.query(`UPDATE "StudySession" s SET "executionContext"=r.context FROM jsonb_to_recordset($1::jsonb) AS r(id int,context jsonb)
        WHERE s.id=r.id AND s."userId"=$2 AND s."endedAt" IS NOT NULL AND s."executionContext" IS NULL`, [JSON.stringify(dates), ownerId]);
      for (const spec of baselineSpecs) {
        const quest = inventory.quests.find(quest => spec.blueprintActivityId === `legacy_${quest.id}`)!;
        const completed = quest.status === "COMPLETED"; const started = quest.elapsedSeconds > 0 || inventory.sessions.some(session => session.questId === quest.id) || quest.status === "IN_PROGRESS";
        await sql.query(`UPDATE "Quest" SET "goalId"=$2,"plannedMinutes"=$3,"targetMinutes"=$3,"remainingMinutesEstimate"=$4,"remainingEstimateBasisActualSeconds"=$5,
          "remainingDisposition"=$6,"plannerSpec"=$7,"plannerSpecDigest"=$8,"executionVersion"=CASE WHEN $9 THEN GREATEST("executionVersion",1) ELSE "executionVersion" END WHERE id=$1 AND "userId"=$10`,
          [quest.id, goalId, spec.effort.plannedMinutes, spec.effort.remainingMinutesEstimate, spec.effort.remainingEstimateBasisActualSeconds, completed ? "COMPLETED" : "OPEN", spec, specDigest(spec), started || completed, ownerId]);
        const link = inventory.links.find(link => link.questId === quest.id);
        if (link) await sql.query('UPDATE "PlannerQuestLink" SET "baselineSpecDigest"=$2,disposition=\'LIVE\',"updatedAt"=clock_timestamp() WHERE id=$1', [link.id, specDigest(spec)]);
        else await sql.query('INSERT INTO "PlannerQuestLink" (id,"planId","itemKey","questId","createdRevisionId","appliedRevisionId",baseline,"baselineSpecDigest","updatedAt") VALUES ($1,$2,$3,$4,$5,$5,$6,$7,clock_timestamp())', [randomUUID(), plan.id, spec.activityKey, quest.id, baselineRevisionId, spec, specDigest(spec)]);
      }
      const baselineDigest = hash("imported-live-baseline", baselineSpecs);
      const receipt: MigrationReceipt = { planId: plan.id, intentVersionId: accepted.intentVersionId, baselineDigest, questIds: baselineSpecs.map(spec => inventory.quests.find(quest => spec.blueprintActivityId === `legacy_${quest.id}`)!.id), adoptedAt: (await clock(sql)).toISOString(), requestKey: request.key };
      const migration = { schemaVersion: 2, quality: "LEGACY_UNREVIEWED", requestHash, receipt, sourceInventoryDigest: inventory.liveDigest, baselineDigest, baselineSpecs, legacyDescriptions,
        historyOnlyQuestIds: historyOnly, issues: inventory.issues, originalDurations: inventory.quests.map(quest => ({ questId: quest.id, targetMinutes: quest.targetMinutes, requiredMinutes: quest.requiredMinutes })),
        originalPlan: existing ? { mode: existing.mode, version: existing.version, activeRevisionId: existing.activeRevisionId, latestDraftRevisionId: existing.latestDraftRevisionId } : null,
        actualDateAdoptionBasis: "CUTOVER_TIMEZONE_WITH_ORIGINAL_INSTANT_PRESERVED",
        originalRevisionIds: [...new Set([...inventory.links.flatMap(link => [link.createdRevisionId, link.appliedRevisionId]), ...(existing?.activeRevisionId ? [existing.activeRevisionId] : []), ...(existing?.latestDraftRevisionId ? [existing.latestDraftRevisionId] : [])])], originalLinksDigest: hash("original-links", inventory.links), originalSessionsDigest: hash("original-sessions", inventory.sessions) };
      if (plannerSerializedBytes(migration) > PLANNER_V2_ENVELOPE.serializedBytes) reject("PAYLOAD_TOO_LARGE", "The imported baseline exceeds the migration envelope; keep it protected until segmented adoption is reviewed.");
      await sql.query('UPDATE "PlannerPlan" SET "migrationEvidence"=$2,version=version+1,"updatedAt"=clock_timestamp() WHERE id=$1', [plan.id, migration]);
      await this.boundary?.(sql);
      return receipt;
    });
  }
}
