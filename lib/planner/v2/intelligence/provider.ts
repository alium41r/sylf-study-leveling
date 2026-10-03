import { randomUUID } from "node:crypto";
import { WORKLOAD_ROUTING_TABLE, type WorkloadType, type ModelRouteSpec } from "../../../ai/agent-router";
import { LLMFactory } from "../../../ai/providers/factory";
import type { LLMAdapter, LLMResponse, NormalizedMessage } from "../../../ai/providers/types";
import { pricedProviderUsage } from "../../../ai/usage-pricing";
import type { QuotaFeature } from "../../../ai/config";
import type { RuntimeBudgetV2 } from "../contracts";
import { AttemptService, type LeaseToken } from "../server/attempts";
import { ForegroundAccountingService, type ProviderUsage } from "../server/accounting";
import { DurablePlannerError } from "../server/database";
import { providerCategory, type ProviderPolicy } from "./provider-policy";

type ResultMetadata = { finishReason?: "STOP" | "MAX_TOKENS" | "OTHER"; errorCode?: string; accepted?: boolean };
export interface ProviderMeter {
  reserve(route: ModelRouteSpec, inputTokens: number, outputTokens: number, policy: ProviderPolicy, signal: AbortSignal): Promise<string>;
  window(purpose: ProviderPolicy["purpose"]): Promise<{ now: number; deadline: number }>;
  settle(callId: string, usage: ProviderUsage): Promise<void>;
  close(callId: string, result: ResultMetadata): Promise<void>;
  lateUsage(callId: string, usage: ProviderUsage): Promise<void>;
}
export function workerProviderMeter(attempts: AttemptService, token: LeaseToken): ProviderMeter {
  return {
    reserve: async (route, inputTokens, outputTokens, policy, signal) => {
      const category = providerCategory(policy.purpose);
      const id = await attempts.reserveCall(token, { ...route, inputTokens, outputTokens, category, policy });
      if (signal.aborted) { await attempts.closeProviderCall(token, id, { errorCode: "CANCELLED" }); throw cancelled(); }
      await attempts.dispatchCall(token, id, category); return id;
    },
    window: purpose => attempts.providerWindow(token, purpose), settle: (id, usage) => attempts.settleCall(token, id, usage),
    close: (id, result) => attempts.closeProviderCall(token, id, result),
    lateUsage: (id, usage) => attempts.recordLateUsage(token.ownerId, token.attemptId, id, usage),
  };
}
export function foregroundProviderMeter(accounting: ForegroundAccountingService, ownerId: number, initialBudget: RuntimeBudgetV2, feature: QuotaFeature) {
  let budget = structuredClone(initialBudget);
  const meter: ProviderMeter = {
    reserve: async (route, inputTokens, outputTokens, policy, signal) => {
      if (signal.aborted) throw cancelled();
      const result = await accounting.dispatch(ownerId, budget, feature, { callId: randomUUID(), ...route, inputTokens, outputTokens, policy });
      budget = result.budget; return result.call.callId;
    },
    window: () => accounting.window(ownerId, budget),
    settle: async (id, usage) => { budget = await accounting.settle(ownerId, budget, id, usage); },
    close: async id => { budget = await accounting.close(ownerId, budget, id); },
    lateUsage: (id, usage) => accounting.recordLateUsage(ownerId, id, usage),
  };
  return { meter, budget: () => structuredClone(budget) };
}
const cancelled = () => new DurablePlannerError("CANCELLED", "The model request was cancelled.", "RECOVERY");
const failure = (code: "PROVIDER_FAILURE" | "INVALID_OUTPUT" | "OUTPUT_TRUNCATED" | "PROVIDER_TIMEOUT" | "BUDGET_EXHAUSTED", message: string) => new DurablePlannerError(code, message, "RECOVERY");

export interface MeteredProviderRequest<T> {
  messages: NormalizedMessage[]; systemInstruction: string; policy: ProviderPolicy; outputTokens: number;
  workload?: WorkloadType; signal?: AbortSignal; callTimeoutMs?: number;
  /** Validate structured content before accepting a result/releasing holdbacks. */
  validate: (response: Pick<LLMResponse, "text" | "finishReason" | "usage">, signal: AbortSignal) => T | Promise<T>;
}
/** One upstream attempt per durable reservation. This intentionally uses shared
 * route configuration, never the older router's retrying dispatch helper. */
export async function dispatchMeteredProvider<T>(meter: ProviderMeter, request: MeteredProviderRequest<T>,
  dependencies: { adapter?: (route: ModelRouteSpec) => LLMAdapter; pollMs?: number } = {}) {
  const workload = request.workload ?? (request.policy.purpose === "INTERPRETATION" ? "general_chat" : request.policy.purpose === "OCR" ? "multimodal_vision" : "syllabus");
  const config = WORKLOAD_ROUTING_TABLE[workload];
  if (!Number.isSafeInteger(request.outputTokens) || request.outputTokens <= 0 || request.outputTokens > config.outputTokenCap ||
    request.callTimeoutMs !== undefined && (!Number.isFinite(request.callTimeoutMs) || request.callTimeoutMs <= 0))
    throw failure("INVALID_OUTPUT", "Invalid bounded provider output or timeout allowance.");
  // A conservative UTF-8 upper bound avoids under-reserving an un-tokenized
  // multilingual prompt. Provider actual usage replaces it on settlement.
  const inputTokens = Buffer.byteLength(JSON.stringify({ messages: request.messages, systemInstruction: request.systemInstruction })) + 256;
  const routes = [config.primary, config.fallback, config.secondaryFallback].filter((r): r is ModelRouteSpec => !!r);
  const attempts: { callId: string; provider: string; model: string; code?: string }[] = [];
  let lastError: DurablePlannerError = failure("PROVIDER_FAILURE", "No configured provider is available.");
  for (const configured of routes) {
    if (request.signal?.aborted) throw cancelled();
    let adapter: LLMAdapter; let route = { ...configured };
    try {
      adapter = (dependencies.adapter ?? (r => LLMFactory.getAdapter(r.provider, r.model)))(route);
      // DeepSeek's existing environment/model alias resolution is authoritative
      // for the actual model sent upstream, including explicit overrides.
      if (route.provider === "deepseek" && "resolveModelName" in adapter && typeof adapter.resolveModelName === "function")
        route = { ...route, model: adapter.resolveModelName(route.model) as string };
    } catch { continue; } // Missing configuration made no external attempt.
    const before = await meter.window(request.policy.purpose);
    if (before.deadline <= before.now) throw failure("BUDGET_EXHAUSTED", "The model processing deadline expired.");
    const controller = new AbortController();
    const onAbort = () => controller.abort(cancelled());
    request.signal?.addEventListener("abort", onAbort, { once: true });
    if (request.signal?.aborted) onAbort();
    let callId: string | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined; let abandoned = false;
    let upstream: Promise<LLMResponse> | undefined; let abortListener: (() => void) | undefined;
    let finishReason: LLMResponse["finishReason"];
    try {
      if (controller.signal.aborted) throw cancelled();
      callId = await meter.reserve(route, inputTokens, request.outputTokens, request.policy, controller.signal);
      attempts.push({ callId, ...route });
      if (controller.signal.aborted) throw cancelled();
      const window = await meter.window(request.policy.purpose);
      const remaining = window.deadline - window.now;
      if (remaining <= 0) throw failure("BUDGET_EXHAUSTED", "The model processing deadline expired.");
      const timeout = Math.min(remaining, request.callTimeoutMs ?? remaining);
      timer = setTimeout(() => controller.abort(failure(timeout < remaining ? "PROVIDER_TIMEOUT" : "BUDGET_EXHAUSTED", "The model processing deadline expired.")), timeout);
      let checking = false;
      poll = setInterval(() => {
        if (checking || controller.signal.aborted) return;
        checking = true;
        void meter.window(request.policy.purpose).then(w => { if (w.deadline <= w.now) controller.abort(failure("BUDGET_EXHAUSTED", "The model processing deadline expired.")); })
          .catch(error => controller.abort(error)).finally(() => { checking = false; });
      }, Math.max(10, dependencies.pollMs ?? 1000));
      const aborted = new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(controller.signal.reason ?? cancelled());
        controller.signal.addEventListener("abort", abortListener, { once: true });
      });
      upstream = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw controller.signal.reason;
        return adapter.generateResponse(request.messages, request.systemInstruction, [], {
          maxTokens: request.outputTokens, responseFormat: "json_object", thinking: config.thinking, singleAttempt: true, signal: controller.signal,
        });
      });
      void upstream.then(response => {
        if (abandoned && response.usage) {
          try { void meter.lateUsage(callId!, pricedProviderUsage(route.model, response.usage)).catch(() => {}); } catch { /* Invalid usage stays unknown. */ }
        }
      }).catch(() => {});
      const response = await Promise.race([upstream, aborted]);
      finishReason = response.finishReason;
      if (response.usage) {
        const usage = pricedProviderUsage(route.model, response.usage);
        try { await meter.settle(callId, usage); }
        catch (error) { await meter.lateUsage(callId, usage); throw error; }
      } else throw failure("PROVIDER_FAILURE", "The provider did not return accounting usage.");
      if (controller.signal.aborted) throw controller.signal.reason;
      await meter.window(request.policy.purpose); // Cancellation, supersession or overrun wins over output.
      if (response.finishReason === "MAX_TOKENS") throw failure("OUTPUT_TRUNCATED", "The provider reached its output limit.");
      if (response.finishReason !== "STOP" || !response.text?.trim()) throw failure("INVALID_OUTPUT", "The provider did not return a complete structured result.");
      const safe = { text: response.text, finishReason: response.finishReason, usage: response.usage };
      let value: T;
      try { value = await Promise.race([Promise.resolve(request.validate(safe, controller.signal)), aborted]); }
      catch { if (controller.signal.aborted) throw controller.signal.reason; throw failure("INVALID_OUTPUT", "The provider result failed structured validation."); }
      if (controller.signal.aborted) throw controller.signal.reason;
      await meter.close(callId, { finishReason: response.finishReason, accepted: true });
      return { value, provider: route.provider, model: route.model, callId, attempts };
    } catch (error) {
      abandoned = true;
      // Error text/raw reasoning can contain private prompts or provider keys.
      // Persist and return only stable Planner error codes.
      lastError = error instanceof DurablePlannerError ? error : failure("PROVIDER_FAILURE", "The model request failed.");
      if (callId) {
        attempts[attempts.length - 1].code = lastError.detail.code;
        await meter.close(callId, { finishReason, errorCode: lastError.detail.code }).catch(() => {});
      }
      controller.abort(lastError);
      if (!["PROVIDER_FAILURE", "PROVIDER_TIMEOUT", "OUTPUT_TRUNCATED", "INVALID_OUTPUT"].includes(lastError.detail.code)) throw lastError;
    } finally {
      if (timer) clearTimeout(timer); if (poll) clearInterval(poll);
      if (abortListener) controller.signal.removeEventListener("abort", abortListener);
      request.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastError;
}
