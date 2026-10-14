'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Isolated diagnostic harness, frozen CommonJS services. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { SpendingGuard, executeTrial, sha, runtime, here } = require('./guard.cjs');
const { preventSleep } = require('./sleep.cjs');
const json = x => JSON.stringify(x, null, 2) + '\n';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function requireApproval(file) {
  const a = read(file), manifest = path.join(here, 'protocol-manifest.json');
  assert.equal(a.status, 'APPROVED', 'Paid execution requires explicit user approval.');
  assert.equal(a.protocolVersion, '2026-10-09-step6-controlled-diagnostics-v2');
  assert.equal(a.protocolManifestSha256, sha(fs.readFileSync(manifest)));
  assert.equal(a.maximumSpendUsd, 0.4); assert.equal(a.maximumTotalDispatches, 20); assert.equal(a.maximumRecoveryDispatches, 0);
  assert.equal(a.provider, 'deepseek'); assert.equal(a.model, 'deepseek-flash'); assert.equal(a.publication, 'FORBIDDEN');
  assert(a.approvedBy && a.approvedAt && a.approvalEvidence, 'Human approval provenance required.');
  assert(a.publicMetadataVerifiedAt && a.publicMetadataEvidence, 'Current model/default/rate verification required.');
  const metadataAge = Date.now() - Date.parse(a.publicMetadataVerifiedAt);
  assert(Number.isFinite(metadataAge) && metadataAge >= 0 && metadataAge < 86400000, 'Public metadata verification expired.');
  const signoff = path.join(here, 'initial-block/label-signoff.json'), preflight = path.join(here, 'initial-block/evidence/preflight.json');
  assert.equal(a.independentLabelSignoffSha256, sha(fs.readFileSync(signoff)));
  assert.equal(a.unpaidPreflightSha256, sha(fs.readFileSync(preflight)));
  const s = read(signoff), p = read(preflight);
  assert.equal(s.status, 'SIGNED_OFF'); assert.equal(s.independentOfAuthor, true); assert.equal(s.independentOfTestedModel, true);
  assert.equal(s.generationRubricsChecked, 8); assert.equal(s.candidateLabelsChecked, 12);
  assert.equal(s.labelsSha256, sha(fs.readFileSync(path.join(here, 'evaluator/labels.json'))));
  assert.equal(s.casesSha256, sha(fs.readFileSync(path.join(here, 'evaluator/cases.cjs'))));
  assert.equal(s.rubricSha256, sha(fs.readFileSync(path.join(here, 'evaluator/RUBRIC.md'))));
  assert.equal(Object.keys(s.candidateSha256).length, 12);
  for (const [name, digest] of Object.entries(s.candidateSha256)) assert.equal(sha(fs.readFileSync(path.join(here, 'evaluator/candidates', name + '.json'))), digest);
  assert.equal(p.status, 'PASSED'); assert.equal(p.paidCalls, 0); assert.equal(p.realAccounting, true);
  assert.equal(p.sourceFreezeSha256, sha(fs.readFileSync(path.join(here, 'freeze.json'))));
  assert.equal(Object.keys(p.toolingSha256).length, 6);
  for (const [name, digest] of Object.entries(p.toolingSha256)) assert.equal(sha(fs.readFileSync(path.join(__dirname, name))), digest, 'Execution tooling changed since preflight.');
  for (const [file, digest] of Object.entries(read(manifest).artifacts)) assert.equal(sha(fs.readFileSync(path.join(here, file))), digest, 'Protocol artifact drift.');
  return a;
}

function validator(trial) {
  if (trial.category === 'REASONING') return response => {
    const v = JSON.parse(response.text);
    assert.deepEqual(Object.keys(v), ['strategy']); assert.equal(typeof v.strategy, 'string'); assert(v.strategy.trim()); return v;
  };
  const q = runtime('planner/v2/intelligence/quality'), { hash } = runtime('planner/v2/server/database');
  const fixture = read(path.join(here, 'evaluator/candidates', trial.caseId + '.json'));
  const checkpoint = { payload: fixture.proposal, binding: { targets: fixture.input.goals.map(g => ({ planRef: g.planRef,
    qualityEvidenceDigest: hash('diagnostic-evidence', fixture.input.context), context: { externalActivityDependencies: [] } })) } };
  const blank = q.incompleteQuality(checkpoint);
  return response => q.validateQualityReview(JSON.parse(response.text), fixture.input, blank);
}

async function runBlock({ mode, directory, meterFactory, approvalFile, fixtureResponse }) {
  assert(['UNPAID_PREFLIGHT', 'PAID'].includes(mode));
  if (mode === 'PAID') requireApproval(approvalFile); // before keys, sleep, or dispatch
  const manifest = read(path.join(here, 'initial-block/run-manifest.json'));
  const guard = new SpendingGuard(directory, manifest);
  let sleep;
  try {
    sleep = await preventSleep();
    const records = [], save = () => fs.writeFileSync(path.join(directory, 'results.json'), json({ mode, educationalJudgment: 'UNASSESSED', records }), { mode: 0o600 });
    let key = 'UNPAID_DUMMY_KEY', transport;
    if (mode === 'PAID') {
      // Read only this provider key. Hosted database, storage, Gemini and search credentials are excluded.
      key = process.env.DEEPSEEK_API_KEY;
      for (const name of ['.env.local', '.env']) {
        const file = path.resolve(here, '../../../..', name);
        if (!key && fs.existsSync(file)) {
          const match = fs.readFileSync(file, 'utf8').match(/^\s*(?:export\s+)?DEEPSEEK_API_KEY\s*=\s*(.*?)\s*$/m);
          if (match) key = match[1].replace(/^(["'])(.*)\1$/, '$2');
        }
      }
      assert(key, 'Missing DeepSeek key; no calls allowed.');
      transport = global.fetch.bind(global);
    } else {
      assert(fixtureResponse, 'Unpaid mode requires intercepted responses.');
    }
    let lastSleep;
    for (const trial of manifest.runs) {
      if (guard.state.stopped) break;
      if (fs.existsSync(path.join(here, 'initial-block/STOP'))) { guard.halt('OPERATOR_STOP'); break; }
      // Keep the predeclared arm stop after two operational failures; independent arms remain useful.
      if (records.filter(r => r.category === trial.category && r.status !== 'VALIDATED').length >= 2) continue;
      const prepared = await meterFactory(trial);
      try {
        const outcome = await executeTrial({ guard, trial, meter: prepared.meter, key,
          transport: mode === 'PAID' ? transport : async () => ({ ok: true, json: async () => fixtureResponse(trial) }),
          assertAwake: async () => { lastSleep = sleep.check(); }, validate: validator(trial) });
        records.push({ trialId: trial.trialId, category: trial.category, packetSha256: sha(fs.readFileSync(path.join(here, trial.packet))),
          rootRequestId: prepared.rootRequestId, attemptId: prepared.attemptId, ...outcome }); save();
      } finally { await prepared.finish(); }
    }
    lastSleep = sleep.check();
    const result = { status: guard.state.stopped ? 'STOPPED' : 'COMPLETE_UNASSESSED', mode, paidCalls: mode === 'PAID' ? guard.state.calls.filter(c => c.wires).length : 0,
      interceptedRequests: mode === 'UNPAID_PREFLIGHT' ? guard.state.calls.filter(c => c.wires).length : 0,
      calls: guard.state.calls.length, stopped: guard.state.stopped, reservedUsd: guard.state.calls.reduce((n, c) => n + c.reservedNanodollars, 0) / 1e9,
      actualPeakUpperEstimateUsd: guard.state.calls.reduce((n, c) => n + (c.actualNanodollars ?? c.reservedNanodollars), 0) / 1e9,
      sleep: { start: sleep.initial, end: lastSleep }, productionRoutingChanged: false, publication: 'FORBIDDEN' };
    fs.writeFileSync(path.join(directory, 'summary.json'), json(result)); return result;
  } finally { sleep?.release(); guard.release(); }
}
module.exports = { requireApproval, validator, runBlock };
