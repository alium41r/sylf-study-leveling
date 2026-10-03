import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { connect, user } from "./database";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";
import { AttemptService, newBudget } from "@/lib/planner/v2/server/attempts";
import { IntentService } from "@/lib/planner/v2/server/intents";
import { ForegroundAccountingService } from "@/lib/planner/v2/server/accounting";
import { intentFixture } from "../contracts/fixtures";

let connection: pg.Client; let pool: pg.Pool; let attempts: AttemptService; let db: PlannerDatabase;
beforeAll(async () => { connection = await connect(); pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 4 }); db = new PlannerDatabase(pool); attempts = new AttemptService(db); });
afterAll(async () => { delete process.env.SYLF_UNLIMITED_AI_USER_IDS; await pool.end(); await connection.end(); });
const callInput = { provider: "fixture", model: "unpriced-model", inputTokens: 200, outputTokens: 100, category: "PLANNING" as const };
async function queued() {
  const ownerId = await user(connection); const created = await new IntentService(db).create(ownerId, randomUUID(), intentFixture());
  const request = { key: randomUUID(), text: "Accounting fixture", kind: "PLAN" as const, budget: newBudget("EDUCATIONAL"),
    targets: [{ planId: created.plan.id, intentId: created.intent.intentVersionId, planningVersion: 0, baseRevisionId: null }] };
  const attempt = await attempts.enqueue(ownerId, request); const token = await attempts.claim(`accounting_${randomUUID()}`);
  if (!token || token.attemptId !== attempt.attemptId) throw new Error("Accounting fixture admission was not isolated");
  return { ownerId, attempt, token, request };
}
describe("durable quota and provider accounting on PostgreSQL", () => {
  it("reserves one quota unit for parallel calls and refunds once in the original bucket before dispatch", async () => {
    const fixture = await queued();
    const calls = await Promise.all([attempts.reserveCall(fixture.token, callInput), attempts.reserveCall(fixture.token, callInput)]);
    expect(new Set(calls).size).toBe(2);
    const bucket = (await connection.query('SELECT * FROM "UserQuota" WHERE "userId"=$1', [fixture.ownerId])).rows[0];
    expect(bucket.used).toBe(1);
    await db.coordinated(fixture.ownerId, sql => sql.query('UPDATE "User" SET timezone=\'Pacific/Honolulu\' WHERE id=$1', [fixture.ownerId]));
    await Promise.all([attempts.cancel(fixture.ownerId, fixture.attempt.attemptId), attempts.cancel(fixture.ownerId, fixture.attempt.attemptId)]);
    expect((await connection.query('SELECT used FROM "UserQuota" WHERE id=$1', [bucket.id])).rows[0].used).toBe(0);
    expect((await connection.query('SELECT id FROM "AiUsageLog" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(0);
  });
  it("accounts repeated dispatch/settlement exactly once and keeps unknown pricing explicit", async () => {
    const fixture = await queued(); const callId = await attempts.reserveCall(fixture.token, callInput);
    await Promise.all([attempts.dispatchCall(fixture.token, callId, "PLANNING"), attempts.dispatchCall(fixture.token, callId, "PLANNING")]);
    const usage = { inputTokens: 120, outputTokens: 80, costUsd: null };
    await Promise.all([attempts.settleCall(fixture.token, callId, usage), attempts.settleCall(fixture.token, callId, usage)]);
    const logs = (await connection.query('SELECT * FROM "AiUsageLog" WHERE "userId"=$1', [fixture.ownerId])).rows;
    expect(logs).toHaveLength(1); expect(logs[0]).toMatchObject({ requestId: callId, accountingState: "SETTLED", promptTokens: 120, completionTokens: 80, estimatedCostUsd: null });
    expect((await attempts.read(fixture.ownerId, fixture.attempt.attemptId)).budget.consumed).toMatchObject({ modelCalls: 1, inputTokens: 120, outputTokens: 80 });
    await attempts.cancel(fixture.ownerId, fixture.attempt.attemptId);
    expect((await connection.query('SELECT used FROM "UserQuota" WHERE "userId"=$1', [fixture.ownerId])).rows[0].used).toBe(1);
  });
  it("reconciles late financial usage after cancellation without altering a terminal artifact or refunding spend", async () => {
    const fixture = await queued(); const callId = await attempts.reserveCall(fixture.token, callInput);
    await attempts.dispatchCall(fixture.token, callId, "PLANNING"); await attempts.cancel(fixture.ownerId, fixture.attempt.attemptId);
    const before = (await connection.query('SELECT artifact,payload FROM "PlannerAttempt" WHERE id=$1', [fixture.attempt.attemptId])).rows[0];
    expect((await connection.query('SELECT "accountingState","estimatedCostUsd" FROM "AiUsageLog" WHERE "requestId"=$1', [callId])).rows[0]).toEqual({ accountingState: "UNKNOWN_SPEND", estimatedCostUsd: null });
    const usage = { inputTokens: 190, outputTokens: 30, costUsd: 0.003 };
    await Promise.all([attempts.recordLateUsage(fixture.ownerId, fixture.attempt.attemptId, callId, usage), attempts.recordLateUsage(fixture.ownerId, fixture.attempt.attemptId, callId, usage)]);
    expect((await connection.query('SELECT artifact,payload FROM "PlannerAttempt" WHERE id=$1', [fixture.attempt.attemptId])).rows[0]).toEqual(before);
    await expect(attempts.checkpoint(fixture.token, "BLUEPRINT", { late: true })).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
    await expect(attempts.recordLateUsage(fixture.ownerId, fixture.attempt.attemptId, callId, { ...usage, inputTokens: 191 })).rejects.toMatchObject({ detail: { code: "IDEMPOTENCY_MISMATCH" } });
    expect((await connection.query('SELECT used FROM "UserQuota" WHERE "userId"=$1', [fixture.ownerId])).rows[0].used).toBe(1);
    await expect(attempts.enqueue(fixture.ownerId, { ...fixture.request, key: randomUUID() })).rejects.toMatchObject({ detail: { code: "IDEMPOTENCY_MISMATCH" } });
  });
  it("preserves the existing unlimited entitlement without minting or refunding a quota row", async () => {
    const fixture = await queued(); process.env.SYLF_UNLIMITED_AI_USER_IDS = String(fixture.ownerId);
    try {
      const callId = await attempts.reserveCall(fixture.token, callInput); await attempts.dispatchCall(fixture.token, callId, "PLANNING");
      await attempts.cancel(fixture.ownerId, fixture.attempt.attemptId);
      expect((await connection.query('SELECT id FROM "UserQuota" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(0);
      expect((await connection.query('SELECT id FROM "AiUsageLog" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(1);
    } finally { delete process.env.SYLF_UNLIMITED_AI_USER_IDS; }
  });
  it("transfers owned foreground call/quota receipts into one root without resetting budget or charging twice", async () => {
    const ownerId=await user(connection);const created=await new IntentService(db).create(ownerId,randomUUID(),intentFixture());
    const service=new ForegroundAccountingService(db);let budget=newBudget("EDUCATIONAL");budget.foregroundProcessingMs=1250;
    const input={callId:randomUUID(),provider:"fixture",model:"unpriced-model",inputTokens:200,outputTokens:100};
    const [first,replay]=await Promise.all([service.dispatch(ownerId,budget,"planner",input),service.dispatch(ownerId,budget,"planner",input)]);
    expect(first).toEqual(replay);budget=await service.settle(ownerId,first.budget,input.callId,{inputTokens:170,outputTokens:80,costUsd:null});
    const request={key:randomUUID(),text:"Foreground interpreted request",kind:"PLAN" as const,budget,targets:[{planId:created.plan.id,intentId:created.intent.intentVersionId,planningVersion:0,baseRevisionId:null}]};
    const queued=await attempts.enqueue(ownerId,request);
    const token=(await attempts.claim("foreground_transfer"))!;
    expect(token.attemptId).toBe(queued.attemptId);
    const claimed=await attempts.read(ownerId,queued.attemptId);
    expect(claimed.budget.consumed).toMatchObject({modelCalls:1,inputTokens:170,outputTokens:80});
    expect(Date.parse(claimed.budget.executionDeadlineAt!)-Date.parse(claimed.budget.processingStartedAt!)).toBe(178750);
    const call=await attempts.reserveCall(token,callInput);await attempts.dispatchCall(token,call,"PLANNING");await attempts.cancel(ownerId,queued.attemptId);
    expect((await connection.query('SELECT used FROM "UserQuota" WHERE "userId"=$1',[ownerId])).rows).toEqual([{used:1}]);
    expect((await connection.query('SELECT "attemptId" FROM "AiUsageLog" WHERE "requestId"=$1',[input.callId])).rows[0].attemptId).toBe(queued.attemptId);
    await expect(service.dispatch(ownerId,budget,"planner",input)).rejects.toMatchObject({detail:{code:"IDEMPOTENCY_MISMATCH"}});
    await expect(attempts.enqueue(ownerId,{...request,key:randomUUID()})).rejects.toMatchObject({detail:{code:"IDEMPOTENCY_MISMATCH"}});
  });
  it("rejects invented foreground counters and foreign request roots without leaking or transferring spend", async () => {
    const fixture=await queued();await attempts.cancel(fixture.ownerId,fixture.attempt.attemptId);
    const budget=newBudget("EDUCATIONAL");budget.consumed.modelCalls=1;
    await expect(attempts.enqueue(fixture.ownerId,{...fixture.request,key:randomUUID(),budget})).rejects.toMatchObject({detail:{code:"IDEMPOTENCY_MISMATCH"}});
    const service=new ForegroundAccountingService(db);const root=newBudget("EDUCATIONAL");
    await service.dispatch(fixture.ownerId,root,"planner",{callId:randomUUID(),provider:"fixture",model:"unpriced",inputTokens:200,outputTokens:100});
    const foreign=await user(connection);
    await expect(service.dispatch(foreign,root,"planner",{callId:randomUUID(),provider:"fixture",model:"unpriced",inputTokens:200,outputTokens:100})).rejects.toMatchObject({detail:{code:"IDEMPOTENCY_MISMATCH"}});
  });

});
