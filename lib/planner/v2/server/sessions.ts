import {
  StudySessionTransitionV2Schema, StudySessionExecutionV2Schema, ExecutionTaskSpecV2Schema,
  deriveRemainingWorkV2, type ExecutionTaskSpecV2,
} from "../contracts";
import { PlannerDatabase, rows, clock, hash, reject, type Sql } from "./database";
import { civilDate, type SessionRow, type QuestRow } from "./context";
import { settleWeeklyMission } from "./settlement";

async function executionCapability(sql: Sql, sessionId: number, questId: number): Promise<void> {
  await sql.query("SELECT set_config('sylf.planner_v2_session_transition',$1,true),set_config('sylf.planner_v2_execution_quest',$2,true)", [String(sessionId), String(questId)]);
}
async function sessionView(sql: Sql, row: SessionRow) {
  const user = (await rows<{ timezone: string }>(sql, 'SELECT timezone FROM "User" WHERE id=$1', [row.userId]))[0];
  return StudySessionExecutionV2Schema.parse({ schemaVersion: 2, sessionId: row.id, ownerId: row.userId, questId: row.questId,
    state: row.executionState, executionVersion: row.executionVersion, acceptedFocusSeconds: row.durationSeconds,
    acceptedBreakSeconds: row.breakSeconds, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null,
    actualCivilDate: row.executionContext?.actualCivilDate ?? civilDate(row.startedAt, user.timezone), timezone: row.executionContext?.timezone ?? user.timezone });
}
export class SessionService {
  constructor(readonly db: PlannerDatabase) {}
  async read(ownerId: number, sessionId: number) {
    return this.db.coordinated(ownerId, async sql => {
      const session = (await rows<SessionRow>(sql, 'SELECT * FROM "StudySession" WHERE id=$1 AND "userId"=$2', [sessionId, ownerId]))[0];
      if (!session?.executionState) reject("REFERENCE_NOT_OWNED", "This versioned timer is unavailable.");
      return sessionView(sql, session);
    });
  }
  async start(ownerId: number, questId: number): Promise<ReturnType<typeof StudySessionExecutionV2Schema.parse>> {
    return this.db.coordinated(ownerId, async sql => {
      // Session locks precede Quest locks, including existing sessions on other devices.
      const sessions = await rows<SessionRow>(sql, 'SELECT * FROM "StudySession" WHERE "userId"=$1 AND "endedAt" IS NULL ORDER BY id FOR UPDATE', [ownerId]);
      const same = sessions.find(session => session.questId === questId);
      const quest = (await rows<QuestRow>(sql, 'SELECT * FROM "Quest" WHERE id=$1 AND "userId"=$2 FOR UPDATE', [questId, ownerId]))[0];
      if (!quest?.plannerSpec) reject("REFERENCE_NOT_OWNED", "A V2-linked activity is required.");
      if (quest.status === "COMPLETED" || quest.remainingDisposition !== "OPEN") reject("PROTECTED_EXECUTION", "This activity has no open study work.");
      if (same?.executionState === "RUNNING" || same?.executionState === "PAUSED") return sessionView(sql, same);
      if (sessions.length) reject("PROTECTED_EXECUTION", "Resume or explicitly stop the existing timer first.");
      const sessionId = Number((await rows<{ id: string }>(sql, `SELECT nextval(pg_get_serial_sequence('"StudySession"','id')) AS id`))[0].id);
      await executionCapability(sql, sessionId, questId);
      const now = await clock(sql);
      const recent = Number((await rows<{ count: string }>(sql, 'SELECT count(*) FROM "StudySession" WHERE "userId"=$1 AND "endedAt">=$2', [ownerId, new Date(now.getTime() - 60_000).toISOString()]))[0].count);
      if (recent >= 6) reject("PROTECTED_EXECUTION", "Too many recent session settlements. Please wait a moment.");
      const user = (await rows<{ timezone: string }>(sql, 'SELECT timezone FROM "User" WHERE id=$1', [ownerId]))[0];
      await sql.query('INSERT INTO "StudySession" (id,"userId","questId","subjectId","durationMinutes","durationSeconds","executionState","executionVersion","runningSince","startedAt","executionContext") VALUES ($1,$2,$3,$4,0,0,\'RUNNING\',1,$5,$5,$6)',
        [sessionId, ownerId, questId, quest.subjectId, now.toISOString(), { timezone: user.timezone, actualCivilDate: civilDate(now, user.timezone) }]);
      await sql.query('UPDATE "Quest" SET status=\'IN_PROGRESS\',"executionVersion"="executionVersion"+1 WHERE id=$1', [questId]);
      return sessionView(sql, (await rows<SessionRow>(sql, 'SELECT * FROM "StudySession" WHERE id=$1', [sessionId]))[0]);
    });
  }
  async transition(ownerId: number, raw: unknown): Promise<{ execution: ReturnType<typeof StudySessionExecutionV2Schema.parse>; settlement: Record<string, unknown> }> {
    const request = StudySessionTransitionV2Schema.parse(raw);
    const requestHash = hash("session-transition", request);
    return this.db.coordinated(ownerId, async sql => {
      const session = (await rows<SessionRow>(sql, 'SELECT * FROM "StudySession" WHERE id=$1 AND "userId"=$2 FOR UPDATE', [request.sessionId, ownerId]))[0];
      if (!session?.executionState || !session.questId) reject("REFERENCE_NOT_OWNED", "This versioned session is unavailable.");
      const receipt = session.transitionReceipts?.[request.idempotencyKey];
      if (receipt) {
        if (receipt.requestHash !== requestHash) reject("IDEMPOTENCY_MISMATCH", "This timer operation has already been accepted with different data.");
        return receipt.response as { execution: ReturnType<typeof StudySessionExecutionV2Schema.parse>; settlement: Record<string, unknown> };
      }
      if (session.executionVersion !== request.expectedExecutionVersion || session.executionState === "ENDED") reject("PROTECTED_EXECUTION", "The timer changed on another client. Reload its accepted state.");
      if (request.action === "RESUME" && session.executionState !== "PAUSED" || request.action === "PAUSE" && session.executionState !== "RUNNING") reject("PROTECTED_EXECUTION", "The timer is no longer in the expected state.");
      const quest = (await rows<QuestRow>(sql, 'SELECT * FROM "Quest" WHERE id=$1 AND "userId"=$2 FOR UPDATE', [session.questId, ownerId]))[0];
      if (!quest || quest.remainingDisposition !== "OPEN" && !["END", "STOP_OTHER_DEVICE"].includes(request.action)) reject("PROTECTED_EXECUTION", "This activity's remaining work is closed.");
      const now = await clock(sql);
      // Paused wall time earns no focus/break time. A small transport tolerance
      // is shared across the session; repeated pause/resume cannot renew it.
      const elapsed = session.executionState === "RUNNING" ? Math.max(0, Math.floor((now.getTime() - session.runningSince!.getTime()) / 1000)) : 0;
      const toleranceUsed = session.executionContext?.toleranceUsedSeconds ?? 0;
      const maximum = session.executionState === "RUNNING" ? elapsed + Math.max(0, 5 - toleranceUsed) : 0;
      const focus = Math.max(session.durationSeconds, Math.min(request.cumulativeFocusSeconds, session.acceptedFocusAtResume + maximum));
      const breaks = Math.max(session.breakSeconds, Math.min(request.cumulativeBreakSeconds,
        session.acceptedBreakAtResume + Math.max(0, maximum - (focus - session.acceptedFocusAtResume))));
      await executionCapability(sql, session.id, quest.id);
      const final = ["END", "STOP_OTHER_DEVICE"].includes(request.action);
      const user = (await rows<{ timezone: string }>(sql, 'SELECT timezone FROM "User" WHERE id=$1', [ownerId]))[0];
      const settled = (await rows<{ result: Record<string, unknown> }>(sql,
        'SELECT public.settle_study_session_atomic($1,$2,$3,$4,$5,NULL,false,$6,$7) AS result',
        [ownerId, session.id, focus, breaks, quest.id, final, civilDate(now, user.timezone)]))[0].result;
      const state = final ? "ENDED" : request.action === "PAUSE" ? "PAUSED" : request.action === "RESUME" ? "RUNNING" : session.executionState;
      const closedInterval = session.executionState === "RUNNING" && ["PAUSE", "END", "STOP_OTHER_DEVICE"].includes(request.action);
      const executionContext = { ...session.executionContext!, toleranceUsedSeconds: toleranceUsed + (closedInterval ? Math.max(0, focus + breaks - session.acceptedFocusAtResume - session.acceptedBreakAtResume - elapsed) : 0) };
      // The existing RPC remains the economic/actual-time authority. State and
      // interval anchors are advanced in this same transaction, never separately.
      await sql.query('UPDATE "StudySession" SET "executionState"=$2,"executionVersion"="executionVersion"+1,"runningSince"=CASE WHEN $2=\'RUNNING\' THEN CASE WHEN $3 THEN $4::timestamp ELSE "runningSince" END ELSE NULL END,"acceptedFocusAtResume"=CASE WHEN $3 THEN "durationSeconds" ELSE "acceptedFocusAtResume" END,"acceptedBreakAtResume"=CASE WHEN $3 THEN "breakSeconds" ELSE "acceptedBreakAtResume" END,"executionContext"=$5 WHERE id=$1',
        [session.id, state, request.action === "RESUME", now.toISOString(), executionContext]);
      const updatedQuest = (await rows<QuestRow>(sql, 'SELECT * FROM "Quest" WHERE id=$1', [quest.id]))[0];
      const spec: ExecutionTaskSpecV2 = ExecutionTaskSpecV2Schema.parse(updatedQuest.plannerSpec);
      const remaining = deriveRemainingWorkV2(spec.effort, updatedQuest.elapsedSeconds, updatedQuest.remainingDisposition);
      await sql.query('UPDATE "Quest" SET "remainingMinutesEstimate"=$2,"executionVersion"="executionVersion"+$3 WHERE id=$1',
        [quest.id, remaining.remainingMinutesEstimate, request.action === "PROGRESS" ? 0 : 1]);
      settled.weeklyAwarded = await settleWeeklyMission(sql, ownerId, now);
      const current = (await rows<SessionRow>(sql, 'SELECT * FROM "StudySession" WHERE id=$1', [session.id]))[0];
      const response = { execution: await sessionView(sql, current), settlement: settled };
      // The receipt is part of the accepted transition; it cannot outlive a rollback.
      await sql.query('UPDATE "StudySession" SET "transitionReceipts"=COALESCE("transitionReceipts",\'{}\'::jsonb)||$2::jsonb,"executionVersion"="executionVersion"+1 WHERE id=$1',
        [session.id, { [request.idempotencyKey]: { requestHash, response: { ...response, execution: { ...response.execution, executionVersion: current.executionVersion + 1 } } } }]);
      response.execution.executionVersion++;
      return response;
    });
  }
  async settleLegacy(ownerId: number, request: { id: number; focus: number; breaks: number; questId?: number; complete: boolean; final: boolean }): Promise<Record<string, unknown>> {
    return this.db.coordinated(ownerId, async sql => {
      const now = await clock(sql);
      if (request.final) {
        const count = Number((await rows<{ count: string }>(sql, 'SELECT count(*) FROM "StudySession" WHERE "userId"=$1 AND id<>$2 AND "endedAt">=$3',
          [ownerId, request.id, new Date(now.getTime() - 60_000).toISOString()]))[0].count);
        if (count >= 6) reject("PROTECTED_EXECUTION", "Too many session settlements. Please wait a moment.");
      }
      const user = (await rows<{ timezone: string }>(sql, 'SELECT timezone FROM "User" WHERE id=$1', [ownerId]))[0];
      const result = (await rows<{ result: Record<string, unknown> }>(sql,
        'SELECT public.settle_study_session_atomic($1,$2,$3,$4,$5,NULL,$6,$7,$8) AS result',
        [ownerId, request.id, request.focus, request.breaks, request.questId ?? null, request.complete, request.final, civilDate(now, user.timezone)]))[0].result;
      result.weeklyAwarded = await settleWeeklyMission(sql, ownerId, now);
      return result;
    });
  }
  async complete(ownerId: number, questId: number, expectedVersion: number): Promise<Record<string, unknown>> {
    return this.db.coordinated(ownerId, async sql => {
      const sessions = await rows<SessionRow>(sql, 'SELECT * FROM "StudySession" WHERE "questId"=$1 AND "userId"=$2 ORDER BY id FOR UPDATE', [questId, ownerId]);
      const quest = (await rows<QuestRow>(sql, 'SELECT * FROM "Quest" WHERE id=$1 AND "userId"=$2 FOR UPDATE', [questId, ownerId]))[0];
      if (!quest?.plannerSpec) reject("REFERENCE_NOT_OWNED", "A V2-linked activity is required.");
      if (quest.status === "COMPLETED") return { alreadyCompleted: true, questId };
      if (quest.executionVersion !== expectedVersion || quest.remainingDisposition !== "OPEN" || sessions.some(session => session.endedAt === null)) reject("PROTECTED_EXECUTION", "Stop the current timer and reload the activity before completing it.");
      await sql.query("SELECT set_config('sylf.planner_v2_execution_quest',$1,true)", [String(questId)]);
      const user = (await rows<{ timezone: string }>(sql, 'SELECT timezone FROM "User" WHERE id=$1', [ownerId]))[0];
      return (await rows<{ result: Record<string, unknown> }>(sql, 'SELECT public.claim_quest_reward($1,$2,$3) AS result', [ownerId, questId, civilDate(await clock(sql), user.timezone)]))[0].result;
    });
  }
}
