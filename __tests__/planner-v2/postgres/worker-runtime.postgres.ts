import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { fork, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createServer } from "node:net";
import { PlannerWorker } from "@/lib/planner/v2/server/worker";
import { connect, user } from "./database";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";
import { AttemptService, newBudget, type LeaseToken } from "@/lib/planner/v2/server/attempts";
import { IntentService } from "@/lib/planner/v2/server/intents";
import { intentFixture } from "../contracts/fixtures";

let connection: pg.Client; let pool: pg.Pool; let db: PlannerDatabase; let attempts: AttemptService;
const children = new Set<ChildProcess>();
beforeAll(async () => {
  connection = await connect(); pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 4 });
  db = new PlannerDatabase(pool); attempts = new AttemptService(db);
});
afterAll(async () => { for (const child of children) child.kill("SIGKILL"); await pool?.end(); await connection?.end(); });
async function queued(foreground = 0) {
  const ownerId = await user(connection); const created = await new IntentService(db).create(ownerId, randomUUID(), intentFixture());
  const budget = newBudget("EDUCATIONAL"); budget.foregroundProcessingMs = foreground;
  const attempt = await attempts.enqueue(ownerId, { key: randomUUID(), text: "Runtime recovery fixture", kind: "PLAN", budget,
    targets: [{ planId: created.plan.id, intentId: created.intent.intentVersionId, planningVersion: 0, baseRevisionId: null }] });
  return { ownerId, attempt };
}
function worker(attemptId: string, mode = "hold") {
  const child = fork(new URL("./worker-process-fixture.cjs", import.meta.url), [], { execArgv: [], silent: true,
    env: { NODE_ENV: "test", PATH: process.env.PATH, PLANNER_TEST_DATABASE_URL: process.env.PLANNER_TEST_DATABASE_URL,
      PLANNER_PHASE0_REQUIRED: "true", PLANNER_FIXTURE_ATTEMPT: attemptId, PLANNER_FIXTURE_MODE: mode } });
  children.add(child); child.once("exit", () => children.delete(child));
  return child;
}
async function event(child: ChildProcess, name: string): Promise<{ token: LeaseToken }> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: { event: string; token: LeaseToken }) => { if (message.event === name) { cleanup(); resolve(message); } };
    const onExit = () => { cleanup(); reject(new Error("Runtime fixture exited before its durable checkpoint")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Runtime fixture checkpoint timed out")); }, 7000);
    const cleanup = () => { clearTimeout(timer); child.off("message", onMessage); child.off("exit", onExit); };
    child.on("message", onMessage); child.once("exit", onExit);
  });
}
async function exit(child: ChildProcess, signal: NodeJS.Signals) {
  const ended = new Promise(resolve => child.once("exit", resolve)); child.kill(signal); await ended;
}
async function eventually(run: () => Promise<boolean>, limitMs: number) {
  const end = Date.now() + limitMs;
  while (Date.now() < end) { if (await run()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error("Durable runtime state did not converge before its bound");
}
describe("compiled worker process recovery against genuine PostgreSQL", () => {
  it("recovers SIGKILL through the real 45-second lease without resetting the root", async () => {
    const fixture = await queued(); const child = worker(fixture.attempt.attemptId); const original = await event(child, "checkpoint");
    const before = await attempts.read(fixture.ownerId, fixture.attempt.attemptId);
    await exit(child, "SIGKILL");
    await eventually(async () => { await attempts.sweep(); return (await attempts.read(fixture.ownerId, fixture.attempt.attemptId)).state === "QUEUED"; }, 52_000);
    const restarted = worker(fixture.attempt.attemptId, "recover"); const recovered = await event(restarted, "recovered");
    expect(recovered.token.fence).toBe(original.token.fence + 1);
    const after = await attempts.read(fixture.ownerId, fixture.attempt.attemptId);
    expect(after.budget).toEqual(before.budget); expect(after.checkpoint).toEqual(before.checkpoint); expect(after.state).toBe("NEEDS_DECISION");
    const payload = (await connection.query('SELECT payload FROM "PlannerAttempt" WHERE id=$1', [after.attemptId])).rows[0].payload;
    expect(payload.checkpoint.marker).toBe("durable_before_process_exit"); expect(payload.calls[0].state).toBe("UNKNOWN_SPEND");
    await expect(attempts.checkpoint(original.token, "PREFLIGHT", { late: true })).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
    await exit(restarted, "SIGTERM"); await attempts.cancel(fixture.ownerId, after.attemptId);
  }, 65_000);
  it("retires an SDK that ignores abort at the absolute root deadline", async () => {
    const fixture = await queued(179_000); const child = worker(fixture.attempt.attemptId); await event(child, "checkpoint");
    await eventually(async () => (await attempts.read(fixture.ownerId, fixture.attempt.attemptId)).state === "FAILED", 5000);
    const after = await attempts.read(fixture.ownerId, fixture.attempt.attemptId);
    expect(after.error?.code).toBe("BUDGET_EXHAUSTED"); expect(after.lease).toBeNull();
    expect((await connection.query('SELECT payload FROM "PlannerAttempt" WHERE id=$1', [after.attemptId])).rows[0].payload.calls[0].state).toBe("UNKNOWN_SPEND");
    await exit(child, "SIGTERM");
  });
  it("releases a hanging call on graceful shutdown and preserves its uncertainty", async () => {
    const fixture = await queued(); const child = worker(fixture.attempt.attemptId); await event(child, "checkpoint");
    const before = await attempts.read(fixture.ownerId, fixture.attempt.attemptId); const stoppedAt = Date.now(); await exit(child, "SIGTERM");
    expect(Date.now() - stoppedAt).toBeLessThan(3000);
    const after = await attempts.read(fixture.ownerId, fixture.attempt.attemptId);
    expect(after.state).toBe("QUEUED"); expect(after.budget).toEqual(before.budget); expect(after.checkpoint).toEqual(before.checkpoint);
    expect((await connection.query('SELECT payload FROM "PlannerAttempt" WHERE id=$1', [after.attemptId])).rows[0].payload.calls[0].state).toBe("UNKNOWN_SPEND");
    await attempts.cancel(fixture.ownerId, after.attemptId);
  });
  it("runs the packaged main entrypoint and reports liveness separately from unregistered intelligence readiness", async () => {
    const listener=createServer();await new Promise<void>(resolve=>listener.listen(0,"127.0.0.1",resolve));
    const port=(listener.address() as {port:number}).port;await new Promise<void>(resolve=>listener.close(()=>resolve()));
    const child=spawn(process.execPath,["dist/planner-worker/main.js"],{env:{NODE_ENV:"test",PATH:process.env.PATH,DATABASE_WORKER_URL:process.env.PLANNER_TEST_DATABASE_URL,PLANNER_WORKER_HEALTH_PORT:String(port)},stdio:"ignore"});
    children.add(child);child.once("exit",()=>children.delete(child));
    try {
      await eventually(async()=>{if(child.exitCode!==null)throw new Error("Packaged worker exited before liveness");try{return(await fetch(`http://127.0.0.1:${port}/live`,{signal:AbortSignal.timeout(500)})).status===200;}catch{return false;}},5000);
      const response=await fetch(`http://127.0.0.1:${port}/ready`);const health=await response.json();
      expect(response.status).toBe(503);expect(health).toMatchObject({compatible:true,ready:false,claiming:false,running:0});expect(health.lastSweepAt).toBeTruthy();
    } finally {if(child.exitCode===null)await exit(child,"SIGTERM");}
  });
  it("fails readiness and claiming when an execution backstop is absent, then recovers after restoration", async () => {
    const worker=new PlannerWorker(attempts,{PLAN:async()=>{}});
    await connection.query('ALTER TABLE "Quest" DISABLE TRIGGER planner_v2_execution_quest');
    try {
      expect((await worker.readiness()).compatible).toBe(false);
      await expect(worker.tick()).rejects.toMatchObject({detail:{code:"WORKER_UNAVAILABLE"}});
    } finally {await connection.query('ALTER TABLE "Quest" ENABLE TRIGGER planner_v2_execution_quest');}
    expect((await worker.readiness()).compatible).toBe(true);
  });

});
