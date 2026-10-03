/* eslint-disable @typescript-eslint/no-require-imports -- Exercises the compiled CommonJS worker in a separate process. */
// Controlled runtime fixture; no provider, intelligence handler or hosted URL.
const { Pool } = require("pg");
const { PlannerDatabase } = require("../../../dist/planner-worker/planner/v2/server/database.js");
const { AttemptService } = require("../../../dist/planner-worker/planner/v2/server/attempts.js");
const { PlannerWorker } = require("../../../dist/planner-worker/planner/v2/server/worker.js");
const url = new URL(process.env.PLANNER_TEST_DATABASE_URL);
if (url.hostname !== "127.0.0.1" || !/^\/sylf_planner_phase1_[a-f0-9]{16}$/.test(url.pathname) || process.env.PLANNER_PHASE0_REQUIRED !== "true") throw new Error("Disposable runtime required");
const pool = new Pool({ connectionString: url.toString(), max: 4, statement_timeout: 5000 });
const attempts = new AttemptService(new PlannerDatabase(pool));
const worker = new PlannerWorker(attempts, { PLAN: async ({ token }) => {
  if (token.attemptId !== process.env.PLANNER_FIXTURE_ATTEMPT) throw new Error("Unexpected fixture job");
  if (process.env.PLANNER_FIXTURE_MODE === "recover") {
    await attempts.needsDecision(token, "Continue from the verified durable checkpoint?");
    process.send({ event: "recovered", token });
    return;
  }
  const callId = await attempts.reserveCall(token, { provider: "controlled-runtime", model: "stub", inputTokens: 100, outputTokens: 100, category: "PLANNING" });
  await attempts.dispatchCall(token, callId, "PLANNING");
  await attempts.checkpoint(token, "PREFLIGHT", { marker: "durable_before_process_exit" });
  process.send({ event: "checkpoint", token });
  // Deliberately ignore AbortSignal to test a hanging SDK. The supervisor must
  // release/terminate its lease without waiting forever for this promise.
  await new Promise(() => {});
} }, event => process.send?.(event));
let ticking = false;
const timer = setInterval(() => {
  if (ticking) return;
  ticking = true;
  void worker.tick().catch(() => process.send?.({ event: "tick_failed" })).finally(() => { ticking = false; });
}, 100);
process.once("SIGTERM", async () => {
  clearInterval(timer);
  await worker.shutdown();
  await pool.end();
  process.exit(0);
});
