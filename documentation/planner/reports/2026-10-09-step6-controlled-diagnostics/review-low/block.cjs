'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Isolated two-review diagnostic; existing validators and accounting remain authoritative. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { SpendingGuard, executeTrial, checkFrozen, sha, here, root } = require('./guard.cjs');
const { validator } = require('../initial-block/block.cjs');
const { preventSleep } = require('../initial-block/sleep.cjs');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const json = value => JSON.stringify(value, null, 2) + '\n';

function requireApproval(file) {
  const a = read(file);
  assert.equal(a.status, 'APPROVED', 'Paid Low execution requires new explicit user approval.');
  const manifest = checkFrozen();
  assert.equal(a.protocolVersion, manifest.protocolVersion);
  assert.equal(a.manifestSha256, sha(fs.readFileSync(path.join(__dirname, 'run-manifest.json'))));
  assert.equal(a.variantFreezeSha256, sha(fs.readFileSync(path.join(__dirname, 'freeze-low.json'))));
  assert.equal(a.maximumSpendUsd, 0.02); assert.equal(a.maximumTotalDispatches, 2); assert.equal(a.maximumRecoveryDispatches, 0);
  assert.equal(a.reasoningEffort, 'low'); assert.equal(a.provider, 'deepseek'); assert.equal(a.model, 'deepseek-flash');
  assert.equal(a.publication, 'FORBIDDEN'); assert(a.approvedBy && a.approvedAt && a.approvalEvidence, 'Human approval provenance required.');
  const signoffFile = path.join(here, 'initial-block/label-signoff.json'), preflightFile = path.join(__dirname, 'evidence/preflight.json');
  assert.equal(a.independentLabelSignoffSha256, sha(fs.readFileSync(signoffFile)));
  assert.equal(a.unpaidPreflightSha256, sha(fs.readFileSync(preflightFile)));
  const preflight = read(preflightFile);
  assert.equal(preflight.status, 'PASSED'); assert.equal(preflight.paidCalls, 0); assert.equal(preflight.realAccounting, true);
  assert.equal(preflight.interceptedDispatches, 2); assert.equal(preflight.independentReview, 2);
  for (const [name, digest] of Object.entries(preflight.toolingSha256))
    assert.equal(sha(fs.readFileSync(path.join(__dirname, name))), digest);
  assert(a.publicMetadataVerifiedAt && a.publicMetadataEvidence, 'Current Low support and rate verification required.');
  assert.equal(a.publicMetadataEvidence.sha256, sha(fs.readFileSync(path.join(__dirname, 'evidence/public-metadata.json'))));
  const age = Date.now() - Date.parse(a.publicMetadataVerifiedAt);
  assert(Number.isFinite(age) && age >= 0 && age < 86400000, 'Public metadata verification expired.');
  return a;
}

async function runBlock({ mode, directory, meterFactory, approvalFile, fixtureResponse }) {
  assert(['UNPAID_PREFLIGHT', 'PAID'].includes(mode));
  if (mode === 'PAID') requireApproval(approvalFile);
  const manifest = checkFrozen(), guard = new SpendingGuard(directory, manifest);
  let sleep;
  try {
    sleep = await preventSleep();
    let key = 'UNPAID_DUMMY_KEY', transport;
    if (mode === 'PAID') {
      key = process.env.DEEPSEEK_API_KEY;
      for (const name of ['.env.local', '.env']) {
        const file = path.join(root, name);
        if (!key && fs.existsSync(file)) {
          const match = fs.readFileSync(file, 'utf8').match(/^\s*(?:export\s+)?DEEPSEEK_API_KEY\s*=\s*(.*?)\s*$/m);
          if (match) key = match[1].replace(/^(["'])(.*)\1$/, '$2');
        }
      }
      assert(key, 'Missing DeepSeek key; no calls allowed.'); transport = global.fetch.bind(global);
    } else assert(fixtureResponse, 'Unpaid mode requires intercepted responses.');
    const records = [];
    for (const trial of manifest.runs) {
      if (guard.state.stopped) break;
      if (fs.existsSync(path.join(__dirname, 'STOP'))) { guard.halt('OPERATOR_STOP'); break; }
      const prepared = await meterFactory(trial);
      try {
        const outcome = await executeTrial({ guard, trial, meter: prepared.meter, key,
          transport: mode === 'PAID' ? transport : async () => ({ ok: true, json: async () => fixtureResponse(trial) }),
          assertAwake: async () => { sleep.check(); }, validate: validator(trial) });
        records.push({ trialId: trial.trialId, category: trial.category, packetSha256: sha(fs.readFileSync(path.join(here, trial.packet))),
          rootRequestId: prepared.rootRequestId, attemptId: prepared.attemptId, ...outcome });
        fs.writeFileSync(path.join(directory, 'results.json'), json({ mode, educationalJudgment: 'UNASSESSED', records }), { mode: 0o600 });
      } finally { await prepared.finish(); }
    }
    const summary = { status: guard.state.stopped ? 'STOPPED' : 'COMPLETE_UNASSESSED', mode,
      paidCalls: mode === 'PAID' ? guard.state.calls.filter(c => c.wires).length : 0,
      interceptedRequests: mode === 'UNPAID_PREFLIGHT' ? guard.state.calls.filter(c => c.wires).length : 0,
      calls: guard.state.calls.length, stopped: guard.state.stopped,
      reservedUsd: guard.state.calls.reduce((n, c) => n + c.reservedNanodollars, 0) / 1e9,
      actualPeakUpperEstimateUsd: guard.state.calls.reduce((n, c) => n + (c.actualNanodollars ?? c.reservedNanodollars), 0) / 1e9,
      sleep: { start: sleep.initial, end: sleep.check() }, productionRoutingChanged: false, publication: 'FORBIDDEN' };
    fs.writeFileSync(path.join(directory, 'summary.json'), json(summary)); return summary;
  } finally { sleep?.release(); guard.release(); }
}
module.exports = { requireApproval, validator, runBlock };
