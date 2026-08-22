// ============================================================
// Objective Accent Theme Engine — SINGLE SOURCE OF TRUTH
// ============================================================
// Purpose-built palette for the Scholar Objectives subsystem.
// `Goal.color` stores one of these curated tokens; every surface
// (goal cards, quest log, calendar milestones/chips, day drawers)
// resolves the token through this module so theming stays unified.
// ============================================================

export const GOAL_COLOR_TOKENS = [
  "EMERALD",
  "CYAN",
  "BLUE",
  "VIOLET",
  "ROSE",
  "AMBER",
] as const;

export type GoalColorToken = (typeof GOAL_COLOR_TOKENS)[number];

export interface GoalColorTheme {
  /** Human-facing name, e.g. "Emerald" */
  name: string;
  /** Solid swatch used by the palette picker */
  swatch: string;
  /** Base accent (borders, badges, chips) */
  base: string;
  /** Light variant (text, XP chips) */
  light: string;
  /** Ultra-subtle rgba (card fills) */
  dim: string;
  /** Medium rgba (active borders / glows) */
  mid: string;
  /** Dark variant (high contrast) */
  dark: string;
}

export const GOAL_COLOR_PALETTE: Record<GoalColorToken, GoalColorTheme> = {
  EMERALD: {
    name: "Emerald",
    swatch: "#10b981",
    base: "#10b981",
    light: "#34d399",
    dim: "rgba(16, 185, 129, 0.14)",
    mid: "rgba(16, 185, 129, 0.40)",
    dark: "#047857",
  },
  CYAN: {
    name: "Cyan",
    swatch: "#06b6d4",
    base: "#06b6d4",
    light: "#22d3ee",
    dim: "rgba(6, 182, 212, 0.14)",
    mid: "rgba(6, 182, 212, 0.40)",
    dark: "#0e7490",
  },
  BLUE: {
    name: "Electric Blue",
    swatch: "#3b82f6",
    base: "#3b82f6",
    light: "#60a5fa",
    dim: "rgba(59, 130, 246, 0.14)",
    mid: "rgba(59, 130, 246, 0.40)",
    dark: "#1d4ed8",
  },
  VIOLET: {
    name: "Amethyst Violet",
    swatch: "#8b5cf6",
    base: "#8b5cf6",
    light: "#a78bfa",
    dim: "rgba(139, 92, 246, 0.14)",
    mid: "rgba(139, 92, 246, 0.40)",
    dark: "#6d28d9",
  },
  ROSE: {
    name: "Neon Rose",
    swatch: "#f43f5e",
    base: "#f43f5e",
    light: "#fb7185",
    dim: "rgba(244, 63, 94, 0.14)",
    mid: "rgba(244, 63, 94, 0.40)",
    dark: "#be123c",
  },
  AMBER: {
    name: "Solar Amber",
    swatch: "#f59e0b",
    base: "#f59e0b",
    light: "#fbbf24",
    dim: "rgba(245, 158, 11, 0.14)",
    mid: "rgba(245, 158, 11, 0.40)",
    dark: "#b45309",
  },
};

export const DEFAULT_GOAL_COLOR: GoalColorToken = "EMERALD";

/**
 * Resolve a stored `Goal.color` token into its full theme.
 * Unrecognized values gracefully fall back to the default EMERALD preset.
 */
export function resolveGoalColor(token: string | null | undefined): GoalColorTheme {
  if (token && token in GOAL_COLOR_PALETTE) {
    return GOAL_COLOR_PALETTE[token as GoalColorToken];
  }
  return GOAL_COLOR_PALETTE[DEFAULT_GOAL_COLOR];
}

/** True when the string is one of the curated goal color tokens. */
export function isGoalColorToken(value: unknown): value is GoalColorToken {
  return typeof value === "string" && (GOAL_COLOR_TOKENS as readonly string[]).includes(value);
}

// ============================================================
// Exact Timeline Countdown (Workstream A)
// ============================================================
// Replaces coarse integer-week rounding with day-level intervals:
//   < 1 day            -> "Due today" / "Due tomorrow"
//   1 to 6 days        -> "N days left"
//   >= 7 days          -> "N weeks left"
//   past deadline      -> "Overdue by N days"
// ============================================================

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Normalize any Date/ISO/datetime into a UTC midnight start-of-day. */
function startOfDayUtc(value: Date | string): Date {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Whole calendar-day difference between two UTC-normalized dates.
 * Positive = target is in the future.
 */
export function daysUntil(targetDate: Date | string, now: Date | string = new Date()): number {
  const target = startOfDayUtc(targetDate);
  const today = startOfDayUtc(now);
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
}

/**
 * Human-readable exact countdown for an objective deadline.
 *
 * Examples over "today":
 *   yesterday        -> "Overdue by 1 day"
 *   today            -> "Due today"
 *   +1 day           -> "Due tomorrow"
 *   +3 days          -> "3 days left"
 *   +9 days          -> "1 week left"
 *   +17 days         -> "2 weeks left"
 *   +52 days         -> "7 weeks left"
 */
export function formatGoalDeadline(targetDate: Date | string, now: Date | string = new Date()): string {
  const days = daysUntil(targetDate, now);

  if (days < 0) {
    const abs = Math.abs(days);
    return `Overdue by ${abs} ${abs === 1 ? "day" : "days"}`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `${days} days left`;

  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} left`;
}

/**
 * Exact calendar target label, e.g. "Target: Aug 31, 2026".
 * Rendered from the UTC-representational date so timezone shifts
 * never move the user-chosen deadline day.
 */
export function formatTargetDateLabel(targetDate: Date | string | null | undefined): string | null {
  if (!targetDate) return null;
  const d = new Date(targetDate);
  if (isNaN(d.getTime())) return null;
  return `Target: ${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

/**
 * Convert a YYYY-MM-DD calendar string into its UTC representational
 * midnight instant. Throws on malformed input.
 */
export function targetDateToUtc(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid target date: "${dateStr}" (expected YYYY-MM-DD)`);
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Whole-week count between today and an absolute date (min 1). */
export function targetDateToWeeks(targetDate: Date | string, now: Date | string = new Date()): number {
  const days = daysUntil(targetDate, now);
  return Math.max(1, Math.ceil(days / 7));
}
