'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Diagnostic tooling consumes the frozen CommonJS runtime. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const here = path.resolve(__dirname, '..'), root = path.resolve(here, '../../../..');
const runtime = name => require(path.join(root, 'dist/planner-worker', name));
const { DurablePlannerError } = runtime('planner/v2/server/database');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const stop = code => { throw new DurablePlannerError('BUDGET_EXHAUSTED', code, 'RECOVERY'); };
const allowance = (input, output) => input * 300 + output * 1200; // integer nanodollars, peak/cache-miss
const routeAllowed = route => route.provider === 'deepseek' && route.model === 'deepseek-flash';

class SpendingGuard {
  constructor(directory, manifest, ceiling = 400000000) {
    this.directory = directory; this.manifest = manifest; this.ceiling = ceiling;
    if (ceiling > 400000000 || !Number.isSafeInteger(ceiling) || ceiling <= 0) stop('INVALID_CEILING');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.lock = path.join(directory, 'spending.lock');
    this.lockFd = fs.openSync(this.lock, 'wx', 0o600); // no automatic stale-lock removal/resumption
    try {
      this.file = path.join(directory, 'spending.json');
      if (fs.existsSync(this.file)) stop('EXISTING_RUN_REQUIRES_RECONCILIATION');
      if (manifest.runs.length !== 20 || manifest.maximumSpendUsd !== 0.4 || manifest.maximumTotalDispatches !== 20 || manifest.maximumRecoveryDispatches !== 0) stop('INVALID_SCOPE');
      this.state = { schemaVersion: 1, ceilingNanodollars: ceiling, stopped: null, calls: [], productionPublication: 'FORBIDDEN' };
      this.save();
    } catch (error) { this.release(); throw error; }
  }
  save() {
    const temporary = this.file + '.next'; let fd;
    try {
      fd = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(this.state, null, 2) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      fs.renameSync(temporary, this.file);
      const directoryFd = fs.openSync(this.directory, 'r');
      try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
    } catch (error) { this.state.stopped = 'JOURNAL_FAILURE'; throw error; }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  halt(reason) { this.state.stopped ??= reason; this.save(); }
  reserve(trial, route, input, output) {
    if (this.state.stopped) stop(this.state.stopped);
    const owned = this.manifest.runs.find(r => r.trialId === trial.trialId);
    if (!owned || !routeAllowed(route) || input !== owned.inputReservationUnits || output !== owned.outputTokenCap) stop('UNAPPROVED_REQUEST');
    if (this.state.calls.some(c => c.trialId === trial.trialId) || this.state.calls.some(c => c.status === 'RESERVED')) stop('RETRY_OR_CONCURRENT_REQUEST');
    const amount = allowance(input, output);
    if (this.state.calls.reduce((n, c) => n + c.reservedNanodollars, 0) + amount > this.ceiling) stop('SPENDING_CEILING');
    const call = { trialId: trial.trialId, input, output, reservedNanodollars: amount, status: 'RESERVED', wires: 0, actualNanodollars: null };
    this.state.calls.push(call); this.save(); return call;
  }
  wire(call, url, options, packet) {
    if (this.state.stopped || call.status !== 'RESERVED' || call.wires) stop('WIRE_NOT_AUTHORIZED');
    const body = JSON.parse(options.body);
    const expected = { model: 'deepseek-flash', messages: [{ role: 'system', content: packet.systemInstruction.trim() }, ...packet.messages], stream: false,
      response_format: { type: 'json_object' }, max_tokens: packet.outputTokens };
    if (url !== 'https://api.deepseek.com/chat/completions' || options.method !== 'POST' || JSON.stringify(body) !== JSON.stringify(expected)) stop('WIRE_CONFIGURATION_DRIFT');
    call.wires = 1; call.dispatchedAt = new Date().toISOString(); this.save(); return body;
  }
  usage(call, raw) {
    const u = raw?.usage;
    if (!u || !Number.isSafeInteger(u.prompt_tokens) || u.prompt_tokens <= 0 || !Number.isSafeInteger(u.completion_tokens) || u.completion_tokens < 0 ||
      !Number.isSafeInteger(u.total_tokens) || u.total_tokens !== u.prompt_tokens + u.completion_tokens ||
      (u.prompt_cache_hit_tokens !== undefined && (!Number.isSafeInteger(u.prompt_cache_hit_tokens) || u.prompt_cache_hit_tokens < 0 || u.prompt_cache_hit_tokens > u.prompt_tokens)) ||
      (u.completion_tokens_details?.reasoning_tokens !== undefined && (!Number.isSafeInteger(u.completion_tokens_details.reasoning_tokens) || u.completion_tokens_details.reasoning_tokens < 0 || u.completion_tokens_details.reasoning_tokens > u.completion_tokens))) {
      this.halt('UNKNOWN_OR_INVALID_USAGE'); stop('UNKNOWN_OR_INVALID_USAGE');
    }
    if (raw.model !== 'deepseek-flash') { this.halt('RETURNED_MODEL_DRIFT'); stop('RETURNED_MODEL_DRIFT'); }
    call.actualNanodollars = allowance(u.prompt_tokens, u.completion_tokens); call.rawUsage = u;
    call.returnedModel = raw.model; call.fingerprint = raw.system_fingerprint ?? null;
    if (u.prompt_tokens > call.input || u.completion_tokens > call.output || call.actualNanodollars > call.reservedNanodollars) {
      this.halt('USAGE_EXCEEDS_RESERVATION'); stop('USAGE_EXCEEDS_RESERVATION');
    }
    this.save();
  }
  wrap(meter, trial) {
    let call, callId;
    return {
      reserve: async (route, input, output, policy, signal) => {
        call = this.reserve(trial, route, input, output);
        call.policy = policy; call.reservedAt = new Date().toISOString();
        try { callId = await meter.reserve(route, input, output, policy, signal); call.callId = callId; this.save(); return callId; }
        catch (error) { this.halt('CANONICAL_RESERVATION_FAILED'); throw error; }
      },
      window: async purpose => {
        if (this.state.stopped) stop(this.state.stopped);
        try { return await meter.window(purpose); } catch (error) { this.halt('CANONICAL_WINDOW_FAILED'); throw error; }
      },
      settle: async (id, usage) => {
        if (id !== callId || call.actualNanodollars === null || usage.inputTokens !== call.rawUsage.prompt_tokens || usage.outputTokens !== call.rawUsage.completion_tokens) {
          this.halt('SETTLEMENT_MISMATCH'); stop('SETTLEMENT_MISMATCH');
        }
        try { await meter.settle(id, usage); } catch (error) { this.halt('CANONICAL_SETTLEMENT_FAILED'); throw error; }
        call.canonicalUsage = usage; call.status = 'SETTLED'; this.save();
      },
      close: async (id, result) => {
        try { await meter.close(id, result); }
        catch (error) { this.state.stopped ??= 'CANONICAL_CLOSE_FAILED'; throw error; }
        finally {
          if (call) {
            call.result = result;
            if (call.status !== 'SETTLED') { call.status = 'UNKNOWN_SPEND'; this.state.stopped ??= 'UNKNOWN_SPEND'; }
            this.save();
          }
        }
      },
      lateUsage: async (id, usage) => { await meter.lateUsage(id, usage); if (call) { call.lateCanonicalUsage = usage; this.save(); } },
      current: () => call,
    };
  }
  release() { if (this.lockFd !== undefined) { fs.closeSync(this.lockFd); this.lockFd = undefined; fs.unlinkSync(this.lock); } }
}

async function executeTrial({ guard, trial, meter, key, transport, assertAwake, validate }) {
  if (guard.inFlight) stop('CONCURRENT_EXECUTION');
  const packetPath = path.join(here, trial.packet), bytes = fs.readFileSync(packetPath);
  const freeze = read(path.join(here, 'freeze.json'));
  for (const [name, digest] of Object.entries(freeze.sourcePins)) if (sha(fs.readFileSync(path.join(root, name))) !== digest) stop('FROZEN_SOURCE_DRIFT');
  const pin = freeze.packets.find(p => p.name === trial.packet);
  if (!pin || sha(bytes) !== pin.sha256) stop('PACKET_DRIFT');
  const packet = JSON.parse(bytes), { DeepSeekAdapter } = runtime('ai/providers/deepseek');
  const { dispatchMeteredProvider, boundedProviderInput } = runtime('planner/v2/intelligence/provider');
  if (boundedProviderInput(packet) !== trial.inputReservationUnits) stop('INPUT_RESERVATION_DRIFT');
  const wrapped = guard.wrap(meter, trial), previousFetch = global.fetch;
  guard.inFlight = true;
  let finalText = null, rejected = null, latencyMs;
  global.fetch = async (url, options) => {
    await assertAwake();
    const call = wrapped.current(); guard.wire(call, url, options, packet);
    const start = Date.now();
    try {
      const response = await transport(url, { ...options, redirect: 'error' });
      if (!response.ok) { guard.halt('HTTP_FAILURE_UNKNOWN_SPEND'); return response; }
      const raw = await response.json(); latencyMs = Date.now() - start;
      finalText = raw.choices?.[0]?.message?.content ?? null;
      // Validate raw counters before the shared adapter can normalize absent fields to zero.
      guard.usage(call, raw);
      call.finishReason = raw.choices?.[0]?.finish_reason ?? null;
      call.latencyMs = latencyMs; guard.save();
      return { ok: true, json: async () => raw };
    } catch (error) { guard.halt('TRANSPORT_OR_RECEIPT_UNCERTAINTY'); throw error; }
  };
  const routing = runtime('ai/agent-router').WORKLOAD_ROUTING_TABLE;
  const routingBefore = JSON.stringify(routing);
  try {
    const result = await dispatchMeteredProvider(wrapped, { ...packet, validate, rejectedResponse: text => { rejected = text; return undefined; } }, {
      adapter: route => {
        if (!routeAllowed(route)) throw new Error('DIAGNOSTIC_PROVIDER_FORBIDDEN');
        const adapter = new DeepSeekAdapter(key, route.model, 'https://api.deepseek.com');
        if (adapter.resolveModelName(route.model) !== 'deepseek-flash') throw new Error('DIAGNOSTIC_MODEL_FORBIDDEN');
        return adapter;
      },
    });
    return { status: 'VALIDATED', result, finalText, latencyMs };
  } catch (error) {
    return { status: 'REJECTED', errorCode: error.detail?.code ?? 'UNCLASSIFIED', finalText, rejected, latencyMs, stopped: guard.state.stopped };
  } finally {
    global.fetch = previousFetch;
    guard.inFlight = false;
    if (JSON.stringify(routing) !== routingBefore) { guard.halt('PRODUCTION_ROUTING_CHANGED'); stop('PRODUCTION_ROUTING_CHANGED'); }
  }
}
module.exports = { SpendingGuard, executeTrial, allowance, sha, runtime, here, root };
