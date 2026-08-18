/**
 * AI Configuration Module
 * 
 * Centralized config for AI quotas, limits, and feature flags.
 * Adjust values here to change limits across the entire app.
 */

export const AI_QUOTAS = {
  chat: {
    /** Maximum AI chat messages per user per day */
    limit: 15,
    /** Window type for the quota */
    window: "day" as const,
  },
  planner: {
    /** Maximum AI planner generations per user per day */
    limit: 1,
    /** Window type for the quota */
    window: "day" as const,
  },
} as const;

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

