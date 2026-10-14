'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Isolated diagnostic guard; no production persistence or dispatch. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { read, sha, allowance, checkSources, here, root } = require('./prepare.cjs');
const endpoint = 'https://api.deepseek.com/chat/completions';

function checkFrozen() {
  checkSources();
  const frozen = read('freeze.json');
  for (const [file, digest] of Object.entries(frozen.artifacts))
    assert.equal(sha(fs.readFileSync(path.join(here, file))), digest, 'Experiment artifact drift: ' + file);
  for (const [file, digest] of Object.entries(frozen.externalArtifacts))
    assert.equal(sha(fs.readFileSync(path.join(root, file))), digest, 'Referenced protocol/sleep helper drift: ' + file);
  assert.equal(read('evaluator/signoff.json').status, 'SIGNED_OFF');
  assert.equal(read('evaluator/signoff.json').humanSignoff, false);
  assert.equal(read('evaluator/signoff.json').independentOfCaseAuthor, true);
  return read('run-manifest.json');
}

class Guard {
  constructor(directory, manifest) {
    assert.equal(manifest.maximumTotalDispatches, 4); assert.equal(manifest.maximumRecoveryDispatches, 0);
    assert.equal(manifest.maximumSpendUsd, .20); assert.equal(manifest.runs.length, 4);
    assert(manifest.runs.reduce((n, r) => n + r.reservedNanodollars, 0) <= 200000000);
    this.manifest = manifest; this.directory = directory;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'spending.json'); this.lock = path.join(directory, 'spending.lock');
    this.fd = fs.openSync(this.lock, 'wx', 0o600);
    try {
      assert(!fs.existsSync(this.file), 'EXISTING_RUN_REQUIRES_RECONCILIATION');
      this.state = { maximumSpendNanodollars: 200000000, calls: [], stopped: null, productionPublication: 'FORBIDDEN' };
      this.save();
    } catch (error) { this.release(); throw error; }
  }
  save() {
    const next = this.file + '.next'; let fd;
    try {
      fd = fs.openSync(next, 'wx', 0o600); fs.writeFileSync(fd, JSON.stringify(this.state, null, 2) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      fs.renameSync(next, this.file);
      const directory = fs.openSync(this.directory, 'r'); try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    } catch (error) { this.state.stopped ??= 'JOURNAL_FAILURE'; throw error; }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  halt(reason) { this.state.stopped ??= reason; this.save(); }
  reserve(trial) {
    assert(!this.state.stopped, 'EXECUTION_HALTED');
    assert(!this.state.calls.some(c => c.status !== 'SETTLED'), 'UNSETTLED_CALL');
    assert.deepEqual(trial, this.manifest.runs[this.state.calls.length], 'UNAPPROVED_CALL_ORDER_OR_RETRY');
    assert.equal(trial.reservedNanodollars, allowance(trial.inputReservationUnits, trial.outputTokenCap));
    assert(this.state.calls.reduce((n, c) => n + c.reservedNanodollars, 0) + trial.reservedNanodollars <= this.state.maximumSpendNanodollars, 'SPENDING_CEILING');
    const call = { trialId: trial.trialId, reservedNanodollars: trial.reservedNanodollars, status: 'RESERVED', wires: 0 };
    this.state.calls.push(call); this.save(); return call;
  }
  wire(call, trial, url, options) {
    assert(!this.state.stopped && call.status === 'RESERVED' && call.wires === 0, 'RETRY_OR_HALTED');
    assert.equal(url, endpoint); assert.equal(options.method, 'POST'); assert.equal(sha(options.body), trial.requestBodySha256, 'WIRE_DRIFT');
    assert(Buffer.byteLength(options.body) + 1024 === trial.inputReservationUnits);
    call.wires = 1; call.dispatchedAt = new Date().toISOString(); this.save();
  }
  settle(call, trial, raw, latencyMs) {
    try {
      assert.equal(call.status, 'RESERVED'); assert.equal(call.wires, 1); assert.equal(raw.model, 'deepseek-flash');
      const u = raw.usage, integer = x => Number.isSafeInteger(x) && x >= 0;
      assert(u && integer(u.prompt_tokens) && u.prompt_tokens > 0 && integer(u.completion_tokens) && integer(u.total_tokens));
      assert.equal(u.total_tokens, u.prompt_tokens + u.completion_tokens);
      assert(integer(u.prompt_cache_hit_tokens) && integer(u.prompt_cache_miss_tokens)); assert.equal(u.prompt_tokens, u.prompt_cache_hit_tokens + u.prompt_cache_miss_tokens);
      assert(integer(u.completion_tokens_details?.reasoning_tokens) && u.completion_tokens_details.reasoning_tokens <= u.completion_tokens);
      assert(u.prompt_tokens <= trial.inputReservationUnits && u.completion_tokens <= trial.outputTokenCap, 'USAGE_EXCEEDS_RESERVATION');
      const upper = allowance(u.prompt_tokens, u.completion_tokens); assert(upper <= call.reservedNanodollars);
      call.status = 'SETTLED'; call.usage = u; call.conservativePeakNanodollars = upper; call.latencyMs = latencyMs;
      call.finishReason = raw.choices?.[0]?.finish_reason ?? null; call.returnedModel = raw.model; call.systemFingerprint = raw.system_fingerprint ?? null;
      this.save();
    } catch (error) { call.status = 'UNKNOWN_SPEND'; this.halt('RECEIPT_OR_SPEND_UNCERTAINTY'); throw error; }
  }
  release() { if (this.fd !== undefined) { fs.closeSync(this.fd); this.fd = undefined; fs.unlinkSync(this.lock); } }
}

module.exports = { Guard, checkFrozen, endpoint };
