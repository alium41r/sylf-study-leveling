#!/usr/bin/env node
'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone, approval-gated diagnostic; never creates production artifacts. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const P = require('./prepare.cjs'), { Guard, checkFrozen } = require('./guard.cjs');
const { preventSleep } = require('../2026-10-09-step6-controlled-diagnostics/initial-block/sleep.cjs');

function requireApproval(now = Date.now()) {
  const manifest = checkFrozen(), approval = P.read('approval.json'), preflight = P.read('evidence/preflight.json');
  assert.equal(approval.status, 'HUMAN_APPROVED'); assert.equal(approval.maximumTotalDispatches, 4); assert.equal(approval.maximumSpendUsd, .20);
  assert.equal(approval.manifestSha256, P.sha(fs.readFileSync(path.join(P.here, 'run-manifest.json'))));
  assert.equal(approval.freezeSha256, P.sha(fs.readFileSync(path.join(P.here, 'freeze.json'))));
  assert.equal(approval.matchedStandaloneCapTokens, 32768); assert.equal(approval.productionChangesAuthorized, false);
  assert(typeof approval.humanMessage === 'string' && approval.humanMessage.trim().length > 0);
  assert.equal(preflight.status, 'UNPAID_PREFLIGHT_PASS_SIGNED_OFF_AWAITING_APPROVAL'); assert.equal(preflight.externalCalls, 0);
  assert.equal(approval.preflightSha256, P.sha(fs.readFileSync(path.join(P.here, 'evidence/preflight.json'))));
  for (const time of [approval.approvedAt, approval.rateVerifiedAt, preflight.checkedAt])
    assert(Number.isFinite(Date.parse(time)) && now >= Date.parse(time) && now - Date.parse(time) <= 86400000, 'STALE_APPROVAL_RATE_OR_PREFLIGHT');
  assert.equal(approval.rateSource, 'https://api-docs.deepseek.com/quick_start/pricing/');
  assert.deepEqual(approval.maximumPeakUsdPerMillion, { input: .30, output: 1.20 });
  return manifest;
}

function validateStructured(caseId, text) {
  const c = P.read('cases.json').find(c => c.id === caseId), f = P.fixture(c), B = P.runtime('planner/v2/intelligence/blueprint');
  const raw = P.runtime('planner/v2/intelligence/provider').extractJsonValue(text);
  const result = B.validateCompactLearningProposal(raw, f.input);
  const expanded = B.expandDeclaredSplits(result.snapshot, f.input.envelope, result.kept, new Map([['plan_1',30]]));
  const allocation = P.runtime('planner/v2/intelligence/allocator').allocateLearning(expanded.snapshot, f.input.envelope, f.allocationFacts);
  return { canonicalProposal: { ...result, ...expanded, kept: [...result.kept] }, allocation };
}

async function execute() {
  const manifest = requireApproval(); // No live-key adapter or network call before all approval gates.
  assert(!fs.existsSync(path.join(P.here, 'STOP')), 'OPERATOR_STOP');
  const key = process.env.DEEPSEEK_API_KEY; assert(key, 'MISSING_KEY');
  const directory = path.join(P.here, 'evidence/paid-run'), guard = new Guard(directory, manifest);
  let sleep;
  try { sleep = await preventSleep(); } catch (error) { guard.halt('SLEEP_GUARD_UNAVAILABLE'); guard.release(); throw error; }
  const transport = global.fetch, started = Date.now(), results = [];
  const persist = (file, value) => fs.writeFileSync(path.join(directory, file), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  let fingerprint;
  try {
    persist('sleep.json', sleep.initial);
    for (const trial of manifest.runs) {
      checkFrozen(); sleep.check(); assert(!fs.existsSync(path.join(P.here, 'STOP')), 'OPERATOR_STOP');
      assert(Date.now() - started < manifest.globalExecutionTimeoutMs, 'GLOBAL_DEADLINE');
      const call = guard.reserve(trial), controller = new AbortController();
      const remaining = manifest.globalExecutionTimeoutMs - (Date.now() - started);
      const timer = setTimeout(() => controller.abort(new Error('DIAGNOSTIC_TIMEOUT')), Math.min(manifest.callTimeoutMs, remaining));
      const poll = setInterval(() => {
        try { sleep.check(); assert(!fs.existsSync(path.join(P.here, 'STOP')), 'OPERATOR_STOP'); }
        catch (error) { controller.abort(error); }
      }, 5000);
      let content, rawReceipt;
      global.fetch = async (url, options) => {
        sleep.check(); assert(!controller.signal.aborted && !fs.existsSync(path.join(P.here, 'STOP')), 'OPERATOR_STOP_OR_CANCELLED');
        guard.wire(call, trial, url, options);
        const before = Date.now();
        const response = await transport(url, { ...options, redirect: 'error' });
        assert(response.ok, 'HTTP_FAILURE_SPEND_UNCERTAIN');
        const raw = await response.json();
        content = raw.choices?.[0]?.message?.content ?? null;
        // Preserve the bounded billing/final-content receipt even if usage validation fails.
        rawReceipt = { model: raw.model, system_fingerprint: raw.system_fingerprint ?? null, usage: raw.usage,
          finish_reason: raw.choices?.[0]?.finish_reason ?? null, content };
        persist(trial.trialId + '.receipt.json', rawReceipt);
        guard.settle(call, trial, raw, Date.now() - before);
        assert.equal(raw.choices?.length, 1, 'UNEXPECTED_CHOICES');
        assert(!raw.choices[0].message?.tool_calls, 'UNEXPECTED_TOOL_CALL');
        const nextFingerprint = raw.system_fingerprint ?? null;
        assert(nextFingerprint === null || typeof nextFingerprint === 'string', 'INVALID_PROVIDER_FINGERPRINT');
        if (fingerprint !== undefined) assert.equal(nextFingerprint, fingerprint, 'PROVIDER_FINGERPRINT_DRIFT');
        else fingerprint = nextFingerprint;
        return { ok: true, json: async () => raw };
      };
      try {
        const packet = P.read(trial.packet), { DeepSeekAdapter } = P.runtime('ai/providers/deepseek');
        const result = await new DeepSeekAdapter(key, 'deepseek-flash').generateResponse(packet.messages, packet.systemInstruction, [], { ...packet.options, signal: controller.signal });
        sleep.check(); assert(!controller.signal.aborted, 'CANCELLED_AFTER_RESPONSE');
        assert.equal(result.finishReason, 'STOP', 'INCOMPLETE_PROVIDER_RESPONSE'); assert(content && content.trim(), 'BLANK_FINAL_RESPONSE');
        let technical = null, validationError = null;
        if (trial.arm === 'structured') {
          try { technical = validateStructured(trial.caseId, content); }
          catch (error) { validationError = { name: error.name, message: error.message }; } // Keep the complete reply; never repair or fall back.
        }
        results.push({ trialId: trial.trialId, content, technical, validationError }); persist('results.json', results);
        // A complete schema rejection is informative: permit its matched peer without changing anything.
      } catch (error) {
        guard.halt(call.status === 'SETTLED' ? error.message : 'TRANSPORT_OR_SPEND_UNCERTAINTY');
        persist('stopped.json', { trialId: trial.trialId, error: error.message, dispatchedCalls: guard.state.calls.length, nextDispatchForbidden: true });
        throw error;
      } finally { clearTimeout(timer); clearInterval(poll); global.fetch = transport; }
    }
    persist('completed.json', { status: 'PAID_CALLS_FINISHED_AWAITING_INDEPENDENT_EVALUATION', calls: results.length, furtherCallsAuthorized: false });
  } finally { global.fetch = transport; sleep.release(); guard.release(); }
}

if (require.main === module) {
  assert.equal(process.argv[2], 'paid', 'Only explicit approval-gated paid execution is supported here. Preparation uses prepare.cjs/preflight.cjs.');
  execute().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
module.exports = { requireApproval, validateStructured };
