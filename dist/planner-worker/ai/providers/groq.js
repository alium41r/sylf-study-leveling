"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqAdapter = void 0;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const types_1 = require("./types");
const crypto_1 = __importDefault(require("crypto"));
class GroqAdapter {
    groq;
    model;
    constructor(apiKey, model = process.env.GROQ_MODEL || "openai/gpt-oss-120b") {
        this.groq = new groq_sdk_1.default({ apiKey });
        this.model = model;
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
        const groqMessages = [];
        // Groq requires system instruction as the first message
        groqMessages.push({ role: "system", content: systemInstruction });
        for (const msg of messages) {
            if (msg.role === "system")
                continue;
            if (msg.role === "user") {
                if (msg.parts && msg.parts.some((p) => p.inlineData)) {
                    const contentParts = [];
                    for (const p of msg.parts) {
                        if (p.text)
                            contentParts.push({ type: "text", text: p.text });
                        if (p.inlineData) {
                            contentParts.push({
                                type: "image_url",
                                image_url: {
                                    url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
                                },
                            });
                        }
                    }
                    if (contentParts.length === 0 && msg.content) {
                        contentParts.push({ type: "text", text: msg.content });
                    }
                    groqMessages.push({ role: "user", content: contentParts });
                }
                else {
                    let content = msg.content || "";
                    if (msg.parts) {
                        for (const p of msg.parts) {
                            if (p.text)
                                content += (content ? "\n" : "") + p.text;
                        }
                    }
                    groqMessages.push({ role: "user", content: content || " " });
                }
            }
            else if (msg.role === "assistant") {
                if (msg.toolCalls) {
                    groqMessages.push({
                        role: "assistant",
                        content: msg.content || "",
                        tool_calls: msg.toolCalls.map(tc => ({
                            id: tc.id,
                            type: "function",
                            function: { name: tc.name, arguments: JSON.stringify(tc.args) }
                        }))
                    });
                }
                else {
                    groqMessages.push({ role: "assistant", content: msg.content || "" });
                }
            }
            else if (msg.role === "tool") {
                if (msg.toolResults) {
                    for (const tr of msg.toolResults) {
                        groqMessages.push({
                            role: "tool",
                            tool_call_id: tr.toolCallId,
                            name: tr.name,
                            content: typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result),
                        });
                    }
                }
            }
        }
        return groqMessages;
    }
    async generateResponse(messages, systemInstruction, tools, options) {
        const groqMessages = this.mapMessages(messages, systemInstruction);
        const groqTools = tools.length > 0 ? tools.map(this.mapTool) : undefined;
        const candidateModels = options?.singleAttempt ? [this.model] : Array.from(new Set([
            this.model,
            process.env.GROQ_MODEL,
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "llama-3.3-70b-versatile",
            "qwen/qwen3.8-27b",
        ].filter(Boolean)));
        let lastError = null;
        for (const modelToTry of candidateModels) {
            try {
                const completion = await this.groq.chat.completions.create({
                    model: modelToTry,
                    messages: groqMessages,
                    tools: groqTools,
                    tool_choice: groqTools ? "auto" : undefined,
                    response_format: options?.responseFormat === "json_object"
                        ? { type: "json_object" }
                        : undefined,
                    temperature: options?.temperature,
                    max_tokens: options?.maxTokens,
                }, {
                    signal: options?.signal,
                    ...(options?.singleAttempt ? { maxRetries: 0 } : {}),
                });
                const responseMessage = completion.choices[0].message;
                const normalizedToolCalls = [];
                // 1. Standard Tool Calls
                if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
                    for (const tc of responseMessage.tool_calls) {
                        let args = {};
                        try {
                            args = JSON.parse(tc.function.arguments || "{}");
                        }
                        catch (e) {
                            throw new types_1.LLMProviderError("groq", "Failed to parse tool arguments from Groq", e, "invalid_json");
                        }
                        normalizedToolCalls.push({
                            id: tc.id,
                            name: tc.function.name,
                            args,
                        });
                    }
                }
                // 2. Llama-3 XML Recovery Logic
                else if (responseMessage.content && responseMessage.content.includes("<function")) {
                    const matches = [...responseMessage.content.matchAll(/<function[=(](\w+)[=)>]*([\s\S]*?)<\/function>/gi)];
                    for (const match of matches) {
                        const toolName = match[1];
                        const rawArgs = match[2];
                        let args = {};
                        try {
                            const cleanedArgs = rawArgs.replace(/^[=\s>]+/, "").trim();
                            args = JSON.parse(cleanedArgs || "{}");
                        }
                        catch (err) {
                            // We swallow parsing errors here to let it fail upstream gracefully
                        }
                        normalizedToolCalls.push({
                            id: crypto_1.default.randomUUID(), // Groq didn't provide one since it hallucinated
                            name: toolName,
                            args,
                        });
                    }
                }
                const rawContent = responseMessage.content || undefined;
                const cleanContent = rawContent ? rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() : undefined;
                return {
                    finishReason: completion.choices?.[0]?.finish_reason === "length" ? "MAX_TOKENS" :
                        ["stop", "tool_calls"].includes(completion.choices?.[0]?.finish_reason ?? "") ? "STOP" : "OTHER",
                    text: cleanContent || undefined,
                    toolCalls: normalizedToolCalls.length > 0 ? normalizedToolCalls : undefined,
                    usage: completion.usage ? {
                        promptTokens: completion.usage.prompt_tokens || 0,
                        completionTokens: completion.usage.completion_tokens || 0,
                        totalTokens: completion.usage.total_tokens || 0,
                    } : undefined,
                };
            }
            catch (error) {
                lastError = error;
                // Handle the Llama-3 400 error where it throws raw XML back at the API
                const groqInnerError = error.error?.error;
                if (!options?.singleAttempt && groqInnerError?.code === "tool_use_failed" && groqInnerError?.failed_generation) {
                    const failedGen = groqInnerError.failed_generation;
                    const match = failedGen.match(/<function[=(](\w+)[=)>]*([\s\S]*?)<\/function>/i);
                    if (match) {
                        const toolName = match[1];
                        const rawArgs = match[2];
                        let args = {};
                        try {
                            const cleanedArgs = rawArgs.replace(/^[=\s>]+/, "").trim();
                            args = JSON.parse(cleanedArgs || "{}");
                        }
                        catch (e) { }
                        return {
                            toolCalls: [{
                                    id: crypto_1.default.randomUUID(),
                                    name: toolName,
                                    args,
                                }]
                        };
                    }
                }
                // If error is model_not_found, 404, or decommissioned, try next candidate model
                const isModelNotFound = error.status === 404 ||
                    groqInnerError?.code === "model_not_found" ||
                    groqInnerError?.code === "model_decommissioned" ||
                    (error.message && (error.message.includes("model_not_found") ||
                        error.message.includes("model_decommissioned") ||
                        error.message.includes("decommissioned")));
                if (!isModelNotFound) {
                    throw new types_1.LLMProviderError("groq", error.message || "Failed to generate Groq response", error, groqInnerError?.code);
                }
            }
        }
        const groqInnerError = lastError?.error?.error;
        throw new types_1.LLMProviderError("groq", lastError?.message || "Failed to generate Groq response across available models", lastError, groqInnerError?.code);
    }
}
exports.GroqAdapter = GroqAdapter;
