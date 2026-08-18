import { LLMAdapter } from "./types";
import { GeminiAdapter } from "./gemini";
import { GroqAdapter } from "./groq";

export class LLMFactory {
  static getAdapter(provider: "gemini" | "groq"): LLMAdapter {
    if (provider === "groq") {
      if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set.");
      return new GroqAdapter(process.env.GROQ_API_KEY);
    }
    
    // Default to Gemini
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
    return new GeminiAdapter(process.env.GEMINI_API_KEY);
  }
}
