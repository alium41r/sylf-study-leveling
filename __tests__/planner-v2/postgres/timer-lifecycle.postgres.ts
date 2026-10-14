import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { connect, user } from "./database";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";
import { SessionService } from "@/lib/planner/v2/server/sessions";
import { IntentService } from "@/lib/planner/v2/server/intents";
import { ApplyService } from "@/lib/planner/v2/server/apply";
import { prepareProposal } from "./proposal-fixture";
import { intentFixture } from "../contracts/fixtures";
import { settleWeeklyMission } from "@/lib/planner/v2/server/settlement";
import { getWeeklyBounds } from "@/lib/game-engine";

let connection: pg.Client; let pool: pg.Pool; let db: PlannerDatabase; let service: SessionService;
beforeAll(async () => {
  connection = await connect(); pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 6 });
  db = new PlannerDatabase(pool); service = new SessionService(db);
});
afterAll(async () => { await pool?.end(); await connection?.end(); });
async function legacy(seconds = 300) {
  const ownerId = await user(connection); const startedAt = new Date(Date.now() - (seconds + 60) * 1000).toISOString();
  const identity = { clientSessionKey: randomUUID(), startedAt };
  await connection.query('UPDATE "User" SET "createdAt"=$2 WHERE id=$1', [ownerId, startedAt]);
  const session = await service.startLegacy(ownerId, undefined, undefined, identity);
  return { ownerId, session, identity };
}
describe("timer lifecycle on genuine PostgreSQL", () => {
  it("settles delayed Focus Party exits once and ignores a replay after rejoining", async () => {
    const ownerId = await user(connection), friendId = await user(connection);
    const party = (await connection.query('SELECT public.create_focus_party($1,\'Timer recovery\') AS result', [ownerId])).rows[0].result;
    const partyId = party.partyId ?? party.id;
    await connection.query('INSERT INTO "FocusPartyMember" ("partyId","userId") VALUES ($1,$2)', [partyId, friendId]);
    const entry = (await connection.query('SELECT public.enter_focus_session($1,$2) AS result', [partyId, ownerId])).rows[0].result;
    await connection.query('SELECT public.enter_focus_session($1,$2)', [partyId, friendId]);
    const start = new Date(Math.floor(Date.now() / 1000) * 1000 - 3_600_000);
    await connection.query('UPDATE "FocusSessionMember" SET "joinedAt"=$3,"currentStartedAt"=$3,"timerState"=\'FOCUSING\' WHERE "sessionId"=$1 AND "userId"=$2', [entry.sessionId, ownerId, start.toISOString()]);
    const end = new Date(start.getTime() + 300_000);
    const leave = async () => (await connection.query('SELECT public.leave_focus_session($1,$2,$3::timestamp,$4::timestamp) AS result', [entry.sessionId, ownerId, start.toISOString(), end.toISOString()])).rows[0].result;
    expect((await leave()).accumulatedSeconds).toBe(300);
    expect((await leave()).alreadyLeft).toBe(true);
    await connection.query('SELECT public.enter_focus_session($1,$2)', [partyId, ownerId]);
    expect((await leave()).supersededParticipation).toBe(true);
    expect((await connection.query('SELECT "timerState","accumulatedSeconds" FROM "FocusSessionMember" WHERE "sessionId"=$1 AND "userId"=$2', [entry.sessionId, ownerId])).rows[0])
      .toMatchObject({ timerState: "PAUSED", accumulatedSeconds: 300 });
  });
  it("cuts off an in-flight party pause/resume at the original saved exit and preserves the prior participation base", async () => {
    for (const resume of [false, true]) {
      const ownerId = await user(connection);
      const party = (await connection.query('SELECT public.create_focus_party($1,\'Late pause\') AS result', [ownerId])).rows[0].result;
      const entry = (await connection.query('SELECT public.enter_focus_session($1,$2) AS result', [party.partyId ?? party.id, ownerId])).rows[0].result;
      const start = new Date(Math.floor(Date.now() / 1000) * 1000 - 600_000), end = new Date(start.getTime() + 300_000);
      await connection.query('UPDATE "FocusSessionMember" SET "joinedAt"=$3,"currentStartedAt"=$3,"accumulatedSeconds"=90,"timerState"=\'FOCUSING\' WHERE "sessionId"=$1 AND "userId"=$2', [entry.sessionId,ownerId,start.toISOString()]);
      await connection.query('SELECT public.pause_focus_timer($1,$2)', [entry.sessionId,ownerId]);
      if (resume) await connection.query('SELECT public.resume_focus_timer($1,$2)', [entry.sessionId,ownerId]);
      const leave = async () => (await connection.query('SELECT public.leave_focus_session($1,$2,$3::timestamp,$4::timestamp) AS result', [entry.sessionId,ownerId,start.toISOString(),end.toISOString()])).rows[0].result;
      expect((await leave()).accumulatedSeconds).toBe(390);
      expect((await leave()).accumulatedSeconds).toBe(390);
      expect((await connection.query(`SELECT "leftAt" AT TIME ZONE 'UTC' AS "leftAt","timerTimeline" FROM "FocusSessionMember" WHERE "sessionId"=$1 AND "userId"=$2`,[entry.sessionId,ownerId])).rows[0]).toMatchObject({ leftAt: end, timerTimeline: null });
    }
  });
  it("closes a Focus Party when its last members leave concurrently", async () => {
    const ownerId = await user(connection), friendId = await user(connection);
    const party = (await connection.query('SELECT public.create_focus_party($1,\'Concurrent exits\') AS result', [ownerId])).rows[0].result;
    const partyId = party.partyId ?? party.id;
    await connection.query('INSERT INTO "FocusPartyMember" ("partyId","userId") VALUES ($1,$2)', [partyId, friendId]);
    const entry = (await connection.query('SELECT public.enter_focus_session($1,$2) AS result', [partyId, ownerId])).rows[0].result;
    await connection.query('SELECT public.enter_focus_session($1,$2)', [partyId, friendId]);
    await Promise.all([ownerId, friendId].map(id => pool.query('SELECT public.leave_focus_session($1,$2)', [entry.sessionId, id])));
    expect((await connection.query('SELECT "endedAt" FROM "FocusSession" WHERE id=$1', [entry.sessionId])).rows[0].endedAt).not.toBeNull();
    expect((await connection.query('SELECT * FROM "FocusSessionMember" WHERE "sessionId"=$1 AND "timerState"<>\'LEFT\'', [entry.sessionId])).rows).toHaveLength(0);
  });
  it("denies direct public economic RPC calls with a fabricated timer owner", async () => {
    const fixture = await legacy();
    try {
      await connection.query('SET ROLE authenticated');
      await expect(connection.query('SELECT public.settle_study_session_atomic($1,$2,300,0,NULL,NULL,false,true,NULL)', [fixture.ownerId, fixture.session.id])).rejects.toMatchObject({ code: "42501" });
    } finally { await connection.query('RESET ROLE'); }
    expect((await connection.query('SELECT "totalStudySeconds","currentXP" FROM "User" WHERE id=$1', [fixture.ownerId])).rows[0]).toMatchObject({ totalStudySeconds: 0, currentXP: 0 });
  });
  it("uses authoritative pause/resume and receipt replay for an ordinary timer", async () => {
    const ownerId = await user(connection); const startMs = Date.now() - 3_600_000;
    const identity = { clientSessionKey: randomUUID(), startedAt: new Date(startMs).toISOString() };
    await connection.query('UPDATE "User" SET "createdAt"=$2 WHERE id=$1', [ownerId, identity.startedAt]);
    const session = await service.startLegacy(ownerId, undefined, undefined, identity, true);
    expect(session.execution).toMatchObject({ state: "RUNNING", questId: null });
    const pause = { schemaVersion: 2, sessionId: session.id, expectedExecutionVersion: session.execution!.executionVersion,
      idempotencyKey: randomUUID(), action: "PAUSE", cumulativeFocusSeconds: 300, cumulativeBreakSeconds: 30,
      occurredAt: new Date(startMs + 330_000).toISOString() };
    const paused = await service.transition(ownerId, pause);
    const resumed = await service.transition(ownerId, { ...pause, expectedExecutionVersion: paused.execution.executionVersion,
      idempotencyKey: randomUUID(), action: "RESUME", occurredAt: new Date(startMs + 930_000).toISOString() });
    const end = { ...pause, expectedExecutionVersion: resumed.execution.executionVersion, idempotencyKey: randomUUID(), action: "END",
      cumulativeFocusSeconds: 600, cumulativeBreakSeconds: 60, occurredAt: new Date(startMs + 1_260_000).toISOString() };
    const ended = await service.transition(ownerId, end);
    expect(ended.execution).toMatchObject({ state: "ENDED", acceptedFocusSeconds: 600, acceptedBreakSeconds: 60, endedAt: end.occurredAt });
    expect(await service.transition(ownerId, end)).toEqual(ended);
    expect((await service.startLegacy(ownerId, undefined, undefined, identity, true)).id).toBe(session.id);
    await expect(service.settleLegacy(ownerId, { id: session.id, focus: 900, breaks: 0, complete: false, final: true }))
      .rejects.toThrow(/PLANNER_EXECUTION_PROTOCOL_REQUIRED/);
    expect((await connection.query('SELECT "totalStudySeconds","currentXP" FROM "User" WHERE id=$1', [ownerId])).rows[0])
      .toMatchObject({ totalStudySeconds: 600, currentXP: 50 });
  });
  it("pays zero-delta final settlement exactly once after all time was checkpointed", async () => {
    const fixture = await legacy();
    const request = { id: fixture.session.id, focus: 300, breaks: 30, complete: false, final: false };
    await service.settleLegacy(fixture.ownerId, request);
    const results = await Promise.all(Array.from({ length: 5 }, () => service.settleLegacy(fixture.ownerId, { ...request, final: true })));
    expect(results.filter(result => result.awarded)).toHaveLength(1);
    expect(results.find(result => result.awarded)).toMatchObject({ xpGained: 25, sylphGained: 5, deltaSeconds: 0 });
    const user = (await connection.query('SELECT "totalStudySeconds","currentXP",sylph FROM "User" WHERE id=$1', [fixture.ownerId])).rows[0];
    expect(user).toMatchObject({ totalStudySeconds: 300, currentXP: 25, sylph: 5 });
    expect((await connection.query('SELECT * FROM "XpLedger" WHERE "userId"=$1 AND source=\'TIMER\'', [fixture.ownerId])).rows).toHaveLength(1);
  });
  it("freezes final time, rewards and end timestamp against late higher/lower heartbeats and retries", async () => {
    const fixture = await legacy(); const end = new Date(Date.now() - 20_000).toISOString();
    const request = { id: fixture.session.id, focus: 300, breaks: 30, complete: false, final: true, endedAt: end };
    await service.settleLegacy(fixture.ownerId, request);
    const before = (await connection.query('SELECT * FROM "StudySession" WHERE id=$1', [fixture.session.id])).rows[0];
    await Promise.all([service.settleLegacy(fixture.ownerId, { ...request, focus: 600 }), service.settleLegacy(fixture.ownerId, { ...request, focus: 20, final: false })]);
    const after = (await connection.query('SELECT * FROM "StudySession" WHERE id=$1', [fixture.session.id])).rows[0];
    expect(after).toEqual(before);
    expect((await connection.query('SELECT "totalStudySeconds","currentXP" FROM "User" WHERE id=$1', [fixture.ownerId])).rows[0]).toMatchObject({ totalStudySeconds: 300, currentXP: 25 });
  });
  it("replays a lost start response after END and converges concurrent creation on one row", async () => {
    const ownerId = await user(connection); const identity = { clientSessionKey: randomUUID(), startedAt: new Date(Date.now() - 120_000).toISOString() };
    await connection.query('UPDATE "User" SET "createdAt"=$2 WHERE id=$1', [ownerId, identity.startedAt]);
    const sessions = await Promise.all(Array.from({ length: 4 }, () => service.startLegacy(ownerId, undefined, undefined, identity)));
    expect(new Set(sessions.map(session => session.id)).size).toBe(1);
    await service.settleLegacy(ownerId, { id: sessions[0].id, focus: 60, breaks: 0, complete: false, final: true });
    expect((await service.startLegacy(ownerId, undefined, undefined, identity)).id).toBe(sessions[0].id);
    expect((await connection.query('SELECT * FROM "StudySession" WHERE "userId"=$1', [ownerId])).rows).toHaveLength(1);
    await expect(service.startLegacy(ownerId, undefined, undefined, { ...identity, startedAt: new Date().toISOString() })).rejects.toMatchObject({ detail: { code: "IDEMPOTENCY_MISMATCH" } });
  });
  it("recovers a long offline creation without the old 30-minute truncation", async () => {
    const fixture = await legacy(10_800);
    const result = await service.settleLegacy(fixture.ownerId, { id: fixture.session.id, focus: 10_800, breaks: 0, complete: false, final: true });
    expect(result.durationSeconds).toBe(10_800); expect(result.xpGained).toBe(1170);
    expect((await connection.query('SELECT "totalStudySeconds" FROM "User" WHERE id=$1', [fixture.ownerId])).rows[0].totalStudySeconds).toBe(10_800);
  });
  it("does not silently close another subject's unsaved active session", async () => {
    const fixture = await legacy();
    const subject = (await connection.query('INSERT INTO "Subject" ("userId",name) VALUES ($1,\'Other subject\') RETURNING id', [fixture.ownerId])).rows[0];
    await expect(service.startLegacy(fixture.ownerId, undefined, subject.id, { clientSessionKey: randomUUID(), startedAt: new Date().toISOString() }))
      .rejects.toMatchObject({ detail: { code: "PROTECTED_EXECUTION" } });
    expect((await connection.query('SELECT "endedAt" FROM "StudySession" WHERE id=$1', [fixture.session.id])).rows[0].endedAt).toBeNull();
  });
  it("keeps focus plus break inside one wall budget when stale writers disagree", async () => {
    const fixture = await legacy();
    await service.settleLegacy(fixture.ownerId, { id: fixture.session.id, focus: 300, breaks: 60, complete: false, final: false });
    const result = await service.settleLegacy(fixture.ownerId, { id: fixture.session.id, focus: 20, breaks: 600, complete: false, final: true });
    expect(result.durationSeconds).toBe(300); expect(Number(result.breakSeconds)).toBeLessThanOrEqual(121);
  });
  it("recovers a delayed weekly mission once and repairs the streak without rewinding its latest week", async () => {
    const ownerId = await user(connection); const now = Date.now();
    const dates = [new Date(now - 14 * 86_400_000), new Date(now - 7 * 86_400_000), new Date(now)];
    const history = async (at: Date) => { await connection.query('INSERT INTO "StudySession" ("userId","durationMinutes","durationSeconds","startedAt","endedAt") VALUES ($1,180,10800,$2,$2)', [ownerId, at.toISOString()]); };
    await history(dates[0]); expect(await db.coordinated(ownerId, sql => settleWeeklyMission(sql, ownerId, dates[0]))).toBe(true);
    await history(dates[2]); expect(await db.coordinated(ownerId, sql => settleWeeklyMission(sql, ownerId, dates[2]))).toBe(true);
    await history(dates[1]); expect(await db.coordinated(ownerId, sql => settleWeeklyMission(sql, ownerId, dates[1]))).toBe(true);
    expect(await db.coordinated(ownerId, sql => settleWeeklyMission(sql, ownerId, dates[1]))).toBe(false);
    expect((await connection.query('SELECT "streakDays","lastActiveDate",sylph FROM "User" WHERE id=$1', [ownerId])).rows[0])
      .toMatchObject({ streakDays: 3, lastActiveDate: getWeeklyBounds(dates[2], "UTC").weekKey, sylph: 195 });
  });
  it("rejects foreign sessions and forged Quest linkage without changing any ledger", async () => {
    const fixture = await legacy(); const other = await user(connection);
    await expect(service.restore(other, fixture.session.id)).rejects.toMatchObject({ detail: { code: "REFERENCE_NOT_OWNED" } });
    await expect(service.settleLegacy(other, { id: fixture.session.id, focus: 300, breaks: 0, complete: false, final: true })).rejects.toMatchObject({ detail: { code: "REFERENCE_NOT_OWNED" } });
    const quest = (await connection.query('INSERT INTO "Quest" ("userId",title,"scheduledFor","requiredMinutes") VALUES ($1,\'Wrong quest\',\'2026-10-14\',30) RETURNING id', [fixture.ownerId])).rows[0];
    await expect(service.settleLegacy(fixture.ownerId, { id: fixture.session.id, questId: quest.id, focus: 300, breaks: 0, complete: false, final: true })).rejects.toThrow(/quest does not match/);
    expect((await connection.query('SELECT * FROM "XpLedger" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(0);
  });
  it("replays offline V2 pause/resume/end intervals with exact accounting and durable receipts", async () => {
    const ownerId = await user(connection);
    await connection.query('UPDATE "User" SET "restDays"=\'{}\',timezone=\'Asia/Karachi\' WHERE id=$1', [ownerId]);
    const intent = { ...intentFixture(), availability: { timezone: "Asia/Karachi", dailyCeilingMinutes: [120,120,120,120,120,120,120], restWeekdays: [], blockedDates: [], recoveryPercent: 15, basis: "CONFIRMED_AVAILABILITY" } };
    const created = await new IntentService(db).create(ownerId, randomUUID(), intent);
    const proposal = await prepareProposal(db, ownerId, [created.plan.id]); await new ApplyService(db).apply(ownerId, proposal.request);
    const questId = (await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [ownerId])).rows[0].id;
    const startMs = Date.now() - 3_600_000;
    const identity = { clientSessionKey: randomUUID(), startedAt: new Date(startMs).toISOString() };
    await connection.query('UPDATE "User" SET "createdAt"=$2 WHERE id=$1', [ownerId, identity.startedAt]);
    const started = await service.start(ownerId, questId, identity);
    const pause = { schemaVersion: 2, sessionId: started.sessionId, expectedExecutionVersion: started.executionVersion,
      idempotencyKey: randomUUID(), action: "PAUSE", cumulativeFocusSeconds: 300, cumulativeBreakSeconds: 0, occurredAt: new Date(startMs + 300_000).toISOString() };
    const paused = await service.transition(ownerId, pause);
    const resumed = await service.transition(ownerId, { ...pause, action: "RESUME", idempotencyKey: randomUUID(), expectedExecutionVersion: paused.execution.executionVersion, occurredAt: new Date(startMs + 900_000).toISOString() });
    const end = { ...pause, action: "END", idempotencyKey: randomUUID(), expectedExecutionVersion: resumed.execution.executionVersion,
      cumulativeFocusSeconds: 600, cumulativeBreakSeconds: 30, occurredAt: new Date(startMs + 1_230_000).toISOString() };
    const ended = await service.transition(ownerId, end);
    expect(ended.execution).toMatchObject({ state: "ENDED", acceptedFocusSeconds: 600, acceptedBreakSeconds: 30, endedAt: end.occurredAt });
    expect(await service.transition(ownerId, end)).toEqual(ended);
    expect((await service.start(ownerId, questId, identity)).sessionId).toBe(started.sessionId);
    expect((await connection.query('SELECT "totalStudySeconds" FROM "User" WHERE id=$1', [ownerId])).rows[0].totalStudySeconds).toBe(600);
    expect((await connection.query('SELECT * FROM "XpLedger" WHERE "userId"=$1 AND source=\'TIMER\'', [ownerId])).rows).toHaveLength(1);
  });
});
