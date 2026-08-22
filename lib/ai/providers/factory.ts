import { LLMAdapter } from "./types";
import { GeminiAdapter } from "./gemini";
import { GroqAdapter } from "./groq";
import { DeepSeekAdapter } from "./deepseek";
import { DEEPSEEK_MODELS, GEMINI_MODELS, GROQ_MODELS } from "../config";

export type LLMProviderName = "deepseek" | "gemini" | "groq";

export class LLMFactory {
  static getAdapter(provider: LLMProviderName = "deepseek", model?: string): LLMAdapter {
    if (provider === "deepseek") {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error("DEEPSEEK_API_KEY is not set.");
      }
      return new DeepSeekAdapter(apiKey, model || DEEPSEEK_MODELS.default);
    }

    if (provider === "groq") {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error("GROQ_API_KEY is not set.");
      }
      return new GroqAdapter(apiKey, model || GROQ_MODELS.default);
    }

    // Default / Gemini
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set.");
    }
    return new GeminiAdapter(apiKey, model || GEMINI_MODELS.default);
  }
}

