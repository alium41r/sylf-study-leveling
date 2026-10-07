"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiAdapter = void 0;
const genai_1 = require("@google/genai");
const types_1 = require("./types");
const crypto_1 = __importDefault(require("crypto"));
class GeminiAdapter {
    ai;
    model;
    constructor(apiKey, model = "gemini-2.5-flash") {
        this.ai = new genai_1.GoogleGenAI({ apiKey });
        this.model = model;
    }
    // Convert normalized tool to Gemini FunctionDeclaration
    mapTool(tool) {
        const mapType = (t) => {
            switch (t.toLowerCase()) {
                case "string": return genai_1.Type.STRING;
                case "number": return genai_1.Type.NUMBER;
                case "integer": return genai_1.Type.INTEGER;
                case "boolean": return genai_1.Type.BOOLEAN;
                case "array": return genai_1.Type.ARRAY;
                case "object": return genai_1.Type.OBJECT;
                default: return genai_1.Type.STRING;
            }
        };
        const mapSchema = (schema) => {
            if (!schema)
                return schema;
            const res = { type: mapType(schema.type) };
            if (schema.properties) {
                res.properties = {};
                for (const k in schema.properties) {
                    res.properties[k] = mapSchema(schema.properties[k]);
                }
            }
            if (schema.items)
                res.items = mapSchema(schema.items);
            if (schema.required)
                res.required = schema.required;
            if (schema.description)
                res.description = schema.description;
            return res;
        };
        return {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters ? mapSchema(tool.parameters) : undefined,
        };
    }
    mapMessages(messages) {
        const contents = [];
        for (const msg of messages) {
            if (msg.role === "system")
                continue; // System prompt is passed via config in generateContent
            let role;
            if (msg.role === "user" || msg.role === "tool") {
                // Gemini expects tool responses to come from "user" role
                role = "user";
            }
            else {
                role = "model";
            }
            // If the message contains original provider parts (e.g. Gemini candidate parts with thought_signature), preserve them directly!
            if (msg.rawParts && msg.rawParts.length > 0) {
                contents.push({ role, parts: msg.rawParts });
                continue;
            }
            const parts = [];
            if (msg.content) {
                parts.push({ text: msg.content });
            }
            if (msg.parts) {
                for (const p of msg.parts) {
                    if (p.text)
                        parts.push({ text: p.text });
                    if (p.inlineData)
                        parts.push({ inlineData: p.inlineData });
                }
            }
            if (msg.toolCalls) {
                for (const tc of msg.toolCalls) {
                    if (tc.rawPart) {
                        parts.push(tc.rawPart);
                    }
                    else {
                        parts.push({ functionCall: { name: tc.name, args: tc.args } });
                    }
                }
            }
            if (msg.toolResults) {
                for (const tr of msg.toolResults) {
                    parts.push({ functionResponse: { name: tr.name, response: tr.result } });
                }
            }
            contents.push({ role, parts });
        }
        return contents;
    }
    async generateResponse(messages, systemInstruction, tools, options) {
        const contents = this.mapMessages(messages);
        const geminiTools = tools.length > 0 ? [{ functionDeclarations: tools.map(this.mapTool) }] : undefined;
        const candidateModels = options?.singleAttempt ? [this.model] : Array.from(new Set([this.model, "gemini-2.5-flash", "gemini-3.7-flash"].filter(Boolean)));
        let lastError = null;
        for (const modelToTry of candidateModels) {
            try {
                const response = await this.ai.models.generateContent({
                    model: modelToTry,
                    contents,
                    config: {
                        systemInstruction,
                        tools: geminiTools,
                        responseMimeType: options?.responseFormat === "json_object"
                            ? "application/json"
                            : undefined,
                        maxOutputTokens: options?.maxTokens,
                        temperature: options?.temperature,
                        abortSignal: options?.signal,
                        ...(options?.singleAttempt && options.thinking === "disabled" && modelToTry === "gemini-2.5-flash" ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
                        ...(options?.singleAttempt ? { httpOptions: { retryOptions: { attempts: 1 } } } : {}),
                    }
                });
                const candidateParts = response.candidates?.[0]?.content?.parts || [];
                const toolCalls = [];
                if (response.functionCalls && response.functionCalls.length > 0) {
                    for (const fc of response.functionCalls) {
                        // Find matching raw part from candidateParts that has this functionCall
                        const matchingPart = candidateParts.find(p => p.functionCall?.name === fc.name);
                        toolCalls.push({
                            id: crypto_1.default.randomUUID(), // deterministic correlation ID for internal use
                            name: fc.name,
                            args: fc.args,
                            rawPart: matchingPart || { functionCall: { name: fc.name, args: fc.args } },
                        });
                    }
                }
                return {
                    text: response.text || undefined,
                    ...(options?.singleAttempt ? { finishReason: response.candidates?.[0]?.finishReason === "MAX_TOKENS" ? "MAX_TOKENS" : response.candidates?.[0]?.finishReason === "STOP" ? "STOP" : "OTHER" } : {}),
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                    rawCandidateParts: candidateParts.length > 0 ? candidateParts : undefined,
                    usage: response.usageMetadata ? {
                        promptTokens: response.usageMetadata.promptTokenCount || 0,
                        // The SDK reports reasoning separately; both are generated output.
                        completionTokens: (response.usageMetadata.candidatesTokenCount || 0) + (response.usageMetadata.thoughtsTokenCount || 0),
                        totalTokens: response.usageMetadata.totalTokenCount || 0,
                    } : undefined,
                };
            }
            catch (error) {
                lastError = error;
                const isUnavailableOrRateLimited = error.status === 503 ||
                    error.status === 429 ||
                    error.status === 404 ||
                    error.code === 503 ||
                    error.code === 429 ||
                    error.code === 404 ||
                    (error.message &&
                        (error.message.includes("high demand") ||
                            error.message.includes("UNAVAILABLE") ||
                            error.message.includes("not found") ||
                            error.message.includes("no longer available") ||
                            error.message.includes("RESOURCE_EXHAUSTED")));
                if (!isUnavailableOrRateLimited) {
                    throw new types_1.LLMProviderError("gemini", error.message || "Failed to generate Gemini response", error);
                }
            }
        }
        throw new types_1.LLMProviderError("gemini", lastError?.message || "Failed to generate Gemini response", lastError);
    }
}
exports.GeminiAdapter = GeminiAdapter;
