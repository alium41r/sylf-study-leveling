import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { connect, user } from "./database";
import { PlannerDatabase, DurablePlannerError } from "@/lib/planner/v2/server/database";
import { AttemptService, newBudget } from "@/lib/planner/v2/server/attempts";
import { IntentService } from "@/lib/planner/v2/server/intents";
import { ForegroundAccountingService } from "@/lib/planner/v2/server/accounting";
import { loadExecutionContext, verifyContextCorrespondence } from "@/lib/planner/v2/server/context";
import { projectPlannerContext } from "@/lib/planner/v2/intelligence/context";
import { loadPlannerModelContext } from "@/lib/planner/v2/intelligence/context";
import { dispatchMeteredProvider, workerProviderMeter, foregroundProviderMeter, type MeteredProviderRequest } from "@/lib/planner/v2/intelligence/provider";
import { intentFixture } from "../contracts/fixtures";
import type { LLMResponse } from "@/lib/ai/providers/types";
import { TimezoneService } from "@/lib/timezone-service";

let connection: pg.Client; let pool: pg.Pool; let db: PlannerDatabase; let attempts: AttemptService;
beforeAll(async () => { connection = await connect(); pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 6 }); db = new PlannerDatabase(pool); attempts = new AttemptService(db); });
afterAll(async () => { await pool.end(); await connection.end(); });
const policy = { purpose: "BLUEPRINT" as const, reviewReserve: { inputTokens: 4096, outputTokens: 2048 } };
const request = (): MeteredProviderRequest<{ ok: boolean }> => ({ messages: [{ role: "user", content: "Use the owned Planner context" }], systemInstruction: "Return JSON", outputTokens: 512, policy, validate: r => JSON.parse(r.text!) });
const response = (): LLMResponse => ({ text: '{"ok":true}', finishReason: "STOP", usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 } });
const twoDays = (today: string) => ({ start: today, end: new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10) });
async function fixture(claim = true, budget = newBudget("EDUCATIONAL")) {
  const ownerId = await user(connection); const created = await new IntentService(db).create(ownerId, randomUUID(), intentFixture());
  const enqueue = { key: randomUUID(), text: "Step 2 boundary fixture", kind: "PLAN" as const, budget,
    targets: [{ planId: created.plan.id, intentId: created.intent.intentVersionId, planningVersion: 0, baseRevisionId: null }] };
  if (!claim) return { ownerId, created, enqueue, attempt: null, token: null };
  const attempt = await attempts.enqueue(ownerId, enqueue); const token = await attempts.claim(`step2_${randomUUID()}`);
  if (!token || token.attemptId !== attempt.attemptId) throw new Error("Step 2 admission was not isolated");
  return { ownerId, created, enqueue, attempt, token };
}
async function stored(attemptId: string) { return (await connection.query('SELECT artifact,payload FROM "PlannerAttempt" WHERE id=$1', [attemptId])).rows[0]; }
describe("Phase 2 context and metered boundary on genuine PostgreSQL", () => {
  it("executes the compiled provider boundary in ordinary Node with actual durable accounting", async () => {
    const f = await fixture(false); const a = await attempts.enqueue(f.ownerId, f.enqueue);
    const result = await promisify(execFile)(process.execPath, ["__tests__/planner-v2/postgres/intelligence-process-fixture.cjs"], {
      timeout: 7000, env: { NODE_ENV: "test", PATH: process.env.PATH, PLANNER_TEST_DATABASE_URL: process.env.PLANNER_TEST_DATABASE_URL,
        PLANNER_PHASE0_REQUIRED: "true", PLANNER_PHASE0_DATABASE_MARKER: process.env.PLANNER_PHASE0_DATABASE_MARKER, PLANNER_FIXTURE_ATTEMPT: a.attemptId },
    });
    expect(JSON.parse(result.stdout)).toMatchObject({ compiled: true, ok: true, modelCalls: 1 });
    expect((await connection.query('SELECT "accountingState" FROM "AiUsageLog" WHERE "attemptId"=$1', [a.attemptId])).rows[0].accountingState).toBe("SETTLED");
  });
  it("loads 1500 historical rows without losing authoritative history/capacity or overflowing the dependency registry", async () => {
    const f = await fixture(false); const intent = { ...f.created.intent.intent, availability: { timezone: "UTC", dailyCeilingMinutes: [120,120,120,120,120,120,120], restWeekdays: [], blockedDates: [], recoveryPercent: 15, basis: "CONFIRMED_AVAILABILITY" as const } };
    await db.coordinated(f.ownerId, async sql => {
      await sql.query('INSERT INTO "Quest" ("userId",title,status,"scheduledFor","targetMinutes","requiredMinutes","completedAt","remainingDisposition") SELECT $1,\'Historical work\',\'COMPLETED\',\'2026-10-01\',30,30,now(),\'COMPLETED\' FROM generate_series(1,1500)', [f.ownerId]);
      await sql.query('INSERT INTO "Quest" ("userId",title,status,"scheduledFor","targetMinutes","requiredMinutes") VALUES ($1,\'Other open work\',\'PENDING\',$2::date,20,20)', [f.ownerId, TimezoneService.getUserLocalDate("UTC")]);
    });
    const c = await db.coordinated(f.ownerId, sql => loadExecutionContext(sql, f.ownerId, [f.created.plan], intent));
    expect(c.quests).toHaveLength(1501); expect(c.dependencies.quests).toHaveLength(1);
    const p = projectPlannerContext(c, [{ planId: f.created.plan.id, planRef: "physics", intent, activeActivityKeys: [] }], twoDays(c.today), { provisionalAvailability: { ...intent.availability, basis: "DISCLOSED_PROVISIONAL_CEILING" } });
    expect(p.view.envelope.days[0]).toMatchObject({ otherCommittedMinutes: 20, recoveryMinutes: 18, availableMinutes: 82 });
    expect(p.view.history.unattributedOrOtherCompletedCount).toBe(1500);
  });
  it("meters fallback before each upstream dispatch and settles one quota unit for the root", async () => {
    const f = await fixture(); let n = 0;
    const result = await dispatchMeteredProvider(workerProviderMeter(attempts, f.token!), request(), { adapter: () => ({ generateResponse: async () => {
      n++; const logs = (await connection.query('SELECT "accountingState" FROM "AiUsageLog" WHERE "attemptId"=$1 ORDER BY id', [f.attempt!.attemptId])).rows;
      expect(logs).toHaveLength(n); expect(logs.at(-1).accountingState).toBe("DISPATCHED");
      if (n === 1) throw new Error("Fixture outage"); return response();
    } }) });
    expect(result.attempts).toHaveLength(2);
    const s = await stored(f.attempt!.attemptId); expect(s.artifact.budget.consumed).toMatchObject({ modelCalls: 2, planningCalls: 2, inputTokens: 100, outputTokens: 30 });
    expect(s.payload.calls.map((c: { state: string }) => c.state)).toEqual(["UNKNOWN_SPEND", "SETTLED"]);
    expect(s.artifact.budget.reserved.inputTokens).toBeGreaterThan(0);
    expect((await connection.query('SELECT used FROM "UserQuota" WHERE "userId"=$1', [f.ownerId])).rows).toEqual([{ used: 1 }]);
    await attempts.cancel(f.ownerId, f.attempt!.attemptId);
  });
  it("loads each joint target's owned dated evidence and rejects another student's intent", async () => {
    const f = await fixture(false); const intent = intentFixture();
    intent.evidence = [{ evidenceId: "weak_method", scopeKeys: [intent.scope[0].scopeKey], source: "STUDENT_NOTE", observedAt: "2026-10-01T10:00:00Z", reliability: "SELF_REPORTED", statement: "Guessing at method selection", demonstratesReadiness: false }];
    const second = await new IntentService(db).create(f.ownerId, randomUUID(), intent);
    const provisional = { timezone: "UTC", dailyCeilingMinutes: [120,120,120,120,120,120,120], restWeekdays: [], blockedDates: [], recoveryPercent: 15, basis: "DISCLOSED_PROVISIONAL_CEILING" as const };
    const requested = [{ planId: f.created.plan.id, planRef: "first", intentId: f.created.intent.intentVersionId }, { planId: second.plan.id, planRef: "second", intentId: second.intent.intentVersionId }];
    const window = twoDays(TimezoneService.getUserLocalDate("UTC"));
    const p = await db.coordinated(f.ownerId, sql => loadPlannerModelContext(sql, f.ownerId, requested, window, { provisionalAvailability: provisional }));
    expect(p.view.plans[1].learning[0]).toMatchObject({ evidenceId: "weak_method", observedAt: "2026-10-01T10:00:00Z", scopeRefs: ["scope_electricity"] });
    expect(p.contexts.map(c => c.context.dependencies.evidence.length)).toEqual([1,2]);
    const foreign = await fixture(false);
    await expect(db.coordinated(f.ownerId, sql => loadPlannerModelContext(sql, f.ownerId, [{ ...requested[0], intentId: foreign.created.intent.intentVersionId }], window, { provisionalAvailability: provisional }))).rejects.toMatchObject({ detail: { code: "REFERENCE_NOT_OWNED" } });
  });
  it("preserves owned legacy observations and pins check provenance changes without relabeling the older result seal", async () => {
    const ownerId = await user(connection);
    const goalId = await db.coordinated(ownerId, async sql => (await sql.query('INSERT INTO "Goal" ("userId",title,"targetWeeks") VALUES ($1,\'Owned legacy learning\',3) RETURNING id', [ownerId])).rows[0].id);
    // Legacy work exists before its goal becomes Planner-owned. The existing
    // SQL guard correctly forbids bypassing ApplyService afterward.
    await db.coordinated(ownerId, sql => sql.query('INSERT INTO "Quest" ("userId","goalId",title,status,"scheduledFor","targetMinutes","requiredMinutes","elapsedSeconds","completedAt","remainingDisposition") VALUES ($1,$2,\'Prior manual practice\',\'COMPLETED\',\'2026-10-01\',30,30,900,now(),\'COMPLETED\')', [ownerId, goalId]));
    const intent = { ...intentFixture(), goalId }; const created = await new IntentService(db).create(ownerId, randomUUID(), intent);
    const checkId = randomUUID();
    await db.coordinated(ownerId, async sql => {
      // A dated legacy self report with unresolved item/revision provenance;
      // the projection must not pretend this is a verified readiness check.
      await sql.query('INSERT INTO "PlannerCheckResult" (id,"planId","userId","revisionId","itemKey",result,"updatedAt") VALUES ($1,$2,$3,$4,$5,\'READY_TO_MOVE_ON\',now())', [checkId, created.plan.id, ownerId, randomUUID(), randomUUID()]);
    });
    const before = await db.coordinated(ownerId, sql => loadExecutionContext(sql, ownerId, [created.plan], intent));
    const p = projectPlannerContext(before, [{ planId: created.plan.id, planRef: "physics", intent, goalId, activeActivityKeys: [] }], twoDays(before.today),
      { provisionalAvailability: { timezone: before.timezone, dailyCeilingMinutes: [120,120,120,120,120,120,120], restWeekdays: [], blockedDates: [], recoveryPercent: 15, basis: "DISCLOSED_PROVISIONAL_CEILING" } });
    expect(p.view.legacyHistory.byPlan[0]).toMatchObject({ completedCount: 1, acceptedSeconds: 900 });
    expect(p.view.plans[0].savedChecks[0]).toMatchObject({ scopeResolution: "UNRESOLVED", demonstratesReadiness: false });
    await db.coordinated(ownerId, sql => sql.query('UPDATE "PlannerCheckResult" SET "updatedAt"="updatedAt"+interval \'1 second\' WHERE id=$1', [checkId]));
    const after = await db.coordinated(ownerId, sql => loadExecutionContext(sql, ownerId, [created.plan], intent));
    expect(after.dependencies.evidence.find(e => e.ref === "saved_checks")).toEqual(before.dependencies.evidence.find(e => e.ref === "saved_checks"));
    expect(() => verifyContextCorrespondence(before.dependencies, after.dependencies, after.quests)).toThrow(/evidence/);
    expect(() => verifyContextCorrespondence({ ...before.dependencies, evidence: before.dependencies.evidence.filter(e => e.ref !== "model_learning_evidence") }, after.dependencies, after.quests)).not.toThrow();
  });
  it("keeps known overrun spend in the financial ledger when another fallback's spend remains unknown", async () => {
    const f = await fixture(); const input = { provider: "fixture", model: "unpriced", inputTokens: 1000, outputTokens: 1000, category: "PLANNING" as const, policy };
    const first = await attempts.reserveCall(f.token!, input); await attempts.dispatchCall(f.token!, first, "PLANNING"); await attempts.closeProviderCall(f.token!, first, { errorCode: "PROVIDER_FAILURE" });
    const second = await attempts.reserveCall(f.token!, input); await attempts.dispatchCall(f.token!, second, "PLANNING");
    await attempts.settleCall(f.token!, second, { inputTokens: 90000, outputTokens: 50, costUsd: null });
    expect((await stored(f.attempt!.attemptId)).artifact).toMatchObject({ state: "FAILED", error: { code: "BUDGET_EXHAUSTED" } });
    expect((await connection.query('SELECT "accountingState","promptTokens" FROM "AiUsageLog" WHERE "requestId"=$1', [second])).rows[0]).toEqual({ accountingState: "SETTLED", promptTokens: 90000 });
    expect((await stored(f.attempt!.attemptId)).payload.calls[0].state).toBe("UNKNOWN_SPEND");
    await expect(attempts.reserveCall(f.token!, input)).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
  });
  it("retains mandatory review capacity under parallel reservations and refunds rejected/undispatched calls", async () => {
    const f = await fixture(); const input = { provider: "fixture", model: "unpriced", inputTokens: 1000, outputTokens: 1000, category: "PLANNING" as const, policy };
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => attempts.reserveCall(f.token!, input)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(4); expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await stored(f.attempt!.attemptId)).payload.calls).toHaveLength(4);
    await attempts.reserveCall(f.token!, { ...input, policy: { purpose: "REVIEW" } });
    await attempts.cancel(f.ownerId, f.attempt!.attemptId);
    expect((await connection.query('SELECT id FROM "AiUsageLog" WHERE "userId"=$1', [f.ownerId])).rows).toHaveLength(0);
    expect((await connection.query('SELECT used FROM "UserQuota" WHERE "userId"=$1', [f.ownerId])).rows).toEqual([{ used: 0 }]);
  });
  it("bounds five reservations waiting on the same owner without exhausting serialization retries", async () => {
    const f = await fixture();
    let release!: () => void; let acquired!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    const blocker = db.coordinated(f.ownerId, async sql => {
      acquired(); await held;
      // A genuine preceding owner write commits after all five waiters have
      // started. Only its timestamp changes; budget/education remain intact.
      await sql.query('UPDATE "PlannerAttempt" SET "updatedAt"=clock_timestamp() WHERE id=$1', [f.attempt!.attemptId]);
    });
    await ready;
    const input = { provider: "fixture", model: "unpriced", inputTokens: 1000, outputTokens: 1000, category: "PLANNING" as const, policy };
    const pending = Promise.allSettled(Array.from({ length: 5 }, () => attempts.reserveCall(f.token!, input)));
    try {
      for (let n = 0; n < 100; n++) {
        const waiters = (await connection.query("SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND classid=73641::oid AND objid=$1::oid AND NOT granted", [f.ownerId])).rows[0].count;
        if (waiters === 5) break;
        if (n === 99) throw new Error("Five independent reservation connections never entered owner-lock wait");
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } finally { release(); await blocker; }
    const results = await pending;
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.map(r => r.reason instanceof DurablePlannerError ? r.reason.detail.code : r.reason.code)).toEqual(["BUDGET_EXHAUSTED"]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(4);
    expect((await stored(f.attempt!.attemptId)).payload.calls).toHaveLength(4);
    await attempts.reserveCall(f.token!, { ...input, policy: { purpose: "REVIEW" } });
    await attempts.cancel(f.ownerId, f.attempt!.attemptId);
    expect((await connection.query('SELECT used FROM "UserQuota" WHERE "userId"=$1', [f.ownerId])).rows).toEqual([{ used: 0 }]);
    expect((await connection.query("SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND classid=73641::oid AND objid=$1::oid", [f.ownerId])).rows[0].count).toBe(0);
  });
  it("returns a clean pooled owner connection after commit and SQL rollback with its original timeout", async () => {
    const f = await fixture(); const single = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 1 });
    const coordinated = new PlannerDatabase(single);
    const original = (await connection.query('SELECT username FROM "User" WHERE id=$1', [f.ownerId])).rows[0].username;
    try {
      await single.query("SET statement_timeout = '7s'");
      await coordinated.coordinated(f.ownerId, async sql => {
        expect((await sql.query("SHOW transaction_isolation")).rows[0].transaction_isolation).toBe("serializable");
        await sql.query("SELECT planner_v2_assert_coordinated($1)", [f.ownerId]);
      });
      await expect(coordinated.coordinated(f.ownerId, async sql => {
        await sql.query('UPDATE "User" SET username=$2 WHERE id=$1', [f.ownerId, `rollback_${randomUUID()}`]);
        await sql.query("SELECT 1/0");
      })).rejects.toMatchObject({ code: "22012" });
      expect((await single.query("SHOW statement_timeout")).rows[0].statement_timeout).toBe("7s");
      expect((await single.query("SELECT count(*)::int AS count FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND classid=73641::oid AND objid=$1::oid", [f.ownerId])).rows[0].count).toBe(0);
      expect((await connection.query('SELECT username FROM "User" WHERE id=$1', [f.ownerId])).rows[0].username).toBe(original);
      await attempts.cancel(f.ownerId, f.attempt!.attemptId);
    } finally { await single.end(); }
  });
  it("starts the research sub-window before search/fetch and never renews it through a fenced takeover", async () => {
    const f = await fixture(true, newBudget("RESEARCH")); const first = await attempts.startResearchWindow(f.token!);
    expect(first.deadline - first.now).toBe(120000); const before = await stored(f.attempt!.attemptId);
    await attempts.release(f.token!); const token = (await attempts.claim(`research_takeover_${randomUUID()}`))!;
    expect(token.fence).toBe(f.token!.fence + 1); const next = await attempts.startResearchWindow(token);
    expect(next.deadline).toBe(first.deadline); expect((await stored(f.attempt!.attemptId)).artifact.budget.executionDeadlineAt).toBe(before.artifact.budget.executionDeadlineAt);
    await expect(attempts.startResearchWindow(f.token!)).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } }); await attempts.cancel(f.ownerId, token.attemptId);
  });
  it("persists review and repair-verification holdbacks, then meters the verification separately", async () => {
    const f = await fixture(); const meter = workerProviderMeter(attempts, f.token!); const adapter = () => ({ generateResponse: async () => response() });
    await dispatchMeteredProvider(meter, request(), { adapter });
    await dispatchMeteredProvider(meter, { ...request(), policy: { purpose: "REVIEW" } }, { adapter });
    expect((await stored(f.attempt!.attemptId)).payload.providerGuard.reviewCompleted).toBe(true);
    await expect(attempts.reserveCall(f.token!, { provider: "fixture", model: "unpriced", inputTokens: 70000, outputTokens: 1000, category: "PLANNING", policy: { purpose: "REPAIR", verificationReserve: { inputTokens: 16000, outputTokens: 2048 } } })).rejects.toMatchObject({ detail: { code: "BUDGET_EXHAUSTED" } });
    await dispatchMeteredProvider(meter, { ...request(), policy: { purpose: "REPAIR", verificationReserve: { inputTokens: 4096, outputTokens: 2048 } } }, { adapter });
    expect((await stored(f.attempt!.attemptId)).payload.providerGuard.verificationReserve).toBeDefined();
    await dispatchMeteredProvider(meter, { ...request(), policy: { purpose: "VERIFICATION" } }, { adapter });
    const s = await stored(f.attempt!.attemptId); expect(s.payload.providerGuard.verificationReserve).toBeUndefined(); expect(s.artifact.budget.consumed.planningCalls).toBe(4);
    await attempts.cancel(f.ownerId, f.attempt!.attemptId);
  });
  it("aborts on cancellation from a separate PostgreSQL connection and reconciles a late reply without changing the terminal attempt", async () => {
    const f = await fixture(); let deliver!: (r: LLMResponse) => void; let signal: AbortSignal | undefined;
    const adapter = vi.fn(() => ({ generateResponse: async (_m: unknown, _s: unknown, _t: unknown, options: { signal?: AbortSignal }) => {
      signal = options.signal; await attempts.cancel(f.ownerId, f.attempt!.attemptId);
      return new Promise<LLMResponse>(resolve => { deliver = resolve; });
    } }));
    await expect(dispatchMeteredProvider(workerProviderMeter(attempts, f.token!), request(), { pollMs: 10, adapter })).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
    const before = await stored(f.attempt!.attemptId); expect(signal!.aborted).toBe(true); expect(adapter).toHaveBeenCalledTimes(1);
    deliver(response());
    for (let i = 0; i < 50; i++) { if ((await connection.query('SELECT "accountingState" FROM "AiUsageLog" WHERE "attemptId"=$1', [f.attempt!.attemptId])).rows[0].accountingState === "SETTLED") break; await new Promise(resolve => setTimeout(resolve, 10)); }
    expect((await connection.query('SELECT "accountingState","promptTokens" FROM "AiUsageLog" WHERE "attemptId"=$1', [f.attempt!.attemptId])).rows[0]).toMatchObject({ accountingState: "SETTLED", promptTokens: 100 });
    expect(await stored(f.attempt!.attemptId)).toEqual(before);
  });
  it("enforces the database root deadline even when the adapter ignores abort", async () => {
    // Bind a short remainder at the first claim. Never edit an existing root's
    // immutable processing start/deadline just to make the fixture faster.
    const budget = newBudget("EDUCATIONAL"); budget.foregroundProcessingMs = 179700;
    const f = await fixture(true, budget);
    let signal: AbortSignal | undefined;
    await expect(dispatchMeteredProvider(workerProviderMeter(attempts, f.token!), request(), { pollMs: 10, adapter: () => ({ generateResponse: async (_m, _s, _t, options) => {
      signal = options?.signal; return new Promise<LLMResponse>(() => {});
    } }) })).rejects.toMatchObject({ detail: { code: "BUDGET_EXHAUSTED" } });
    expect(signal!.aborted).toBe(true); expect((await stored(f.attempt!.attemptId)).payload.calls[0].state).toBe("UNKNOWN_SPEND");
    expect((await stored(f.attempt!.attemptId)).artifact.state).toBe("FAILED");
  });
  it("transfers actual metered foreground time, quota and review holds exactly once into worker processing", async () => {
    const f = await fixture(false); const accounting = new ForegroundAccountingService(db);
    const foreground = foregroundProviderMeter(accounting, f.ownerId, f.enqueue.budget, "planner");
    const result = await dispatchMeteredProvider(foreground.meter, { ...request(), policy: { purpose: "INTERPRETATION", reviewReserve: policy.reviewReserve } }, { adapter: () => ({ generateResponse: async () => {
      await new Promise(resolve => setTimeout(resolve, 20)); return response();
    } }) });
    const budget = foreground.budget(); expect(budget.foregroundProcessingMs).toBeGreaterThanOrEqual(20); expect(budget.consumed.modelCalls).toBe(1);
    await expect(attempts.enqueue(f.ownerId, { ...f.enqueue, budget: { ...budget, foregroundProcessingMs: 0 } })).rejects.toMatchObject({ detail: { code: "BUDGET_EXHAUSTED" } });
    const a = await attempts.enqueue(f.ownerId, { ...f.enqueue, budget }); const token = (await attempts.claim(`fg_step2_${randomUUID()}`))!;
    const claimed = await attempts.read(f.ownerId, a.attemptId);
    expect(Date.parse(claimed.budget.executionDeadlineAt!) - Date.parse(claimed.budget.processingStartedAt!)).toBe(180000 - budget.foregroundProcessingMs);
    expect((await stored(a.attemptId)).payload.providerGuard.reviewReserve).toEqual(policy.reviewReserve);
    await expect(attempts.enqueue(f.ownerId, { ...f.enqueue, key: randomUUID(), budget })).rejects.toMatchObject({ detail: { code: "IDEMPOTENCY_MISMATCH" } });
    await accounting.recordLateUsage(f.ownerId, result.callId, { inputTokens: 100, outputTokens: 30, costUsd: null });
    expect((await connection.query('SELECT used FROM "UserQuota" WHERE "userId"=$1', [f.ownerId])).rows).toEqual([{ used: 1 }]); await attempts.cancel(f.ownerId, token.attemptId);
  });
});
