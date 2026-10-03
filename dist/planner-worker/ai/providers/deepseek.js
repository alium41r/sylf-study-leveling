"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepSeekAdapter = void 0;
const types_1 = require("./types");
const crypto_1 = __importDefault(require("crypto"));
class DeepSeekAdapter {
    apiKey;
    model;
    baseURL;
    constructor(apiKey, model = "deepseek-v4-flash", baseURL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com") {
        // Sanitize API key and baseURL against zero-width spaces (\u200B) or non-ASCII characters
        this.apiKey = (apiKey || "").replace(/[^\x20-\x7E]/g, "").trim();
        this.model = model;
        this.baseURL = (baseURL || "https://api.deepseek.com")
            .replace(/[^\x20-\x7E]/g, "")
            .trim()
            .replace(/\/+$/, "");
    }
    getModel() {
        return this.model;
    }
    resolveModelName(requested) {
        if (process.env.DEEPSEEK_MODEL)
            return process.env.DEEPSEEK_MODEL;
        if (requested.includes("vision"))
            return "deepseek-v4-flash-vision-exp";
        if (requested.includes("reasoner"))
            return "deepseek-reasoner";
        return requested || "deepseek-v4-flash";
    }
    mapTool(tool) {
        return {
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters || { type: "object", properties: {} },
            },
        };
    }
    mapMessages(messages, systemInstruction) {
        const deepSeekMessages = [];
        // DeepSeek OpenAI-compatible standard requires system message
        if (systemInstruction && systemInstruction.trim().length > 0) {
            deepSeekMessages.push({
                role: "system",
                content: systemInstruction.trim(),
            });
        }
        for (const msg of messages) {
            if (msg.role === "system") {
                if (msg.content) {
                    deepSeekMessages.push({ role: "system", content: msg.content });
                }
                continue;
            }
            if (msg.role === "user") {
                const hasMedia = msg.parts?.some((p) => !!p.inlineData);
                if (hasMedia && msg.parts) {
                    const contentParts = [];
                    for (const p of msg.parts) {
                        if (p.text) {
                            contentParts.push({ type: "text", text: p.text });
                        }
                        if (p.inlineData) {
                            contentParts.push({
                                type: "image_url",
                                image_url: {
                                    url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
                                },
                            });
                        }
                    }
                    if (msg.content && !msg.parts.some((p) => p.text === msg.content)) {
                        contentParts.unshift({ type: "text", text: msg.content });
                    }
                    deepSeekMessages.push({ role: "user", content: contentParts });
                }
                else {
                    let text = msg.content || "";
                    if (msg.parts) {
                        const partsText = msg.parts
                            .map((p) => p.text)
                            .filter(Boolean)
                            .join("\n");
                        if (partsText) {
                            text = text ? `${text}\n${partsText}` : partsText;
                        }
                    }
                    deepSeekMessages.push({ role: "user", content: text || " " });
                }
            }
            else if (msg.role === "assistant") {
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    deepSeekMessages.push({
                        role: "assistant",
                        content: msg.content || null,
                        tool_calls: msg.toolCalls.map((tc) => ({
                            id: tc.id || `call_${crypto_1.default.randomUUID().slice(0, 8)}`,
                            type: "function",
                            function: {
                                name: tc.name,
                                arguments: typeof tc.args === "string"
                                    ? tc.args
                                    : JSON.stringify(tc.args || {}),
                            },
                        })),
                    });
                }
                else {
                    deepSeekMessages.push({
                        role: "assistant",
                        content: msg.content || "",
                    });
                }
            }
            else if (msg.role === "tool") {
                if (msg.toolResults && msg.toolResults.length > 0) {
                    for (const tr of msg.toolResults) {
                        deepSeekMessages.push({
                            role: "tool",
                            tool_call_id: tr.toolCallId,
                            name: tr.name,
                            content: typeof tr.result === "string"
                                ? tr.result
                                : JSON.stringify(tr.result),
                        });
                    }
                }
            }
        }
        return deepSeekMessages;
    }
    async generateResponse(messages, systemInstruction, tools = [], options) {
        if (!this.apiKey) {
            throw new types_1.LLMProviderError("deepseek", "DEEPSEEK_API_KEY is not configured.", null, "missing_api_key");
        }
        const deepSeekMessages = this.mapMessages(messages, systemInstruction);
        const deepSeekTools = tools.length > 0 ? tools.map((t) => this.mapTool(t)) : undefined;
        const targetModel = this.resolveModelName(this.model);
        const payload = {
            model: targetModel,
            messages: deepSeekMessages,
            stream: false,
        };
        if (deepSeekTools && deepSeekTools.length > 0) {
            payload.tools = deepSeekTools;
            payload.tool_choice = "auto";
        }
        if (options?.responseFormat === "json_object") {
            payload.response_format = { type: "json_object" };
        }
        if (typeof options?.temperature === "number") {
            payload.temperature = options.temperature;
        }
        if (typeof options?.maxTokens === "number") {
            payload.max_tokens = options.maxTokens;
        }
        if (options?.thinking) {
            payload.thinking = { type: options.thinking };
        }
        const doRequest = async (reqPayload) => {
            const endpoint = `${this.baseURL}/chat/completions`;
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(reqPayload),
                signal: options?.signal,
            });
            if (!response.ok) {
                let errorBody = "";
                try {
                    errorBody = await response.text();
                }
                catch {
                    // ignore
                }
                const statusCode = response.status;
                let errorCode = "api_error";
                if (statusCode === 401)
                    errorCode = "unauthorized";
                else if (statusCode === 429)
                    errorCode = "rate_limit";
                else if (statusCode >= 500)
                    errorCode = "server_error";
                const err = new types_1.LLMProviderError("deepseek", `DeepSeek API responded with HTTP ${statusCode}: ${errorBody || response.statusText}`, errorBody, errorCode);
                err.status = statusCode;
                throw err;
            }
            return response.json();
        };
        try {
            let data;
            try {
                data = await doRequest(payload);
            }
            catch (err) {
                // If the deployed model doesn't accept the `thinking` param, retry
                // once without it instead of cascading to fallback providers.
                if (!options?.singleAttempt && options?.thinking &&
                    err instanceof types_1.LLMProviderError &&
                    err.status === 400 &&
                    typeof err.originalError === "string" &&
                    /thinking/i.test(err.originalError)) {
                    console.warn("[DeepSeek] 'thinking' param rejected by the API — retrying without it.");
                    delete payload.thinking;
                    data = await doRequest(payload);
                }
                else {
                    throw err;
                }
            }
            const choice = data.choices?.[0];
            const message = choice?.message;
            if (!message) {
                throw new types_1.LLMProviderError("deepseek", "DeepSeek API returned an empty choices array.", data, "empty_response");
            }
            const normalizedToolCalls = [];
            if (message.tool_calls && Array.isArray(message.tool_calls)) {
                for (const tc of message.tool_calls) {
                    let parsedArgs = {};
                    try {
                        parsedArgs =
                            typeof tc.function?.arguments === "string"
                                ? JSON.parse(tc.function.arguments || "{}")
                                : tc.function?.arguments || {};
                    }
                    catch (err) {
                        throw new types_1.LLMProviderError("deepseek", `Failed to parse tool call arguments for tool '${tc.function?.name}'`, err, "invalid_json");
                    }
                    normalizedToolCalls.push({
                        id: tc.id || crypto_1.default.randomUUID(),
                        name: tc.function?.name || "",
                        args: parsedArgs,
                    });
                }
            }
            const rawText = message.content || "";
            const reasoningContent = message.reasoning_content;
            // If reasoning_content exists (DeepSeek Reasoner), log or preserve reasoning
            const text = rawText ? rawText.trim() : undefined;
            return {
                finishReason: data.choices?.[0]?.finish_reason === "length" ? "MAX_TOKENS" :
                    ["stop", "tool_calls"].includes(data.choices?.[0]?.finish_reason) ? "STOP" : "OTHER",
                text,
                toolCalls: normalizedToolCalls.length > 0 ? normalizedToolCalls : undefined,
                rawCandidateParts: reasoningContent
                    ? [{ text: reasoningContent, type: "reasoning" }]
                    : undefined,
                usage: data.usage
                    ? {
                        promptTokens: data.usage.prompt_tokens || 0,
                        completionTokens: data.usage.completion_tokens || 0,
                        totalTokens: data.usage.total_tokens || 0,
                        cacheHitTokens: data.usage.prompt_cache_hit_tokens || 0,
                    }
                    : undefined,
            };
        }
        catch (err) {
            if (err instanceof types_1.LLMProviderError) {
                throw err;
            }
            throw new types_1.LLMProviderError("deepseek", `DeepSeek network or execution error: ${err.message || String(err)}`, err, "network_error");
        }
    }
}
exports.DeepSeekAdapter = DeepSeekAdapter;
