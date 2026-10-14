'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Extend the frozen diagnostic guard in an isolated process only. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = require('../initial-block/guard.cjs');
const { here, root, sha } = base, directory = __dirname;
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function checkFrozen() {
  const pins = read(path.join(directory, 'freeze-low.json'));
  for (const [name, digest] of Object.entries(pins.variantArtifacts))
    assert.equal(sha(fs.readFileSync(path.join(directory, name))), digest, 'Low diagnostic artifact drift.');
  for (const [name, digest] of Object.entries(pins.baselineArtifacts))
    assert.equal(sha(fs.readFileSync(path.join(here, name))), digest, 'Approved baseline artifact drift.');
  const frozen = read(path.join(here, 'freeze.json'));
  for (const [name, digest] of Object.entries(frozen.sourcePins))
    assert.equal(sha(fs.readFileSync(path.join(root, name))), digest, 'Frozen implementation drift.');
  for (const packet of frozen.packets)
    assert.equal(sha(fs.readFileSync(path.join(here, packet.name))), packet.sha256, 'Frozen packet drift.');
  const signed = read(path.join(here, 'initial-block/label-signoff.json'));
  assert.equal(signed.status, 'SIGNED_OFF'); assert.equal(signed.humanSignoff, false);
  assert.equal(signed.independentOfAuthor, true); assert.equal(signed.independentOfTestedModel, true);
  for (const [id, digest] of Object.entries(signed.candidateSha256))
    assert.equal(sha(fs.readFileSync(path.join(here, 'evaluator/candidates', id + '.json'))), digest);
  const manifest = read(path.join(directory, 'run-manifest.json'));
  assert.equal(manifest.protocolVersion, '2026-10-09-step6-review-low-pair-v1');
  assert.equal(manifest.maximumSpendUsd, 0.02); assert.equal(manifest.maximumTotalDispatches, 2);
  assert.equal(manifest.maximumRecoveryDispatches, 0); assert.equal(manifest.reasoningEffort, 'low');
  assert.deepEqual(manifest.runs.map(t => t.caseId), ['v09', 'v04']);
  const original = read(path.join(here, 'initial-block/run-manifest.json'));
  for (const trial of manifest.runs) {
    assert.deepEqual(trial, original.runs.find(t => t.trialId === trial.trialId));
    assert.equal(trial.category, 'REVIEW'); assert.equal(trial.outputTokenCap, 4096);
  }
  return manifest;
}

class SpendingGuard extends base.SpendingGuard {
  constructor(outputDirectory, manifest, ceiling = 20000000) {
    assert.deepEqual(manifest, checkFrozen());
    assert(Number.isSafeInteger(ceiling) && ceiling > 0 && ceiling <= 20000000, 'Low pair ceiling cannot exceed $0.02.');
    // Keep the existing guard's frozen scope/accounting implementation. This
    // subclass restricts admission to the two exact original trials, in order.
    super(outputDirectory, read(path.join(here, 'initial-block/run-manifest.json')), ceiling);
    this.variantManifest = manifest;
  }
  reserve(trial, route, input, output) {
    checkFrozen();
    assert.deepEqual(trial, this.variantManifest.runs[this.state.calls.length], 'Only the next approved pair trial is allowed.');
    return super.reserve(trial, route, input, output);
  }
  wire(call, url, options, packet) {
    // Validate the original adapter wire byte-for-byte before adding the sole
    // approved diagnostic variant. No prompt, schema, token cap or route changes.
    const original = super.wire(call, url, options, packet);
    const actual = { ...original, reasoning_effort: 'low' };
    options.body = JSON.stringify(actual);
    call.requestBodySha256 = sha(options.body);
    call.reasoningEffort = 'low'; call.thinking = 'OMITTED_ENABLED_DEFAULT';
    this.save();
    return actual;
  }
  usage(call, raw) {
    const usage = raw?.usage;
    if (!Number.isSafeInteger(usage?.completion_tokens_details?.reasoning_tokens) || usage.completion_tokens_details.reasoning_tokens < 0 ||
      !Number.isSafeInteger(usage?.prompt_cache_hit_tokens) || !Number.isSafeInteger(usage?.prompt_cache_miss_tokens) ||
      usage.prompt_cache_hit_tokens + usage.prompt_cache_miss_tokens !== usage.prompt_tokens) {
      this.halt('UNKNOWN_REASONING_OR_CACHE_USAGE'); throw new Error('UNKNOWN_REASONING_OR_CACHE_USAGE');
    }
    return super.usage(call, raw);
  }
}

async function executeTrial(options) {
  const transport = options.transport;
  return base.executeTrial({ ...options, transport: async (url, request) => {
    const call = options.guard.state.calls.at(-1), body = JSON.parse(request.body);
    assert.equal(body.reasoning_effort, 'low'); assert.equal(body.max_tokens, 4096);
    assert.equal(sha(request.body), call.requestBodySha256, 'Actual transport diverged from the approved Low wire.');
    return transport(url, request);
  } });
}
module.exports = { ...base, SpendingGuard, executeTrial, checkFrozen };
