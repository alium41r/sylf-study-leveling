#!/usr/bin/env node
'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Unpaid diagnostic verification against frozen owners. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const P = require('./prepare.cjs'), { Guard } = require('./guard.cjs');
const { preventSleep } = require('../2026-10-09-step6-controlled-diagnostics/initial-block/sleep.cjs');
const B = P.runtime('planner/v2/intelligence/blueprint'), { allocateLearning } = P.runtime('planner/v2/intelligence/allocator');
const { SchedulingEnvelopeSchema } = P.runtime('planner/v2/intelligence/schemas/scheduling');

function technicalProposal(c) {
  // An unassessed technical stub, never sent to a model and not a reference strategy.
  return { detail: { days: 14, checkpoint: 'Technical fixture only.' }, plans: [{ planRef: 'plan_1',
    strategy: { outcome: c.outcome, explanation: 'Unassessed plumbing stub.', recommendedEffort: [15, 20, 25], phases: [] },
    scope: c.student.scope.map((_, i) => ({ scopeRef: 'scope_' + (i + 1), disposition: 'INCLUDED', contribution: 'Technical fixture only.' })),
    activities: [{ localId: 'work_1', outcomeRefs: [], scopeRefs: c.student.scope.map((_, i) => 'scope_' + (i + 1)), title: 'Unassessed fixture', activityType: 'PRACTICE',
      purpose: 'Technical fixture only.', instructions: 'Unassessed fixture; no educational acceptance implied.', completionCriterion: 'Technical fixture only.', effort: [15,20,25],
      timeboxMinutes: 20, commitment: { category: 'COMMITTED' }, hardDependencies: [] }],
    decisions: { assumptions: [], tradeOffs: [], unresolvedUncertainty: [], stoppingConditions: ['Technical fixture only.'] } }], sharedDependencies: [], tradeOffExplanation: 'Unassessed technical fixture.' };
}

function verifyAnswers() {
  assert.equal((24 + 16) / 200, .2); assert.equal(24 / (24 + 16), .6); assert.equal(24 / 80, .3);
  assert(Math.abs(.2 * .9 + .8 * .2 - .34) < 1e-12);
  assert(Math.abs((.2 * .9) / (.2 * .9 + .8 * .2) - 9 / 17) < 1e-12);
  assert(Math.abs((.5 * .9) / (.5 * .9 + .5 * .2) - 9 / 11) < 1e-12);
  const a = [1,2,3], b = [4,5,6], c = [2,4,6];
  assert.equal(a.filter(n => b.includes(n)).length / 6, 0); assert.equal(a.filter(n => c.includes(n)).length / 6, 1/6);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(P.read('cases.json')[1].student.resources[0].content.split('\nEach loan_id')[0]);
    const rows = sql => db.prepare(sql).all().map(r => Object.values(r));
    assert.deepEqual(rows('SELECT l.loan_id,r.name,l.title FROM loans l JOIN readers r ON r.reader_id=l.reader_id WHERE l.returned_at IS NULL ORDER BY l.loan_id'),
      [[101,'Amina','Atlas'],[103,'Ben','Atlas'],[105,'Cleo','Moss'],[106,'Cleo','Comets']]);
    assert.deepEqual(rows('SELECT r.name,COUNT(l.loan_id) FROM readers r LEFT JOIN loans l ON l.reader_id=r.reader_id GROUP BY r.reader_id,r.name ORDER BY r.name'),
      [['Amina',2],['Ben',2],['Cleo',2],['Dara',1],['Eli',0]]);
    assert.deepEqual(rows('SELECT r.name,COUNT(l.loan_id) FROM readers r LEFT JOIN loans l ON l.reader_id=r.reader_id AND l.returned_at IS NULL GROUP BY r.reader_id,r.name ORDER BY r.name'),
      [['Amina',1],['Ben',1],['Cleo',2],['Dara',0],['Eli',0]]);
    assert.deepEqual(rows('SELECT r.name,COUNT(l.loan_id) FROM readers r JOIN loans l ON l.reader_id=r.reader_id GROUP BY r.reader_id,r.name HAVING COUNT(l.loan_id)>=2 ORDER BY r.name'),
      [['Amina',2],['Ben',2],['Cleo',2]]);
  } finally { db.close(); }
}

async function main() {
  global.fetch = async () => { throw new Error('NETWORK_DISABLED_FOR_PREFLIGHT'); };
  const packets = await P.prepare('check'), cases = P.read('cases.json'), checks = [];
  const pass = name => checks.push(name);
  pass('Four native adapter bodies recaptured, no transport; complete student context identical within each pair');
  verifyAnswers(); pass('Probability key independently recalculated; all four SQL expected tables executed locally');
  for (const c of cases) {
    const f = P.fixture(c), stub = technicalProposal(c), result = B.validateCompactLearningProposal(stub, f.input);
    const expanded = B.expandDeclaredSplits(result.snapshot, f.input.envelope, result.kept, new Map([['plan_1',30]]));
    const allocated = allocateLearning(expanded.snapshot, f.input.envelope, f.allocationFacts);
    assert.equal(allocated.status, 'FEASIBLE'); assert.equal(allocated.committedMinutes, 20);
    assert(!allocated.placements.some(p => c.student.availability.days.find(d => d.date === p.date).availableMinutes === 0));
    const bad = structuredClone(stub); bad.plans[0].scope[0].scopeRef = 'invented_scope'; assert.throws(() => B.validateCompactLearningProposal(bad, f.input));
    const badCalendar = structuredClone(f.input.envelope); badCalendar.days[0].availableMinutes++; assert.throws(() => SchedulingEnvelopeSchema.parse(badCalendar));
    const canonical = f.input.plans[0].intent;
    assert.equal(canonical.outcome, c.outcome); assert.equal(canonical.deadline.date, c.student.assessment.date);
    assert.deepEqual(canonical.evidence.map(e => e.statement), c.student.readiness.map(e => e.statement));
    assert(canonical.evidence.every(e => e.reliability === 'SELF_REPORTED'));
  }
  pass('Existing compact/canonical validation and allocation pass unassessed stubs; invented scope and incorrect capacity rejected');
  const m = P.read('run-manifest.json'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sylf-free-plan-preflight-'));
  const raw = { model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: 'UNPAID_STUB' } }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100, completion_tokens_details: { reasoning_tokens: 150 } } };
  let guard;
  try {
    guard = new Guard(path.join(temp, 'normal'), m);
    assert.throws(() => new Guard(path.join(temp, 'normal'), m)); // exclusive process ownership
    for (const trial of m.runs) {
      const call = guard.reserve(trial), wire = P.read(trial.wire);
      assert.throws(() => guard.reserve(trial));
      const bad = { ...wire, model: 'gemini-2.5-flash' }; assert.throws(() => guard.wire(call, trial, 'https://api.deepseek.com/chat/completions', { method: 'POST', body: JSON.stringify(bad) }));
      guard.wire(call, trial, 'https://api.deepseek.com/chat/completions', { method: 'POST', body: JSON.stringify(wire) });
      assert.throws(() => guard.wire(call, trial, 'https://api.deepseek.com/chat/completions', { method: 'POST', body: JSON.stringify(wire) }));
      guard.settle(call, trial, raw, 1);
    }
    assert.throws(() => guard.reserve(m.runs[0]));
    guard.release(); assert.throws(() => new Guard(path.join(temp, 'normal'), m)); // no restart even after clean release
    pass('Exclusive persisted reservations, exact wire/model/cap/effort hashes, four-call scope, no retries/restart');
    guard = new Guard(path.join(temp, 'unknown'), m);
    const trial = m.runs[0], call = guard.reserve(trial);
    guard.wire(call, trial, 'https://api.deepseek.com/chat/completions', { method: 'POST', body: JSON.stringify(P.read(trial.wire)) });
    assert.throws(() => guard.settle(call, trial, { ...raw, usage: {} }, 1)); assert.throws(() => guard.reserve(m.runs[1])); guard.release();
    pass('Missing reasoning/cache/usage counters halt next dispatch; reservation retained');
    guard = new Guard(path.join(temp, 'ceiling'), m); guard.state.maximumSpendNanodollars = m.runs[0].reservedNanodollars - 1;
    assert.throws(() => guard.reserve(m.runs[0])); assert.equal(guard.state.calls.length, 0); guard.release();
    pass('One-nanodollar insufficient allowance refuses reservation before wire');
  } finally { guard?.release(); fs.rmSync(temp, { recursive: true, force: true }); }
  const sleep = await preventSleep(); let sleepEvidence;
  try { sleepEvidence = sleep.check(); } finally { sleep.release(); }
  pass('Owned macOS caffeinate sleep assertion acquired, verified and released');
  const signed = fs.existsSync(path.join(P.here, 'evaluator/signoff.json')) && P.read('evaluator/signoff.json').status === 'SIGNED_OFF';
  const evidence = { ...packets, status: signed ? 'UNPAID_PREFLIGHT_PASS_SIGNED_OFF_AWAITING_APPROVAL' : 'UNPAID_PREFLIGHT_PASS_SIGNOFF_PENDING',
    checkedAt: new Date().toISOString(), externalCalls: 0, paidCalls: 0, checks, sleepEvidence,
    independentSignoffComplete: signed, productionWrites: 0, note: '32,768-token standalone diagnostic bypasses the production dispatcher cap. No canonical Attempt/Apply or live compiler workflow was exercised.' };
  P.write('evidence/preflight.json', evidence); process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
}
if (require.main === module) main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
module.exports = { technicalProposal, verifyAnswers };
