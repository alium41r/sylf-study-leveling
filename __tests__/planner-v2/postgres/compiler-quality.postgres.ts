import { beforeAll, afterAll, afterEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { connect, user } from "./database";
import { intentFixture, blueprintFixture } from "../contracts/fixtures";
import { PlannerDatabase, DurablePlannerError } from "@/lib/planner/v2/server/database";
import { IntentService, ownedPlan } from "@/lib/planner/v2/server/intents";
import { AttemptService, newBudget, loadAttempt, persistAttempt } from "@/lib/planner/v2/server/attempts";
import { PlannerCompilerService } from "@/lib/planner/v2/server/compiler";
import { createCompilerHandlers } from "@/lib/planner/v2/server/compiler";
import { PlannerWorker } from "@/lib/planner/v2/server/worker";
import { ResearchService } from "@/lib/planner/v2/server/research";
import { ApplyService } from "@/lib/planner/v2/server/apply";
import { SessionService } from "@/lib/planner/v2/server/sessions";
import { loadExecutionContext } from "@/lib/planner/v2/server/context";
import { prepareProposal } from "./proposal-fixture";
import { assessment,text } from "../intelligence/research-fixtures";
import { RevisionService } from "@/lib/planner/v2/server/revisions";
import { CompilerCheckpointSchema } from "@/lib/planner/v2/intelligence/schemas/checkpoint";
import type { CompilerCheckpoint } from "@/lib/planner/v2/intelligence/schemas/checkpoint";
import { PlannerRevisionV2Schema } from "@/lib/planner/v2/contracts";
import type { LLMAdapter } from "@/lib/ai/providers/types";

let connection: pg.Client, pool: pg.Pool, db: PlannerDatabase, attempts: AttemptService;
const owners: number[] = [];
beforeAll(async () => { connection = await connect(); pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 6 }); db = new PlannerDatabase(pool); attempts = new AttemptService(db); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const owner of owners.splice(0)) for (const row of (await connection.query('SELECT id FROM "PlannerAttempt" WHERE "userId"=$1 AND state IN (\'QUEUED\',\'RUNNING\',\'NEEDS_DECISION\')', [owner])).rows) await attempts.cancel(owner, row.id); });
afterAll(async () => { await pool.end(); await connection.end(); });
async function fixture(count = 1, daily = 120) {
  const ownerId = await user(connection); owners.push(ownerId);
  await connection.query('UPDATE "User" SET timezone=\'Asia/Karachi\',"restDays"=\'{}\' WHERE id=$1', [ownerId]);
  const intents = new IntentService(db), created = [];
  for (let i = 0; i < count; i++) created.push(await intents.create(ownerId, randomUUID(), { ...intentFixture(), assessment, deadline: { kind: "NONE" },
    availability: { timezone: "Asia/Karachi", dailyCeilingMinutes: Array(7).fill(daily), weeklyCeilingMinutes: daily * 7, restWeekdays: [], blockedDates: [], recoveryPercent: 0, basis: "CONFIRMED_AVAILABILITY" } }));
  return { ownerId, created, intents };
}
async function queue(f: Awaited<ReturnType<typeof fixture>>) {
  const targets = [];
  for (const c of f.created) { const p = await db.coordinated(f.ownerId, sql => ownedPlan(sql, f.ownerId, c.plan.id)); targets.push({ planId: p.id, intentId: p.workingIntentVersionId!, planningVersion: p.version, baseRevisionId: p.activeRevisionId }); }
  const attempt = await attempts.enqueue(f.ownerId, { key: randomUUID(), text: "Prepare the selected study plan", kind: targets.length === 2 ? "JOINT" : "PLAN", targets, budget: newBudget("EDUCATIONAL") });
  const token = await attempts.claim(`quality_${randomUUID()}`, [attempt.kind]); if (!token || token.attemptId !== attempt.attemptId) throw new Error("Fixture admission was not isolated"); return { attempt, token };
}
function proposal(input: ReturnType<typeof JSON.parse>, repaired = false, minutes = 30) {
  return { decision: "REVISE", detail: { days: 14, checkpoint: "Choose the circuit method independently" }, tradeOffExplanation: "Target the accepted method weakness without adding repetition",
    plans: input.plans.map((p: { planRef: string; policy: "EXAM"; allowlist: { scopeRefs: string[]; excludedScopeRefs: string[] } }, i: number) => {
      const b = blueprintFixture(); b.strategy.policy = p.policy; b.strategy.phases = [];
      b.scope = p.allowlist.scopeRefs.map(ref => ({ scopeRef: ref, disposition: p.allowlist.excludedScopeRefs.includes(ref) ? "EXCLUDED" : "INCLUDED", contribution: "Supports independent method selection", ...(p.allowlist.excludedScopeRefs.includes(ref) ? { reason: "Keep explicit exclusion" } : {}) }));
      b.activities = [{ ...b.activities[0], localId: `method_${i + 1}`, outcomeRefs: [], scopeRefs: p.allowlist.scopeRefs.filter(ref => !p.allowlist.excludedScopeRefs.includes(ref)).slice(0,1),
        timeboxMinutes: minutes, effort: { lowMinutes: minutes, likelyMinutes: minutes, highMinutes: minutes }, instructions: `Solve the target ${i + 1} circuit and explain the method.`,
        completionCriterion: repaired ? "Choose and apply the circuit law independently, then correct each method error." : "State the relevant law." }];
      return { planRef: p.planRef, blueprint: b };
    }), sharedDependencies: [] as Extract<CompilerCheckpoint["payload"], {stage:"ALLOCATION"}>["blueprints"]["sharedDependencies"] };
}
function reviewed(input: ReturnType<typeof JSON.parse>, blocking = false, preference = false) {
  return { plans: input.goals.map((g: { planRef: string }, i: number) => ({ planRef: g.planRef, issues: blocking ? [{ issueId: `criterion_${i + 1}`, category: "WEAK_CRITERION", severity: "BLOCKING", affectedRefs: [`method_${i + 1}`], basis: preference ? "PREFERENCE" : "CONCRETE_VIOLATION",
    grounds: [{ ref: `${g.planRef}/goal`, excerpt: "Solve electricity questions confidently" }, { ref: `${g.planRef}/activity/method_${i + 1}`, excerpt: "State the relevant law." }],
    evidence: preference ? "Needs more practice" : "A recall-only criterion does not demonstrate the requested problem solving",
    consequence: "The student may stop without being able to choose and apply the circuit method", requestedResolution: "Verify independent method choice and application", requiresAcknowledgement: false }] : [] })) };
}
function verified(input: ReturnType<typeof JSON.parse>, result = "RESOLVED") {
  return { plans: input.goals.map((g: { planRef: string }, i: number) => ({ planRef: g.planRef,
    resolutions: input.repairIssueIds.filter((id: string) => id === `criterion_${i + 1}`).map((issueId: string) => ({ issueId, result,
      explanation: result === "RESOLVED" ? "The repaired criterion checks independent application in the actual allocated activity" : "The criterion still does not test independent application",
      grounds: [{ ref: `${g.planRef}/activity/method_${i + 1}`, excerpt: input.proposal.blueprints.plans[i].blueprint.activities[0].completionCriterion }] })), newIssues: [] })) };
}
const signal = () => new AbortController().signal;
function compiler(reply: (input: ReturnType<typeof JSON.parse>, n: number) => unknown | Promise<unknown> = input => input.stage === "REVIEW" ? reviewed(input) : proposal(input)) {
  let calls = 0;
  const service = new PlannerCompilerService(attempts, { provider: { adapter: () => ({ generateResponse: async messages => {
    const input = JSON.parse(messages[0].content!), value = await reply(input, ++calls);
    return { text: JSON.stringify(value), finishReason: "STOP" as const, usage: { promptTokens: 150, completionTokens: 100, totalTokens: 250 } };
  } }) as LLMAdapter } }); return { service, calls: () => calls };
}
async function stored(q: Awaited<ReturnType<typeof queue>>) { return db.coordinated(q.attempt.ownerId, sql => loadAttempt(sql, q.attempt.ownerId, q.attempt.attemptId)); }
async function candidates(ownerId: number) { return Number((await connection.query('SELECT count(*) FROM "PlannerRevision" r JOIN "PlannerPlan" p ON p.id=r."planId" WHERE p."userId"=$1', [ownerId])).rows[0].count); }

it("seals a known-scope candidate after independent review with two calls and no execution writes", async () => {
  const f = await fixture(), q = await queue(f), c = compiler(); await c.service.run(q.token, signal());
  const { attempt, payload } = await stored(q); expect(attempt).toMatchObject({ state: "SUCCEEDED", stage: "PERSISTENCE", result: { kind: "REVISIONS" }, applyReceipt: null });
  expect(attempt.budget.consumed).toMatchObject({ modelCalls: 2, planningCalls: 2 }); expect(c.calls()).toBe(2); expect(await candidates(f.ownerId)).toBe(1);
  expect((await connection.query('SELECT count(*) FROM "Quest" WHERE "userId"=$1', [f.ownerId])).rows[0].count).toBe("0");
  expect((await connection.query('SELECT count(*) FROM "Goal" WHERE "userId"=$1', [f.ownerId])).rows[0].count).toBe("0");
  expect(payload.providerGuard?.reviewCompleted).toBe(true); expect(CompilerCheckpointSchema.parse(payload.checkpoint).payload.stage).toBe("REVIEW");
  await c.service.run(q.token, signal()); expect(c.calls()).toBe(2); expect(await candidates(f.ownerId)).toBe(1);
});
it("one named repair is independently verified on its actual new allocation before sealing", async () => {
  const f = await fixture(), q = await queue(f), c = compiler(input => input.stage === "REVIEW" ? reviewed(input, true) : input.stage === "REPAIR" ? proposal(input, true, 20) : input.stage === "VERIFICATION" ? verified(input) : proposal(input));
  await c.service.run(q.token, signal()); const { attempt, payload } = await stored(q), checkpoint = CompilerCheckpointSchema.parse(payload.checkpoint);
  expect(attempt.state).toBe("SUCCEEDED"); expect(c.calls()).toBe(4); expect(checkpoint).toMatchObject({ repairs: 1, repairIssueIds: ["criterion_1"], payload: { stage: "VERIFICATION", reviewSupport: { phase: "VERIFIED" } } });
  if (!("quality" in checkpoint.payload)) throw new Error(); expect(checkpoint.payload.quality[0].report).toMatchObject({ status: "PASSED", issues: [{ issueId: "criterion_1", resolution: "REPAIRED", verification: { result: "RESOLVED" } }] });
  expect(checkpoint.payload.allocation.report.placements[0].minutes).toBe(20); expect(payload.providerGuard?.verificationReserve).toBeUndefined();
});
it("vague more-practice preference cannot add workload, trigger repair or block a candidate", async () => {
  const f = await fixture(), q = await queue(f), c = compiler(input => input.stage === "REVIEW" ? reviewed(input, true, true) : proposal(input));
  await c.service.run(q.token, signal()); const { attempt, payload } = await stored(q), checkpoint = CompilerCheckpointSchema.parse(payload.checkpoint);
  expect(attempt.state).toBe("SUCCEEDED"); expect(c.calls()).toBe(2); expect(checkpoint.repairs).toBe(0);
  if (!("quality" in checkpoint.payload)) throw new Error(); expect(checkpoint.payload.quality[0].report.issues[0].severity).toBe("ADVISORY"); expect(checkpoint.payload.allocation.report.committedMinutes).toBe(30);
});
it("an unresolved exact verification remains unconfirmable with no second repair", async () => {
  const f = await fixture(), q = await queue(f), c = compiler(input => input.stage === "REVIEW" ? reviewed(input, true) : input.stage === "REPAIR" ? proposal(input, true) : input.stage === "VERIFICATION" ? verified(input, "UNRESOLVED") : proposal(input));
  await expect(c.service.run(q.token, signal())).rejects.toMatchObject({ detail: { code: "QUALITY_BLOCKED", stage: "VERIFICATION" } });
  expect(await candidates(f.ownerId)).toBe(0); const before = c.calls(); await expect(c.service.run(q.token, signal())).rejects.toMatchObject({ detail: { code: "QUALITY_BLOCKED" } }); expect(c.calls()).toBe(before);
});
it("a review outage preserves a readable pending review and never silently publishes", async () => {
  const f = await fixture(), q = await queue(f), c = compiler(input => input.stage === "REVIEW" ? { unavailable: true } : proposal(input));
  await expect(c.service.run(q.token, signal())).rejects.toThrow(); const { payload } = await stored(q), checkpoint = CompilerCheckpointSchema.parse(payload.checkpoint);
  expect(checkpoint.payload.stage).toBe("REVIEW"); if (!("quality" in checkpoint.payload)) throw new Error(); expect(checkpoint.payload.quality[0].report.status).toBe("INCOMPLETE"); expect(await candidates(f.ownerId)).toBe(0);
});
it("insufficient repair plus verification allowance leaves the blocked review intact", async () => {
  const f = await fixture(), q = await queue(f), c = compiler(async input => {
    if (input.stage === "REVIEW") { await attempts.mutate(q.token, async (sql, attempt, payload) => { const budget = structuredClone(attempt.budget); budget.consumed.modelCalls = 5; budget.consumed.planningCalls = 4; const { persistAttempt } = await import("@/lib/planner/v2/server/attempts"); await persistAttempt(sql, attempt, { ...attempt, budget }, payload); }); return reviewed(input, true); }
    return proposal(input);
  });
  await expect(c.service.run(q.token, signal())).rejects.toMatchObject({ detail: { code: "BUDGET_EXHAUSTED" } });
  const checkpoint = CompilerCheckpointSchema.parse((await stored(q)).payload.checkpoint); expect(checkpoint.repairs).toBe(0); expect(checkpoint.payload.stage).toBe("REVIEW"); expect(c.calls()).toBe(2); expect(await candidates(f.ownerId)).toBe(0);
});
it("takeover resumes a cleared review without model calls or deadline renewal", async () => {
  const f = await fixture(), q = await queue(f), c = compiler(); const spy = vi.spyOn(RevisionService.prototype, "publish").mockRejectedValueOnce(new Error("Crash before atomic publication"));
  await expect(c.service.run(q.token, signal())).rejects.toThrow(/Crash/); const deadline = (await stored(q)).attempt.budget.executionDeadlineAt; spy.mockRestore();
  await attempts.release(q.token); const next = await attempts.claim(`takeover_${randomUUID()}`, ["PLAN"]); await c.service.run(next!, signal());
  expect(c.calls()).toBe(2); expect((await stored(q)).attempt.budget.executionDeadlineAt).toBe(deadline); expect(await candidates(f.ownerId)).toBe(1);
});
it("takeover uses an accepted saved repair instead of repeating the repair call", async () => {
  const f = await fixture(), q = await queue(f), c = compiler(input => input.stage === "REVIEW" ? reviewed(input, true) : input.stage === "REPAIR" ? proposal(input, true) : input.stage === "VERIFICATION" ? verified(input) : proposal(input));
  const save = c.service.learning.saveCheckpoint.bind(c.service.learning); let crashed = false;
  vi.spyOn(c.service.learning, "saveCheckpoint").mockImplementation(async (...args) => { const checkpoint = await save(...args); if (!crashed && "reviewSupport" in checkpoint.payload && checkpoint.payload.reviewSupport?.phase === "REPAIR_ACCEPTED") { crashed = true; throw new Error("Crash after saved repair"); } return checkpoint; });
  await expect(c.service.run(q.token, signal())).rejects.toThrow(/Crash/); expect(c.calls()).toBe(3); await attempts.release(q.token);
  const next = await attempts.claim(`takeover_${randomUUID()}`, ["PLAN"]); await c.service.run(next!, signal()); expect(c.calls()).toBe(4); expect(await candidates(f.ownerId)).toBe(1);
});
it("takeover cannot repeat a dispatched repair whose accepted response was lost", async () => {
  const f = await fixture(), q = await queue(f), c = compiler(input => input.stage === "REVIEW" ? reviewed(input, true) : input.stage === "REPAIR" ? { invalid: true } : proposal(input));
  await expect(c.service.run(q.token, signal())).rejects.toThrow(); const before = c.calls(); await attempts.release(q.token);
  const next = await attempts.claim(`takeover_${randomUUID()}`, ["PLAN"]); await expect(c.service.run(next!, signal())).rejects.toThrow(/cannot repeat|cannot be repeated/); expect(c.calls()).toBe(before); expect(await candidates(f.ownerId)).toBe(0);
});
it("cancellation and changed calendar reject a late review before sealing", async () => {
  for (const cancel of [true, false]) {
    const f = await fixture(), q = await queue(f), c = compiler(async input => { if (input.stage === "REVIEW") { if (cancel) await attempts.cancel(f.ownerId, q.attempt.attemptId); else await db.coordinated(f.ownerId, sql => sql.query('UPDATE "User" SET "restDays"=\'{1}\' WHERE id=$1', [f.ownerId])); return reviewed(input); } return proposal(input); });
    await expect(c.service.run(q.token, signal())).rejects.toMatchObject({ detail: { code: cancel ? "LEASE_EXPIRED" : "STALE_CONTEXT" } }); expect(await candidates(f.ownerId)).toBe(0);
  }
});
it("joint publication seals both reviewed targets atomically and duplicates no prerequisite", async () => {
  const f = await fixture(2), q = await queue(f), c = compiler(input => { if (input.stage === "REVIEW") return reviewed(input); const p = proposal(input); p.sharedDependencies = [{ prerequisite: { planRef: "plan_1", activityId: "method_1" }, dependent: { planRef: "plan_2", activityId: "method_2" }, strength: "HARD", reason: "One method prerequisite supports the second goal" }]; return p; });
  await c.service.run(q.token, signal()); const { attempt, payload } = await stored(q); expect(attempt.result).toMatchObject({ kind: "REVISIONS" }); expect(await candidates(f.ownerId)).toBe(2);
  const rows = (await connection.query('SELECT r."v2Artifact" FROM "PlannerRevision" r JOIN "PlannerPlan" p ON p.id=r."planId" WHERE p."userId"=$1', [f.ownerId])).rows;
  const dependent = rows.find(r => r.v2Artifact.context.externalActivityDependencies.length)!.v2Artifact;
  expect(dependent.executable[0].content.hardDependencies).toHaveLength(1); expect(payload.changeSet).toMatchObject({ aggregate: { committedTargetMinutes: 60 }, applyReceipt: null });
});
it("tampered reviewed allocation/checkpoint cannot publish", async () => {
  const f = await fixture(), q = await queue(f), c = compiler(); const spy = vi.spyOn(RevisionService.prototype, "publish").mockRejectedValueOnce(new Error("Pause before sealing"));
  await expect(c.service.run(q.token, signal())).rejects.toThrow(); spy.mockRestore();
  await attempts.mutate(q.token, async (sql, attempt, payload) => { const checkpoint = CompilerCheckpointSchema.parse(payload.checkpoint); if (!("allocation" in checkpoint.payload)) throw new Error(); const placement=checkpoint.payload.allocation.report.placements[0]; placement.date = new Date(Date.parse(placement.date)+86400000).toISOString().slice(0,10);
    const { persistAttempt } = await import("@/lib/planner/v2/server/attempts"); await persistAttempt(sql, attempt, attempt, { ...payload, checkpoint }); });
  await expect(c.service.run(q.token, signal())).rejects.toMatchObject({ detail: { code: "STALE_CONTEXT" } }); expect(await candidates(f.ownerId)).toBe(0);
});



async function retry(f:Awaited<ReturnType<typeof fixture>>,parentId:string){
 vi.stubEnv("SYLF_UNLIMITED_AI_USER_IDS",String(f.ownerId));
 const targets=[];for(const c of f.created){const p=await db.coordinated(f.ownerId,sql=>ownedPlan(sql,f.ownerId,c.plan.id));targets.push({planId:p.id,intentId:p.workingIntentVersionId!,planningVersion:p.version,baseRevisionId:p.activeRevisionId});}
 const attempt=await attempts.enqueue(f.ownerId,{key:randomUUID(),text:'Retry the retained quality checkpoint',kind:targets.length===2?'JOINT':'PLAN',targets,budget:newBudget('EDUCATIONAL'),parentAttemptId:parentId});
 const token=await attempts.claim(`linked_${randomUUID()}`,[attempt.kind]);return {attempt,token:token!};
}
it('an explicit linked retry resumes a failed review on a new root without regenerating education',async()=>{
 const f=await fixture(),q=await queue(f),first=compiler(input=>input.stage==='REVIEW'?{invalid:true}:proposal(input));
 await expect(first.service.run(q.token,signal())).rejects.toThrow();await attempts.fail(q.token,new DurablePlannerError('PROVIDER_FAILURE','Independent reviewer unavailable','REVIEW'));
 const next=await retry(f,q.attempt.attemptId),second=compiler(input=>{expect(input.stage).toBe('REVIEW');return reviewed(input);});await second.service.run(next.token,signal());
 const result=await stored(next);expect(result.attempt.state).toBe('SUCCEEDED');expect(result.attempt.parentAttemptId).toBe(q.attempt.attemptId);expect(result.attempt.budget.rootRequestId).not.toBe(q.attempt.budget.rootRequestId);expect(second.calls()).toBe(1);expect(result.payload.compilerRetry?.sourceCheckpointDigest).toBe((await stored(q)).attempt.checkpoint?.digest);expect(await candidates(f.ownerId)).toBe(1);
});
it('an explicit linked new root can retry a lost repair while ordinary takeover cannot',async()=>{
 const f=await fixture(),q=await queue(f),first=compiler(input=>input.stage==='REVIEW'?reviewed(input,true):input.stage==='REPAIR'?{invalid:true}:proposal(input));
 await expect(first.service.run(q.token,signal())).rejects.toThrow();await attempts.fail(q.token,new DurablePlannerError('PROVIDER_FAILURE','Lost repair response','REPAIR'));
 const next=await retry(f,q.attempt.attemptId),second=compiler(input=>input.stage==='REPAIR'?proposal(input,true):verified(input));await second.service.run(next.token,signal());
 expect(second.calls()).toBe(2);expect((await stored(next)).attempt.state).toBe('SUCCEEDED');expect(CompilerCheckpointSchema.parse((await stored(next)).payload.checkpoint).repairs).toBe(1);
});
it('takeover meters a repeated review when the accepted response was lost before its checkpoint',async()=>{
 const f=await fixture(),q=await queue(f),c=compiler(),save=c.service.learning.saveCheckpoint.bind(c.service.learning);let crash=true;
 vi.spyOn(c.service.learning,'saveCheckpoint').mockImplementation(async(...args)=>{const p=args[1].payload;if(crash&&'reviewSupport' in p&&p.reviewSupport?.phase==='REVIEWED'){crash=false;throw new Error('Lost review response');}return save(...args);});
 await expect(c.service.run(q.token,signal())).rejects.toThrow(/Lost review/);expect(c.calls()).toBe(2);await attempts.release(q.token);const next=await attempts.claim(`review_recovery_${randomUUID()}`,['PLAN']);await c.service.run(next!,signal());expect(c.calls()).toBe(3);expect((await stored(q)).attempt.budget.consumed.modelCalls).toBe(3);
});
it('takeover reestablishes verification hold and meters verification whose response was lost',async()=>{
 const f=await fixture(),q=await queue(f),c=compiler(input=>input.stage==='REVIEW'?reviewed(input,true):input.stage==='REPAIR'?proposal(input,true):input.stage==='VERIFICATION'?verified(input):proposal(input));
 const save=c.service.learning.saveCheckpoint.bind(c.service.learning);let crash=true;vi.spyOn(c.service.learning,'saveCheckpoint').mockImplementation(async(...args)=>{const p=args[1].payload;if(crash&&'reviewSupport' in p&&p.reviewSupport?.phase==='VERIFIED'){crash=false;throw new Error('Lost verification response');}return save(...args);});
 await expect(c.service.run(q.token,signal())).rejects.toThrow(/Lost verification/);expect(c.calls()).toBe(4);await attempts.release(q.token);const next=await attempts.claim(`verification_recovery_${randomUUID()}`,['PLAN']);await c.service.run(next!,signal());expect(c.calls()).toBe(5);expect((await stored(q)).attempt.state).toBe('SUCCEEDED');
});
it('repair infeasibility retains its accepted education and feedback without another adaptation',async()=>{
 const f=await fixture(1,30),q=await queue(f),c=compiler(input=>input.stage==='REVIEW'?reviewed(input,true):input.stage==='REPAIR'?proposal(input,true,60):proposal(input));
 await expect(c.service.run(q.token,signal())).rejects.toMatchObject({detail:{code:'QUALITY_BLOCKED',stage:'REPAIR'}});const checkpoint=CompilerCheckpointSchema.parse((await stored(q)).payload.checkpoint);
 if(!('reviewSupport' in checkpoint.payload))throw new Error();expect(checkpoint.payload.reviewSupport).toMatchObject({phase:'REPAIR_ACCEPTED',repairAllocationFailure:{status:'CAPACITY_SHORTFALL'}});expect(checkpoint.payload.reviewSupport?.acceptedRepair).toContain('independently');const calls=c.calls();await expect(c.service.run(q.token,signal())).rejects.toThrow();expect(c.calls()).toBe(calls);expect(await candidates(f.ownerId)).toBe(0);
});
it('new concrete verification blockers cannot publish even when original issues resolve',async()=>{
 const f=await fixture(),q=await queue(f),c=compiler(input=>{if(input.stage==='REVIEW')return reviewed(input,true);if(input.stage==='REPAIR')return proposal(input,true);if(input.stage==='VERIFICATION'){const result=verified(input),finding=reviewed(input,true).plans[0].issues[0];finding.issueId='new_concrete_issue';finding.grounds[1].excerpt=input.proposal.blueprints.plans[0].blueprint.activities[0].completionCriterion;result.plans[0].newIssues=[finding];return result;}return proposal(input);});
 await expect(c.service.run(q.token,signal())).rejects.toMatchObject({detail:{code:'QUALITY_BLOCKED'}});expect(c.calls()).toBe(4);expect(await candidates(f.ownerId)).toBe(0);
});
it('publication rejects changes to the reviewed execution date and durable activity identity',async()=>{
 for(const identity of [false,true]){const f=await fixture(),q=await queue(f),c=compiler(),publish=RevisionService.prototype.publish;
 vi.spyOn(RevisionService.prototype,'publish').mockImplementation(async function(this:RevisionService,token,revisions,changeSet){const forged=revisions.map(r=>PlannerRevisionV2Schema.parse(r));if(identity)forged[0].executable[0].activityKey=randomUUID();else forged[0].executable[0].placement.date=new Date(Date.parse(forged[0].executable[0].placement.date)+86400000).toISOString().slice(0,10);return publish.call(this,token,forged,changeSet);});
 await expect(c.service.run(q.token,signal())).rejects.toThrow();expect(await candidates(f.ownerId)).toBe(0);vi.restoreAllMocks();}
});
it('actual supervised compiler failure retains stage and review artifact with zero candidates',async()=>{
 const f=await fixture(),q=await queue(f);await attempts.release(q.token);
 const worker=new PlannerWorker(attempts,createCompilerHandlers(attempts,{provider:{adapter:()=>({generateResponse:async messages=>{const input=JSON.parse(messages[0].content!);return {text:JSON.stringify(input.stage==='REVIEW'?{invalid:true}:proposal(input)),finishReason:'STOP',usage:{promptTokens:150,completionTokens:100,totalTokens:250}};}}) as LLMAdapter}}),()=>{});
 await worker.tick();for(let i=0;i<500;i++){if((await connection.query('SELECT state FROM "PlannerAttempt" WHERE id=$1',[q.attempt.attemptId])).rows[0].state==='FAILED')break;await new Promise(resolve=>setTimeout(resolve,10));}await worker.shutdown();
 const result=await stored(q);expect(result.attempt.state).toBe('FAILED');expect(result.attempt.checkpoint?.stage).toBe('REVIEW');expect(result.attempt.error?.code).toBe('INVALID_OUTPUT');expect(await candidates(f.ownerId)).toBe(0);
});
it('compiled ordinary Node supervised handlers produce a reviewed sealed candidate',async()=>{
 const f=await fixture(),q=await queue(f);await attempts.release(q.token);const result=await promisify(execFile)(process.execPath,['__tests__/planner-v2/postgres/compiler-process-fixture.cjs'],{timeout:10000,env:{NODE_ENV:'test',PATH:process.env.PATH,PLANNER_TEST_DATABASE_URL:process.env.PLANNER_TEST_DATABASE_URL,PLANNER_PHASE0_REQUIRED:'true',PLANNER_PHASE0_DATABASE_MARKER:process.env.PLANNER_PHASE0_DATABASE_MARKER,PLANNER_FIXTURE_ATTEMPT:q.attempt.attemptId,PLANNER_FIXTURE_OWNER:String(f.ownerId)}});
 expect(JSON.parse(result.stdout)).toEqual({compiled:true,state:'SUCCEEDED',modelCalls:2,calls:2,candidates:1,quests:0,compatible:true,ready:true});
});
it('protected running education is reviewed and sealed unchanged without execution writes or double counting',async()=>{
 const f=await fixture(),today=await db.coordinated(f.ownerId,async sql=>(await loadExecutionContext(sql,f.ownerId,[await ownedPlan(sql,f.ownerId,f.created[0].plan.id)],f.created[0].intent.intent)).today);
 const initial=await prepareProposal(db,f.ownerId,[f.created[0].plan.id],specs=>{specs[0].placement.date=today;});await new ApplyService(db).apply(f.ownerId,initial.request);const quest=(await connection.query('SELECT id FROM "Quest" WHERE "userId"=$1',[f.ownerId])).rows[0];await new SessionService(db).start(f.ownerId,quest.id);const before=(await connection.query('SELECT * FROM "Quest" WHERE id=$1',[quest.id])).rows[0],q=await queue(f);
 const c=compiler(input=>{if(input.stage==='REVIEW'){expect(input.context.execution.some((e:{state:string})=>e.state==='RUNNING')).toBe(true);expect(input.proposal.blueprints.plans[0].blueprint.activities.find((a:{localId:string})=>a.localId==='practice01')).toEqual(initial.revisions[0].blueprint.activities[0]);return reviewed(input);}return proposal(input);});await c.service.run(q.token,signal());
 expect((await connection.query('SELECT * FROM "Quest" WHERE id=$1',[quest.id])).rows[0]).toEqual(before);const result=(await stored(q)).attempt.result;if(result?.kind!=='REVISIONS')throw new Error();const row=(await connection.query('SELECT "v2Artifact" FROM "PlannerRevision" WHERE id=$1',[result.revisions[0].revisionId])).rows[0];expect(row.v2Artifact.executable.find((s:{activityKey:string})=>s.activityKey===initial.revisions[0].executable[0].activityKey)).toEqual(initial.revisions[0].executable[0]);expect((await stored(q)).payload.changeSet).toMatchObject({aggregate:{committedTargetMinutes:60}});
});

function researchService(kind:"ASSESSED_SCOPE"|"RESOURCE"="ASSESSED_SCOPE"){
 return new ResearchService(attempts,{search:{id:'brave',search:async input=>{await input.beforeRequest?.();return [{url:'https://cambridgeinternational.org/9702',title:'Physics syllabus',provider:'brave',rank:1,snippet:null}];}},fetch:async(url,options)=>{await options?.beforeRequest?.();return {finalUrl:url,contentType:'text/plain',text:'',partial:false,partialReason:null,bytes:Buffer.byteLength(text),requests:1,rawBytes:Buffer.from(text)};},provider:{adapter:()=>({generateResponse:async(messages,system)=>{const input=JSON.parse(messages[0].content!);const p=input.plans[0];const value=system.startsWith('You are an assessment-aware')?{plans:[{planRef:p.planRef,extraction:{identities:[{sourceId:'source_1',fields:Object.entries(assessment).map(([field,value])=>({field,value,excerpt:text,anchor:{section:'Document'}}))}],claims:[{sourceId:'source_1',statement:'Explain circuit laws',excerpt:'Explain circuit laws and calculate potential difference.',anchor:{section:'Document'},kind}],completeSourceIds:['source_1'],gaps:[],answer:'Verify circuit laws'}}]}:{plans:[{planRef:p.planRef,review:{claims:p.candidates.map((c:{claimId:string})=>({claimId:c.claimId,support:'SUPPORTED',applicability:'MATCHED',reason:'Quoted actual source supports the accepted circuit outcome'})),scopeBindings:p.candidates.map((c:{claimId:string})=>({claimId:c.claimId,scopeRefs:['scope_electricity'],disposition:'ANNOTATE_SCOPE'})),identities:p.extraction.identities.map((i:{sourceId:string;fields:{field:string}[]})=>({sourceId:i.sourceId,fields:i.fields.map(f=>({field:f.field,supported:true}))})),completeSourceIds:['source_1'],conflicts:[],answer:'Verified applicable circuit laws'}}]};return {text:JSON.stringify(value),finishReason:'STOP',usage:{promptTokens:150,completionTokens:100,totalTokens:250}};}}) as LLMAdapter}});
}
async function researchQueue(f:Awaited<ReturnType<typeof fixture>>){const c=f.created[0],attempt=await attempts.enqueue(f.ownerId,{key:randomUUID(),text:'Research and plan the accepted assessment',kind:'PLAN',targets:[{planId:c.plan.id,intentId:c.intent.intentVersionId,planningVersion:0,baseRevisionId:null}],budget:newBudget('RESEARCH')});const token=await attempts.claim(`quality_research_${randomUUID()}`,['PLAN']);return {attempt,token:token!};}
it('one supervised compiler root researches verifies adopts reviews and seals with raw source provenance',async()=>{
 const f=await fixture(),q=await researchQueue(f),c=compiler(input=>{if(input.stage==='REVIEW'){expect(input.goals[0].requested.scope[0].sourceClaimIds).toEqual([]);expect(input.goals[0].resolved.scope[0].sourceClaimIds).toHaveLength(1);expect(input.context.plans[0].research.claims[0].verification).toEqual({excerpt:'VERIFIED',support:'SUPPORTED',applicability:'MATCHED'});return reviewed(input);}const p=proposal(input);p.plans[0].blueprint.activities[0].resourceRefs=['source_1'];p.plans[0].blueprint.activities[0].evidenceRefs=input.plans[0].allowlist.evidenceRefs;return p;});
 const full=new PlannerCompilerService(attempts,{provider:c.service.dependencies.provider,research:researchService()});await full.run(q.token,signal());const result=await stored(q),checkpoint=CompilerCheckpointSchema.parse(result.payload.checkpoint);expect(result.attempt.state).toBe('SUCCEEDED');expect(result.attempt.budget.consumed).toMatchObject({modelCalls:4,researchSynthesisCalls:2,planningCalls:2});expect(checkpoint.payload.stage).toBe('REVIEW');if('blueprints' in checkpoint.payload)expect(checkpoint.payload.blueprints.plans[0].blueprint.activities[0].evidenceRefs).toContain(checkpoint.payload.research?.evidence?.claims[0].claimId);expect(checkpoint.binding.sourceDigests).toHaveLength(1);expect(checkpoint.binding.targets[0].resolution).toBe('RESEARCH_ADOPTION');expect(await candidates(f.ownerId)).toBe(1);
});
it('keeps Exam research unconfirmable when no assessed scope is verified despite an empty model conflict list',async()=>{
 const f=await fixture(),q=await researchQueue(f),c=compiler(input=>proposal(input));const full=new PlannerCompilerService(attempts,{provider:c.service.dependencies.provider,research:researchService('RESOURCE')});await full.run(q.token,signal());const result=await stored(q);expect(result.attempt.state).toBe('NEEDS_DECISION');expect(result.attempt.budget.consumed).toMatchObject({modelCalls:2,researchSynthesisCalls:2,planningCalls:0});expect(result.payload.researchCheckpoint).toMatchObject({phase:'VERIFIED',verification:[{decision:expect.stringContaining('before planning'),evidence:{claims:[{kind:'RESOURCE',status:'ADOPTED'}]}}]});expect(c.calls()).toBe(0);expect(await candidates(f.ownerId)).toBe(0);expect((await connection.query('SELECT count(*)::int AS n FROM "Quest" WHERE "userId"=$1',[f.ownerId])).rows[0].n).toBe(0);expect((await connection.query('SELECT "workingIntentVersionId" FROM "PlannerPlan" WHERE id=$1',[f.created[0].plan.id])).rows[0].workingIntentVersionId).toBe(f.created[0].intent.intentVersionId);
});
it('seals an owned saved-check reference without treating that check as verified readiness',async()=>{
 const f=await fixture(),previous=await prepareProposal(db,f.ownerId,[f.created[0].plan.id]);await new ApplyService(db).apply(f.ownerId,previous.request);
 await db.coordinated(f.ownerId,sql=>sql.query('INSERT INTO "PlannerCheckResult" (id,"planId","userId","revisionId","itemKey",result,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'NEEDS_MORE_WORK\',clock_timestamp(),clock_timestamp())',[randomUUID(),f.created[0].plan.id,f.ownerId,previous.revisions[0].revisionId,previous.revisions[0].executable[0].activityKey]));
 const q=await queue(f),c=compiler(input=>{if(input.stage==='REVIEW'){expect(input.context.plans[0].savedChecks[0]).toMatchObject({ref:'saved_check_1',reliability:'SELF_REPORTED',demonstratesReadiness:false});return reviewed(input);}const p=proposal(input);p.plans[0].blueprint.activities[0].evidenceRefs=['saved_check_1'];return p;});
 await c.service.run(q.token,signal());const result=await stored(q);expect(result.attempt.state).toBe('SUCCEEDED');expect(await candidates(f.ownerId)).toBe(2);
 const checkpoint=CompilerCheckpointSchema.parse(result.payload.checkpoint);if('blueprints' in checkpoint.payload)expect(checkpoint.payload.blueprints.plans[0].blueprint.activities.find(a=>a.localId==='method_1')?.evidenceRefs).toEqual(['saved_check_1']);
});
it('research adoption crash resumes its verified receipt without renewing the expired research window',async()=>{
 const f=await fixture(),q=await researchQueue(f),research=researchService(),resolve=RevisionService.prototype.resolveResearch;
 vi.spyOn(RevisionService.prototype,'resolveResearch').mockImplementationOnce(async function(this:RevisionService,...args){await resolve.apply(this,args);throw new Error('Crash after research adoption');});await expect(research.complete(q.token,signal())).rejects.toThrow(/Crash/);vi.restoreAllMocks();
 await attempts.mutate(q.token,async(sql,attempt,payload)=>{await persistAttempt(sql,attempt,attempt,{...payload,providerGuard:{...payload.providerGuard,researchDeadlineAt:new Date(Date.now()-1000).toISOString()}});});const before=(await stored(q)).attempt.budget.executionDeadlineAt;await attempts.release(q.token);const next=await attempts.claim(`adoption_recovery_${randomUUID()}`,['PLAN']),c=compiler();const full=new PlannerCompilerService(attempts,{provider:c.service.dependencies.provider,research});await full.run(next!,signal());const result=await stored(q);expect(result.attempt.state).toBe('SUCCEEDED');expect(c.calls()).toBe(2);expect(result.attempt.budget.executionDeadlineAt).toBe(before);expect(result.attempt.budget.consumed.modelCalls).toBe(4);expect(await candidates(f.ownerId)).toBe(1);
});
it('root deadline expiry and a superseded intent fence a late independent review',async()=>{
 for(const expired of [true,false]){const f=await fixture(),q=await queue(f),c=compiler(async input=>{if(input.stage==='REVIEW'){if(expired)await attempts.mutate(q.token,async(sql,attempt,payload)=>{await persistAttempt(sql,attempt,{...attempt,budget:{...attempt.budget,executionDeadlineAt:new Date(Date.now()-1000).toISOString()}},payload);});else {const p=await db.coordinated(f.ownerId,sql=>ownedPlan(sql,f.ownerId,f.created[0].plan.id));await f.intents.edit(f.ownerId,p.id,p.version,p.workingIntentVersionId!,{...f.created[0].intent.intent,title:'A changed requested goal'});}return reviewed(input);}return proposal(input);});await expect(c.service.run(q.token,signal())).rejects.toThrow();expect(await candidates(f.ownerId)).toBe(0);}
});

it('review checkpoint pins the execution identity registry against tampering after review',async()=>{
 const f=await fixture(),q=await queue(f),c=compiler();vi.spyOn(RevisionService.prototype,'publish').mockRejectedValueOnce(new Error('Pause reviewed publication'));await expect(c.service.run(q.token,signal())).rejects.toThrow();vi.restoreAllMocks();
 await attempts.mutate(q.token,async(sql,attempt,payload)=>{const ids=structuredClone(payload.compilerIdentities!);ids[0].activityKey=randomUUID();await persistAttempt(sql,attempt,attempt,{...payload,compilerIdentities:ids});});await expect(c.service.run(q.token,signal())).rejects.toMatchObject({detail:{code:'STALE_CONTEXT'}});expect(await candidates(f.ownerId)).toBe(0);
});
it('insufficient actual verification growth retains the repaired allocation without publishing or another repair',async()=>{
 const f=await fixture(),q=await queue(f),c=compiler(input=>{if(input.stage==='REVIEW')return reviewed(input,true);const p=proposal(input,input.stage==='REPAIR');if(input.stage==='REPAIR'){const original=p.plans[0].blueprint.activities[0];for(let n=0;n<20;n++)p.plans[0].blueprint.activities.push({...original,localId:`specific_method_${n}`,title:`Apply circuit variant ${n}`,instructions:`Analyze the distinct circuit variant ${n}, document its method selection and corrections. ${'Explain the justification in the actual circuit. '.repeat(12)}`,timeboxMinutes:5,effort:{lowMinutes:5,likelyMinutes:5,highMinutes:5}});}return p;});
 await expect(c.service.run(q.token,signal())).rejects.toMatchObject({detail:{code:'BUDGET_EXHAUSTED',stage:'VERIFICATION'}});const checkpoint=CompilerCheckpointSchema.parse((await stored(q)).payload.checkpoint);if(!('reviewSupport' in checkpoint.payload))throw new Error();expect(checkpoint.payload.reviewSupport?.phase).toBe('REPAIRED');expect(checkpoint.payload.allocation.report.status).toBe('FEASIBLE');expect(c.calls()).toBe(3);expect(await candidates(f.ownerId)).toBe(0);
});
