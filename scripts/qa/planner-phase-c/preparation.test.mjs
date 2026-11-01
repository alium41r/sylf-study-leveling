import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readKey, getMetadata, preflight, allowedPaths, origin } from "./preflight.mjs";
import { funding, maximumModelUsd, validateBank, modelPacket, reportPath } from "./prepare.mjs";
const bank = JSON.parse(readFileSync(`${reportPath}/CASE_BANK.json`, "utf8"));
const evaluator = JSON.parse(readFileSync(`${reportPath}/EVALUATOR_ONLY.json`, "utf8"));
const model = { id: "deepseek-flash", name: "Test Flash", context_window: 1048576, max_output_tokens: 393216, effort: { supported_levels: ["high"] } };

test("metadata preflight cannot dispatch to any generating, tool or foreign endpoint", async () => {
  let requests = 0;
  for (const path of ["/chat/completions", "/v1/tools/search", "/v1/tools/fetch", "https://foreign.invalid/models", "/models?url=foreign"]) {
    await assert.rejects(getMetadata(path, "dummy", async () => { requests++; }), /METADATA_GET_ONLY/);
  }
  assert.equal(requests, 0); assert.deepEqual(allowedPaths, ["/models", "/user/balance"]);
});
test("metadata preflight uses only fixed-origin GET, forbids redirects and preserves no credential", async () => {
  const seen = [];
  const result = await preflight(process.cwd(), { key: "dummy-secret", request: async (url, options) => {
    seen.push(url); assert.equal(options.method, "GET"); assert.equal(options.redirect, "error"); assert.equal(options.headers.Authorization, "Bearer dummy-secret");
    return new Response(JSON.stringify(url.endsWith("/models") ? { data: [model] } : { is_available: true, balance_infos: [{ currency: "USD", total_balance: "2.14" }] }));
  } });
  assert.deepEqual(seen, allowedPaths.map(path => origin + path)); assert.equal(result.status, "METADATA_REACHABLE"); assert.equal(result.paidCalls, 0);
  assert.equal(JSON.stringify(result).includes("dummy-secret"), false);
});
test("unavailable model capability is incomplete even when both GETs succeed", async () => {
  const result = await preflight(process.cwd(), { key: "dummy", request: async url => new Response(JSON.stringify(url.endsWith("/models") ? { data: [{ ...model, max_output_tokens: 4096 }] } : { is_available: true, balance_infos: [] })) });
  assert.equal(result.status, "INCOMPLETE");
});
test("HTTP rejection and transport uncertainty never retain echoed provider errors or claim success", async () => {
  const rejected = await getMetadata("/models", "dummy", async () => new Response('echoed secret and diagnostics', { status: 401 }));
  assert.deepEqual(rejected, { path: "/models", status: 401, ok: false });
  const uncertain = await getMetadata("/models", "dummy", async () => { throw Object.assign(new Error("secret"), { cause: { code: "ENOTFOUND" } }); });
  assert.deepEqual(uncertain, { path: "/models", ok: false, error: "ENOTFOUND" });
});
test("oversized metadata is bounded and cannot become successful evidence", async () => {
  const value = await getMetadata("/models", "dummy", async () => new Response("x".repeat(65537)));
  assert.equal(value.ok, false); assert.equal("data" in value, false);
});
test("credential loading matches existing in-memory sanitation without changing files", () => {
  const folder = mkdtempSync(join(tmpdir(), "sylf-phase-c-key-test-"));
  try {
    const source = 'DEEPSEEK_API_KEY="fake\u200b-key"\nOTHER_SECRET=not-loaded\n'; writeFileSync(join(folder, ".env.local"), source);
    assert.equal(readKey(folder, {}), "fake-key"); assert.equal(readKey(folder, { DEEPSEEK_API_KEY: "  env\u200b-key " }), "env-key");
    assert.equal(readFileSync(join(folder, ".env.local"), "utf8"), source);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
test("frozen bank has diverse packets and excludes evaluator labels and keys from model input", () => {
  assert.equal(validateBank(bank, evaluator).id, "C01"); assert.equal(bank.cases.length, 12);
  const packet = modelPacket({ ...bank.cases[0], accidentalEvaluatorNote: "must stay out" });
  for (const property of ["id", "partition", "expectedJourney", "clarificationFacts", "fixtureRequirements", "accidentalEvaluatorNote"]) assert.equal(property in packet, false);
  for (const hidden of evaluator.pilot.hiddenTransferItems) assert.equal(JSON.stringify(packet).includes(hidden.question), false);
  assert.equal("kind" in packet.materials[0], false);
});
test("a leaked hidden answer or third mutation target blocks preparation", () => {
  const leaked = structuredClone(bank); leaked.cases[0].acceptedInstructions += evaluator.pilot.hiddenTransferItems[0].question;
  assert.throws(() => validateBank(leaked, evaluator), /EVALUATOR_LEAK/);
  const broad = structuredClone(bank); broad.cases[0].goals.push(broad.cases[0].goals[0]); assert.throws(() => validateBank(broad, evaluator), /CASE_PACKET/);
});
test("conservative funding covers full downstream role escrows without a smaller generation cap", () => {
  assert.equal(maximumModelUsd(), 1.74); assert.ok(maximumModelUsd() < funding.proposedAuthorizationUsd);
  assert.ok(funding.roleInputUnits * 6 <= funding.inputUnits); assert.ok(funding.roleCompletionTokens * 6 <= funding.completionTokens);
  assert.equal(funding.roleCompletionTokens, 65536); assert.equal(funding.processingMs, 4 * 3600000);
});
test("preparation CLI rejects paid/live flags before writing any manifest", () => {
  const result = spawnSync(process.execPath, ["scripts/qa/planner-phase-c/prepare.mjs", "--live"], { encoding: "utf8" });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /PREPARATION_ONLY_NO_LIVE_FLAGS/);
});
