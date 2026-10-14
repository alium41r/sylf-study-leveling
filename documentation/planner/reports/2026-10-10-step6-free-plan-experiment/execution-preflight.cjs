#!/usr/bin/env node
'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- VM-local simulated approval and transport; never enables real paid execution. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm'), assert = require('node:assert/strict');
const P = require('./prepare.cjs'), { Guard } = require('./guard.cjs'), { technicalProposal } = require('./preflight.cjs');

async function trial(mode) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sylf-unpaid-execution-'));
  const manifest = P.read('run-manifest.json'), now = new Date().toISOString(); let calls = 0, awake = 0, released = false;
  const put = (file, value) => { const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n'); };
  put('run-manifest.json', manifest); put('freeze.json', { mock: true, noAuthorization: true });
  put('evidence/preflight.json', { status: 'UNPAID_PREFLIGHT_PASS_SIGNED_OFF_AWAITING_APPROVAL', checkedAt: now, externalCalls: 0 });
  const digest = file => P.sha(fs.readFileSync(path.join(directory, file)));
  const approval = { status: 'HUMAN_APPROVED', humanMessage: 'SIMULATED IN VM ONLY — THIS DOES NOT AUTHORIZE SPENDING.', maximumTotalDispatches: 4, maximumSpendUsd: .20,
    manifestSha256: digest('run-manifest.json'), freezeSha256: digest('freeze.json'), preflightSha256: digest('evidence/preflight.json'),
    matchedStandaloneCapTokens: 32768, productionChangesAuthorized: false, approvedAt: now, rateVerifiedAt: now,
    rateSource: 'https://api-docs.deepseek.com/quick_start/pricing/', maximumPeakUsdPerMillion: { input: .30, output: 1.20 } };
  if (mode === 'no_approval') approval.status = 'NOT_AUTHORIZED';
  if (mode === 'stale') approval.approvedAt = '2000-01-01T00:00:00Z';
  if (mode === 'changed_hash') approval.manifestSha256 = 'WRONG';
  if (mode === 'raised_ceiling') approval.maximumSpendUsd = .40;
  if (mode === 'changed_rate') approval.maximumPeakUsdPerMillion.output = 1.21;
  put('approval.json', approval); // Only inside disposable VM fixture, never in the real report directory.
  const context = vm.createContext({ module: { exports: {} }, setTimeout, clearTimeout, setInterval, clearInterval, AbortController, Date, Buffer,
    process: { env: { DEEPSEEK_API_KEY: 'OFFLINE_DUMMY_KEY' } } });
  context.global = context;
  context.fetch = async () => { throw new Error('UNPAID_TRANSPORT_MUST_BE_INSTALLED'); };
  class MockAdapter {
    constructor(key, model) { assert.equal(key, 'OFFLINE_DUMMY_KEY'); assert.equal(model, 'deepseek-flash'); }
    async generateResponse(messages, systemInstruction, tools, options) {
      const r = manifest.runs[calls], packet = P.read(r.packet), body = P.read(r.wire);
      assert.equal(JSON.stringify(messages), JSON.stringify(packet.messages)); assert.equal(systemInstruction, packet.systemInstruction);
      assert.equal(tools.length, 0); assert.equal(options.maxTokens, 32768); assert.equal(options.singleAttempt, true); assert.equal(options.reasoningEffort, 'high');
      const response = await context.fetch('https://api.deepseek.com/chat/completions', { method: 'POST', body: JSON.stringify(body), signal: options.signal });
      const raw = await response.json(); return { finishReason: raw.choices[0].finish_reason === 'length' ? 'MAX_TOKENS' : 'STOP' };
    }
  }
  const source = fs.readFileSync(path.join(P.here, 'execute.cjs'), 'utf8').replace(/^#!.*\n/, '');
  context.require = name => {
    if (name === './prepare.cjs') return { ...P, here: directory, read: file => ['approval.json','evidence/preflight.json'].includes(file)
      ? vm.runInContext('JSON.parse(' + JSON.stringify(fs.readFileSync(path.join(directory, file), 'utf8')) + ')', context) : P.read(file),
      runtime: name => name === 'ai/providers/deepseek' ? { DeepSeekAdapter: MockAdapter } : P.runtime(name) };
    if (name === './guard.cjs') return { Guard, checkFrozen: () => manifest };
    if (name.endsWith('/sleep.cjs')) return { preventSleep: async () => ({ initial: { mock: true }, check: () => { awake++; if (mode === 'lost_sleep' && awake >= 2) throw new Error('SLEEP_GUARD_LOST'); }, release: () => { released = true; } }) };
    return require(name);
  };
  // This transport is captured by the actual loop; it is not fetch and has no network implementation.
  context.fetch = async () => {
    const r = manifest.runs[calls++], c = P.read('cases.json').find(c => c.id === r.caseId);
    if (mode === 'http_failure') return { ok: false };
    const content = r.arm === 'structured' ? JSON.stringify(technicalProposal(c)) : 'UNPAID, UNASSESSED NATURAL PLAN STUB';
    const raw = { model: 'deepseek-flash', system_fingerprint: 'unpaid-fixed', choices: [{ finish_reason: mode === 'length' ? 'length' : 'stop', message: { content: mode === 'blank' ? '' : content } }],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100, completion_tokens_details: { reasoning_tokens: 150 } } };
    if (mode === 'fingerprint_drift' && calls === 2) raw.system_fingerprint = 'changed';
    if (mode === 'fingerprint_disappears' && calls === 2) delete raw.system_fingerprint;
    if (mode === 'fingerprint_appears' && calls === 1) delete raw.system_fingerprint;
    if (mode === 'unknown_usage') delete raw.usage.completion_tokens_details;
    if (mode === 'malformed_structure' && r.arm === 'structured') raw.choices[0].message.content = '{malformed';
    return { ok: true, json: async () => raw };
  };
  try {
    new vm.Script(source, { filename: 'execute.cjs' }).runInContext(context);
    if (mode === 'success' || mode === 'malformed_structure') {
      // execute is lexical, deliberately not a real CLI invocation or exported live transport.
      await vm.runInContext('execute()', context);
      assert.equal(calls, 4); assert(released);
      const results = JSON.parse(fs.readFileSync(path.join(directory, 'evidence/paid-run/results.json'), 'utf8'));
      assert.equal(results.length, 4);
      if (mode === 'success') assert(results.filter(r => r.technical).every(r => r.technical.allocation.status === 'FEASIBLE'));
      else assert.equal(results.filter(r => r.validationError).length, 2);
    } else {
      await assert.rejects(vm.runInContext('execute()', context));
      const fingerprintMode = mode.startsWith('fingerprint_');
      assert(calls <= (fingerprintMode ? 2 : 1), 'Failure must prevent every subsequent dispatch');
      if (fingerprintMode) assert.equal(calls, 2);
      if (['no_approval','stale','changed_hash','raised_ceiling','changed_rate','lost_sleep'].includes(mode)) assert.equal(calls, 0);
    }
    return { mode, unpaidMockDispatches: calls, noExternalTransport: true };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

(async () => {
  global.fetch = async () => { throw new Error('NETWORK_DISABLED_FOR_EXECUTION_PREFLIGHT'); };
  const cases = ['success','malformed_structure','no_approval','stale','changed_hash','raised_ceiling','changed_rate','length','blank','unknown_usage','http_failure','lost_sleep',
    'fingerprint_drift','fingerprint_disappears','fingerprint_appears'];
  const results = [];
  for (const mode of cases) results.push(await trial(mode));
  const evidence = { status: 'UNPAID_EXECUTION_LOOP_PASS', checkedAt: new Date().toISOString(), externalCalls: 0, paidCalls: 0,
    simulatedApprovalOnlyInDisposableVm: true, modes: results.length, results };
  P.write('evidence/execution-preflight.json', evidence); process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
