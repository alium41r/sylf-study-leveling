'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Unpaid verification of the isolated Low reviewer variant. */
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { SpendingGuard, executeTrial, allowance, here, runtime } = require('./guard.cjs');
const { requireApproval, validator } = require('./block.cjs');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'run-manifest.json'))), trial = manifest.runs[0];
const route = { provider: 'deepseek', model: 'deepseek-flash' };
const meter = () => ({ reserve: async () => 'fixture-call', window: async () => ({ now: Date.now(), deadline: Date.now() + 180000 }),
  settle: async () => {}, close: async () => {}, lateUsage: async () => {} });
const fixtureText = t => {
  const candidate = JSON.parse(fs.readFileSync(path.join(here, 'evaluator/candidates', t.caseId + '.json')));
  const labels = JSON.parse(fs.readFileSync(path.join(here, 'evaluator/labels.json')));
  return JSON.stringify({ plans: candidate.input.goals.map(goal => ({ planRef: goal.planRef,
    issues: (labels.repair[t.caseId]?.originalFindings ?? []).filter(f => f.planRef === goal.planRef).map(f => f.finding) })) });
};
const raw = (t = trial, overrides = {}) => ({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: fixtureText(t) } }],
  usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100,
    completion_tokens_details: { reasoning_tokens: 4 } }, ...overrides });
async function scoped(fn, ceiling) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sylf-review-low-'));
  let guard;
  try { guard = new SpendingGuard(directory, manifest, ceiling); return await fn(guard, directory); }
  finally { guard?.release(); fs.rmSync(directory, { recursive: true, force: true }); }
}
async function dispatch(guard, t = trial, response = raw(t), extra = {}) {
  let wires = 0, body;
  const result = await executeTrial({ guard, trial: t, meter: meter(), key: 'UNPAID_DUMMY_KEY', assertAwake: async () => {}, validate: validator(t),
    transport: async (_url, request) => { wires++; body = JSON.parse(request.body); return { ok: true, json: async () => response }; }, ...extra });
  return { result, wires, body };
}
test('pending approval rejects before any provider setup', () => assert.throws(() => requireApproval(path.join(__dirname, 'approval-template.json')), /new explicit user approval/));
test('two sound/defective fixture responses validate and differ only by Low effort on wire', () => scoped(async guard => {
  for (const t of manifest.runs) {
    const { result, wires, body } = await dispatch(guard, t);
    assert.equal(result.status, 'VALIDATED'); assert.equal(wires, 1);
    const p = JSON.parse(fs.readFileSync(path.join(here, t.packet)));
    assert.deepEqual(body, { model: 'deepseek-flash', messages: [{ role: 'system', content: p.systemInstruction.trim() }, ...p.messages],
      stream: false, response_format: { type: 'json_object' }, max_tokens: 4096, reasoning_effort: 'low' });
    assert.equal(guard.state.calls.at(-1).canonicalUsage.costUsd, null);
  }
  assert.equal(guard.state.calls.reduce((n, c) => n + c.reservedNanodollars, 0), 16803000);
}));
test('Low wire equals the existing native adapter Low option without changing routing', () => scoped(async guard => {
  const { body } = await dispatch(guard);
  const p = JSON.parse(fs.readFileSync(path.join(here, trial.packet))), { DeepSeekAdapter } = runtime('ai/providers/deepseek');
  const previous = global.fetch; let native;
  try {
    global.fetch = async (_url, request) => { native = JSON.parse(request.body); return { ok: true, json: async () => raw() }; };
    await new DeepSeekAdapter('UNPAID_DUMMY_KEY', 'deepseek-flash', 'https://api.deepseek.com').generateResponse(p.messages, p.systemInstruction, [],
      { ...p.adapterOptions, reasoningEffort: 'low' });
  } finally { global.fetch = previous; }
  assert.deepEqual(body, native);
}));
test('pair scope/order/caps and provider admission cannot expand', () => scoped(guard => {
  const original = JSON.parse(fs.readFileSync(path.join(here, 'initial-block/run-manifest.json')));
  for (const [t, r, input, output] of [[manifest.runs[1], route, manifest.runs[1].inputReservationUnits, 4096],
    [original.runs[0], route, original.runs[0].inputReservationUnits, original.runs[0].outputTokenCap],
    [trial, { provider: 'gemini', model: 'gemini-2.5-flash' }, trial.inputReservationUnits, 4096],
    [trial, { ...route, model: 'deepseek-v4-pro' }, trial.inputReservationUnits, 4096],
    [trial, route, trial.inputReservationUnits, 4097]]) assert.throws(() => guard.reserve(t, r, input, output));
  assert.equal(guard.state.calls.length, 0);
  for (const t of manifest.runs) { const call = guard.reserve(t, route, t.inputReservationUnits, t.outputTokenCap); call.status = 'SETTLED'; }
  assert.throws(() => guard.reserve(trial, route, trial.inputReservationUnits, 4096));
}));
test('the $0.02 ceiling and smaller insufficient ceilings fail before dispatch', async () => {
  await scoped(guard => assert.equal(guard.ceiling, 20000000));
  await scoped(async guard => { const { wires } = await dispatch(guard); assert.equal(wires, 0); }, allowance(trial.inputReservationUnits, 4096) - 1);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sylf-review-low-limit-'));
  try { assert.throws(() => new SpendingGuard(d, manifest, 20000001)); } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
test('unknown reasoning/cache counters stop and retain the full reservation', async () => {
  for (const usage of [undefined, { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    { ...raw().usage, prompt_cache_miss_tokens: 99 }]) await scoped(async guard => {
    const { wires } = await dispatch(guard, trial, raw(trial, { usage })); assert.equal(wires, 1); assert(guard.state.stopped);
    assert.equal(guard.state.calls[0].actualNanodollars, null);
    assert.throws(() => guard.reserve(manifest.runs[1], route, manifest.runs[1].inputReservationUnits, 4096));
  });
});
test('truncation and malformed JSON are settled failures with no retry or fallback', async () => {
  for (const choices of [[{ finish_reason: 'length', message: { content: '' } }], [{ finish_reason: 'stop', message: { content: 'invalid JSON' } }]]) await scoped(async guard => {
    const { result, wires } = await dispatch(guard, trial, raw(trial, { choices }));
    assert.equal(result.status, 'REJECTED'); assert.equal(wires, 1); assert.equal(guard.state.calls[0].status, 'SETTLED');
    assert.throws(() => guard.reserve(trial, route, trial.inputReservationUnits, 4096));
  });
});
test('unsupported quotations are rejected without losing the returned concern', () => scoped(async guard => {
  await dispatch(guard);
  const t = manifest.runs[1], value = JSON.parse(fixtureText(t)); value.plans[0].issues[0].grounds[1].excerpt = 'UNSUPPORTED_QUOTATION';
  const content = JSON.stringify(value), { result, wires } = await dispatch(guard, t, raw(t, { choices: [{ finish_reason: 'stop', message: { content } }] }));
  assert.equal(result.status, 'REJECTED'); assert.equal(wires, 1); assert.equal(result.rejected, content);
  assert.equal(guard.state.calls.length, 2);
}));
test('HTTP uncertainty makes one attempt and prevents the next call', () => scoped(async guard => {
  let wires = 0;
  const { result } = await dispatch(guard, trial, raw(), { transport: async () => { wires++; return { ok: false, status: 400, text: async () => 'rejected parameter' }; } });
  assert.equal(result.status, 'REJECTED'); assert.equal(wires, 1); assert(guard.state.stopped);
  assert.throws(() => guard.reserve(manifest.runs[1], route, manifest.runs[1].inputReservationUnits, 4096));
}));
test('exclusive journal cannot be reset, resumed or retried', () => scoped(async (guard, directory) => {
  await dispatch(guard);
  assert.throws(() => new SpendingGuard(directory, manifest));
  guard.release(); assert.throws(() => new SpendingGuard(directory, manifest), /RECONCILIATION/);
}));
test('lost sleep or journal failure prevents a wire', async () => {
  await scoped(async guard => { const { wires } = await dispatch(guard, trial, raw(), { assertAwake: async () => { throw new Error('SLEEP_GUARD_LOST'); } }); assert.equal(wires, 0); });
  await scoped(async guard => { guard.save = () => { throw new Error('JOURNAL_FAILURE'); }; const { wires } = await dispatch(guard); assert.equal(wires, 0); });
});
test('endpoint or additional body controls cannot pass the frozen-wire guard', () => scoped(guard => {
  const call = guard.reserve(trial, route, trial.inputReservationUnits, 4096), p = JSON.parse(fs.readFileSync(path.join(here, trial.packet)));
  const body = { model: 'deepseek-flash', messages: [{ role: 'system', content: p.systemInstruction.trim() }, ...p.messages], stream: false,
    response_format: { type: 'json_object' }, max_tokens: 4096 };
  for (const extra of [{ reasoning_effort: 'max' }, { thinking: { type: 'disabled' } }, { temperature: 0.2 }])
    assert.throws(() => guard.wire(call, 'https://api.deepseek.com/chat/completions', { method: 'POST', body: JSON.stringify({ ...body, ...extra }) }, p));
  assert.throws(() => guard.wire(call, 'https://another.example/chat/completions', { method: 'POST', body: JSON.stringify(body) }, p));
}));
