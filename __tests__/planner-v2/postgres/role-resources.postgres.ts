import { DeepSeekAdapter } from "@/lib/ai/providers/deepseek";
import { streamPlannerActivity } from "@/lib/planner/v2/server/activity";
import { readEventStream } from "@/lib/ai/sylvie/event-stream";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { AI_PRICING_VERSION } from "@/lib/ai/config";
import pg from "pg";
import { connect, user } from "./database";
import { intentFixture } from "./intent-fixture";
import { GenerationService } from "@/lib/planner/v2/server/generation";
import { AttemptService } from "@/lib/planner/v2/server/attempts";
import { PlannerDatabase, DurablePlannerError, hash } from "@/lib/planner/v2/server/database";
import { offlineResourcePolicy } from "@/lib/planner/v2/intelligence/foundation/role-calls";
import { dispatchMeteredProvider, workerProviderMeter, type MeteredProviderRequest } from "@/lib/planner/v2/intelligence/provider";
import type { PlannerRole } from "@/lib/planner/v2/intelligence/foundation/contracts";
import type { LLMAdapter, LLMResponse } from "@/lib/ai/providers/types";
import { PlannerFoundationService } from "@/lib/planner/v2/server/foundation";
import { StudentWorkspaceService } from "@/lib/planner/v2/server/student-workspace";
import { PlannerWorker } from "@/lib/planner/v2/server/worker";
import { readPlannerActivity,readProviderReasoning, retainVisibleOutput, studentVisibleText } from "@/lib/planner/v2/server/activity";

let client: pg.Client, pool: pg.Pool, db: PlannerDatabase, attempts: AttemptService;
const owners = new Set<number>();
beforeAll(async () => { client = await connect(); pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 6 }); db = new PlannerDatabase(pool); attempts = new AttemptService(db); });
afterEach(async () => { for (const ownerId of owners) for (const row of (await client.query('SELECT id FROM "PlannerAttempt" WHERE "userId"=$1 AND state IN (\'QUEUED\',\'RUNNING\',\'NEEDS_DECISION\')', [ownerId])).rows) await attempts.cancel(ownerId, row.id); owners.clear(); });
afterAll(async () => { await pool?.end(); await client?.end(); });
async function fixture(calls = 32, processingMs = 1800000, maximumMicros?: number) {
  const ownerId = await user(client); owners.add(ownerId);
  const { authorizationDigest: _auth, ...resources } = offlineResourcePolicy("a".repeat(64), randomUUID()); void _auth;
  resources.root = { calls, inputUnits: 1000000, completionTokens: 2000000 }; resources.processingMs = processingMs;
  if (maximumMicros !== undefined) resources.spending = { maximumMicros, pricingVersion: AI_PRICING_VERSION };
  for (const role of Object.values(resources.roles)) { role.call.inputUnits = 10000; role.holdback.inputUnits = role.holdback.calls * 10000; }
  const service = new GenerationService(db, { compilerVersion: 2, resources });
  const text = "Develop my accepted physics goal with complete useful education";
  const attempt = (await service.accept(ownerId, { schemaVersion: 2, requestKey: randomUUID(), text, targets: [{ kind: "NEW", intent: intentFixture() }] })).attempt;
  const token = await attempts.claim(`roles_${randomUUID()}`); expect(token?.attemptId).toBe(attempt.attemptId);
  const current = await attempts.read(ownerId, attempt.attemptId);
  const continuation = (parentAttemptId = attempt.attemptId, key = randomUUID()) => service.accept(ownerId, { schemaVersion: 2, requestKey: key, text, parentAttemptId,
    targets: [{ kind: "EXISTING", planId: attempt.targets[0].planId, expectedIntentVersionId: attempt.targets[0].requestedIntentVersionId, expectedPlanningVersion: 0, baseActiveRevisionId: null }] });
  return { ownerId, attempt: current, token: token!, service, resources, continuation };
}
function request(role: PlannerRole = "STRATEGIST", key = randomUUID()): MeteredProviderRequest<string> {
  return { role: { role, key }, policy: { purpose: role === "RESEARCH" ? "RESEARCH" : role === "REVIEWER" ? "REVIEW" : "BLUEPRINT" },
    messages: [{ role: "user", content: "Use the owned accepted physics context." }], systemInstruction: "Produce excellent education with honest uncertainty.", outputTokens: 32768, validate: r => r.text! };
}
const response = (): LLMResponse => ({ model: "deepseek-flash", fingerprint: "scripted-fingerprint", finishReason: "STOP", text: "  Complete natural study strategy 🧠\n\nStop after success.\n", usage: { promptTokens: 100, completionTokens: 80, reasoningTokens: 55, totalTokens: 180, cacheHitTokens: 20 } });
const adapter = (): LLMAdapter => ({ generateResponse: async () => response() });
async function run(f: Awaited<ReturnType<typeof fixture>>, role: PlannerRole = "STRATEGIST") {
  return dispatchMeteredProvider(workerProviderMeter(attempts, f.token), request(role), { adapter: () => ({ generateResponse: async () => ({ ...response(), text: role === "STRATEGIST" ? response().text : '{"result":"complete"}' }) }) });
}
async function reserve(f: Awaited<ReturnType<typeof fixture>>, role: PlannerRole = "STRATEGIST") {
  const p = await attempts.rolePolicy(f.token, role);
  return attempts.reserveRoleCall(f.token, { provider: "deepseek", model: "deepseek-flash", inputTokens: 100, outputTokens: 100,
    roleCall: { schemaVersion: 1, key: randomUUID(), role, policyDigest: p.policyDigest, inputDigest: hash("input", []), promptDigest: hash("prompt", []), format: p.format, effort: p.effort, purpose: role === "RESEARCH" ? "RESEARCH" : role === "REVIEWER" ? "REVIEW" : "BLUEPRINT" } });
}
describe("compiler v2 role resources on genuine PostgreSQL", () => {
  it("keeps a reserved call live so its subsequent stream is not discarded as stopped",async()=>{
    const f=await fixture(),callId=await reserve(f),planId=f.attempt.targets[0].planId;
    expect((await readPlannerActivity(db,f.ownerId,planId,f.attempt.attemptId)).calls).toEqual([expect.objectContaining({id:callId,state:"WORKING"})]);
    await attempts.dispatchCall(f.token,callId,"PLANNING");
    await retainVisibleOutput(attempts,f.token,callId,"Actual first reasoning",22,"reasoning");
    expect((await readPlannerActivity(db,f.ownerId,planId,f.attempt.attemptId)).calls[0]).toMatchObject({state:"WORKING",reasoning:{text:"Actual first reasoning",recorded:true}});
  });
  it("shows actual streamed strategy text under the owned fence without exposing credentials or changing accounting",async()=>{
    const f=await fixture(),planId=f.attempt.targets[0].planId,partial="Study substitution first. sk-synthetic-secret candidate_1",full=partial+"\nThen practise independently.",thinking="Check the prerequisites before ordering practice. sk-synthetic-secret";
    const result=await dispatchMeteredProvider(workerProviderMeter(attempts,f.token),{role:{role:"STRATEGIST",key:"live_strategy_fixture"},messages:[{role:"user",content:"Plan"}],systemInstruction:"Unpaid fixture",policy:{purpose:"BLUEPRINT"},outputTokens:100,validate:r=>r.text},{adapter:()=>({generateResponse:async(_messages,_system,_tools,options)=>{
      expect(options?.onTextDelta).toBeTypeOf("function");options!.onTextDelta!(partial);
      expect(options?.onReasoningDelta).toBeTypeOf("function");options!.onReasoningDelta!(thinking);
      let activity=await readPlannerActivity(db,f.ownerId,planId,f.attempt.attemptId);
      for(let n=0;n<100&&!activity.output;n++){await new Promise(resolve=>setTimeout(resolve,10));activity=await readPlannerActivity(db,f.ownerId,planId,f.attempt.attemptId);}
      expect(activity.output).toMatchObject({text:studentVisibleText(partial),state:"WRITING",receivedCharacters:partial.length});
      return {model:"deepseek-flash",fingerprint:"fixture",finishReason:"STOP",text:full,reasoningText:thinking,usage:{promptTokens:10,completionTokens:20,totalTokens:30,cacheHitTokens:0,reasoningTokens:10}};
    }})});
    expect(result.value).toBe(full);
    const activity=await readPlannerActivity(db,f.ownerId,planId,f.attempt.attemptId);expect(activity.output).toMatchObject({text:studentVisibleText(full),state:"RECEIVED"});
    expect(JSON.stringify(activity)).not.toContain("synthetic-secret");expect(JSON.stringify(activity)).not.toContain("candidate_1");
    expect((await client.query('SELECT reservation->\'result\'->>\'text\' AS text,"accountingState" FROM "AiUsageLog" WHERE "requestId"=$1',[result.callId])).rows[0]).toEqual({text:full,accountingState:"SETTLED"});
    expect((await attempts.resources(f.ownerId,f.attempt.attemptId)).snapshot.consumed.calls).toBe(1);
    expect(await readProviderReasoning(db,f.ownerId,planId,f.attempt.attemptId,result.callId)).toMatchObject({text:studentVisibleText(thinking),complete:true,recorded:true,redacted:true});
    await expect(db.coordinated(f.ownerId,sql=>sql.query('UPDATE "AiUsageLog" SET reservation=jsonb_set(reservation,\'{result,reasoning,text}\',\'"changed"\') WHERE "requestId"=$1',[result.callId]))).rejects.toThrow();
    const outsider=await user(client);owners.add(outsider);await expect(readPlannerActivity(db,outsider,planId,f.attempt.attemptId)).rejects.toMatchObject({detail:{code:"PLAN_NOT_FOUND"}});
    await attempts.cancel(f.ownerId,f.attempt.attemptId);await expect(retainVisibleOutput(attempts,f.token,result.callId,"late",4)).rejects.toMatchObject({detail:{code:"LEASE_EXPIRED"}});
    expect((await readPlannerActivity(db,f.ownerId,planId,f.attempt.attemptId)).output?.text).toBe(studentVisibleText(full));
  });
  it("refuses structured-role output as public streaming text",async()=>{
    const f=await fixture(),id=await reserve(f,"RESEARCH");
    await expect(retainVisibleOutput(attempts,f.token,id,"internal JSON",13)).rejects.toMatchObject({detail:{code:"REFERENCE_NOT_OWNED"}});
  });
  it("retains API-provided reasoning for structured roles without exposing their buffered JSON as live output",async()=>{
    const f=await fixture();
    for(const role of ["RESEARCH","TRANSLATOR","REVIEWER"] as const){
      const reasoning=`Provider reasoning for ${role}.`;
      const result=await dispatchMeteredProvider(workerProviderMeter(attempts,f.token),{role:{role,key:`reasoning_${role.toLowerCase()}_fixture`},messages:[{role:"user",content:"Fixture"}],systemInstruction:"Fixture",policy:{purpose:role==="RESEARCH"?"RESEARCH":role==="REVIEWER"?"REVIEW":"BLUEPRINT"},outputTokens:100,validate:r=>JSON.parse(r.text!)},{adapter:()=>({generateResponse:async(_m,_s,_t,options)=>{expect(options?.onTextDelta).toBeUndefined();options!.onReasoningDelta!(reasoning);return {model:"deepseek-flash",finishReason:"STOP",text:'{"ok":true}',reasoningText:reasoning,usage:{promptTokens:10,completionTokens:20,totalTokens:30,cacheHitTokens:0,reasoningTokens:10}};}})});
      expect((await readProviderReasoning(db,f.ownerId,f.attempt.targets[0].planId,f.attempt.attemptId,result.callId)).text).toBe(reasoning);
    }
    const activity=await readPlannerActivity(db,f.ownerId,f.attempt.targets[0].planId,f.attempt.attemptId);expect(activity.calls).toHaveLength(3);expect(activity.calls.every(call=>call.reasoning?.recorded)).toBe(true);expect(activity.output).toBeNull();
  });
  it("renews through a coherent read snapshot and validates a fresh committed lease afterwards", async () => {
    const f = await fixture();
    const oldExpiry = await attempts.observe(f.token, async (sql, initial) => {
      await attempts.renew(f.token);
      const inside = (await sql.query('SELECT artifact->\'lease\'->>\'expiresAt\' AS expiry FROM "PlannerAttempt" WHERE id=$1', [f.attempt.attemptId])).rows[0].expiry;
      expect(inside).toBe(initial.lease!.expiresAt);
      return inside;
    });
    const current = await attempts.read(f.ownerId, f.attempt.attemptId);
    expect(Date.parse(current.lease!.expiresAt)).toBeGreaterThan(Date.parse(oldExpiry));
    expect(current.budget.executionDeadlineAt).toBe(f.attempt.budget.executionDeadlineAt);
  });
  it("rejects a snapshot prepared across cancellation instead of returning stale worker authority", async () => {
    const f = await fixture();
    await expect(attempts.observe(f.token, async () => {
      await attempts.cancel(f.ownerId, f.attempt.attemptId);
      return "Cannot authorize a strategy";
    })).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
  });
  it("survives heartbeat lock contention during a real long checkpoint without extending or losing its valid lease", async () => {
    const f = await fixture(), events: string[] = [], controller = new AbortController();
    const worker = new PlannerWorker(attempts, { PLAN: async () => {
      await db.coordinated(f.ownerId, async sql => {
        await sql.query('SELECT id FROM "PlannerAttempt" WHERE id=$1 FOR UPDATE', [f.attempt.attemptId]);
        // Exercise the real 10s owner-lock wait within the real 45s lease.
        // Active statements avoid faking an idle transaction timeout failure.
        for (let i = 0; i < 25; i++) await sql.query("SELECT pg_sleep(1)");
      });
      expect(controller.signal.aborted).toBe(false);
      await attempts.needsDecision(f.token, "Retained checkpoint completed without a provider call");
    } }, event => events.push(event.event));
    await (worker as unknown as { run(token: typeof f.token, controller: AbortController): Promise<void> }).run(f.token, controller);
    expect(events).toContain("renewal_contended");
    expect(events).not.toContain("stopped");
    const current = await attempts.read(f.ownerId, f.attempt.attemptId);
    expect(current.state).toBe("NEEDS_DECISION");
    expect(current.budget.executionDeadlineAt).toBe(f.attempt.budget.executionDeadlineAt);
    expect(current.budget.consumed.modelCalls).toBe(0);
  }, 35000);
  it("reads progress and provider controls while an owner writer is open, without authorizing mutation", async () => {
    const f = await fixture();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const writer = db.coordinated(f.ownerId, async sql => {
      await sql.query('SELECT id FROM "PlannerPlan" WHERE id=$1 FOR UPDATE', [f.attempt.targets[0].planId]);
      entered(); await gate;
    });
    await ready;
    try {
      const window = await attempts.providerWindow(f.token, "BLUEPRINT");
      expect(window.deadline).toBeGreaterThan(window.now);
      const view = await new StudentWorkspaceService(db).read(f.ownerId, f.attempt.targets[0].planId);
      expect(view.attempt?.attemptId).toBe(f.attempt.attemptId);
      await expect(db.observed(f.ownerId, sql => sql.query('UPDATE "PlannerPlan" SET title=title WHERE id=$1', [f.attempt.targets[0].planId]))).rejects.toMatchObject({ code: "25006" });
    } finally { release(); await writer; }
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
    await expect(attempts.providerWindow(f.token, "BLUEPRINT")).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
  });
  it("read-only provider controls still reject foreign owners, stale fences and expired deadlines", async () => {
    const f = await fixture(32, 1000);
    await expect(attempts.providerWindow({ ...f.token, ownerId: await user(client) }, "BLUEPRINT")).rejects.toMatchObject({ detail: { code: "REFERENCE_NOT_OWNED" } });
    await expect(attempts.providerWindow({ ...f.token, fence: f.token.fence + 1 }, "BLUEPRINT")).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
    await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(f.attempt.budget.executionDeadlineAt!) - Date.now() + 20)));
    await expect(attempts.providerWindow(f.token, "BLUEPRINT")).rejects.toMatchObject({ detail: { code: "BUDGET_EXHAUSTED" } });
  });
  it("serializes simultaneous dollar reservations without exceeding the root ceiling", async () => {
    const f = await fixture(32, 1800000, 220);
    const results = await Promise.allSettled([reserve(f), reserve(f)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { detail: { code: "BUDGET_EXHAUSTED" } } });
    expect((await client.query('SELECT count(*)::int AS count FROM "AiUsageLog" WHERE "rootRequestId"=$1', [f.attempt.budget.rootRequestId])).rows[0].count).toBe(1);
  });
  it("preserves known spending and the dollar ceiling across linked continuation", async () => {
    const f = await fixture(32, 1800000, 400), call = await reserve(f);
    await attempts.dispatchCall(f.token, call, "PLANNING");
    await attempts.settleCall(f.token, call, { inputTokens: 100, outputTokens: 100, costUsd: 0.00015, effectiveModel: "deepseek-flash", cacheHitTokens: 0, finishReason: "STOP", response: "Complete natural strategy" });
    await attempts.needsDecision(f.token, "Continue the retained paid root");
    const child = await f.continuation(), token = (await attempts.claim(`dollars_${randomUUID()}`))!;
    expect(token.attemptId).toBe(child.attempt.attemptId);
    expect((await attempts.resources(f.ownerId, token.attemptId)).policy.spending?.maximumMicros).toBe(400);
    await reserve({ ...f, token });
    await expect(reserve({ ...f, token })).rejects.toMatchObject({ detail: { code: "BUDGET_EXHAUSTED" } });
  });
  it("blocks further paid reservations when settled usage still has unknown cost", async () => {
    const f = await fixture(32, 1800000, 500), call = await reserve(f);
    await attempts.dispatchCall(f.token, call, "PLANNING");
    await attempts.settleCall(f.token, call, { inputTokens: 100, outputTokens: 100, costUsd: null });
    await expect(reserve(f)).rejects.toMatchObject({ detail: { code: "QUALITY_INCOMPLETE" } });
  });
  it("streams actual provider deltas through durable SQL and SSE while the paid-shaped response is still pending",async()=>{
    const f=await fixture();let upstream!:ReadableStreamDefaultController<Uint8Array>;
    const fetch=vi.fn(async()=>new Response(new ReadableStream<Uint8Array>({start(c){upstream=c;}}),{headers:{"content-type":"text/event-stream"}}));
    vi.stubGlobal("fetch",fetch);
    const encode=(value:unknown)=>new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
    const requestAbort=new AbortController(),displayAbort=new AbortController();let responseFinished=false;
    const generating=dispatchMeteredProvider(workerProviderMeter(attempts,f.token),{...request("RESEARCH"),signal:requestAbort.signal},{adapter:()=>new DeepSeekAdapter("synthetic","deepseek-flash")}).finally(()=>{responseFinished=true;});
    try{
      await vi.waitFor(()=>expect(upstream).toBeDefined(),{timeout:5000});
      const display=await streamPlannerActivity(db,f.ownerId,f.attempt.targets[0].planId,f.token.attemptId,displayAbort.signal);const events:{text:string}[]=[];
      const reading=readEventStream(display,(_event,data)=>{const value=JSON.parse(data);if(value.reasoning)events.push(value.reasoning);},displayAbort.signal).catch(()=>{});
      upstream.enqueue(encode({model:"deepseek-flash",choices:[{delta:{reasoning_content:"Check "}}]}));
      await vi.waitFor(()=>expect(events.some(e=>e.text==="Check ")).toBe(true),{timeout:5000});expect(responseFinished).toBe(false);
      upstream.enqueue(encode({choices:[{delta:{reasoning_content:"the actual facts."}}]}));
      await vi.waitFor(()=>expect(events.some(e=>e.text==="Check the actual facts.")).toBe(true),{timeout:5000});expect(responseFinished).toBe(false);
      expect((await client.query('SELECT "accountingState" FROM "AiUsageLog" WHERE "attemptId"=$1',[f.token.attemptId])).rows).toEqual([{accountingState:"DISPATCHED"}]);
      upstream.enqueue(encode({choices:[{delta:{content:'{"result":"complete"}'},finish_reason:"stop"}],usage:{prompt_tokens:100,completion_tokens:80,reasoning_tokens:55,prompt_cache_hit_tokens:0}}));upstream.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));upstream.close();
      await generating;displayAbort.abort();await reading;expect(fetch).toHaveBeenCalledTimes(1);
      expect((await client.query('SELECT "accountingState",reservation FROM "AiUsageLog" WHERE "attemptId"=$1',[f.token.attemptId])).rows[0]).toMatchObject({accountingState:"SETTLED",reservation:{result:{text:'{"result":"complete"}',reasoning:{text:"Check the actual facts."}},accepted:true}});
      await expect(streamPlannerActivity(db,await user(client),f.attempt.targets[0].planId,f.token.attemptId,new AbortController().signal)).rejects.toMatchObject({detail:{code:"PLAN_NOT_FOUND"}});
    }finally{requestAbort.abort();displayAbort.abort();await generating.catch(()=>{});vi.unstubAllGlobals();}
  });
  it("retains natural TEXT exactly, sends explicit effort/cap, and records reasoning once with effective identity", async () => {
    const f = await fixture(); let options: Parameters<LLMAdapter["generateResponse"]>[3];
    const result = await dispatchMeteredProvider(workerProviderMeter(attempts, f.token), request(), { adapter: () => ({ generateResponse: async (_m, _s, _t, o) => { options = o; return response(); } }) });
    expect(options).toMatchObject({ responseFormat: "text", thinking: "enabled", reasoningEffort: "high", maxTokens: 32768, preserveText: true, singleAttempt: true });
    expect(result.value).toBe(response().text);
    const row = (await client.query('SELECT * FROM "AiUsageLog" WHERE "requestId"=$1', [result.callId])).rows[0];
    expect(row).toMatchObject({ accountingState: "SETTLED", reasoningTokens: 55, completionTokens: 80, cacheHitTokens: 20, usageKnown: true, cacheUsageKnown: true, modelVerified: true });
    expect(row.reservation).toMatchObject({ accepted: true, usage: { effectiveModel: "deepseek-flash", fingerprint: "scripted-fingerprint" }, result: { text: response().text } });
    expect((await attempts.resources(f.ownerId, f.attempt.attemptId)).snapshot.consumed).toEqual({ calls: 1, inputUnits: 100, completionTokens: 80 });
  });
  it("supports JSON translation/review and more than the legacy six/five-call ceiling", async () => {
    const f = await fixture(); const formats: unknown[] = [];
    for (const role of ["RESEARCH", "STRATEGIST", "TRANSLATOR", "REVIEWER", "STRATEGIST", "TRANSLATOR", "REVIEWER", "REVIEWER"] as PlannerRole[]) {
      await dispatchMeteredProvider(workerProviderMeter(attempts, f.token), request(role), { adapter: () => ({ generateResponse: async (_m, _s, _t, o) => { formats.push(o?.responseFormat); return { ...response(), text: role === "STRATEGIST" ? response().text : '{"result":"complete"}' }; } }) });
    }
    expect(formats).toEqual(["json_object", "text", "json_object", "json_object", "text", "json_object", "json_object", "json_object"]);
    expect((await attempts.read(f.ownerId, f.attempt.attemptId)).budget.consumed).toMatchObject({ modelCalls: 8, planningCalls: 7, researchSynthesisCalls: 1, outputTokens: 640 });
    expect((await client.query('SELECT used FROM "UserQuota" WHERE "userId"=$1', [f.ownerId])).rows).toEqual([{ used: 1 }]);
  });
  it("serializes concurrent reservations and preserves translation plus review/verification holdbacks", async () => {
    const f = await fixture(9), results = await Promise.allSettled(Array.from({ length: 8 }, () => reserve(f)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(4); expect(results.filter(r => r.status === "rejected")).toHaveLength(4);
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
    expect((await attempts.resources(f.ownerId, f.attempt.attemptId)).snapshot.reserved).toEqual({ calls: 0, inputUnits: 0, completionTokens: 0 });
    expect((await client.query('SELECT DISTINCT "accountingState","estimatedCostUsd" FROM "AiUsageLog" WHERE "userId"=$1', [f.ownerId])).rows).toEqual([{ accountingState: "CANCELLED_BEFORE_DISPATCH", estimatedCostUsd: 0 }]);
    expect((await client.query('SELECT used FROM "UserQuota" WHERE "userId"=$1', [f.ownerId])).rows).toEqual([{ used: 0 }]);
  });
  it("continues one root without resetting counters, quota or deadline and prevents sibling branches", async () => {
    const f = await fixture(); await run(f); await attempts.needsDecision(f.token, "Continue the accepted strategy refinement");
    const key = randomUUID(), child = await f.continuation(f.attempt.attemptId, key);
    expect((await f.continuation(f.attempt.attemptId, key)).replayed).toBe(true);
    await expect(f.continuation()).rejects.toMatchObject({ detail: { code: "INTENT_CONFLICT" } });
    const token = (await attempts.claim(`child_${randomUUID()}`))!;
    expect(token.attemptId).toBe(child.attempt.attemptId);
    expect((await attempts.read(f.ownerId, token.attemptId)).budget).toMatchObject({ rootRequestId: f.attempt.budget.rootRequestId, processingStartedAt: f.attempt.budget.processingStartedAt, executionDeadlineAt: f.attempt.budget.executionDeadlineAt, consumed: { modelCalls: 1, outputTokens: 80 } });
    await run({ ...f, token }, "REVIEWER");
    expect((await attempts.resources(f.ownerId, token.attemptId)).snapshot).toMatchObject({ lineage: [f.attempt.attemptId, token.attemptId], consumed: { calls: 2, completionTokens: 160 } });
    expect((await client.query('SELECT used FROM "UserQuota" WHERE "userId"=$1', [f.ownerId])).rows).toEqual([{ used: 1 }]);
  });
  it("retains uncertain spend through stopping and permits continuation only after actual reconciliation", async () => {
    const f = await fixture(), call = await reserve(f); await attempts.dispatchCall(f.token, call, "PLANNING"); await attempts.needsDecision(f.token, "Investigate dispatch uncertainty");
    expect((await attempts.resources(f.ownerId, f.attempt.attemptId)).snapshot).toMatchObject({ uncertainDispatch: true, consumed: { calls: 1 }, reserved: { inputUnits: 100 } });
    await expect(f.continuation()).rejects.toMatchObject({ detail: { code: "QUALITY_INCOMPLETE" } });
    const frozen = await attempts.read(f.ownerId, f.attempt.attemptId);
    await attempts.recordLateUsage(f.ownerId, f.attempt.attemptId, call, { inputTokens: 40, outputTokens: 20, costUsd: null, reasoningTokens: 10 });
    expect(await attempts.read(f.ownerId, f.attempt.attemptId)).toEqual(frozen);
    const child = await f.continuation();
    expect(child.attempt.budget.consumed).toMatchObject({ modelCalls: 1, inputTokens: 40, outputTokens: 20 });
    expect(child.attempt.budget.reserved.inputTokens).toBe(0);
    await expect(attempts.recordLateUsage(f.ownerId, f.attempt.attemptId, call, { inputTokens: 41, outputTokens: 20, costUsd: null })).rejects.toMatchObject({ detail: { code: "IDEMPOTENCY_MISMATCH" } });
  });
  it("resumes a complete response after takeover and never repeats its provider call", async () => {
    const f = await fixture(), req = request(), meter = workerProviderMeter(attempts, f.token); let upstream = 0;
    meter.close = async () => { throw new DurablePlannerError("WORKER_UNAVAILABLE", "Simulated worker loss after saving response", "RECOVERY"); };
    await expect(dispatchMeteredProvider(meter, req, { adapter: () => ({ generateResponse: async () => { upstream++; return response(); } }) })).rejects.toMatchObject({ detail: { code: "WORKER_UNAVAILABLE" } });
    await attempts.release(f.token); const token = (await attempts.claim(`saved_${randomUUID()}`))!;
    const recovered = await dispatchMeteredProvider(workerProviderMeter(attempts, token), req, { adapter: () => { upstream++; throw new Error("Must recover without a provider"); } });
    expect(recovered.value).toBe(response().text); expect("recovered" in recovered && recovered.recovered).toBe(true); expect(upstream).toBe(1);
    expect((await attempts.read(f.ownerId, f.attempt.attemptId)).budget.consumed.modelCalls).toBe(1);
    await expect(dispatchMeteredProvider(workerProviderMeter(attempts, token), { ...req, outputTokens: 30000 }, { adapter })).rejects.toMatchObject({ detail: { code: "IDEMPOTENCY_MISMATCH" } });
  });
  it("retains incomplete output and actual usage without approval, silent repetition or provider fallback", async () => {
    const f = await fixture(), req = request(); let calls = 0;
    const dependencies = { adapter: () => ({ generateResponse: async () => { calls++; return { ...response(), finishReason: "MAX_TOKENS" as const }; } }) };
    await expect(dispatchMeteredProvider(workerProviderMeter(attempts, f.token), req, dependencies)).rejects.toMatchObject({ detail: { code: "OUTPUT_TRUNCATED" } });
    await expect(dispatchMeteredProvider(workerProviderMeter(attempts, f.token), req, dependencies)).rejects.toMatchObject({ detail: { code: "QUALITY_INCOMPLETE" } });
    expect(calls).toBe(1);
    expect((await client.query('SELECT reservation FROM "AiUsageLog" WHERE "attemptId"=$1', [f.attempt.attemptId])).rows[0].reservation).toMatchObject({ accepted: false, result: { finishReason: "MAX_TOKENS" } });
  });
  it("expires role work even when the provider ignores abort and reconciles late spend without changing failed history", async () => {
    const f = await fixture(32, 1000); let deliver!: (r: LLMResponse) => void;
    await expect(dispatchMeteredProvider(workerProviderMeter(attempts, f.token), request(), { pollMs: 10, adapter: () => ({ generateResponse: async () => new Promise<LLMResponse>(resolve => { deliver = resolve; }) }) })).rejects.toMatchObject({ detail: { code: "BUDGET_EXHAUSTED" } });
    const before = await attempts.read(f.ownerId, f.attempt.attemptId); expect(before.state).toBe("FAILED");
    deliver(response());
    for (let n = 0; n < 100; n++) { if (!(await attempts.resources(f.ownerId, f.attempt.attemptId)).snapshot.uncertainDispatch) break; await new Promise(resolve => setTimeout(resolve, 10)); }
    expect((await attempts.resources(f.ownerId, f.attempt.attemptId)).snapshot).toMatchObject({ uncertainDispatch: false, consumed: { calls: 1, inputUnits: 100 } });
    expect(await attempts.read(f.ownerId, f.attempt.attemptId)).toEqual(before);
    await expect(f.continuation()).rejects.toThrow();
  });
  it("enforces ownership and immutable policy/deadline at both service and SQL boundaries", async () => {
    const f = await fixture();
    await expect(attempts.resources(await user(client), f.attempt.attemptId)).rejects.toMatchObject({ detail: { code: "REFERENCE_NOT_OWNED" } });
    await expect(db.coordinated(f.ownerId, sql => sql.query('UPDATE "PlannerAttempt" SET payload=jsonb_set(payload,\'{resourcePolicy,root,calls}\',\'999\') WHERE id=$1', [f.attempt.attemptId]))).rejects.toThrow(/IMMUTABLE/);
    await expect(attempts.escalate(f.token, "RESEARCH", "Extend time")).rejects.toMatchObject({ detail: { code: "INTENT_CONFLICT" } });
    await expect(attempts.startResearchWindow(f.token)).rejects.toMatchObject({ detail: { code: "QUALITY_INCOMPLETE" } });
    await expect(attempts.consumeResearch(f.token, { researchQueries: 1 })).rejects.toMatchObject({ detail: { code: "QUALITY_INCOMPLETE" } });
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
    await expect(reserve(f)).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
  });
  it("keeps truthful actual overrun and unknown price while stopping further work", async () => {
    const f = await fixture(), call = await reserve(f); await attempts.dispatchCall(f.token, call, "PLANNING");
    await attempts.settleCall(f.token, call, { inputTokens: 1000001, outputTokens: 100, costUsd: null, reasoningTokens: 80 });
    expect(await attempts.read(f.ownerId, f.attempt.attemptId)).toMatchObject({ state: "FAILED", budget: { consumed: { inputTokens: 1000001, outputTokens: 100 } } });
    expect((await client.query('SELECT "accountingState","estimatedCostUsd","reasoningTokens" FROM "AiUsageLog" WHERE "requestId"=$1', [call])).rows[0]).toEqual({ accountingState: "SETTLED", estimatedCostUsd: null, reasoningTokens: 80 });
  });
  it("binds saved checkpoint text to its actual role receipt rather than a fabricated response", async () => {
    const f = await fixture(), result = await run(f), foundation = new PlannerFoundationService(attempts);
    const roleCall = (await client.query('SELECT reservation FROM "AiUsageLog" WHERE "requestId"=$1', [result.callId])).rows[0].reservation.roleCall;
    const checkpoint = { schemaVersion: 1, compilerVersion: 2, previous: null, requestHash: f.attempt.requestHash, rootRequestId: f.attempt.budget.rootRequestId,
      authorizationDigest: f.attempt.acceptedRequest.targetAuthorizationDigest, targetsDigest: hash("ai-first-targets-v1", f.attempt.targets), stage: "RESEARCH", artifacts: [],
      resourceSnapshotDigest: hash("resource-snapshot", (await attempts.resources(f.ownerId, f.attempt.attemptId)).snapshot),
      pendingCall: { callId: result.callId, role: "STRATEGIST", inputDigest: roleCall.inputDigest, state: "RESPONSE_SAVED", response: response().text!, responseDigest: hash("saved-role-response-v1", response().text) }, route: null, reason: "Retain complete role output before assembly" };
    const before = await foundation.read(f.ownerId, f.attempt.attemptId);
    await expect(foundation.append(f.token, before.digest, "CHECKPOINT", { ...checkpoint, pendingCall: { ...checkpoint.pendingCall, response: "Fabricated education", responseDigest: hash("saved-role-response-v1", "Fabricated education") } })).rejects.toMatchObject({ detail: { code: "INVALID_OUTPUT" } });
    await foundation.append(f.token, before.digest, "CHECKPOINT", checkpoint);
    expect(await foundation.inspect(f.ownerId, f.attempt.attemptId)).toMatchObject({ recovery: "ASSEMBLE_SAVED_RESPONSE", checkpoint: { pendingCall: { response: response().text } } });
  });
  it("admits only one child under simultaneous continuations", async () => {
    const f = await fixture(); await run(f); await attempts.needsDecision(f.token, "Continue within the same accepted authorization");
    const results = await Promise.allSettled([f.continuation(), f.continuation()]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await client.query('SELECT count(*)::int AS n FROM "PlannerAttempt" WHERE artifact->>\'parentAttemptId\'=$1', [f.attempt.attemptId])).rows[0].n).toBe(1);
  });
  it("keeps missing accounting usage uncertain and blocks subsequent role dispatch", async () => {
    const f = await fixture(); let calls = 0;
    const dependencies = { adapter: () => ({ generateResponse: async () => { calls++; return { ...response(), usage: undefined }; } }) };
    await expect(dispatchMeteredProvider(workerProviderMeter(attempts, f.token), request(), dependencies)).rejects.toMatchObject({ detail: { code: "PROVIDER_FAILURE" } });
    await expect(dispatchMeteredProvider(workerProviderMeter(attempts, f.token), request(), dependencies)).rejects.toMatchObject({ detail: { code: "BUDGET_EXHAUSTED" } });
    expect(calls).toBe(1); expect((await attempts.resources(f.ownerId, f.attempt.attemptId)).snapshot.uncertainDispatch).toBe(true);
  });
  it("retains actual spend on physical response overflow without clipping the education", async () => {
    const f = await fixture();
    await expect(dispatchMeteredProvider(workerProviderMeter(attempts, f.token), request(), { adapter: () => ({ generateResponse: async () => ({ ...response(), text: "x".repeat(2 * 1024 * 1024 + 1) }) }) })).rejects.toMatchObject({ detail: { code: "PAYLOAD_TOO_LARGE" } });
    const row = (await client.query('SELECT reservation,"accountingState","completionTokens" FROM "AiUsageLog" WHERE "attemptId"=$1', [f.attempt.attemptId])).rows[0];
    expect(row).toMatchObject({ accountingState: "SETTLED", completionTokens: 80, reservation: { responseOverflow: true, accepted: false } });
    expect(row.reservation).not.toHaveProperty("result");
  });
});
