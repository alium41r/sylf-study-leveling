"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMFactory = void 0;
const gemini_1 = require("./gemini");
const groq_1 = require("./groq");
const deepseek_1 = require("./deepseek");
const config_1 = require("../config");
class LLMFactory {
    static getAdapter(provider = "deepseek", model) {
        if (provider === "deepseek") {
            const apiKey = process.env.DEEPSEEK_API_KEY;
            if (!apiKey) {
                throw new Error("DEEPSEEK_API_KEY is not set.");
            }
            return new deepseek_1.DeepSeekAdapter(apiKey, model || config_1.DEEPSEEK_MODELS.default);
        }
        if (provider === "groq") {
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) {
                throw new Error("GROQ_API_KEY is not set.");
            }
            return new groq_1.GroqAdapter(apiKey, model || config_1.GROQ_MODELS.default);
        }
        // Default / Gemini
        const apiKey = process.env.GEMINI_API_KEY ||
            process.env.GOOGLE_GENAI_API_KEY ||
            process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not set.");
        }
        return new gemini_1.GeminiAdapter(apiKey, model || config_1.GEMINI_MODELS.default);
    }
}
exports.LLMFactory = LLMFactory;
