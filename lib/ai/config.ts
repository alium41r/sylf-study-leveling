/**
 * AI Configuration Module
 * 
 * Centralized config for AI quotas, limits, model IDs, and multi-engine routing.
 */

export const AI_QUOTAS = {
  chat: {
    /** Maximum AI chat messages per user per day (shared pool across General Chat + Focus Drawer) */
    limit: 10,
    /** Window type for the quota */
    window: "day" as const,
  },
  planner: {
    /** Maximum AI planner generations per user per day */
    limit: 1,
    /** Window type for the quota */
    window: "day" as const,
  },
  compile: {
    /** Maximum syllabus compilations / recompiles per user per day */
    limit: 5,
    /** Window type for the quota */
    window: "day" as const,
  },
} as const;

/** AI features that consume a daily quota (single source of truth). */
export type QuotaFeature = keyof typeof AI_QUOTAS;

export const AI_LIMITS = {
  /** Maximum tool-calling iterations per single chat request */
  maxToolIterations: 5,
  /** Maximum agent handoffs per single chat request */
  maxHandoffs: 1,
  /** Timeout for a single AI chat request (ms) */
  chatTimeoutMs: 90_000,
  /** Timeout for a single AI planner request (ms) - accommodates Google Search web grounding & multi-agent generation */
  plannerTimeoutMs: 180_000,
} as const;

/**
 * Multi-Engine Model Registry
 */
export const DEEPSEEK_MODELS = {
  planner: "deepseek-v4-pro",
  compiler: "deepseek-v4-pro",
  stem: "deepseek-reasoner",
  chat: "deepseek-v4-flash",
  focus: "deepseek-v4-flash",
  vision: "deepseek-v4-flash-vision-exp",
  default: "deepseek-v4-flash",
} as const;

export const GEMINI_MODELS = {
  research: "gemini-3.1-pro",
  visionFallback: "gemini-3.7-flash",
  stemFallback: "gemini-3.7-flash",
  focus: "gemini-3.7-flash",
  flash: "gemini-2.5-flash",
  default: "gemini-2.5-flash",
} as const;

export const GROQ_MODELS = {
  chatFallback: process.env.GROQ_MODEL || "qwen/qwen3.6-27b",
  vision: "llama-3.2-11b-vision-preview",
  default: process.env.GROQ_MODEL || "qwen/qwen3.6-27b",
} as const;

export const PROVIDER_ENDPOINTS = {
  deepseek: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
} as const;


