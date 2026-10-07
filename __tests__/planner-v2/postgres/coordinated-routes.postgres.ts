import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { connect, user } from "./database";
import { intentFixture } from "../contracts/fixtures";
import { prepareProposal } from "./proposal-fixture";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";
import { IntentService } from "@/lib/planner/v2/server/intents";
import { ApplyService } from "@/lib/planner/v2/server/apply";
import { WorkspaceService } from "@/lib/planner/v2/server/workspace";

// Authentication has its own suites. Only identity resolution is stubbed here;
// production routes/services, SQL, guards, Prisma and concurrency are real.
vi.mock("@/lib/auth-server", () => ({ getSession: async (request: Request) => {
  const owner = Number(request.headers.get("x-disposable-owner")); return owner > 0 ? { userId: owner } : null;
} }));
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client"); const { PrismaPg } = await import("@prisma/adapter-pg"); const { Pool } = await import("pg");
  const url = new URL(process.env.PLANNER_TEST_DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || !/^\/sylf_planner_phase1_[a-f0-9]{16}$/.test(url.pathname) || process.env.PLANNER_PHASE0_REQUIRED !== "true") throw new Error("Disposable runtime required");
  const pool = new Pool({ connectionString: url.toString(), max: 4 });
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool) }), getApplicationPool: () => pool };
});
vi.mock("@/lib/cache-service", () => ({ invalidateRankingsCache: vi.fn() }));
import { prisma, getApplicationPool } from "@/lib/prisma";
import { GET as readQuest, PATCH as patchQuest, DELETE as deleteQuest } from "@/app/api/quests/[id]/route";
import { POST as createQuest } from "@/app/api/quests/route";
import { POST as restDay } from "@/app/api/user/study-schedule/floating-rest-day/route";
import { POST as resetProgress } from "@/app/api/user/reset-progress/route";
import { POST as deleteAccount } from "@/app/api/user/account/delete/route";
import { GET as workspace } from "@/app/api/planner/[id]/route";
import { POST as cancelOperation } from "@/app/api/planner/[id]/operations/[key]/route";
import { AttemptService, newBudget } from "@/lib/planner/v2/server/attempts";
import { POST as claimAchievement } from "@/app/api/achievements/route";
import { executeChatTool } from "@/lib/ai/chat-tool-executor";
import { GET as readCosts } from "@/app/api/ai-costs/route";
import { GET as readAssistant,POST as assistantAction } from "@/app/api/planner/[id]/assistant/route";
import { POST as uploadDocument } from "@/app/api/planner/[id]/documents/route";
import { GET as readOperation } from "@/app/api/planner/[id]/operations/[key]/route";

let connection: Awaited<ReturnType<typeof connect>>; let db: PlannerDatabase;
beforeAll(async () => { connection = await connect(); db = new PlannerDatabase(getApplicationPool()); process.env.PLANNER_V2_DURABLE_CORE_ENABLED = "true"; });
afterAll(async () => {
  if (process.env.PLANNER_PHASE1_BROWSER_FIXTURE) {
    const fixture = await proposal();
    await db.coordinated(fixture.ownerId, sql => sql.query('UPDATE "User" SET "hasCompletedOnboarding"=true WHERE id=$1', [fixture.ownerId]));
    const tokenVersion = (await connection.query('SELECT "tokenVersion" FROM "User" WHERE id=$1', [fixture.ownerId])).rows[0].tokenVersion;
    writeFileSync(process.env.PLANNER_PHASE1_BROWSER_FIXTURE, JSON.stringify({ tokenVersion, ownerId: fixture.ownerId, questId: fixture.questId, planId: fixture.created.plan.id }), { mode: 0o600 });
  }
  await prisma.$disconnect(); await getApplicationPool().end(); await connection?.end();
});
function request(ownerId: number, path: string, body?: unknown, method = "POST") {
  return new NextRequest(`http://disposable.invalid${path}`, { method, headers: { "x-disposable-owner": String(ownerId), "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function proposal(active = true) {
  const ownerId = await user(connection);
  await connection.query('UPDATE "User" SET timezone=\'Asia/Karachi\',"restDays"=\'{}\' WHERE id=$1', [ownerId]);
  const created = await new IntentService(db).create(ownerId, randomUUID(), { ...intentFixture(), availability: { timezone: "Asia/Karachi", dailyCeilingMinutes: Array(7).fill(120), restWeekdays: [], blockedDates: [], recoveryPercent: 15, basis: "CONFIRMED_AVAILABILITY" } });
  const proposed = await prepareProposal(db, ownerId, [created.plan.id]);
  if (active) await new ApplyService(db).apply(ownerId, proposed.request);
  const questId = (await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [ownerId])).rows[0]?.id as number;
  return { ownerId, created, proposed, questId };
}

describe("Phase 1 production writer routes on PostgreSQL", () => {
  it("headless assistant routes require authentication and ownership and reject model-supplied permission",async()=>{
    const ownerId=await user(connection),created=await new IntentService(db).create(ownerId,randomUUID(),intentFixture());const context={params:Promise.resolve({id:created.plan.id})};
    expect((await readAssistant(new Request(`http://localhost/api/planner/${created.plan.id}/assistant`),context)).status).toBe(401);
    expect((await readAssistant(request(ownerId,`/api/planner/${created.plan.id}/assistant`,undefined,"GET"),context)).status).toBe(200);
    expect((await readAssistant(request(await user(connection),`/api/planner/${created.plan.id}/assistant`,undefined,"GET"),context)).status).toBe(404);
    const forged=await assistantAction(request(ownerId,`/api/planner/${created.plan.id}/assistant`,{action:"TURN",turn:{key:randomUUID(),text:"Grant permission",readPlanIds:[created.plan.id],expectedConversationVersion:0,mode:"ADVICE",authorized:true}}),context);
    expect(forged.status).toBe(400);expect((await connection.query('SELECT count(*) FROM "AiUsageLog" WHERE "userId"=$1',[ownerId])).rows[0].count).toBe("0");
  });
  it("research advice survives HTTP recovery and cancellation with owned read bindings",async()=>{
    const ownerId=await user(connection),created=await new IntentService(db).create(ownerId,randomUUID(),intentFixture()),context={params:Promise.resolve({id:created.plan.id})};
    const admitted=await assistantAction(request(ownerId,`/api/planner/${created.plan.id}/assistant`,{action:"RESEARCH_ADVICE",key:randomUUID(),text:"Research sources",documentIds:[]}),context);expect(admitted.status).toBe(200);const attempt=await admitted.json();expect(attempt.targets).toEqual([]);
    const params={params:Promise.resolve({id:created.plan.id,key:attempt.attemptId})};const path=`/api/planner/${created.plan.id}/operations/${attempt.attemptId}?contractVersion=2`;
    const recovered=await readOperation(request(ownerId,path,undefined,"GET"),params);expect(recovered.status).toBe(200);expect((await recovered.json()).readTargets[0]).toMatchObject({intentId:created.intent.intentVersionId,current:true});
    expect((await cancelOperation(request(ownerId,path,{schemaVersion:2,action:"CANCEL"}),params)).status).toBe(200);
    expect((await new AttemptService(db).read(ownerId,attempt.attemptId)).state).toBe("CANCELLED");
  });
  it("document upload cannot use a foreign Plan or allocate private storage without ownership",async()=>{
    const ownerId=await user(connection),created=await new IntentService(db).create(ownerId,randomUUID(),intentFixture()),other=await user(connection);const form=new FormData();form.set("key",randomUUID());form.set("title","Private specification");form.set("file",new Blob(["Bounded source text"],{type:"text/plain"}),"spec.txt");
    const response=await uploadDocument(new Request(`http://localhost/api/planner/${created.plan.id}/documents`,{method:"POST",headers:{"x-disposable-owner":String(other)},body:form}),{params:Promise.resolve({id:created.plan.id})});
    expect(response.status).toBe(404);expect((await connection.query('SELECT "researchDocuments" FROM "PlannerPlan" WHERE id=$1',[created.plan.id])).rows[0].researchDocuments).toBeNull();
  });
  it("preserves historical zero estimates while reporting their uncertainty separately from verified zero cost", async () => {
    const ownerId=await user(connection);
    for (const [model,cost,receipt] of [["legacy-zero",0,null],["verified-zero",0,randomUUID()],["unknown-price",null,randomUUID()],["known-price",0.25,null]] as const)
      await connection.query('INSERT INTO "AiUsageLog" ("userId",feature,provider,model,"estimatedCostUsd","requestId") VALUES ($1,\'planner\',\'fixture\',$2,$3,$4)',[ownerId,model,cost,receipt]);
    const before=(await connection.query('SELECT * FROM "AiUsageLog" WHERE "userId"=$1 ORDER BY id',[ownerId])).rows;
    const response=await readCosts(request(ownerId,"/api/ai-costs",undefined,"GET"));
    expect(response.status).toBe(200);
    const costs=(await response.json()).last7Days;
    expect(costs).toMatchObject({totalRequests:4,costUsd:0.25,unknownCostRequests:2,costComplete:false});
    expect(costs.byModel.find((row:{model:string})=>row.model==="verified-zero")).toMatchObject({costUsd:0,unknownCostRequests:0});
    expect(costs.byModel.find((row:{model:string})=>row.model==="legacy-zero")).toMatchObject({costUsd:0,unknownCostRequests:1});
    expect((await connection.query('SELECT * FROM "AiUsageLog" WHERE "userId"=$1 ORDER BY id',[ownerId])).rows).toEqual(before);
  });
  it("blocks old-client edits, completion and deletion of adopted work without side effects", async () => {
    const fixture = await proposal(); const params = { params: Promise.resolve({ id: String(fixture.questId) }) };
    const before = (await connection.query('SELECT * FROM "Quest" WHERE id=$1', [fixture.questId])).rows[0];
    for (const body of [{ status: "COMPLETED" }, { title: "Changed behind review" }, { requiredMinutes: 60 }, { elapsedSeconds: 1000 }]) {
      expect((await patchQuest(request(fixture.ownerId, "/api/quests/1", body, "PATCH"), params)).status).toBe(409);
    }
    expect((await deleteQuest(request(fixture.ownerId, "/api/quests/1", undefined, "DELETE"), params)).status).toBe(409);
    expect((await connection.query('SELECT * FROM "Quest" WHERE id=$1', [fixture.questId])).rows[0]).toEqual(before);
    const chat = await executeChatTool("updateQuest", { questId: fixture.questId, description: "Chat bypass" }, fixture.ownerId);
    expect(chat.error).toContain("PLANNER_REVIEW_REQUIRED");
  });
  it("settles explicit generic Quest completion once across duplicate requests", async () => {
    const fixture = await proposal(); const params = { params: Promise.resolve({ id: String(fixture.questId) }) };
    const version = (await connection.query('SELECT "executionVersion" FROM "Quest" WHERE id=$1', [fixture.questId])).rows[0].executionVersion;
    const body = { status: "COMPLETED", executionProtocol: 2, expectedExecutionVersion: version };
    const responses = await Promise.all([patchQuest(request(fixture.ownerId, "/api/quests/1", body, "PATCH"), params), patchQuest(request(fixture.ownerId, "/api/quests/1", body, "PATCH"), params)]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    const quest = (await connection.query('SELECT status,"remainingDisposition","remainingMinutesEstimate","completedAt" FROM "Quest" WHERE id=$1', [fixture.questId])).rows[0];
    expect(quest.status).toBe("COMPLETED"); expect(quest.remainingMinutesEstimate).toBe(0); expect(quest.completedAt).toBeTruthy();
    expect((await connection.query('SELECT id FROM "XpLedger" WHERE "userId"=$1 AND source=\'QUEST\'', [fixture.ownerId])).rows).toHaveLength(1);
    expect((await connection.query('SELECT id FROM "StudySession" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(0);
  });
  it("makes duplicate desired rest-day writes harmless without moving sealed Planner work", async () => {
    const fixture = await proposal(); const date = fixture.proposed.revisions[0].executable[0].placement.date;
    const responses = await Promise.all([restDay(request(fixture.ownerId, "/api/user/study-schedule/floating-rest-day", { dateKey: date, enabled: true })), restDay(request(fixture.ownerId, "/api/user/study-schedule/floating-rest-day", { dateKey: date, enabled: true }))]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect((await connection.query('SELECT id FROM "FloatingRestDay" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(1);
    expect((await connection.query('SELECT "scheduledFor" FROM "Quest" WHERE id=$1', [fixture.questId])).rows[0].scheduledFor).toBe(date);
    expect((await new WorkspaceService(db).read(fixture.ownerId, fixture.created.plan.id)).scheduleHealth).toBe("UPDATE_SUGGESTED");
    const read = await workspace(request(fixture.ownerId, `/api/planner/${fixture.created.plan.id}?contractVersion=2`, undefined, "GET"), { params: Promise.resolve({ id: fixture.created.plan.id }) });
    expect(read.status).toBe(200); expect((await read.json()).active.revisionId).toBe(fixture.proposed.revisions[0].revisionId);
  });
  it("rechecks actual calendar work added through the generic Quest route before apply", async () => {
    const fixture = await proposal(false);
    const created = await createQuest(request(fixture.ownerId, "/api/quests", { title: "School assignment", targetMinutes: 120, scheduledFor: fixture.proposed.revisions[0].executable[0].placement.date }));
    expect(created.status).toBe(201);
    await expect(new ApplyService(db).apply(fixture.ownerId, fixture.proposed.request)).rejects.toMatchObject({ detail: { code: "SCHEDULE_CONFLICT" } });
    expect((await connection.query('SELECT id FROM "Goal" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(0);
    expect((await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(1);
    expect((await new WorkspaceService(db).read(fixture.ownerId, fixture.created.plan.id)).candidate?.freshness).toBe("STALE");
  });
  it("blocks a reset of linked execution without consuming its security code", async () => {
    const fixture = await proposal();
    const token = (await connection.query('INSERT INTO "VerificationToken" ("userId",token,"expiresAt") VALUES ($1,\'RESET_PROGRESS:123456\',clock_timestamp()+interval \'5 minutes\') RETURNING id', [fixture.ownerId])).rows[0];
    expect((await resetProgress(request(fixture.ownerId, "/api/user/reset-progress", { code: "123456" }))).status).toBe(409);
    expect((await connection.query('SELECT id FROM "VerificationToken" WHERE id=$1', [token.id])).rows).toHaveLength(1);
    expect((await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(1);
  });
  it("returns derived remaining work to the shared Focus client without rewriting the approved timebox", async () => {
    const fixture = await proposal(); const service = new (await import("@/lib/planner/v2/server/sessions")).SessionService(db);
    const started = await service.start(fixture.ownerId, fixture.questId);
    await service.transition(fixture.ownerId, { schemaVersion: 2, sessionId: started.sessionId, expectedExecutionVersion: started.executionVersion,
      idempotencyKey: randomUUID(), action: "PAUSE", cumulativeFocusSeconds: 5, cumulativeBreakSeconds: 0 });
    const response = await readQuest(request(fixture.ownerId, "/api/quests/1", undefined, "GET"), { params: Promise.resolve({ id: String(fixture.questId) }) });
    const value = await response.json();
    const stored = (await connection.query('SELECT "plannedMinutes","remainingMinutesEstimate","elapsedSeconds" FROM "Quest" WHERE id=$1', [fixture.questId])).rows[0];
    expect(response.status).toBe(200); expect(value.plannedMinutes).toBe(stored.plannedMinutes);
    expect(value.remainingMinutesEstimate).toBe(Math.max(1, Math.ceil(stored.remainingMinutesEstimate - stored.elapsedSeconds / 60)));
    expect(value.plannerSpec.content.completionCriterion).toBeTruthy(); expect(value.requiresReestimate).toBe(false);
  });
  it("resets ordinary legacy progression atomically, including mirrors and ledger, and consumes the OTP once", async () => {
    const ownerId = await user(connection);
    await connection.query('UPDATE "User" SET level=7,"currentXP"=90,"totalStudySeconds"=120 WHERE id=$1', [ownerId]);
    await connection.query('INSERT INTO "UserStats" ("userId",level,xp,rank,"updatedAt") VALUES ($1,7,2000,\'RANK E\',now())', [ownerId]);
    await connection.query('INSERT INTO "XpLedger" ("userId",amount,source) VALUES ($1,2000,\'TIMER\')', [ownerId]);
    await connection.query('INSERT INTO "VerificationToken" ("userId",token,"expiresAt") VALUES ($1,\'RESET_PROGRESS:543210\',clock_timestamp()+interval \'5 minutes\')', [ownerId]);
    const response = await resetProgress(request(ownerId, "/api/user/reset-progress", { code: "543210" }));
    expect(response.status).toBe(200);
    expect((await connection.query('SELECT level,xp,rank FROM "UserStats" WHERE "userId"=$1', [ownerId])).rows[0]).toEqual({ level: 1, xp: 0, rank: "RANK E" });
    expect((await connection.query('SELECT level,"currentXP","totalStudySeconds" FROM "User" WHERE id=$1', [ownerId])).rows[0]).toEqual({ level: 1, currentXP: 0, totalStudySeconds: 0 });
    expect((await connection.query('SELECT id FROM "XpLedger" WHERE "userId"=$1', [ownerId])).rows).toHaveLength(0);
    expect((await resetProgress(request(ownerId, "/api/user/reset-progress", { code: "543210" }))).status).toBe(400);
  });
  it("uses fresh coordinated achievement eligibility and credits duplicate claims only once", async () => {
    const fixture = await proposal();
    await db.coordinated(fixture.ownerId, sql => sql.query('UPDATE "User" SET "totalStudyMinutes"=60,"totalStudySeconds"=3600 WHERE id=$1', [fixture.ownerId]));
    const responses = await Promise.all([claimAchievement(request(fixture.ownerId, "/api/achievements", { achievementId: "study_1_hour" })), claimAchievement(request(fixture.ownerId, "/api/achievements", { achievementId: "study_1_hour" }))]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 400]);
    expect((await connection.query('SELECT id FROM "UserAchievement" WHERE "userId"=$1 AND "achievementId"=\'study_1_hour\'', [fixture.ownerId])).rows).toHaveLength(1);
    expect((await connection.query('SELECT id FROM "SylphLedger" WHERE "userId"=$1 AND source=\'ACHIEVEMENT\'', [fixture.ownerId])).rows).toHaveLength(1);
  });
  it("erases historical party participation and Planner state through the actual account route", async () => {
    const fixture = await proposal();
    const party = (await connection.query('SELECT public.create_focus_party($1,\'Disposal fixture\') AS result', [fixture.ownerId])).rows[0].result;
    const joined = (await connection.query('SELECT public.enter_focus_session($1,$2) AS result', [party.partyId, fixture.ownerId])).rows[0].result;
    await connection.query('SELECT public.leave_focus_session($1,$2)', [joined.sessionId, fixture.ownerId]);
    await connection.query('INSERT INTO "VerificationToken" ("userId",token,"expiresAt") VALUES ($1,\'DELETE_ACCOUNT:123456\',clock_timestamp()+interval \'5 minutes\')', [fixture.ownerId]);
    const errors: string[] = [];
    const diagnostic = vi.spyOn(console, "error").mockImplementation((...values) => { errors.push(values.map(String).join(" ")); });
    let erased: Response;
    try { erased = await deleteAccount(request(fixture.ownerId, "/api/user/account/delete", { code: "123456" })); }
    finally { diagnostic.mockRestore(); }
    expect(erased.status, errors.join("\n")).toBe(200);
    expect((await connection.query('SELECT id FROM "User" WHERE id=$1', [fixture.ownerId])).rows).toHaveLength(0);
    expect((await connection.query('SELECT id FROM "PlannerPlan" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(0);
    expect((await connection.query('SELECT id FROM "FocusSessionMember" WHERE "userId"=$1', [fixture.ownerId])).rows).toHaveLength(0);
  });
  it("keeps owned recovery reads, cancellation and execution protection available when admission is disabled", async () => {
    const fixture=await proposal();
    const plan=(await connection.query('SELECT version,"workingIntentVersionId","activeRevisionId" FROM "PlannerPlan" WHERE id=$1',[fixture.created.plan.id])).rows[0];
    const attempt=await new AttemptService(db).enqueue(fixture.ownerId,{key:randomUUID(),text:"Update later",kind:"REPLAN",budget:newBudget("CALENDAR_ONLY"),targets:[{planId:fixture.created.plan.id,intentId:plan.workingIntentVersionId,planningVersion:plan.version,baseRevisionId:plan.activeRevisionId}]});
    process.env.PLANNER_V2_DURABLE_CORE_ENABLED="false";
    try {
      const response=await workspace(request(fixture.ownerId,`/api/planner/${fixture.created.plan.id}?contractVersion=2`,undefined,"GET"),{params:Promise.resolve({id:fixture.created.plan.id})});
      expect(response.status).toBe(200);expect((await response.json()).attempt.attemptId).toBe(attempt.attemptId);
      const cancelled=await cancelOperation(request(fixture.ownerId,`/api/planner/${fixture.created.plan.id}/operations/${attempt.attemptId}?contractVersion=2`,{schemaVersion:2,action:"CANCEL"}),{params:Promise.resolve({id:fixture.created.plan.id,key:attempt.attemptId})});
      expect(cancelled.status).toBe(200);expect((await cancelled.json()).state).toBe("CANCELLED");
      const oldRead=await workspace(request(fixture.ownerId,`/api/planner/${fixture.created.plan.id}`,undefined,"GET"),{params:Promise.resolve({id:fixture.created.plan.id})});expect(oldRead.status).toBe(409);
      expect((await patchQuest(request(fixture.ownerId,"/api/quests/1",{requiredMinutes:60},"PATCH"),{params:Promise.resolve({id:String(fixture.questId)})})).status).toBe(409);
    } finally {process.env.PLANNER_V2_DURABLE_CORE_ENABLED="true";}
  });

});
