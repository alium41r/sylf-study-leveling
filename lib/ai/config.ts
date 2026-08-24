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
  vision: "gemini-3.7-flash", // Dedicated vision model for image/diagram prompts
  visionFallback: "gemini-3.6-flash", // In-adapter cascade only
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

/**
 * Approximate USD cost per 1M tokens, used ONLY for usage telemetry
 * (the /api/ai-costs diagnostic). Defaults track DeepSeek's published
 * deepseek-chat / deepseek-reasoner pricing tiers; override per model via
 * env vars if your plan differs. DeepSeek's automatic context cache bills
 * cache-hit input tokens at ~10% of the normal input price — we model that
 * with `inputCached` so telemetry reflects the REAL spend. Providers not
 * listed here (Groq/Gemini free keys) are treated as $0.
 */
export const AI_COST_USD_PER_1M: Record<
  string,
  { input: number; output: number; inputCached?: number }
> = {
  "deepseek-v4-flash": {
    input: Number(process.env.DEEPSEEK_FLASH_IN_PER_1M ?? 0.27),
    output: Number(process.env.DEEPSEEK_FLASH_OUT_PER_1M ?? 1.1),
    inputCached: Number(process.env.DEEPSEEK_FLASH_IN_CACHED_PER_1M ?? 0.027),
  },
  "deepseek-v4-flash-vision-exp": {
    input: Number(process.env.DEEPSEEK_FLASH_IN_PER_1M ?? 0.27),
    output: Number(process.env.DEEPSEEK_FLASH_OUT_PER_1M ?? 1.1),
    inputCached: Number(process.env.DEEPSEEK_FLASH_IN_CACHED_PER_1M ?? 0.027),
  },
  "deepseek-v4-pro": {
    input: Number(process.env.DEEPSEEK_PRO_IN_PER_1M ?? 0.55),
    output: Number(process.env.DEEPSEEK_PRO_OUT_PER_1M ?? 2.19),
    inputCached: Number(process.env.DEEPSEEK_PRO_IN_CACHED_PER_1M ?? 0.055),
  },
  "deepseek-reasoner": {
    input: Number(process.env.DEEPSEEK_PRO_IN_PER_1M ?? 0.55),
    output: Number(process.env.DEEPSEEK_PRO_OUT_PER_1M ?? 2.19),
    inputCached: Number(process.env.DEEPSEEK_PRO_IN_CACHED_PER_1M ?? 0.055),
  },
} as const;


