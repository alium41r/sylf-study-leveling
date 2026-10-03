"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workerProviderMeter = workerProviderMeter;
exports.foregroundProviderMeter = foregroundProviderMeter;
exports.dispatchMeteredProvider = dispatchMeteredProvider;
const node_crypto_1 = require("node:crypto");
const agent_router_1 = require("../../../ai/agent-router");
const factory_1 = require("../../../ai/providers/factory");
const usage_pricing_1 = require("../../../ai/usage-pricing");
const database_1 = require("../server/database");
const provider_policy_1 = require("./provider-policy");
function workerProviderMeter(attempts, token) {
    return {
        reserve: async (route, inputTokens, outputTokens, policy, signal) => {
            const category = (0, provider_policy_1.providerCategory)(policy.purpose);
            const id = await attempts.reserveCall(token, { ...route, inputTokens, outputTokens, category, policy });
            if (signal.aborted) {
                await attempts.closeProviderCall(token, id, { errorCode: "CANCELLED" });
                throw cancelled();
            }
            await attempts.dispatchCall(token, id, category);
            return id;
        },
        window: purpose => attempts.providerWindow(token, purpose), settle: (id, usage) => attempts.settleCall(token, id, usage),
        close: (id, result) => attempts.closeProviderCall(token, id, result),
        lateUsage: (id, usage) => attempts.recordLateUsage(token.ownerId, token.attemptId, id, usage),
    };
}
function foregroundProviderMeter(accounting, ownerId, initialBudget, feature) {
    let budget = structuredClone(initialBudget);
    const meter = {
        reserve: async (route, inputTokens, outputTokens, policy, signal) => {
            if (signal.aborted)
                throw cancelled();
            const result = await accounting.dispatch(ownerId, budget, feature, { callId: (0, node_crypto_1.randomUUID)(), ...route, inputTokens, outputTokens, policy });
            budget = result.budget;
            return result.call.callId;
        },
        window: () => accounting.window(ownerId, budget),
        settle: async (id, usage) => { budget = await accounting.settle(ownerId, budget, id, usage); },
        close: async (id) => { budget = await accounting.close(ownerId, budget, id); },
        lateUsage: (id, usage) => accounting.recordLateUsage(ownerId, id, usage),
    };
    return { meter, budget: () => structuredClone(budget) };
}
const cancelled = () => new database_1.DurablePlannerError("CANCELLED", "The model request was cancelled.", "RECOVERY");
const failure = (code, message) => new database_1.DurablePlannerError(code, message, "RECOVERY");
/** One upstream attempt per durable reservation. This intentionally uses shared
 * route configuration, never the older router's retrying dispatch helper. */
async function dispatchMeteredProvider(meter, request, dependencies = {}) {
    const workload = request.workload ?? (request.policy.purpose === "INTERPRETATION" ? "general_chat" : request.policy.purpose === "OCR" ? "multimodal_vision" : "syllabus");
    const config = agent_router_1.WORKLOAD_ROUTING_TABLE[workload];
    if (!Number.isSafeInteger(request.outputTokens) || request.outputTokens <= 0 || request.outputTokens > config.outputTokenCap ||
        request.callTimeoutMs !== undefined && (!Number.isFinite(request.callTimeoutMs) || request.callTimeoutMs <= 0))
        throw failure("INVALID_OUTPUT", "Invalid bounded provider output or timeout allowance.");
    // A conservative UTF-8 upper bound avoids under-reserving an un-tokenized
    // multilingual prompt. Provider actual usage replaces it on settlement.
    const inputTokens = Buffer.byteLength(JSON.stringify({ messages: request.messages, systemInstruction: request.systemInstruction })) + 256;
    const routes = [config.primary, config.fallback, config.secondaryFallback].filter((r) => !!r);
    const attempts = [];
    let lastError = failure("PROVIDER_FAILURE", "No configured provider is available.");
    for (const configured of routes) {
        if (request.signal?.aborted)
            throw cancelled();
        let adapter;
        let route = { ...configured };
        try {
            adapter = (dependencies.adapter ?? (r => factory_1.LLMFactory.getAdapter(r.provider, r.model)))(route);
            // DeepSeek's existing environment/model alias resolution is authoritative
            // for the actual model sent upstream, including explicit overrides.
            if (route.provider === "deepseek" && "resolveModelName" in adapter && typeof adapter.resolveModelName === "function")
                route = { ...route, model: adapter.resolveModelName(route.model) };
        }
        catch {
            continue;
        } // Missing configuration made no external attempt.
        const before = await meter.window(request.policy.purpose);
        if (before.deadline <= before.now)
            throw failure("BUDGET_EXHAUSTED", "The model processing deadline expired.");
        const controller = new AbortController();
        const onAbort = () => controller.abort(cancelled());
        request.signal?.addEventListener("abort", onAbort, { once: true });
        if (request.signal?.aborted)
            onAbort();
        let callId;
        let timer;
        let poll;
        let abandoned = false;
        let upstream;
        let abortListener;
        let finishReason;
        try {
            if (controller.signal.aborted)
                throw cancelled();
            callId = await meter.reserve(route, inputTokens, request.outputTokens, request.policy, controller.signal);
            attempts.push({ callId, ...route });
            if (controller.signal.aborted)
                throw cancelled();
            const window = await meter.window(request.policy.purpose);
            const remaining = window.deadline - window.now;
            if (remaining <= 0)
                throw failure("BUDGET_EXHAUSTED", "The model processing deadline expired.");
            const timeout = Math.min(remaining, request.callTimeoutMs ?? remaining);
            timer = setTimeout(() => controller.abort(failure(timeout < remaining ? "PROVIDER_TIMEOUT" : "BUDGET_EXHAUSTED", "The model processing deadline expired.")), timeout);
            let checking = false;
            poll = setInterval(() => {
                if (checking || controller.signal.aborted)
                    return;
                checking = true;
                void meter.window(request.policy.purpose).then(w => { if (w.deadline <= w.now)
                    controller.abort(failure("BUDGET_EXHAUSTED", "The model processing deadline expired.")); })
                    .catch(error => controller.abort(error)).finally(() => { checking = false; });
            }, Math.max(10, dependencies.pollMs ?? 1000));
            const aborted = new Promise((_resolve, reject) => {
                abortListener = () => reject(controller.signal.reason ?? cancelled());
                controller.signal.addEventListener("abort", abortListener, { once: true });
            });
            upstream = Promise.resolve().then(() => {
                if (controller.signal.aborted)
                    throw controller.signal.reason;
                return adapter.generateResponse(request.messages, request.systemInstruction, [], {
                    maxTokens: request.outputTokens, responseFormat: "json_object", thinking: config.thinking, singleAttempt: true, signal: controller.signal,
                });
            });
            void upstream.then(response => {
                if (abandoned && response.usage) {
                    try {
                        void meter.lateUsage(callId, (0, usage_pricing_1.pricedProviderUsage)(route.model, response.usage)).catch(() => { });
                    }
                    catch { /* Invalid usage stays unknown. */ }
                }
            }).catch(() => { });
            const response = await Promise.race([upstream, aborted]);
            finishReason = response.finishReason;
            if (response.usage) {
                const usage = (0, usage_pricing_1.pricedProviderUsage)(route.model, response.usage);
                try {
                    await meter.settle(callId, usage);
                }
                catch (error) {
                    await meter.lateUsage(callId, usage);
                    throw error;
                }
            }
            else
                throw failure("PROVIDER_FAILURE", "The provider did not return accounting usage.");
            if (controller.signal.aborted)
                throw controller.signal.reason;
            await meter.window(request.policy.purpose); // Cancellation, supersession or overrun wins over output.
            if (response.finishReason === "MAX_TOKENS")
                throw failure("OUTPUT_TRUNCATED", "The provider reached its output limit.");
            if (response.finishReason !== "STOP" || !response.text?.trim())
                throw failure("INVALID_OUTPUT", "The provider did not return a complete structured result.");
            const safe = { text: response.text, finishReason: response.finishReason, usage: response.usage };
            let value;
            try {
                value = request.validate(safe);
            }
            catch {
                throw failure("INVALID_OUTPUT", "The provider result failed structured validation.");
            }
            await meter.close(callId, { finishReason: response.finishReason, accepted: true });
            return { value, provider: route.provider, model: route.model, callId, attempts };
        }
        catch (error) {
            abandoned = true;
            // Error text/raw reasoning can contain private prompts or provider keys.
            // Persist and return only stable Planner error codes.
            lastError = error instanceof database_1.DurablePlannerError ? error : failure("PROVIDER_FAILURE", "The model request failed.");
            if (callId) {
                attempts[attempts.length - 1].code = lastError.detail.code;
                await meter.close(callId, { finishReason, errorCode: lastError.detail.code }).catch(() => { });
            }
            controller.abort(lastError);
            if (!["PROVIDER_FAILURE", "PROVIDER_TIMEOUT", "OUTPUT_TRUNCATED", "INVALID_OUTPUT"].includes(lastError.detail.code))
                throw lastError;
        }
        finally {
            if (timer)
                clearTimeout(timer);
            if (poll)
                clearInterval(poll);
            if (abortListener)
                controller.signal.removeEventListener("abort", abortListener);
            request.signal?.removeEventListener("abort", onAbort);
        }
    }
    throw lastError;
}
