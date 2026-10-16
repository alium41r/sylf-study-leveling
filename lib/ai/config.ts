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
    /** Maximum AI planner generations per user per WEEK */
    limit: 1,
    /** Window type for the quota (Monday-based local week) */
    window: "week" as const,
  },
  plannerExpansion: {
    /** Maximum selected-period roadmap expansions per user per WEEK.
     *  A separate bucket so planning a period does not consume the single weekly
     *  plan allowance, and higher so several months can be planned in one sitting. */
    limit: 3,
    /** Window type for the quota (Monday-based local week) */
    window: "week" as const,
  },
  plannerRebalance: {
    /** Maximum user-approved replans per user per WEEK.
     *  A separate bucket so reconciling a confirmed plan never consumes the single
     *  weekly plan allowance or an expansion allowance. */
    limit: 3,
    /** Window type for the quota (Monday-based local week) */
    window: "week" as const,
  },
  compile: {
    /** Maximum syllabus compilations per user per DAY — combined with the
     *  one-compile-per-subject-forever rule, a user with N subjects can
     *  compile at most one subject each day (each subject only ever once). */
    limit: 1,
    /** Window type for the quota */
    window: "day" as const,
  },
  scope: {
    /** Scope evaluations (quest coverage % via AI) per user per DAY. Each
     *  evaluation can run up to 3 Gemini generations — this quota keeps the
     *  spend bounded without hurting normal quest planning. */
    limit: 20,
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
 *
 * DeepSeek V4 Pro is no longer an active Sylf model. Every workload that used it —
 * Planner Modes, the Classic Planner pipeline and syllabus compilation — runs on the
 * DeepSeek Flash line instead, and the identifier lives here alone: it is the one
 * place to change if the provider's canonical id moves, and `DEEPSEEK_FLASH_MODEL`
 * lets an environment pin it without a code change. Nothing anywhere else in the
 * runtime may carry a DeepSeek model string literal.
 *
 * `deepseek-flash` is the provider's own canonical name: its API reports the
 * supported models as `deepseek-flash` and `deepseek-v4-pro`, accepts the repository's
 * older Flash/vision aliases. Flash supports reasoning and vision; do not route
 * STEM through an unverified legacy Reasoner alias. Explicit environment pins remain authoritative.
 * There is no `deepseek-v4.1-flash` identifier to use: the Flash line IS the V4.1
 * Flash model this migration targets.
 */
const DEEPSEEK_FLASH = process.env.DEEPSEEK_FLASH_MODEL || "deepseek-flash";

export const DEEPSEEK_MODELS = {
  /** The single active DeepSeek model for planning, teaching and compilation. */
  flash: DEEPSEEK_FLASH,
  planner: DEEPSEEK_FLASH,
  compiler: DEEPSEEK_FLASH,
  stem: DEEPSEEK_FLASH,
  chat: DEEPSEEK_FLASH,
  focus: DEEPSEEK_FLASH,
  vision: DEEPSEEK_FLASH,
  default: DEEPSEEK_FLASH,
} as const;

export const GEMINI_MODELS = {
  research: "gemini-2.5-flash",
  compiler: "gemini-2.5-flash", // Fast + grounded Google Search — syllabus compiler PRIMARY engine
  vision: "gemini-2.5-flash", // Dedicated vision model for image/diagram prompts
  visionFallback: "gemini-2.5-flash", // In-adapter cascade only
  stemFallback: "gemini-2.5-flash",
  focus: "gemini-2.5-flash",
  flash: "gemini-2.5-flash",
  default: "gemini-2.5-flash",
} as const;

export const GROQ_MODELS = {
  chatFallback: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  vision: "qwen/qwen3.8-27b",
  default: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
} as const;

export const PROVIDER_ENDPOINTS = {
  deepseek: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
} as const;

/** Published 2026-10-15 standard paid rates. DeepSeek peak rates are a
 * conservative upper estimate (including holidays); never an invoice. */
export const AI_PRICING_VERSION = "2026-10-15-paid-peak-upper";
const FLASH_RATE = {
  input: Number(process.env.DEEPSEEK_FLASH_IN_PER_1M ?? 0.30),
  output: Number(process.env.DEEPSEEK_FLASH_OUT_PER_1M ?? 1.20),
  inputCached: Number(process.env.DEEPSEEK_FLASH_IN_CACHED_PER_1M ?? 0.006),
};
export const AI_COST_USD_PER_1M: Record<string, { input: number; output: number; inputCached?: number }> = {
  "deepseek-flash": FLASH_RATE,
  "deepseek-v4-flash": FLASH_RATE,
  "deepseek-v4-flash-vision-exp": FLASH_RATE,
  "gemini-2.5-flash": { input: 0.30, output: 2.50, inputCached: 0.03 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75, inputCached: 0.075 },
  "openai/gpt-oss-120b": { input: 0.15, output: 0.60, inputCached: 0.075 },
  "openai/gpt-oss-20b": { input: 0.075, output: 0.30, inputCached: 0.0375 },
  "qwen/qwen3.8-27b": { input: 0.80, output: 4.00 },
};

/**
 * Pricing for models Sylf no longer selects, kept only so the cost diagnostic can
 * price usage rows recorded before the V4.1 Flash migration at what they actually
 * cost. No runtime path chooses these models: `DEEPSEEK_MODELS` is the only active
 * registry, and this table is consulted only as a fallback for historical rows.
 */
export const HISTORICAL_MODEL_COST_USD_PER_1M: Record<
  string,
  { input: number; output: number; inputCached?: number }
> = {
  "deepseek-v4-pro": {
    input: Number(process.env.DEEPSEEK_PRO_IN_PER_1M ?? 0.55),
    output: Number(process.env.DEEPSEEK_PRO_OUT_PER_1M ?? 2.19),
    inputCached: Number(process.env.DEEPSEEK_PRO_IN_CACHED_PER_1M ?? 0.055),
  },
} as const;
