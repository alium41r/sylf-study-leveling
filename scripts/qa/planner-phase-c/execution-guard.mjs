/** Qualification-only controls. Finance is projected from AiUsageLog, never a second ledger. */
import { createHash } from "node:crypto";
export const CEILING_MICROS = 1750000;
export const peakMicros = (input, output) => {
  if (![input, output].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("INVALID_USAGE");
  return Math.ceil((input * 3 + output * 12) / 10);
};
export function financialExposure(records, currentId) {
  let exposure = 0, settled = 0;
  for (const row of records) {
    if (row.accountingState === "CANCELLED_BEFORE_DISPATCH") continue;
    const receipt = row.reservation;
    if (receipt?.schemaVersion !== 2 || receipt.call?.model !== "deepseek-flash") throw new Error("UNAUTHORIZED_FINANCIAL_RECEIPT");
    if (row.accountingState === "SETTLED") {
      if (typeof row.estimatedCostUsd !== "number" || !Number.isFinite(row.estimatedCostUsd) || row.estimatedCostUsd < 0 || row.usageKnown !== true || receipt.usage?.effectiveModel !== "deepseek-flash") throw new Error("UNKNOWN_SPENDING");
      const amount = peakMicros(row.promptTokens, row.completionTokens); exposure += amount; settled += amount;
    } else {
      if (row.accountingState === "UNKNOWN_SPEND" || row.accountingState === "DISPATCHED" && row.requestId !== currentId) throw new Error("UNKNOWN_SPENDING");
      exposure += peakMicros(receipt.call.reservedInputTokens, receipt.call.reservedOutputTokens);
    }
  }
  if (exposure > CEILING_MICROS) throw new Error("USD_CEILING_REQUIRED");
  return { exposureMicros: exposure, settledPeakMicros: settled, ceilingMicros: CEILING_MICROS };
}
export function roleOf(instruction) {
  return instruction.startsWith("Independently") ? "VERIFICATION" : instruction.startsWith("Check the complete") ? "SYNTHESIS" : instruction.startsWith("You are Sylf's Research") ? "RESEARCH" : instruction.startsWith("You are Sylf's DeepSeek") ? "STRATEGIST" : instruction.startsWith("You are Sylf's independent educational reviewer") ? "REVIEWER" : "TRANSLATOR";
}
export function responseProblem(response, format) {
  if (response.model !== "deepseek-flash") return "MODEL_IDENTITY_UNCERTAIN";
  const u = response.usage;
  if (!u || ![u.promptTokens,u.completionTokens,u.totalTokens,u.cacheHitTokens].every(n => Number.isSafeInteger(n) && n >= 0) || u.cacheHitTokens > u.promptTokens || u.reasoningTokens !== undefined && (!Number.isSafeInteger(u.reasoningTokens) || u.reasoningTokens < 0 || u.reasoningTokens > u.completionTokens)) return "USAGE_UNCERTAIN";
  if (u.totalTokens !== u.promptTokens + u.completionTokens || u.completionTokens > 65536 || u.promptTokens > 500000) return "PROVIDER_USAGE_OVERRUN_OR_MISMATCH";
  if (response.finishReason !== "STOP" || !response.text?.trim()) return "INCOMPLETE_PROVIDER_RESPONSE";
  if (format === "json_object") try { JSON.parse(response.text); } catch { return "INVALID_PROVIDER_JSON"; }
  return null;
}
/** readState/onStop compose the actual owned Attempt/meter. now is injectable only in unpaid tests. */
export function guardedAdapter(adapter, { readState, onStop, onTrace, now = Date.now, authorize, invoke, beforeDispatch = async () => {}, getStopReason = () => /** @type {string | null} */ (null) }) {
  let stopped = null, sequence = 0, active = false;
  const stop = async code => { stopped ??= code; await onStop(stopped); };
  return { resolveModelName: () => "deepseek-flash", async generateResponse(messages, instruction, tools, options) {
    await beforeDispatch();
    if (stopped || getStopReason()) throw new Error(stopped ?? getStopReason());
    if (!authorize() || active) throw new Error("C01_NOT_AUTHORIZED_OR_CONCURRENT");
    const role = roleOf(instruction), packet = JSON.parse(messages[0].content);
    if (tools.length || options?.thinking !== "enabled" || options?.reasoningEffort !== "high" || options?.maxTokens !== 65536 || options?.singleAttempt !== true || options?.telemetry !== false || options?.preserveText !== true || options.responseFormat !== (role === "STRATEGIST" ? "text" : "json_object")) throw new Error("ROLE_SETTINGS_CHANGED");
    let state, exposure;
    try { state = await readState(role); exposure = financialExposure(state.records, state.callId); }
    catch (error) {
      const code = typeof error?.message === "string" && /^[A-Z_]+$/.test(error.message) ? error.message : "QUALIFICATION_ADMISSION_STOP";
      await onTrace({ sequence: ++sequence, role, attemptId: state?.attemptId ?? null, callId: state?.callId ?? null,
        startedAt: new Date(now()).toISOString(), finishedAt: new Date(now()).toISOString(), stopReason: code, physicalInvocationStarted: false });
      await stop(code); throw error;
    }
    if (state.route === "ALLOCATION" && state.progressDigest && state.priorReviewProgress.includes(state.progressDigest)) { await stop("UNPRODUCTIVE_CLOCK_ONLY_REVIEW"); throw new Error(stopped); }
    const trace = { sequence: ++sequence, role, callId: state.callId, attemptId: state.attemptId, startedAt: new Date(now()).toISOString(),
      settings: { model: "deepseek-flash", effort: "HIGH", maxTokens: options.maxTokens, responseFormat: options.responseFormat },
      inputBytes: Buffer.byteLength(JSON.stringify(messages) + instruction), inputSha256: createHash("sha256").update(JSON.stringify({messages,instruction})).digest("hex"),
      messages, systemInstruction: instruction, exposure, physicalInvocationStarted: false };
    active = true;
    try {
      await onTrace(trace);
      trace.physicalInvocationStarted = true; await onTrace(trace);
      const response = await invoke(adapter, [messages, instruction, tools, options], trace);
      trace.response = { text: response.text ?? null, model: response.model ?? null, fingerprint: response.fingerprint ?? null, finishReason: response.finishReason ?? null, usage: response.usage ?? null };
      trace.finishedAt = new Date(now()).toISOString();
      const problem = responseProblem(response, options.responseFormat);
      const expires = role === "REVIEWER" ? Date.parse(packet.input?.context?.capacity?.calendar?.validUntil ?? "") : NaN;
      trace.stopReason = problem ?? (Number.isFinite(expires) && now() >= expires ? "REVIEW_CALENDAR_EXPIRED_AFTER_COMPLETE_RESPONSE" : null);
      await onTrace(trace);
      // Return actual response so the existing dispatcher can retain/reconcile
      // complete visible evidence and actual finance after cancellation.
      if (trace.stopReason) await stop(trace.stopReason);
      return response;
    } catch (error) {
      trace.stopReason = getStopReason() ?? stopped ?? "PROVIDER_OR_PROTOCOL_FAILURE";
      trace.finishedAt = new Date(now()).toISOString(); trace.error = { type: error?.name ?? "Error", code: typeof error?.code === "string" ? error.code : null, status: Number.isInteger(error?.status) ? error.status : null };
      await onTrace(trace); await stop(getStopReason() ?? stopped ?? "PROVIDER_OR_PROTOCOL_FAILURE"); throw error;
    } finally { active = false; }
  } };
}
