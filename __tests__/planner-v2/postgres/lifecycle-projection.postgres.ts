import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { connect, user, linked, waitForLock } from "./database";
import { intentFixture } from "../contracts/fixtures";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";
import { IntentService, ownedPlan } from "@/lib/planner/v2/server/intents";
import { AttemptService, newBudget } from "@/lib/planner/v2/server/attempts";
import { RevisionService } from "@/lib/planner/v2/server/revisions";
import { WorkspaceService } from "@/lib/planner/v2/server/workspace";
import { ApplyService } from "@/lib/planner/v2/server/apply";
import { SessionService } from "@/lib/planner/v2/server/sessions";
import { AdoptionService } from "@/lib/planner/v2/server/adoption";
import { loadExecutionContext, liveExecution, externalActivityAlias } from "@/lib/planner/v2/server/context";
import { prepareProposal } from "./proposal-fixture";

let connection: pg.Client; let pool: pg.Pool; let db: PlannerDatabase;
let intents: IntentService; let attempts: AttemptService;
const owners = new Set<number>();
beforeAll(async () => { connection = await connect(); pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 4 }); db = new PlannerDatabase(pool); intents = new IntentService(db); attempts = new AttemptService(db); });
afterAll(async () => { await pool?.end(); await connection?.end(); });
afterEach(async () => {
  for (const ownerId of owners) for (const row of (await connection.query('SELECT id FROM "PlannerAttempt" WHERE "userId"=$1 AND state IN (\'QUEUED\',\'RUNNING\',\'NEEDS_DECISION\')', [ownerId])).rows) await attempts.cancel(ownerId, row.id);
  owners.clear();
});
const availability = (minutes = 120) => ({ timezone: "Asia/Karachi", dailyCeilingMinutes: Array(7).fill(minutes), restWeekdays: [], blockedDates: [], recoveryPercent: 15, basis: "CONFIRMED_AVAILABILITY" as const });
async function student() { const ownerId = await user(connection); owners.add(ownerId); await connection.query('UPDATE "User" SET timezone=\'Asia/Karachi\',"restDays"=\'{}\' WHERE id=$1', [ownerId]); return ownerId; }
async function plan(ownerId: number, minutes = 120) { return intents.create(ownerId, randomUUID(), { ...intentFixture(), availability: availability(minutes) }); }
const research = () => ({ schemaVersion: 2, assessment: {}, sources: [], claims: [], completeAssessedScope: false, unresolvedGaps: ["No verified assessed scope was found"] });

describe("Phase 1 correspondence, projection and reviewed migration", () => {
  it("keeps initial retry correspondence after editing and archives without erasing execution", async () => {
    const ownerId = await student(); const key = randomUUID(); const raw = { ...intentFixture(), availability: availability() };
    const initial = await intents.create(ownerId, key, raw);
    const edited = await intents.edit(ownerId, initial.plan.id, 0, initial.intent.intentVersionId, { ...raw, title: "Changed goal" });
    expect((await intents.create(ownerId, key, raw)).intent.intentVersionId).toBe(initial.intent.intentVersionId);
    const queued = await attempts.enqueue(ownerId, { key: randomUUID(), text: "Prepare changed goal", kind: "PLAN", targets: [{ planId: initial.plan.id, intentId: edited.intentVersionId, planningVersion: 1, baseRevisionId: null }], budget: newBudget("EDUCATIONAL") });
    expect((await new WorkspaceService(db).read(ownerId, initial.plan.id)).phase).toBe("PLANNING");
    await intents.archive(ownerId, initial.plan.id, 1);
    expect((await attempts.read(ownerId, queued.attemptId)).state).toBe("SUPERSEDED");
    expect((await new WorkspaceService(db).read(ownerId, initial.plan.id)).allowedActions).toEqual(["ADVICE"]);
    await expect(db.coordinated(ownerId, async sql => { await sql.query("SELECT set_config('sylf.planner_v2_core_owner','',true)"); await sql.query('UPDATE "PlannerPlan" SET version=version+1 WHERE id=$1', [initial.plan.id]); })).rejects.toThrow(/PATH_REQUIRED/);
  });
  it("preserves deadline and accounting during explicit profile escalation", async () => {
    const ownerId = await student(); const created = await plan(ownerId);
    const queued = await attempts.enqueue(ownerId, { key: randomUUID(), text: "Move Friday", kind: "REPLAN", targets: [{ planId: created.plan.id, intentId: created.intent.intentVersionId, planningVersion: 0, baseRevisionId: null }], budget: newBudget("CALENDAR_ONLY") });
    const token = (await attempts.claim("escalation_worker"))!;
    const before = await attempts.read(ownerId, queued.attemptId);
    await attempts.escalate(token, "EDUCATIONAL", "Reduced capacity requires educational triage");
    const after = await attempts.read(ownerId, queued.attemptId);
    expect(after.budget.processingStartedAt).toBe(before.budget.processingStartedAt); expect(after.budget.consumed).toEqual(before.budget.consumed);
    expect(Date.parse(after.budget.executionDeadlineAt!) - Date.parse(before.budget.executionDeadlineAt!)).toBe(150_000);
    await expect(attempts.escalate(token, "CALENDAR_ONLY", "Reset it")).rejects.toThrow();
    await attempts.cancel(ownerId, queued.attemptId);
  });
  it("adopts research atomically for both targets and never changes hard facts", async () => {
    const ownerId = await student(); const first = await plan(ownerId); const second = await plan(ownerId);
    const queued = await attempts.enqueue(ownerId, { key: randomUUID(), text: "Research both exams", kind: "JOINT", budget: newBudget("RESEARCH"),
      targets: [first, second].map(value => ({ planId: value.plan.id, intentId: value.intent.intentVersionId, planningVersion: 0, baseRevisionId: null })) });
    const token = (await attempts.claim("research_resolution"))!; const service = new RevisionService(attempts);
    const derived = [first, second].map(value => ({ planId: value.plan.id, intent: { ...value.intent.intent, research: research() } }));
    await expect(service.resolveResearch(token, [derived[0], { ...derived[1], intent: { ...derived[1].intent, deadline: { kind: "NONE" } } }])).rejects.toMatchObject({ detail: { code: "INTENT_CONFLICT" } });
    expect((await connection.query('SELECT count(*)::int AS n FROM "PlannerIntentVersion" WHERE "userId"=$1', [ownerId])).rows[0].n).toBe(2);
    await service.resolveResearch(token, derived); await service.resolveResearch(token, derived);
    const bound = await attempts.read(ownerId, queued.attemptId);
    expect(bound.targets.every(target => target.resolution === "RESEARCH_ADOPTION" && target.resolvedPlanningVersion === 1 && target.requestedIntentVersionId !== target.resolvedIntentVersionId)).toBe(true);
    expect((await connection.query('SELECT version FROM "PlannerPlan" WHERE "userId"=$1', [ownerId])).rows.map(row => row.version)).toEqual([1, 1]);
    await attempts.cancel(ownerId, queued.attemptId);
  });
  it("publishes long research as a durable read-only answer with no Plan side effects", async () => {
    const ownerId = await student(); const queued = await attempts.enqueue(ownerId, { key: randomUUID(), text: "Find an official syllabus", kind: "RESEARCH_ADVICE", targets: [], budget: newBudget("RESEARCH") });
    const token = (await attempts.claim("answer_worker"))!;
    await new RevisionService(attempts).publishResearchAnswer(token, "The exact examination cycle still needs clarification.", research());
    const answer = await attempts.read(ownerId, queued.attemptId); expect(answer.result?.kind).toBe("RESEARCH_ANSWER"); expect(answer.targets).toEqual([]); expect(answer.applyReceipt).toBeNull();
    expect((await connection.query('SELECT id FROM "PlannerPlan" WHERE "userId"=$1', [ownerId])).rows).toEqual([]);
  });
  it("uses accepted global availability even while preparing another Plan", async () => {
    const ownerId = await student(); const first = await plan(ownerId, 120); const second = await plan(ownerId, 45);
    await intents.edit(ownerId, first.plan.id, 0, first.intent.intentVersionId, { ...first.intent.intent, title: "New title, same capacity" });
    const context = await db.coordinated(ownerId, async sql => loadExecutionContext(sql, ownerId, [await ownedPlan(sql, ownerId, first.plan.id)], first.intent.intent));
    expect(context.globalAvailability?.dailyCeilingMinutes).toEqual(Array(7).fill(45)); expect(context.availabilityIntentVersionId).toBe(second.intent.intentVersionId);
  });
  it("reviews and atomically applies a joint proposal once", async () => {
    const ownerId = await student(); const first = await plan(ownerId); const second = await plan(ownerId);
    const proposal = await prepareProposal(db, ownerId, [first.plan.id, second.plan.id]);
    const workspace = await new WorkspaceService(db).read(ownerId, first.plan.id); expect(workspace.phase).toBe("REVIEW"); expect(workspace.allowedActions).toContain("CONFIRM");
    const apply = new ApplyService(db);
    const [one, two] = await Promise.all([apply.apply(ownerId, proposal.request), apply.apply(ownerId, proposal.request)]);
    expect(one).toEqual(two); expect(one.targets).toHaveLength(2);
    expect((await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [ownerId])).rows).toHaveLength(2);
    expect((await new WorkspaceService(db).read(ownerId, first.plan.id)).candidate).toBeNull();
  });
  it("retains an unstarted identity across semantic edits and rejects a racing Focus start", async () => {
    const ownerId = await student(); const created = await plan(ownerId); const apply = new ApplyService(db);
    await apply.apply(ownerId, (await prepareProposal(db, ownerId, [created.plan.id])).request);
    const changed = await prepareProposal(db, ownerId, [created.plan.id], specs => { specs[0].content.instructions += " Record the specific error for each question."; });
    expect(changed.changeSet.entries[0].changes).toContain("CHANGED"); await apply.apply(ownerId, changed.request);
    const context = await db.coordinated(ownerId, async sql => loadExecutionContext(sql, ownerId, [await ownedPlan(sql, ownerId, created.plan.id)], created.intent.intent));
    expect(liveExecution(context.quests[0], context.sessions).state).toBe("UNSTARTED");
    const move = await prepareProposal(db, ownerId, [created.plan.id], specs => { specs[0].placement.date = "2026-10-06"; });
    const results = await Promise.allSettled([new SessionService(db).start(ownerId, context.quests[0].id), apply.apply(ownerId, move.request)]);
    expect(results[0].status).toBe("fulfilled");
    const current = (await connection.query('SELECT "scheduledFor",status FROM "Quest" WHERE id=$1', [context.quests[0].id])).rows[0];
    if (results[1].status === "rejected") expect(current.scheduledFor).toBe("2026-10-05"); else expect(current.scheduledFor).toBe("2026-10-06");
    expect(current.status).toBe("IN_PROGRESS");
  });
  it("rolls back both targets of a joint apply at every durable boundary and retries exactly once", async () => {
    for (const failAt of ["goal", "quest", "link", "pointer", "receipt"] as const) {
      const ownerId = await student(); const first = await plan(ownerId); const second = await plan(ownerId);
      const proposal = await prepareProposal(db, ownerId, [first.plan.id, second.plan.id]);
      const failing = new ApplyService(db, async boundary => { if (boundary === failAt) throw new Error("joint rollback"); });
      await expect(failing.apply(ownerId, proposal.request)).rejects.toThrow("joint rollback");
      for (const table of ["Goal", "Quest", "PlannerQuestLink"] as const) {
        const ownership = table === "PlannerQuestLink" ? '"planId" IN (SELECT id FROM "PlannerPlan" WHERE "userId"=$1)' : '"userId"=$1';
        expect((await connection.query(`SELECT id FROM "${table}" WHERE ${ownership}`, [ownerId])).rows).toEqual([]);
      }
      expect((await connection.query('SELECT "activeRevisionId",version FROM "PlannerPlan" WHERE "userId"=$1', [ownerId])).rows).toEqual([
        { activeRevisionId: null, version: 0 }, { activeRevisionId: null, version: 0 },
      ]);
      expect((await attempts.read(ownerId, proposal.request.attemptId)).applyReceipt).toBeNull();
      const receipt = await new ApplyService(db).apply(ownerId, proposal.request);
      expect(receipt.targets).toHaveLength(2);
      expect(await new ApplyService(db).apply(ownerId, proposal.request)).toEqual(receipt);
      expect((await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [ownerId])).rows).toHaveLength(2);
    }
  });
  it("adopts Classic once, preserving actual history and conflicting original aliases", async () => {
    const ownerId = await student(); const goalId = (await connection.query('INSERT INTO "Goal" ("userId",title,"targetWeeks") VALUES ($1,\'Physics\',3) RETURNING id', [ownerId])).rows[0].id;
    const questId = (await connection.query('INSERT INTO "Quest" ("userId","goalId",title,description,"scheduledFor","requiredMinutes","targetMinutes","xpReward","sylphReward") VALUES ($1,$2,\'Electricity\',\'Solve the original questions\',\'2026-10-05\',30,45,77,19) RETURNING id', [ownerId, goalId])).rows[0].id;
    const service = new AdoptionService(db, true); const inventory = await service.inspect(ownerId, { goalId });
    expect(inventory.issues.map(issue => issue.code)).toContain("DURATION_ALIAS_CONFLICT");
    const request = { key: randomUUID(), goalId, expectedLiveDigest: inventory.liveDigest, intent: { ...intentFixture(), availability: availability() }, review: [{ questId, purpose: "Preserve the reviewed legacy study activity", completionCriterion: "Explain and correct each answer" }] };
    const [one, two] = await Promise.all([service.adopt(ownerId, request), service.adopt(ownerId, request)]); expect(one).toEqual(two);
    const quest = (await connection.query('SELECT * FROM "Quest" WHERE id=$1', [questId])).rows[0];
    expect(quest.plannedMinutes).toBe(30); expect(quest.targetMinutes).toBe(30); expect(quest.xpReward).toBe(77); expect(quest.sylphReward).toBe(19); expect(quest.description).toBe("Solve the original questions");
    const workspace = await new WorkspaceService(db).read(ownerId, one.planId); expect(workspace.active?.revisionId).toBeTruthy();
    await expect(connection.query('UPDATE "Quest" SET "requiredMinutes"=60 WHERE id=$1', [questId])).rejects.toThrow(/PLANNER_/);
  });
  it("blocks open timers and rolls back adoption without rewriting ledgers", async () => {
    const ownerId = await student(); const goalId = (await connection.query('INSERT INTO "Goal" ("userId",title,"targetWeeks") VALUES ($1,\'Physics\',3) RETURNING id', [ownerId])).rows[0].id;
    const questId = (await connection.query('INSERT INTO "Quest" ("userId","goalId",title,description,"scheduledFor","requiredMinutes") VALUES ($1,$2,\'Electricity\',\'Original instructions\',\'2026-10-05\',30) RETURNING id', [ownerId, goalId])).rows[0].id;
    const session = (await connection.query('SELECT public.start_study_session($1,$2,NULL,120) AS value', [ownerId, questId])).rows[0].value;
    const service = new AdoptionService(db, true); const inventory = await service.inspect(ownerId, { goalId });
    const request = { key: randomUUID(), goalId, expectedLiveDigest: inventory.liveDigest, intent: { ...intentFixture(), availability: availability() }, review: [{ questId, purpose: "Preserve work", completionCriterion: "Correct answers", remainingMinutesEstimate: 25 }] };
    await expect(service.adopt(ownerId, request)).rejects.toMatchObject({ detail: { code: "PROTECTED_EXECUTION" } });
    await new SessionService(db).settleLegacy(ownerId, { id: session.id, focus: 0, breaks: 0, complete: false, final: true });
    const fresh = await service.inspect(ownerId, { goalId });
    await expect(new AdoptionService(db, true, async () => { throw new Error("baseline rollback"); }).adopt(ownerId, { ...request, expectedLiveDigest: fresh.liveDigest })).rejects.toThrow("baseline rollback");
    expect((await connection.query('SELECT id FROM "PlannerPlan" WHERE "userId"=$1', [ownerId])).rows).toHaveLength(0);
    expect((await connection.query('SELECT "plannedMinutes" FROM "Quest" WHERE id=$1', [questId])).rows[0].plannedMinutes).toBeNull();
    const receipt = await service.adopt(ownerId, { ...request, expectedLiveDigest: fresh.liveDigest }); expect(receipt.questIds).toEqual([questId]);
    expect((await connection.query('SELECT id,"durationSeconds" FROM "StudySession" WHERE id=$1', [session.id])).rows[0]).toEqual({ id: session.id, durationSeconds: 0 });
  });
  it("replans an adopted live baseline repeatedly without reverting edited content or lineage", async () => {
    const ownerId = await student();
    const goalId = (await connection.query('INSERT INTO "Goal" ("userId",title,"targetWeeks") VALUES ($1,\'Physics\',3) RETURNING id', [ownerId])).rows[0].id;
    const questId = (await connection.query('INSERT INTO "Quest" ("userId","goalId",title,description,"scheduledFor","requiredMinutes","targetMinutes","xpReward","sylphReward") VALUES ($1,$2,\'Electricity\',\'Original instructions\',\'2026-10-05\',30,30,77,19) RETURNING id', [ownerId, goalId])).rows[0].id;
    const adoption = new AdoptionService(db, true); const inspection = await adoption.inspect(ownerId, { goalId });
    const adopted = await adoption.adopt(ownerId, { key: randomUUID(), goalId, expectedLiveDigest: inspection.liveDigest, intent: { ...intentFixture(), availability: availability() },
      review: [{ questId, purpose: "Preserve useful work", completionCriterion: "Explain the circuit and correct every error" }] });
    const originalLink = (await connection.query('SELECT id,baseline,"baselineSpecDigest" FROM "PlannerQuestLink" WHERE "questId"=$1', [questId])).rows[0];
    for (const instructions of ["Solve the circuit and explain each voltage drop", "Compare two circuits and explain both voltage drops"]) {
      const proposed = await prepareProposal(db, ownerId, [adopted.planId], specs => { specs[0].content.instructions = instructions; });
      await new ApplyService(db).apply(ownerId, proposed.request);
      expect((await connection.query('SELECT description FROM "Quest" WHERE id=$1', [questId])).rows[0].description).toContain(instructions);
    }
    const acceptedDescription = (await connection.query('SELECT description FROM "Quest" WHERE id=$1', [questId])).rows[0].description;
    const sessions = new SessionService(db); const started = await sessions.start(ownerId, questId);
    await sessions.transition(ownerId, { schemaVersion: 2, sessionId: started.sessionId, expectedExecutionVersion: started.executionVersion,
      idempotencyKey: randomUUID(), action: "PAUSE", cumulativeFocusSeconds: 0, cumulativeBreakSeconds: 0 });
    const moved = await prepareProposal(db, ownerId, [adopted.planId], specs => { specs[0].placement.date = "2026-10-06"; });
    await new ApplyService(db).apply(ownerId, moved.request);
    expect((await connection.query('SELECT description FROM "Quest" WHERE id=$1', [questId])).rows[0].description).toBe(acceptedDescription);
    expect((await connection.query('SELECT id,baseline,"baselineSpecDigest" FROM "PlannerQuestLink" WHERE "questId"=$1', [questId])).rows[0]).toEqual(originalLink);
    expect((await connection.query('SELECT id FROM "Quest" WHERE "goalId"=$1', [goalId])).rows).toEqual([{ id: questId }]);
  });
  it("shows live remaining work and keeps active intent separate from a later working edit", async () => {
    const ownerId = await student(); const created = await plan(ownerId); const proposal = await prepareProposal(db, ownerId, [created.plan.id]);
    await new ApplyService(db).apply(ownerId, proposal.request);
    const questId = (await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [ownerId])).rows[0].id;
    const sessions = new SessionService(db); const started = await sessions.start(ownerId, questId);
    const ended = await sessions.transition(ownerId, { schemaVersion: 2, sessionId: started.sessionId, expectedExecutionVersion: started.executionVersion,
      idempotencyKey: randomUUID(), action: "END", cumulativeFocusSeconds: 5, cumulativeBreakSeconds: 0 });
    expect(ended.execution.acceptedFocusSeconds).toBeLessThanOrEqual(5);
    const current = await db.coordinated(ownerId, sql => ownedPlan(sql, ownerId, created.plan.id));
    await intents.edit(ownerId, current.id, current.version, current.workingIntentVersionId!, { ...created.intent.intent, title: "A different working goal" });
    const workspace = await new WorkspaceService(db).read(ownerId, current.id);
    expect(workspace.active?.resolvedIntentVersionId).toBe(created.intent.intentVersionId);
    expect(workspace.active?.title).not.toBe("A different working goal");
    const version = (await connection.query('SELECT "executionVersion" FROM "Quest" WHERE id=$1', [questId])).rows[0].executionVersion;
    await sessions.complete(ownerId, questId, version);
    const complete = await new WorkspaceService(db).read(ownerId, current.id);
    expect(complete.active?.committedMinutes).toBe(0); expect(complete.active?.primaryFinishDate).toBeNull();
  });
  it("does not renew timing tolerance through repeated acknowledged pause/resume", async () => {
    const ownerId = await student(); const created = await plan(ownerId); const proposal = await prepareProposal(db, ownerId, [created.plan.id]);
    await new ApplyService(db).apply(ownerId, proposal.request);
    const questId = (await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [ownerId])).rows[0].id;
    const sessions = new SessionService(db); let accepted = await sessions.start(ownerId, questId);
    for (let index = 0; index < 6; index++) {
      accepted = (await sessions.transition(ownerId, { schemaVersion: 2, sessionId: accepted.sessionId, expectedExecutionVersion: accepted.executionVersion,
        idempotencyKey: randomUUID(), action: "PAUSE", cumulativeFocusSeconds: 10_000, cumulativeBreakSeconds: 10_000 })).execution;
      expect((await sessions.start(ownerId, questId)).state).toBe("PAUSED");
      accepted = (await sessions.transition(ownerId, { schemaVersion: 2, sessionId: accepted.sessionId, expectedExecutionVersion: accepted.executionVersion,
        idempotencyKey: randomUUID(), action: "RESUME", cumulativeFocusSeconds: 10_000, cumulativeBreakSeconds: 10_000 })).execution;
    }
    expect(accepted.acceptedFocusSeconds + accepted.acceptedBreakSeconds).toBeLessThanOrEqual(6);
    const context = (await connection.query('SELECT "executionContext" FROM "StudySession" WHERE id=$1', [accepted.sessionId])).rows[0].executionContext;
    expect(context.toleranceUsedSeconds).toBe(5);
    const race = { schemaVersion: 2, sessionId: accepted.sessionId, expectedExecutionVersion: accepted.executionVersion, action: "PAUSE", cumulativeFocusSeconds: 10_000, cumulativeBreakSeconds: 0 };
    const results = await Promise.allSettled([sessions.transition(ownerId, { ...race, idempotencyKey: randomUUID() }), sessions.transition(ownerId, { ...race, idempotencyKey: randomUUID() })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });
  it("erases owned durable artifacts through the explicit account cascade while fencing old workers", async () => {
    const ownerId = await student(); const created = await plan(ownerId); const proposal = await prepareProposal(db, ownerId, [created.plan.id]);
    await new ApplyService(db).apply(ownerId, proposal.request);
    const questId = (await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [ownerId])).rows[0].id;
    await new SessionService(db).start(ownerId, questId);
    await expect(connection.query('DELETE FROM "User" WHERE id=$1', [ownerId])).rejects.toThrow(/PLANNER_/);
    await db.coordinated(ownerId, sql => sql.query('DELETE FROM "User" WHERE id=$1', [ownerId]));
    for (const table of ["PlannerPlan", "PlannerIntentVersion", "PlannerAttempt", "Quest", "StudySession"]) {
      expect((await connection.query(`SELECT id FROM "${table}" WHERE "userId"=$1`, [ownerId])).rows).toHaveLength(0);
    }
    expect((await connection.query('SELECT id FROM "PlannerRevision" WHERE "planId"=$1', [created.plan.id])).rows).toHaveLength(0);
    expect((await connection.query('SELECT id FROM "PlannerQuestLink" WHERE "planId"=$1', [created.plan.id])).rows).toHaveLength(0);
    await expect(attempts.checkpoint(proposal.token, "PERSISTENCE", { late: true })).rejects.toMatchObject({ detail: { code: "REFERENCE_NOT_OWNED" } });
  });
  it("pins an owned cross-plan prerequisite, materializes it once and protects reverse dependencies", async () => {
    const ownerId = await student(); const first = await plan(ownerId); const second = await plan(ownerId);
    const prerequisite = await prepareProposal(db, ownerId, [first.plan.id]); await new ApplyService(db).apply(ownerId, prerequisite.request);
    const key = prerequisite.revisions[0].executable[0].activityKey;
    const dependent = await prepareProposal(db, ownerId, [second.plan.id], specs => { specs[0].content.hardDependencies = [key]; specs[0].placement.date = "2026-10-06"; });
    expect(dependent.revisions[0].context.externalActivityDependencies).toHaveLength(1);
    await new ApplyService(db).apply(ownerId, dependent.request);
    expect((await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [ownerId])).rows).toHaveLength(2);
    const before = (await connection.query('SELECT "plannerSpecDigest" FROM "Quest" WHERE "plannerSpec"->>\'activityKey\'=$1', [key])).rows[0].plannerSpecDigest;
    await expect(prepareProposal(db, ownerId, [first.plan.id], specs => { specs[0].content.instructions = "Replace the method used by the other plan"; }))
      .rejects.toMatchObject({ detail: { code: "PROTECTED_EXECUTION" } });
    expect((await connection.query('SELECT "plannerSpecDigest" FROM "Quest" WHERE "plannerSpec"->>\'activityKey\'=$1', [key])).rows[0].plannerSpecDigest).toBe(before);
  });

  it("keeps unchanged Quest identity, content and execution rows byte-for-byte stable", async () => {
    const ownerId = await student(); const created = await plan(ownerId);
    await new ApplyService(db).apply(ownerId, (await prepareProposal(db, ownerId, [created.plan.id])).request);
    const before = (await connection.query('SELECT * FROM "Quest" WHERE "userId"=$1', [ownerId])).rows;
    const unchanged = await prepareProposal(db, ownerId, [created.plan.id]);
    expect(unchanged.changeSet.entries[0].changes).toEqual(["KEPT"]);
    await new ApplyService(db).apply(ownerId, unchanged.request);
    expect((await connection.query('SELECT * FROM "Quest" WHERE "userId"=$1', [ownerId])).rows).toEqual(before);
  });
  it("withdraws stopped unfinished work into a distinct continuation without duplicating completion rewards", async () => {
    const ownerId = await student(); const created = await plan(ownerId);
    const initial = await prepareProposal(db, ownerId, [created.plan.id]); await new ApplyService(db).apply(ownerId, initial.request);
    const original = initial.revisions[0].executable[0];
    const questId = (await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [ownerId])).rows[0].id;
    const sessions = new SessionService(db); const started = await sessions.start(ownerId, questId);
    const paused = (await sessions.transition(ownerId, { schemaVersion:2,sessionId:started.sessionId,expectedExecutionVersion:started.executionVersion,
      idempotencyKey:randomUUID(),action:"PAUSE",cumulativeFocusSeconds:5,cumulativeBreakSeconds:0 })).execution;
    const before = (await connection.query('SELECT * FROM "StudySession" WHERE id=$1', [paused.sessionId])).rows[0];
    const continuation = await prepareProposal(db, ownerId, [created.plan.id], specs => {
      specs[0] = { ...structuredClone(original), activityKey:randomUUID(), blueprintActivityId:"continuation01", continuesActivityKey:original.activityKey,
        effort:{ plannedMinutes:20,remainingMinutesEstimate:20,remainingEstimateBasisActualSeconds:0 },placement:{...original.placement,date:"2026-10-06"} };
    });
    await new ApplyService(db).apply(ownerId, continuation.request);
    const withdrawn = (await connection.query('SELECT * FROM "Quest" WHERE id=$1', [questId])).rows[0];
    expect(withdrawn.remainingDisposition).toBe("WITHDRAWN"); expect(withdrawn.elapsedSeconds).toBe(paused.acceptedFocusSeconds);
    expect(withdrawn.remainingMinutesEstimate).toBe(0); expect(withdrawn.status).not.toBe("COMPLETED");
    expect((await connection.query('SELECT * FROM "StudySession" WHERE id=$1', [paused.sessionId])).rows[0]).toEqual(before);
    await expect(sessions.complete(ownerId, questId, withdrawn.executionVersion)).rejects.toMatchObject({ detail:{code:"PROTECTED_EXECUTION"} });
    await expect(sessions.start(ownerId, questId)).rejects.toMatchObject({ detail:{code:"PROTECTED_EXECUTION"} });
    await sessions.transition(ownerId,{schemaVersion:2,sessionId:paused.sessionId,expectedExecutionVersion:paused.executionVersion,idempotencyKey:randomUUID(),action:"END",cumulativeFocusSeconds:paused.acceptedFocusSeconds,cumulativeBreakSeconds:paused.acceptedBreakSeconds});
    const added = (await connection.query('SELECT * FROM "Quest" WHERE "userId"=$1 AND id<>$2', [ownerId,questId])).rows[0];
    expect(added.plannerSpec.continuesActivityKey).toBe(original.activityKey); expect(added.elapsedSeconds).toBe(0);
    await sessions.complete(ownerId, added.id, added.executionVersion);
    expect((await connection.query('SELECT id FROM "XpLedger" WHERE "userId"=$1 AND source=\'QUEST\'', [ownerId])).rows).toHaveLength(1);
  });
  it("applies new cross-plan prerequisites in one joint transaction without requiring pre-existing Quests", async () => {
    const ownerId = await student(); const first = await plan(ownerId); const second = await plan(ownerId); let key = "";
    const proposal = await prepareProposal(db, ownerId, [first.plan.id,second.plan.id], (specs,index) => {
      if(index===0) key=specs[0].activityKey; else { specs[0].content.hardDependencies=[key];specs[0].placement.date="2026-10-06"; }
    });
    expect(proposal.revisions[1].context.externalActivityDependencies[0].activityKey).toBe(key);
    await new ApplyService(db).apply(ownerId,proposal.request);
    expect((await connection.query('SELECT "plannerSpec" FROM "Quest" WHERE "userId"=$1', [ownerId])).rows).toHaveLength(2);
  });
  it("anchors hard learning intervals to accepted completion date rather than the old calendar slot", async () => {
    const ownerId = await student(); const first = await plan(ownerId); const second = await plan(ownerId);
    const initial = await prepareProposal(db,ownerId,[first.plan.id]); await new ApplyService(db).apply(ownerId,initial.request);
    const quest = (await connection.query('SELECT id,"executionVersion" FROM "Quest" WHERE "userId"=$1',[ownerId])).rows[0];
    await new SessionService(db).complete(ownerId,quest.id,quest.executionVersion);
    // The executable slot is 5 October; accepted completion is 3 October.
    const completedAt = (await connection.query('SELECT "completedAt" FROM "Quest" WHERE id=$1',[quest.id])).rows[0].completedAt;
    const date = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(completedAt);
    const dependentDate = new Date(date+"T00:00:00Z"); dependentDate.setUTCDate(dependentDate.getUTCDate()+1);
    const key=initial.revisions[0].executable[0].activityKey;
    const proposal = await prepareProposal(db,ownerId,[second.plan.id],specs=>{specs[0].content.hardDependencies=[key];specs[0].placement.date=dependentDate.toISOString().slice(0,10);},revision=>{
      revision.blueprint.activities[0].learningWindow={anchorActivityId:externalActivityAlias(key),minimumGapDays:1,maximumGapDays:1,strength:"HARD",reason:"Retrieve one day after the accepted completion"};
    });
    await new ApplyService(db).apply(ownerId,proposal.request);
  });
  it("imports Roadmap expansions from live execution and retains strategic revisions, tombstones and large UTF-8 baselines", async () => {
    const old = await linked(connection,"ROADMAP"); owners.add(old.userId);
    await connection.query('UPDATE "User" SET timezone=\'Asia/Karachi\',"restDays"=\'{}\' WHERE id=$1',[old.userId]);
    const goalId=(await connection.query('INSERT INTO "Goal" ("userId",title,"targetWeeks") VALUES ($1,\'Roadmap\',8) RETURNING id',[old.userId])).rows[0].id;
    await connection.query('UPDATE "PlannerPlan" SET "goalId"=$2,"activeRevisionId"=$3,state=\'ACTIVE\' WHERE id=$1',[old.planId,goalId,old.revisionId]);
    // An imported description may exceed the old 16 KiB link envelope in UTF-8.
    const description="界".repeat(3900);
    await connection.query('SELECT set_config(\'sylf.planner_manual_quest\',$1,false)',[String(old.questId)]);
    await connection.query('UPDATE "Quest" SET "goalId"=$2,description=$3 WHERE id=$1',[old.questId,goalId,description]);
    await connection.query('SELECT set_config(\'sylf.planner_manual_quest\',\'\',false)');
    const expansionId=randomUUID();
    await connection.query('INSERT INTO "PlannerRevision" (id,"planId",sequence,source,"baseVersion","inputSnapshot","availabilitySnapshot","outputSnapshot",digest,"operationKey","operationHash","operationState","sealedAt","updatedAt") VALUES ($1,$2,2,\'EXPAND\',0,\'{}\',\'{}\',\'{"strategic":"preserved"}\',$3,$4,$3,\'SEALED\',now(),now())',[expansionId,old.planId,"f".repeat(64),randomUUID()]);
    const extra=(await connection.query('INSERT INTO "Quest" ("userId","goalId",title,description,"scheduledFor","requiredMinutes","targetMinutes") VALUES ($1,$2,\'Expansion work\',\'Useful expansion instructions\',\'2026-10-06\',20,20) RETURNING id',[old.userId,goalId])).rows[0].id;
    await connection.query('INSERT INTO "PlannerQuestLink" (id,"planId","itemKey","questId","createdRevisionId","appliedRevisionId",baseline,"updatedAt") VALUES ($1,$2,$3,$4,$5,$5,\'{}\',now())',[randomUUID(),old.planId,randomUUID(),extra,expansionId]);
    const orphan=(await connection.query('INSERT INTO "Quest" ("userId","goalId",title,description,"scheduledFor","requiredMinutes","targetMinutes") VALUES ($1,$2,\'Unlinked live Goal work\',\'Keep this real commitment\',\'2026-10-07\',15,15) RETURNING id',[old.userId,goalId])).rows[0].id;
    const before=(await connection.query('SELECT * FROM "PlannerRevision" WHERE "planId"=$1 ORDER BY sequence',[old.planId])).rows;
    const service=new AdoptionService(db,true);const inventory=await service.inspect(old.userId,{planId:old.planId});
    await service.adopt(old.userId,{key:randomUUID(),planId:old.planId,expectedLiveDigest:inventory.liveDigest,intent:{...intentFixture(),policy:"ROADMAP",availability:availability()},review:inventory.quests.map(quest=>({questId:quest.id,purpose:"学".repeat(900),completionCriterion:"证".repeat(900),adoptDetached:true}))});
    expect((await connection.query('SELECT * FROM "PlannerRevision" WHERE "planId"=$1 ORDER BY sequence',[old.planId])).rows).toEqual(before);
    const migrated=(await connection.query('SELECT "migrationEvidence" FROM "PlannerPlan" WHERE id=$1',[old.planId])).rows[0].migrationEvidence;
    expect(new Set(migrated.originalRevisionIds)).toEqual(new Set([old.revisionId,expansionId]));expect(migrated.baselineSpecs).toHaveLength(3);
    expect((await connection.query('SELECT "questId" FROM "PlannerQuestLink" WHERE "planId"=$1 AND "questId"=$2',[old.planId,orphan])).rows).toEqual([{questId:orphan}]);
    expect((await connection.query('SELECT description FROM "Quest" WHERE id=$1',[old.questId])).rows[0].description).toBe(description);
  });

  it("fails closed on independent context/economic SQL writers while allowing coordinated mutations", async () => {
    const ownerId=await student();await plan(ownerId);
    const uncoordinated=[
      ['UPDATE "User" SET timezone=\'UTC\' WHERE id=$1',[ownerId]],
      ['UPDATE "User" SET hp=hp-1 WHERE id=$1',[ownerId]],
      ['INSERT INTO "FloatingRestDay" ("userId","dateKey","weekKey") VALUES ($1,\'2026-10-08\',\'2026-10-05\')',[ownerId]],
      ['INSERT INTO "Subject" ("userId",name,code) VALUES ($1,\'Mathematics\',$2)',[ownerId,randomUUID()]],
      ['INSERT INTO "UserStats" ("userId","updatedAt") VALUES ($1,now())',[ownerId]],
      ['INSERT INTO "InventoryItem" ("userId","itemKey","updatedAt") VALUES ($1,\'ELIXIR_OF_INSIGHT\',now())',[ownerId]],
    ] as const;
    for(const [statement,values] of uncoordinated) await expect(connection.query(statement,[...values])).rejects.toThrow(/PLANNER_COORDINATION_REQUIRED/);
    for(const [statement,values] of uncoordinated) await db.coordinated(ownerId,sql=>sql.query(statement,[...values]));
    // Profile cosmetics do not acquire educational/execution authority.
    await connection.query('UPDATE "User" SET name=\'Cosmetic label\' WHERE id=$1',[ownerId]);
    expect((await connection.query('SELECT hp,timezone FROM "User" WHERE id=$1',[ownerId])).rows[0]).toMatchObject({hp:99,timezone:"UTC"});
  });
  it("coordinates direct SQL shop/equipment writers with apply and preserves their economic math", async () => {
    const ownerId=await student();const created=await plan(ownerId);const proposal=await prepareProposal(db,ownerId,[created.plan.id]);
    await db.coordinated(ownerId,sql=>sql.query('INSERT INTO "UserStats" ("userId",currency,"updatedAt") VALUES ($1,100,now())',[ownerId]));
    const item=(await connection.query('INSERT INTO "Item" (sku,name,description,category,slot,"costSylph","updatedAt") VALUES ($1,\'Helmet\',\'Fixture\',\'EQUIPMENT\',\'HELMET\',20,now()) RETURNING id',[randomUUID()])).rows[0].id;
    const caller=await connect();const blocker=await connect();
    try {
      await caller.query('SELECT set_config(\'request.jwt.claim.userId\',$1,false)',[String(ownerId)]);
      await blocker.query("BEGIN");await blocker.query("SELECT pg_advisory_xact_lock(73641,$1)",[ownerId]);
      const pid=(await caller.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const purchase=caller.query("SELECT * FROM public.purchase_shop_item($1)",[item]);
      await waitForLock(connection,pid);await blocker.query("COMMIT");
      const receipt=(await purchase).rows[0];expect(receipt.success).toBe(true);expect(receipt.remaining_currency).toBe(80);
      expect((await caller.query("SELECT * FROM public.toggle_equip_item($1)",[receipt.inventory_id])).rows[0].is_equipped).toBe(true);
      // Unrelated inventory/economy progress does not stale educational content.
      await new ApplyService(db).apply(ownerId,proposal.request);
      expect((await connection.query('SELECT sylph FROM "User" WHERE id=$1',[ownerId])).rows[0].sylph).toBe(80);
      expect((await connection.query('SELECT amount FROM "SylphLedger" WHERE "userId"=$1 AND source=\'SHOP\'',[ownerId])).rows).toEqual([{amount:-20}]);
    } finally {await blocker.query("ROLLBACK");await caller.end();await blocker.end();}
  });

  it("changes strategy only through a new owned canonical intent and supersedes the old candidate", async () => {
    const ownerId=await student();const created=await plan(ownerId);const proposal=await prepareProposal(db,ownerId,[created.plan.id]);
    const changed=await intents.edit(ownerId,created.plan.id,0,created.intent.intentVersionId,{...created.intent.intent,policy:"MASTERY"});
    expect(changed.intent.policy).toBe("MASTERY");
    expect((await connection.query('SELECT mode,"latestDraftRevisionId" FROM "PlannerPlan" WHERE id=$1',[created.plan.id])).rows[0]).toEqual({mode:"MASTERY",latestDraftRevisionId:proposal.revisions[0].revisionId});
    expect((await new WorkspaceService(db).read(ownerId,created.plan.id)).candidate?.freshness).toBe("STALE");
    await expect(new ApplyService(db).apply(ownerId,proposal.request)).rejects.toMatchObject({detail:{code:"SUPERSEDED"}});
    await expect(db.coordinated(ownerId,sql=>sql.query('UPDATE "PlannerPlan" SET mode=\'EXAM\' WHERE id=$1',[created.plan.id]))).rejects.toThrow(/PLANNER_IDENTITY_IMMUTABLE/);
  });

  it("rejects client-minted verified research and readiness while retaining honest self reports", async () => {
    const ownerId=await student();const input={...intentFixture(),availability:availability()};
    await expect(intents.create(ownerId,randomUUID(),{...input,research:research()})).rejects.toMatchObject({detail:{code:"REFERENCE_NOT_OWNED"}});
    const evidence={evidenceId:"confidence01",scopeKeys:[input.scope[0].scopeKey],source:"SELF_REPORT",observedAt:new Date().toISOString(),reliability:"SELF_REPORTED",statement:"I feel confident in circuits",demonstratesReadiness:false};
    const created=await intents.create(ownerId,randomUUID(),{...input,evidence:[evidence]});
    await expect(intents.edit(ownerId,created.plan.id,0,created.intent.intentVersionId,{...created.intent.intent,evidence:[{...evidence,source:"CHECK_RESULT",reliability:"SUPPORTED_CHECK",demonstratesReadiness:true}]})).rejects.toMatchObject({detail:{code:"REFERENCE_NOT_OWNED"}});
    expect((await connection.query('SELECT artifact FROM "PlannerIntentVersion" WHERE "planId"=$1',[created.plan.id])).rows).toHaveLength(1);
  });

  it("preserves invalid completed legacy history as an exception while rejecting invalid unfinished adoption", async () => {
    const ownerId=await student();const goalId=(await connection.query('INSERT INTO "Goal" ("userId",title,"targetWeeks") VALUES ($1,\'Legacy completed history\',1) RETURNING id',[ownerId])).rows[0].id;
    const quest=(await connection.query('INSERT INTO "Quest" ("userId","goalId",title,status,"scheduledFor","requiredMinutes","targetMinutes","completedAt","xpReward") VALUES ($1,$2,\'Completed historical work\',\'COMPLETED\',\'\',0,45,now(),77) RETURNING *',[ownerId,goalId])).rows[0];
    await connection.query('INSERT INTO "XpLedger" ("userId",amount,source,metadata) VALUES ($1,77,\'QUEST\',$2)',[ownerId,{questId:quest.id}]);
    const service=new AdoptionService(db,true);const inventory=await service.inspect(ownerId,{goalId});
    const receipt=await service.adopt(ownerId,{key:randomUUID(),goalId,expectedLiveDigest:inventory.liveDigest,intent:{...intentFixture(),availability:availability()},review:[{questId:quest.id,purpose:"Preserve historical completion"}]});
    expect(receipt.questIds).toEqual([]);
    expect((await connection.query('SELECT * FROM "Quest" WHERE id=$1',[quest.id])).rows[0]).toEqual(quest);
    const migration=(await connection.query('SELECT "migrationEvidence" FROM "PlannerPlan" WHERE id=$1',[receipt.planId])).rows[0].migrationEvidence;
    await expect(connection.query('UPDATE "Quest" SET title=\'Rewrite historical work\' WHERE id=$1',[quest.id])).rejects.toThrow(/PLANNER_COORDINATION_REQUIRED/);
    await expect(db.coordinated(ownerId,sql=>sql.query('UPDATE "Quest" SET title=\'Rewrite historical work\' WHERE id=$1',[quest.id]))).rejects.toThrow(/PLANNER_EXECUTION_PROTECTED/);
    await expect(connection.query('SELECT public.start_study_session($1,$2,NULL,0)',[ownerId,quest.id])).rejects.toThrow(/PLANNER_/);
    expect(migration.historyOnlyQuestIds).toEqual([quest.id]);expect(migration.quality).toBe("LEGACY_UNREVIEWED");
    expect((await connection.query('SELECT amount FROM "XpLedger" WHERE "userId"=$1',[ownerId])).rows).toEqual([{amount:77}]);
    const unfinishedOwner=await student();
    const unfinishedGoal=(await connection.query('INSERT INTO "Goal" ("userId",title,"targetWeeks") VALUES ($1,\'Invalid future work\',1) RETURNING id',[unfinishedOwner])).rows[0].id;
    const unfinished=(await connection.query('INSERT INTO "Quest" ("userId","goalId",title,"scheduledFor","requiredMinutes","targetMinutes") VALUES ($1,$2,\'Unfinished work\',\'2026-10-05\',0,45) RETURNING *',[unfinishedOwner,unfinishedGoal])).rows[0];
    const invalid=await service.inspect(unfinishedOwner,{goalId:unfinishedGoal});
    await expect(service.adopt(unfinishedOwner,{key:randomUUID(),goalId:unfinishedGoal,expectedLiveDigest:invalid.liveDigest,intent:{...intentFixture(),availability:availability()},review:[{questId:unfinished.id,purpose:"Preserve future work"}]})).rejects.toMatchObject({detail:{code:"PROTECTED_EXECUTION"}});
    expect((await connection.query('SELECT * FROM "Quest" WHERE id=$1',[unfinished.id])).rows[0]).toEqual(unfinished);
    expect((await connection.query('SELECT id FROM "PlannerPlan" WHERE "userId"=$1',[unfinishedOwner])).rows).toEqual([]);
  });

});
