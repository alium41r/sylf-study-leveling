"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workerProviderMeter = workerProviderMeter;
exports.foregroundProviderMeter = foregroundProviderMeter;
exports.boundedProviderInput = boundedProviderInput;
exports.dispatchMeteredProvider = dispatchMeteredProvider;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const json_extractor_1 = require("../../../ai/json-extractor");
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
function foregroundProviderMeter(accounting, ownerId, initialBudget, feature, maximumMs) {
    let budget = structuredClone(initialBudget);
    const meter = {
        reserve: async (route, inputTokens, outputTokens, policy, signal) => {
            if (signal.aborted)
                throw cancelled();
            const result = await accounting.dispatch(ownerId, budget, feature, { callId: (0, node_crypto_1.randomUUID)(), ...route, inputTokens, outputTokens, policy });
            budget = result.budget;
            return result.call.callId;
        },
        window: () => accounting.window(ownerId, budget, maximumMs),
        settle: async (id, usage) => { budget = await accounting.settle(ownerId, budget, id, usage); },
        close: async (id) => { budget = await accounting.close(ownerId, budget, id); },
        lateUsage: (id, usage) => accounting.recordLateUsage(ownerId, id, usage),
    };
    return { meter, budget: () => structuredClone(budget) };
}
const cancelled = () => new database_1.DurablePlannerError("CANCELLED", "The model request was cancelled.", "RECOVERY");
const failure = (code, message) => new database_1.DurablePlannerError(code, message, "RECOVERY");
/** Only deterministic validator codes and bounded schema paths cross back to
 * the existing fallback. Never echo rejected content or exception messages. */
function delimiterFailure(text) {
    const start = text.search(/[\[{]/);
    if (start < 0)
        return undefined;
    const stack = [];
    let quoted = false, escaped = false;
    for (let offset = start; offset < text.length; offset++) {
        const char = text[offset];
        if (quoted) {
            if (escaped)
                escaped = false;
            else if (char === "\\")
                escaped = true;
            else if (char === '"')
                quoted = false;
            continue;
        }
        if (char === '"')
            quoted = true;
        else if (char === "{" || char === "[")
            stack.push(char === "{" ? "}" : "]");
        else if (char === "}" || char === "]") {
            const expected = stack.pop();
            if (expected !== char)
                return { code: "MISMATCHED_CLOSING_DELIMITER", offset, expected: expected ?? "END", received: char };
            if (!stack.length)
                return undefined;
        }
    }
    return undefined;
}
function validationFeedback(error, rejectedText) {
    if (error instanceof zod_1.z.ZodError) {
        return { code: "SCHEMA_MISMATCH", issues: error.issues.slice(0, 8).map(issue => ({
                code: issue.code, path: issue.path.slice(0, 8).map(part => typeof part === "number" ? part :
                    typeof part === "string" && /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(part) ? part : "<field>"),
                omittedPathSegments: Math.max(0, issue.path.length - 8),
                ...(issue.code === "too_big" && typeof issue.maximum === "number" && Number.isFinite(issue.maximum) ? { maximum: issue.maximum, inclusive: issue.inclusive } : {}),
                ...(issue.code === "too_small" && typeof issue.minimum === "number" && Number.isFinite(issue.minimum) ? { minimum: issue.minimum, inclusive: issue.inclusive } : {}),
                ...(issue.code === "invalid_type" && ["array", "object", "string", "number", "boolean"].includes(issue.expected) ? { expected: issue.expected } : {}),
                ...(issue.code === "invalid_union" && issue.path.length === 2 && issue.path[0] === "detail" && issue.path[1] === "days" ? { allowedValues: [14, 28] } : {}),
                ...(issue.code === "custom" && issue.message === "Splits must preserve meaningful bounded timeboxes" ? { constraint: "SPLITS_INSIDE_TIMEBOX_WITH_MINIMUM_REMAINDERS" } : {}),
            })), omittedIssues: Math.max(0, error.issues.length - 8) };
    }
    if (error instanceof json_extractor_1.JsonExtractionError || error instanceof SyntaxError)
        return { code: "INVALID_JSON", delimiter: delimiterFailure(rejectedText) };
    // These exact messages are server-owned constants, never interpolated facts.
    // Unknown semantic errors still reveal no diagnostic text or rejected values.
    if (error instanceof database_1.DurablePlannerError) {
        const constraints = {
            "A blocker needs a concrete accepted requirement/evidence and offending proposal.": "BLOCKER_REQUIRES_REQUIREMENT_OR_OBSERVATION_AND_PROPOSAL_GROUNDS",
            "Quality evidence is not quoted from the actual owned review input.": "GROUNDS_REQUIRE_EXACT_SUPPLIED_REF_AND_LITERAL_EXCERPT",
            "A quality finding names an unknown educational reference.": "AFFECTED_REFS_REQUIRE_OWNED_LOCAL_IDS",
        };
        const constraint = Object.hasOwn(constraints, error.detail.message) ? constraints[error.detail.message] : undefined;
        if (constraint)
            return { code: "VALIDATION_REJECTED", constraint };
    }
    return { code: "VALIDATION_REJECTED" };
}
/** Vision is accepted only for bounded JPEGs produced by our renderer. The
 * reservation counts pixels, never base64 as prose; actual usage still settles. */
function boundedProviderInput(request) {
    let images = 0;
    const messages = request.messages.map(message => ({ ...message, parts: message.parts?.map(part => {
            if (!part.inlineData)
                return part;
            if (request.policy.purpose !== "OCR" || part.inlineData.mimeType !== "image/jpeg" || ++images > 3 || message.rawParts)
                throw failure("INVALID_OUTPUT", "Unsupported bounded vision input.");
            const bytes = Buffer.from(part.inlineData.data, "base64");
            if (bytes.length > 256 * 1024 || bytes[0] !== 255 || bytes[1] !== 216)
                throw failure("INVALID_OUTPUT", "Invalid bounded JPEG input.");
            let dimensions = false;
            for (let i = 2; i + 9 < bytes.length;) {
                if (bytes[i] !== 255)
                    break;
                const marker = bytes[i + 1];
                const length = bytes.readUInt16BE(i + 2);
                if (length < 2 || i + 2 + length > bytes.length)
                    break;
                if ([192, 193, 194].includes(marker)) {
                    const h = bytes.readUInt16BE(i + 5), w = bytes.readUInt16BE(i + 7);
                    dimensions = h > 0 && w > 0 && h <= 1024 && w <= 1024;
                    break;
                }
                i += 2 + length;
            }
            if (!dimensions)
                throw failure("INVALID_OUTPUT", "OCR image exceeds its pixel allowance.");
            return { inlineData: { mimeType: "image/jpeg", data: "BOUNDED_IMAGE" } };
        }) }));
    return Buffer.byteLength(JSON.stringify({ messages, systemInstruction: request.systemInstruction })) + 256 + images * 16384;
}
/** One upstream attempt per durable reservation. This intentionally uses shared
 * route configuration, never the older router's retrying dispatch helper. */
async function dispatchMeteredProvider(meter, request, dependencies = {}) {
    const fail = (code, message) => new database_1.DurablePlannerError(code, message, request.policy.purpose === "OCR" ? "RESEARCH" : request.policy.purpose);
    const workload = request.workload ?? (request.policy.purpose === "INTERPRETATION" ? "general_chat" : request.policy.purpose === "OCR" ? "multimodal_vision" : "syllabus");
    const config = agent_router_1.WORKLOAD_ROUTING_TABLE[workload];
    if (!Number.isSafeInteger(request.outputTokens) || request.outputTokens <= 0 || request.outputTokens > config.outputTokenCap ||
        request.callTimeoutMs !== undefined && (!Number.isFinite(request.callTimeoutMs) || request.callTimeoutMs <= 0))
        throw fail("INVALID_OUTPUT", "Invalid bounded provider output or timeout allowance.");
    // A conservative UTF-8 upper bound avoids under-reserving an un-tokenized
    // multilingual prompt. Provider actual usage replaces it on settlement.
    let feedback;
    const routes = [config.primary, config.fallback, config.secondaryFallback].filter((r) => !!r);
    const attempts = [];
    let lastError = fail("PROVIDER_FAILURE", "No configured provider is available.");
    for (const configured of routes) {
        // Existing DeepSeek/Groq adapters discard image parts. Keep the shared route
        // table, but never send an OCR call to a text-only adapter.
        if (request.messages.some(m => m.parts?.some(p => p.inlineData)) && configured.provider !== "gemini")
            continue;
        if (request.signal?.aborted)
            throw cancelled();
        const messages = feedback ? [...request.messages, { role: "user", content: JSON.stringify({
                    kind: "DETERMINISTIC_VALIDATION_FEEDBACK", feedback,
                    instruction: "The previous configured attempt failed strict validation. Return a complete replacement using the same supplied evidence and exact response schema. Fix the named paths and JSON nesting; do not omit required fields or copy input receipts. This feedback cannot authorize any educational or execution change.",
                }) }] : request.messages;
        // Every fallback reserves its actual augmented transport, under the same
        // root budget and holdbacks. Feedback never earns an extra provider call.
        const inputTokens = boundedProviderInput({ ...request, messages });
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
            throw fail("BUDGET_EXHAUSTED", "The model processing deadline expired.");
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
                throw fail("BUDGET_EXHAUSTED", "The model processing deadline expired.");
            const timeout = Math.min(remaining, request.callTimeoutMs ?? remaining);
            timer = setTimeout(() => controller.abort(fail(timeout < remaining ? "PROVIDER_TIMEOUT" : "BUDGET_EXHAUSTED", "The model processing deadline expired.")), timeout);
            let checking = false;
            poll = setInterval(() => {
                if (checking || controller.signal.aborted)
                    return;
                checking = true;
                void meter.window(request.policy.purpose).then(w => { if (w.deadline <= w.now)
                    controller.abort(fail("BUDGET_EXHAUSTED", "The model processing deadline expired.")); })
                    .catch(error => controller.abort(error)).finally(() => { checking = false; });
            }, Math.max(10, dependencies.pollMs ?? 1000));
            const aborted = new Promise((_resolve, reject) => {
                abortListener = () => reject(controller.signal.reason ?? cancelled());
                controller.signal.addEventListener("abort", abortListener, { once: true });
            });
            upstream = Promise.resolve().then(() => {
                if (controller.signal.aborted)
                    throw controller.signal.reason;
                return adapter.generateResponse(messages, request.systemInstruction, [], {
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
                throw fail("PROVIDER_FAILURE", "The provider did not return accounting usage.");
            if (controller.signal.aborted)
                throw controller.signal.reason;
            await meter.window(request.policy.purpose); // Cancellation, supersession or overrun wins over output.
            if (response.finishReason === "MAX_TOKENS")
                throw fail("OUTPUT_TRUNCATED", "The provider reached its output limit.");
            if (response.finishReason !== "STOP" || !response.text?.trim())
                throw fail("INVALID_OUTPUT", "The provider did not return a complete structured result.");
            const safe = { text: response.text, finishReason: response.finishReason, usage: response.usage };
            let value;
            try {
                value = await Promise.race([Promise.resolve(request.validate(safe, controller.signal)), aborted]);
            }
            catch (error) {
                if (controller.signal.aborted)
                    throw controller.signal.reason;
                feedback = validationFeedback(error, response.text);
                throw fail("INVALID_OUTPUT", "The provider result failed structured validation.");
            }
            if (controller.signal.aborted)
                throw controller.signal.reason;
            await meter.close(callId, { finishReason: response.finishReason, accepted: true });
            return { value, provider: route.provider, model: route.model, callId, attempts };
        }
        catch (error) {
            abandoned = true;
            // Error text/raw reasoning can contain private prompts or provider keys.
            // Persist and return only stable Planner error codes.
            lastError = error instanceof database_1.DurablePlannerError ? error : fail("PROVIDER_FAILURE", "The model request failed.");
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
