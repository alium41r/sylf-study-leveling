import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { connect, user } from "./database";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";
import { IntentService } from "@/lib/planner/v2/server/intents";
import { AttemptService, newBudget } from "@/lib/planner/v2/server/attempts";
import { intentFixture, revisionFixture, changeSetFixture } from "../contracts/fixtures";
import { RevisionService, revisionDigest, educationalDigest, qualityEvidenceDigest } from "@/lib/planner/v2/server/revisions";
import { ApplyService } from "@/lib/planner/v2/server/apply";
import { SessionService } from "@/lib/planner/v2/server/sessions";
import { loadExecutionContext, specDigest, contentDigest } from "@/lib/planner/v2/server/context";
import { ownedPlan } from "@/lib/planner/v2/server/intents";

let connection: pg.Client;
let pool: pg.Pool;
let intents: IntentService;
let attempts: AttemptService;
let db: PlannerDatabase;
beforeAll(async () => {
  connection = await connect();
  pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 4, statement_timeout: 5000 });
  db = new PlannerDatabase(pool); intents = new IntentService(db); attempts = new AttemptService(db);
});
afterAll(async () => { await pool?.end(); await connection?.end(); });
async function queued() {
  const ownerId = await user(connection);
  const created = await intents.create(ownerId, randomUUID(), intentFixture());
  const attempt = await attempts.enqueue(ownerId, { key: randomUUID(), text: "Prepare this exam", kind: "PLAN", budget: newBudget("EDUCATIONAL"),
    targets: [{ planId: created.plan.id, intentId: created.intent.intentVersionId, planningVersion: 0, baseRevisionId: null }] });
  return { ownerId, ...created, attempt };
}
async function proposal() {
  const ownerId = await user(connection);
  await connection.query('UPDATE "User" SET "restDays"=\'{}\',timezone=\'Asia/Karachi\' WHERE id=$1', [ownerId]);
  const intent = { ...intentFixture(), availability: { timezone: "Asia/Karachi", dailyCeilingMinutes: [120,120,120,120,120,120,120], restWeekdays: [], blockedDates: [], recoveryPercent: 15, basis: "CONFIRMED_AVAILABILITY" } };
  const created = await intents.create(ownerId, randomUUID(), intent);
  const attempt = await attempts.enqueue(ownerId, { key: randomUUID(), text: "Prepare my exam", kind: "PLAN", budget: newBudget("EDUCATIONAL"),
    targets: [{ planId: created.plan.id, intentId: created.intent.intentVersionId, planningVersion: 0, baseRevisionId: null }] });
  const token = await attempts.claim("worker_proposal"); expect(token?.attemptId).toBe(attempt.attemptId);
  const service = new RevisionService(attempts); await service.resolveUnchanged(token!);
  const context = await db.coordinated(ownerId, async sql => loadExecutionContext(sql, ownerId, [await ownedPlan(sql, ownerId, created.plan.id)], created.intent.intent));
  const revision = revisionFixture();
  Object.assign(revision, { revisionId: randomUUID(), planId: created.plan.id, ownerId, attemptId: attempt.attemptId,
    requestedIntentVersionId: created.intent.intentVersionId, resolvedIntentVersionId: created.intent.intentVersionId, context: context.dependencies });
  Object.assign(revision.executable[0], { activityKey: randomUUID(), planId: created.plan.id, goalId: created.plan.reservedGoalId! });
  revision.quality.educationalContentDigest = educationalDigest(revision); revision.quality.evidenceDigest = qualityEvidenceDigest(created.intent.intent);
  revision.digest = revisionDigest(revision);
  const changeSet = changeSetFixture(); Object.assign(changeSet, { changeSetId: randomUUID(), attemptId: attempt.attemptId, requestDigest: attempt.requestHash, quality: revision.quality });
  changeSet.targets = [{ planId: created.plan.id, requestedIntentVersionId: created.intent.intentVersionId, resolvedIntentVersionId: created.intent.intentVersionId,
    baseActiveRevisionId: null, planningVersion: 0, resolvedPlanningVersion: 0, revisionId: revision.revisionId, revisionDigest: revision.digest }];
  const spec = revision.executable[0];
  changeSet.entries = [{ activityKey: spec.activityKey, planId: spec.planId, before: null, after: { ...spec.effort, date: spec.placement.date,
    timezone: spec.placement.timezone, specDigest: specDigest(spec), contentDigest: contentDigest(spec) }, changes: ["ADDED"], reason: "Practice the weak assessed skill" }];
  await service.publish(token!, [revision], changeSet);
  return { ownerId, ...created, attempt, revision, changeSet, token: token! };
}
describe("Phase 1 actual durable repositories", () => {
  it("creates one owned immutable intent and returns an identical retry", async () => {
    const ownerId = await user(connection); const key = randomUUID();
    const [first, second] = await Promise.all([intents.create(ownerId, key, intentFixture()), intents.create(ownerId, key, intentFixture())]);
    expect(first.plan.id).toBe(second.plan.id); expect(first.intent).toEqual(second.intent);
    await expect(intents.create(ownerId, key, { ...intentFixture(), title: "Other goal" })).rejects.toMatchObject({ detail: { code: "IDEMPOTENCY_MISMATCH" } });
    await expect(connection.query('UPDATE "PlannerIntentVersion" SET version=version+1 WHERE id=$1', [first.intent.intentVersionId])).rejects.toThrow(/COORDINATION/);
    await expect(db.coordinated(ownerId, sql => sql.query('UPDATE "PlannerIntentVersion" SET version=version+1 WHERE id=$1', [first.intent.intentVersionId]))).rejects.toThrow(/IMMUTABLE/);
  });
  it("binds one lease, survives cancellation and rejects its late checkpoint", async () => {
    const fixture = await queued(); const token = await attempts.claim("worker_cancel");
    expect(token?.attemptId).toBe(fixture.attempt.attemptId);
    const cancelled = await attempts.cancel(fixture.ownerId, fixture.attempt.attemptId);
    expect(cancelled.state).toBe("CANCELLED");
    await expect(attempts.checkpoint(token!, "PREFLIGHT", { useful: true })).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
    expect((await attempts.read(fixture.ownerId, fixture.attempt.attemptId)).state).toBe("CANCELLED");
  });
  it("never retargets an attempt after accepted intent changes", async () => {
    const fixture = await queued();
    await intents.edit(fixture.ownerId, fixture.plan.id, 0, fixture.intent.intentVersionId, { ...intentFixture(), outcome: "Prepare a different exam component" });
    const loaded = await attempts.read(fixture.ownerId, fixture.attempt.attemptId);
    expect(loaded.state).toBe("SUPERSEDED"); expect(loaded.targets[0].requestedIntentVersionId).toBe(fixture.intent.intentVersionId);
  });
  it("recovers an expired lease without resetting budget or accepting the previous fence", async () => {
    const fixture = await queued(); const original = await attempts.claim("worker_before_crash");
    const callId = await attempts.reserveCall(original!, { provider: "controlled-test", model: "stub", inputTokens: 100, outputTokens: 100, category: "PLANNING" });
    await attempts.dispatchCall(original!, callId, "PLANNING");
    await attempts.checkpoint(original!, "PREFLIGHT", { prerequisiteAnalysis: "retained" });
    const before = await attempts.read(fixture.ownerId, fixture.attempt.attemptId);
    // Accelerate only lease expiry on the real DB, rather than changing a host
    // clock or implementing a toy queue. The execution deadline is unchanged.
    await db.coordinated(fixture.ownerId, async sql => {
      const expiry = new Date(Date.now() - 1000).toISOString();
      await sql.query('UPDATE "PlannerAttempt" SET "leaseExpiresAt"=$2::text::timestamp,artifact=jsonb_set(artifact,\'{lease,expiresAt}\',to_jsonb($2::text)) WHERE id=$1', [fixture.attempt.attemptId, expiry]);
    });
    expect(await attempts.sweep()).toBe(1);
    const next = await attempts.claim("worker_after_crash");
    expect(next?.fence).toBe(original!.fence + 1);
    const recovered = await attempts.read(fixture.ownerId, fixture.attempt.attemptId);
    expect(recovered.budget).toEqual(before.budget); expect(recovered.checkpoint).toEqual(before.checkpoint);
    const payload = (await connection.query('SELECT payload FROM "PlannerAttempt" WHERE id=$1', [fixture.attempt.attemptId])).rows[0].payload;
    expect(payload.calls[0].state).toBe("UNKNOWN_SPEND"); expect(payload.calls[0].costUsd).toBeNull();
    await expect(attempts.checkpoint(original!, "PREFLIGHT", { obsolete: true })).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
    await attempts.cancel(fixture.ownerId, fixture.attempt.attemptId);
  });
  it("admits one planning and one read-only research job per user across workers", async () => {
    const fixture = await queued();
    const planning2 = await attempts.enqueue(fixture.ownerId, { key: randomUUID(), text: "Prepare another proposal", kind: "PLAN", budget: newBudget("EDUCATIONAL"),
      targets: [{ planId: fixture.plan.id, intentId: fixture.intent.intentVersionId, planningVersion: 0, baseRevisionId: null }] });
    const research = await attempts.enqueue(fixture.ownerId, { key: randomUUID(), text: "Find the official syllabus", kind: "RESEARCH_ADVICE", budget: newBudget("RESEARCH"), targets: [] });
    const claimed = await Promise.all([attempts.claim("worker_one"), attempts.claim("worker_two"), attempts.claim("worker_three")]);
    expect(claimed.filter(Boolean)).toHaveLength(2);
    const active = (await connection.query('SELECT kind FROM "PlannerAttempt" WHERE "userId"=$1 AND state=\'RUNNING\'', [fixture.ownerId])).rows;
    expect(active.filter(row => row.kind === "RESEARCH_ADVICE")).toHaveLength(1);
    expect(active.filter(row => row.kind === "PLAN")).toHaveLength(1);
    for (const attempt of [fixture.attempt, planning2, research]) await attempts.cancel(fixture.ownerId, attempt.attemptId);
  });
  it("applies an exact proposal once under concurrent confirmation", async () => {
    const fixture = await proposal(); const apply = new ApplyService(db);
    const request = { attemptId: fixture.attempt.attemptId, changeSetId: fixture.changeSet.changeSetId, acknowledgements: [] };
    const [one, two] = await Promise.all([apply.apply(fixture.ownerId, request), apply.apply(fixture.ownerId, request)]);
    expect(one).toEqual(two);
    const quests = await connection.query('SELECT * FROM "Quest" WHERE "userId"=$1', [fixture.ownerId]);
    expect(quests.rows).toHaveLength(1); expect(quests.rows[0].plannerSpecDigest).toBe(specDigest(fixture.revision.executable[0]));
    expect(quests.rows[0].targetMinutes).toBe(quests.rows[0].plannedMinutes);
    const plan = await connection.query('SELECT * FROM "PlannerPlan" WHERE id=$1', [fixture.plan.id]);
    expect(plan.rows[0].activeRevisionId).toBe(fixture.revision.revisionId); expect(plan.rows[0].state).toBe("ACTIVE");
  });
  it("rolls back every materialization boundary without a partial receipt", async () => {
    for (const failAt of ["goal", "quest", "link", "pointer", "receipt"] as const) {
      const fixture = await proposal();
      const apply = new ApplyService(db, async boundary => { if (boundary === failAt) throw new Error("injected rollback"); });
      const request = { attemptId: fixture.attempt.attemptId, changeSetId: fixture.changeSet.changeSetId, acknowledgements: [] };
      await expect(apply.apply(fixture.ownerId, request)).rejects.toThrow("injected rollback");
      expect((await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(0);
      expect((await connection.query('SELECT id FROM "Goal" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(0);
      expect((await attempts.read(fixture.ownerId, fixture.attempt.attemptId)).applyReceipt).toBeNull();
      await new ApplyService(db).apply(fixture.ownerId, request);
    }
  });
  it("protects zero-second starts, acknowledged pause/resume and receipt replays", async () => {
    const fixture = await proposal(); await new ApplyService(db).apply(fixture.ownerId, { attemptId: fixture.attempt.attemptId, changeSetId: fixture.changeSet.changeSetId, acknowledgements: [] });
    const quest = (await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [fixture.ownerId])).rows[0];
    const service = new SessionService(db); const started = await service.start(fixture.ownerId, quest.id);
    expect(started.state).toBe("RUNNING"); expect(started.acceptedFocusSeconds).toBe(0);
    const structuralVersion = (await connection.query('SELECT "executionVersion" FROM "Quest" WHERE id=$1', [quest.id])).rows[0].executionVersion;
    const progress = await service.transition(fixture.ownerId, { schemaVersion: 2, sessionId: started.sessionId,
      expectedExecutionVersion: started.executionVersion, idempotencyKey: randomUUID(), action: "PROGRESS", cumulativeFocusSeconds: 2, cumulativeBreakSeconds: 0 });
    expect((await connection.query('SELECT "executionVersion" FROM "Quest" WHERE id=$1', [quest.id])).rows[0].executionVersion).toBe(structuralVersion);
    const pause = { schemaVersion: 2, sessionId: started.sessionId, expectedExecutionVersion: progress.execution.executionVersion, idempotencyKey: randomUUID(), action: "PAUSE", cumulativeFocusSeconds: 2, cumulativeBreakSeconds: 0 };
    const paused = await service.transition(fixture.ownerId, pause);
    expect(paused.execution.state).toBe("PAUSED"); expect(await service.transition(fixture.ownerId, pause)).toEqual(paused);
    expect((await connection.query('SELECT "executionVersion" FROM "Quest" WHERE id=$1', [quest.id])).rows[0].executionVersion).toBe(structuralVersion + 1);
    await expect(service.transition(fixture.ownerId, { ...pause, idempotencyKey: randomUUID(), action: "RESUME" })).rejects.toMatchObject({ detail: { code: "PROTECTED_EXECUTION" } });
    const resumed = await service.transition(fixture.ownerId, { ...pause, expectedExecutionVersion: paused.execution.executionVersion, idempotencyKey: randomUUID(), action: "RESUME" });
    expect(resumed.execution.state).toBe("RUNNING");
    const ended = await service.transition(fixture.ownerId, { ...pause, expectedExecutionVersion: resumed.execution.executionVersion, idempotencyKey: randomUUID(), action: "END" });
    expect(ended.execution.state).toBe("ENDED");
    expect((await connection.query('SELECT status FROM "Quest" WHERE id=$1', [quest.id])).rows[0].status).toBe("IN_PROGRESS");
  });
  it("settles the weekly mission atomically and only once across competing protocols", async () => {
    const ownerId = await user(connection);
    const service = new SessionService(db);
    const now = new Date().toISOString();
    const history = await connection.query('INSERT INTO "StudySession" ("userId","durationMinutes","durationSeconds","startedAt","endedAt") VALUES ($1,179,10740,$2,$2) RETURNING id', [ownerId, now]);
    const session = (await connection.query('SELECT public.start_study_session($1,NULL,NULL,120) AS result', [ownerId])).rows[0].result;
    const before = (await connection.query('SELECT sylph FROM "User" WHERE id=$1', [ownerId])).rows[0].sylph;
    const request = { id: session.id, focus: 60, breaks: 0, complete: false, final: false };
    const results = await Promise.all([service.settleLegacy(ownerId, request), service.settleLegacy(ownerId, request)]);
    expect(results.filter(result => result.weeklyAwarded)).toHaveLength(1);
    const messages = (await connection.query('SELECT content FROM "SystemMessage" WHERE "userId"=$1 AND type=\'STREAK\'', [ownerId])).rows;
    expect(messages).toHaveLength(1);
    const after = (await connection.query('SELECT sylph,"lastActiveDate" FROM "User" WHERE id=$1', [ownerId])).rows[0];
    expect(after.sylph - before).toBe(65); expect(after.lastActiveDate).toMatch(/-W\d{2}$/);
    expect(history.rows).toHaveLength(1);
  });
});
