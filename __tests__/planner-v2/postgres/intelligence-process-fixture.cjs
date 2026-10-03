/* Real compiled modules and PostgreSQL; synthetic provider reply, no Next or
 * Vitest aliases, no provider credentials, no hosted database. */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- This fixture verifies the compiled CommonJS worker in ordinary Node. */
const path = require("node:path");
const pg = require("pg");
const { PlannerDatabase } = require(path.resolve("dist/planner-worker/planner/v2/server/database.js"));
const { AttemptService } = require(path.resolve("dist/planner-worker/planner/v2/server/attempts.js"));
const { dispatchMeteredProvider, workerProviderMeter } = require(path.resolve("dist/planner-worker/planner/v2/intelligence/provider.js"));
const address = new URL(process.env.PLANNER_TEST_DATABASE_URL);
if (address.hostname !== "127.0.0.1" || !/^\/sylf_planner_phase1_[a-f0-9]{16}$/.test(address.pathname) || process.env.PLANNER_PHASE0_REQUIRED !== "true") throw new Error("Disposable database required");
const pool = new pg.Pool({ connectionString: address.toString(), max: 2 });
(async () => {
  try {
    const marker = (await pool.query("SELECT token FROM public.__planner_phase0_identity")).rows[0].token;
    if (marker !== process.env.PLANNER_PHASE0_DATABASE_MARKER) throw new Error("Disposable marker mismatch");
    const attempts = new AttemptService(new PlannerDatabase(pool));
    const token = await attempts.claim(`compiled_step2_${process.pid}`);
    if (token?.attemptId !== process.env.PLANNER_FIXTURE_ATTEMPT) throw new Error("Isolated admission required");
    const result = await dispatchMeteredProvider(workerProviderMeter(attempts, token), {
      messages: [{ role: "user", content: "Compiled boundary fixture" }], systemInstruction: "Return JSON", outputTokens: 512,
      policy: { purpose: "BLUEPRINT", reviewReserve: { inputTokens: 4096, outputTokens: 2048 } }, validate: r => JSON.parse(r.text),
    }, { adapter: () => ({ generateResponse: async (_messages, _system, _tools, options) => {
      const logs = (await pool.query('SELECT "accountingState" FROM "AiUsageLog" WHERE "attemptId"=$1', [token.attemptId])).rows;
      if (logs.length !== 1 || logs[0].accountingState !== "DISPATCHED" || !options.singleAttempt) throw new Error("Dispatch was not durably metered first");
      return { text: '{"ok":true}', finishReason: "STOP", usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 } };
    } }) });
    const artifact = await attempts.read(token.ownerId, token.attemptId);
    await attempts.cancel(token.ownerId, token.attemptId);
    process.stdout.write(JSON.stringify({ compiled: true, node: process.version, ok: result.value.ok, modelCalls: artifact.budget.consumed.modelCalls }) + "\n");
  } finally { await pool.end(); }
})().catch(error => { process.stderr.write(`Compiled boundary failure: ${error.detail?.code ?? error.message}\n`); process.exitCode = 1; });
