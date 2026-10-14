'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Unpaid diagnostic guard regression tests. */
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { SpendingGuard, executeTrial, allowance, here } = require('./guard.cjs');
const { requireApproval, validator } = require('./block.cjs');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'run-manifest.json'))), trial = manifest.runs[0];
const route = { provider: 'deepseek', model: 'deepseek-flash' };
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sylf-diagnostic-guard-'));
const meter = () => ({ reserve: async () => 'test-call', window: async () => ({ now: Date.now(), deadline: Date.now() + 180000 }), settle: async () => {}, close: async () => {}, lateUsage: async () => {} });
const raw = overrides => ({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: '{"strategy":"Scripted transport fixture; no educational claim."}' } }],
  usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 }, ...overrides });
async function dispatch(guard, response, options = {}) {
  let wires = 0;
  const result = await executeTrial({ guard, trial, meter: meter(), key: 'UNPAID_DUMMY_KEY', assertAwake: async () => {}, validate: r => JSON.parse(r.text),
    transport: async () => { wires++; return { ok: true, json: async () => response }; }, ...options });
  return { result, wires };
}
function scoped(fn, ceiling) { const directory = temp(), guard = new SpendingGuard(directory, manifest, ceiling); return Promise.resolve().then(() => fn(guard, directory)).finally(() => { guard.release(); fs.rmSync(directory, { recursive: true, force: true }); }); }

test('pending approval rejects before any provider setup', () => assert.throws(() => requireApproval(path.join(__dirname, 'approval-template.json')), /explicit user approval/));
test('all twenty full reservations fit $0.40 without reusing savings', () => scoped(guard => {
  for (const t of manifest.runs) { const call = guard.reserve(t, route, t.inputReservationUnits, t.outputTokenCap); call.status = 'SETTLED'; }
  assert.equal(guard.state.calls.reduce((n, c) => n + c.reservedNanodollars, 0), 194336400);
  assert.equal(allowance(189036, 114688), 194336400);
}));
test('ceiling is enforced before canonical reserve or wire dispatch', () => scoped(async guard => {
  const { result, wires } = await dispatch(guard, raw()); assert.equal(wires, 0); assert.equal(result.errorCode, 'BUDGET_EXHAUSTED');
  assert.equal(guard.state.calls.length, 0);
}, allowance(trial.inputReservationUnits, trial.outputTokenCap) - 1));
test('raising the ceiling, unowned cases, Gemini, changed model and caps fail closed', () => scoped(guard => {
  assert.throws(() => new SpendingGuard(temp(), manifest, 400000001));
  for (const [t, r, i, o] of [[{ trialId: 'foreign' }, route, 1, 1], [trial, { provider: 'gemini', model: 'gemini-2.5-flash' }, trial.inputReservationUnits, trial.outputTokenCap],
    [trial, { ...route, model: 'deepseek-v4-pro' }, trial.inputReservationUnits, trial.outputTokenCap], [trial, route, trial.inputReservationUnits, trial.outputTokenCap + 1]]) assert.throws(() => guard.reserve(t, r, i, o));
  assert.equal(guard.state.calls.length, 0);
}));
test('valid actual adapter/dispatcher transport settles once with nullable canonical cost', () => scoped(async guard => {
  const { result, wires } = await dispatch(guard, raw()); assert.equal(result.status, 'VALIDATED'); assert.equal(wires, 1);
  assert.equal(guard.state.calls[0].canonicalUsage.costUsd, null); assert.equal(guard.state.calls[0].actualNanodollars, 42000);
}));
test('unknown usage retains full reservation and prevents the next call', () => scoped(async guard => {
  const { result, wires } = await dispatch(guard, raw({ usage: undefined })); assert.equal(result.status, 'REJECTED'); assert.equal(wires, 1);
  assert(guard.state.stopped); assert.equal(guard.state.calls[0].actualNanodollars, null);
  const next = manifest.runs[1]; assert.throws(() => guard.reserve(next, route, next.inputReservationUnits, next.outputTokenCap));
}));
test('missing counters, mismatched totals, negative/oversized usage and returned-model drift stop', async () => {
  for (const response of [raw({ usage: { prompt_tokens: 100, total_tokens: 100 } }), raw({ usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 999 } }),
    raw({ usage: { prompt_tokens: 100, completion_tokens: -1, total_tokens: 99 } }),
    raw({ usage: { prompt_tokens: 100, completion_tokens: 8193, total_tokens: 8293 } }), raw({ model: 'deepseek-v4-pro' })]) await scoped(async guard => {
    const { wires } = await dispatch(guard, response); assert.equal(wires, 1); assert(guard.state.stopped);
  });
});
test('adapter/HTTP failure makes one attempt and cannot fall back to Gemini', () => scoped(async guard => {
  let count = 0;
  const { result } = await dispatch(guard, raw(), { transport: async () => { count++; return { ok: false, status: 400, text: async () => 'parameter rejected' }; } });
  assert.equal(count, 1); assert.equal(result.status, 'REJECTED'); assert(guard.state.stopped);
}));
test('known clipping and invalid structured content are failures with no fallback/retry', async () => {
  for (const response of [raw({ choices: [{ finish_reason: 'length', message: { content: '{"strategy":' } }] }), raw({ choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }] })]) await scoped(async guard => {
    const { result, wires } = await dispatch(guard, response); assert.equal(result.status, 'REJECTED'); assert.equal(wires, 1);
    assert.equal(result.rejected, response.choices[0].message.content); assert.equal(guard.state.calls[0].status, 'SETTLED');
    assert.throws(() => guard.reserve(trial, route, trial.inputReservationUnits, trial.outputTokenCap));
  });
});
test('duplicate/concurrent reservations and persistent-journal restart cannot reset spend', () => scoped((guard, directory) => {
  guard.reserve(trial, route, trial.inputReservationUnits, trial.outputTokenCap);
  assert.throws(() => new SpendingGuard(directory, manifest));
  const next = manifest.runs[1]; assert.throws(() => guard.reserve(next, route, next.inputReservationUnits, next.outputTokenCap));
  guard.release(); assert.throws(() => new SpendingGuard(directory, manifest), /RECONCILIATION/);
}));
test('failed persistence and lost sleep assertion prevent network dispatch', async () => {
  await scoped(async guard => { guard.save = () => { throw new Error('DISK_FAILURE'); }; const { wires } = await dispatch(guard, raw()); assert.equal(wires, 0); });
  await scoped(async guard => { const { wires } = await dispatch(guard, raw(), { assertAwake: async () => { throw new Error('SLEEP_GUARD_LOST'); } }); assert.equal(wires, 0); assert(guard.state.stopped); });
});
test('wire payload/endpoint drift and second HTTP attempt are rejected', () => scoped(guard => {
  const call = guard.reserve(trial, route, trial.inputReservationUnits, trial.outputTokenCap), packet = JSON.parse(fs.readFileSync(path.join(here, trial.packet)));
  const body = { model: 'deepseek-flash', messages: [{ role: 'system', content: packet.systemInstruction.trim() }, ...packet.messages], stream: false, response_format: { type: 'json_object' }, max_tokens: packet.outputTokens };
  assert.throws(() => guard.wire(call, 'https://api.deepseek.com/chat/completions', { method: 'POST', body: JSON.stringify({ ...body, temperature: 0.2 }) }, packet));
  assert.throws(() => guard.wire(call, 'https://another.example/chat/completions', { method: 'POST', body: JSON.stringify(body) }, packet));
  guard.wire(call, 'https://api.deepseek.com/chat/completions', { method: 'POST', body: JSON.stringify(body) }, packet);
  assert.throws(() => guard.wire(call, 'https://api.deepseek.com/chat/completions', { method: 'POST', body: JSON.stringify(body) }, packet));
}));
test('a malformed grounded review preserves its rejected concern and cannot recover or pass', () => scoped(async guard => {
  const trial = manifest.runs.find(t => t.caseId === 'v01');
  const fixture = JSON.parse(fs.readFileSync(path.join(here, 'evaluator/labels.json'))).repair.v01.originalFindings[0];
  const finding = structuredClone(fixture.finding); finding.grounds[1].excerpt = 'UNSUPPORTED_QUOTATION';
  const content = JSON.stringify({ plans: [{ planRef: fixture.planRef, issues: [finding] }] });
  const { result, wires } = await dispatch(guard, raw({ choices: [{ finish_reason: 'stop', message: { content } }] }), { trial, validate: validator(trial) });
  assert.equal(result.status, 'REJECTED'); assert.equal(wires, 1); assert.equal(result.rejected, content);
  assert(result.rejected.includes(finding.issueId)); assert.equal(guard.state.calls.length, 1);
}));
test('canonical accounting failures block further calls', async () => {
  for (const method of ['window', 'settle', 'close']) await scoped(async guard => {
    const failing = { ...meter(), [method]: async () => { throw new Error('ACCOUNTING_FAILURE'); } };
    await dispatch(guard, raw(), { meter: failing }); assert(guard.state.stopped);
  });
});
test('an aborted transport keeps its full unknown reservation and makes no retry', () => scoped(async guard => {
  const deadline = Date.now() + 500;
  const { result, wires } = await dispatch(guard, raw(), { meter: { ...meter(), window: async () => ({ now: Date.now(), deadline }) },
    transport: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('ABORTED')), { once: true })) });
  assert.equal(result.status, 'REJECTED'); assert.equal(wires, 0); // helper count belongs to its intercepted fixture, not overridden transport
  assert.equal(guard.state.calls[0].wires, 1); assert(guard.state.stopped); assert.equal(guard.state.calls[0].actualNanodollars, null);
}));
