// ============================================================
// Game Engine — XP, Leveling, and Rank Calculation
// ============================================================
// Pure functions with zero side effects. These handle the RPG
// math for the Study Leveling system. No database calls here —
// API routes call these and then persist the results.
// ============================================================

/**
 * Solo Leveling Hunter Ranks, ordered from weakest to strongest.
 * Level thresholds determine when a hunter ranks up.
 */
export const RANKS = ["E", "D", "C", "B", "A", "S"] as const;
export type HunterRank = (typeof RANKS)[number];

/** Maps effort level strings to daily study minutes and XP multipliers. */
export const EFFORT_CONFIG = {
  RELAXED:  { dailyMinutes: 30,  xpMultiplier: 0.8, label: "Relaxed"  },
  NORMAL:   { dailyMinutes: 60,  xpMultiplier: 1.0, label: "Normal"   },
  INTENSE:  { dailyMinutes: 90,  xpMultiplier: 1.3, label: "Intense"  },
  EXTREME:  { dailyMinutes: 120, xpMultiplier: 1.6, label: "Extreme"  },
} as const;

export type EffortLevel = keyof typeof EFFORT_CONFIG;

// ─── XP Calculation ──────────────────────────────────────────

/**
 * Calculate XP required to reach the NEXT level from a given level.
 * Uses a gentle exponential curve so early levels feel fast
 * and higher levels require more grind.
 *
 * Level 1 → 100 XP, Level 5 → 280 XP, Level 10 → 650 XP, etc.
 */
export function xpForNextLevel(level: number): number {
  return Math.floor(200 * Math.pow(level, 1.2));
}

// ─── Rank Calculation ────────────────────────────────────────

/**
 * Determine the Hunter Rank for a given level.
 *
 * E: Level 1–5
 * D: Level 6–12
 * C: Level 13–20
 * B: Level 21–30
 * A: Level 31–45
 * S: Level 46+
 */
export function rankForLevel(level: number): HunterRank {
  if (level >= 46) return "S";
  if (level >= 31) return "A";
  if (level >= 21) return "B";
  if (level >= 13) return "C";
  if (level >= 6)  return "D";
  return "E";
}

// ─── XP Award & Level Up ────────────────────────────────────

export interface LevelUpResult {
  newLevel: number;
  newCurrentXP: number;
  newXPToNextLevel: number;
  newRank: HunterRank;
  previousRank: HunterRank;
  levelsGained: number;
  didRankUp: boolean;
}

/**
 * Award XP to a user and calculate level-ups.
 * Handles overflow (e.g., gaining enough XP for multiple level-ups at once).
 *
 * @param currentLevel    The user's current level
 * @param currentXP       The user's current XP within this level
 * @param xpToNextLevel   The XP threshold for the current level
 * @param xpGained        How much XP to award
 * @returns               Updated stats after processing all level-ups
 */
export function awardXP(
  currentLevel: number,
  currentXP: number,
  xpToNextLevel: number,
  xpGained: number
): LevelUpResult {
  const previousRank = rankForLevel(currentLevel);
  let level = currentLevel;
  let xp = currentXP + xpGained;
  let threshold = xpToNextLevel;

  // Process all level-ups (handles multi-level-up from large XP awards)
  while (xp >= threshold) {
    xp -= threshold;
    level += 1;
    threshold = xpForNextLevel(level);
  }

  const newRank = rankForLevel(level);

  return {
    newLevel: level,
    newCurrentXP: xp,
    newXPToNextLevel: threshold,
    newRank,
    previousRank,
    levelsGained: level - currentLevel,
    didRankUp: newRank !== previousRank,
  };
}

// Note: questRewards and hpPenalty have been moved to lib/difficulty-engine.ts

import { TimezoneService } from "./timezone-service";

// ─── Weekly Quest & Streak Calculations ──────────────────────

export interface WeeklyBounds {
  weekKey: string; // e.g. "2026-W33"
  weekStart: Date; // Monday 00:00:00.000 in user's timezone
  weekEnd: Date; // Sunday 23:59:59.999 in user's timezone
  timeRemainingMs: number;
  daysRemaining: number;
}

/**
 * Compute the ISO week boundaries and remaining time for a given reference date and timezone.
 * Weeks run Monday 00:00:00.000 to Sunday 23:59:59.999 in the user's local timezone.
 */
export function getWeeklyBounds(refDate: Date = new Date(), timezone: string = "UTC"): WeeklyBounds {
  const safeTz = TimezoneService.validateTimezone(timezone) ? timezone : "UTC";
  const localTodayStr = TimezoneService.getUserLocalDate(safeTz, refDate);
  const [yearNum, monthNum, dayNum] = localTodayStr.split("-").map(Number);
  
  // Find local day of week using local noon date (safe from boundary/DST distortion)
  const localNoon = new Date(Date.UTC(yearNum, monthNum - 1, dayNum, 12, 0, 0));
  const dayOfWeek = localNoon.getUTCDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const diffToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const diffToNextMonday = diffToSunday + 1;

  const localMondayStr = TimezoneService.getUserLocalDateOffset(safeTz, diffToMonday, refDate);
  const localNextMondayStr = TimezoneService.getUserLocalDateOffset(safeTz, diffToNextMonday, refDate);

  const mondayNoon = new Date(`${localMondayStr}T12:00:00Z`);
  const nextMondayNoon = new Date(`${localNextMondayStr}T12:00:00Z`);

  const weekStart = TimezoneService.getStartOfDayUTC(safeTz, mondayNoon);
  const nextMondayStart = TimezoneService.getStartOfDayUTC(safeTz, nextMondayNoon);
  const weekEnd = new Date(nextMondayStart.getTime() - 1);

  // ISO Week Key calculation based on local Monday date
  const [monYear, monMonth, monDay] = localMondayStr.split("-").map(Number);
  const target = new Date(Date.UTC(monYear, monMonth - 1, monDay));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = monYear;
  const weekKey = `${year}-W${weekNum.toString().padStart(2, "0")}`;

  const timeRemainingMs = Math.max(0, weekEnd.getTime() - refDate.getTime());
  const daysRemaining = Math.ceil(timeRemainingMs / (1000 * 60 * 60 * 24));

  return {
    weekKey,
    weekStart,
    weekEnd,
    timeRemainingMs,
    daysRemaining,
  };
}

/**
 * Calculate level-scaled XP and Sylph payout for completing the 3-hour weekly quest.
 * EXP is calibrated to ~100% of current level capacity (200 XP at Level 1),
 * while Sylph is a tight, balanced currency reward (65 Sylph at Level 1).
 */
export function calculateWeeklyQuestReward(level: number): { xpReward: number; sylphReward: number } {
  const nextLevelCapacity = xpForNextLevel(level);
  // Milestone XP payout for 3-hour weekly focus (200 XP at Level 1)
  const xpReward = Math.max(200, Math.round(nextLevelCapacity * 1.0));
  // Balanced currency reward (50 Sylph base + 15 per level)
  const sylphReward = Math.round(50 + level * 15);
  return { xpReward, sylphReward };
}

/**
 * Determine weekly streak count based on the current week and last completed week.
 *
 * @param lastActiveWeek  ISO week string (e.g. "2026-W32") or date string or null
 * @param currentWeek     ISO week string (e.g. "2026-W33")
 * @param currentStreak   Current consecutive weeks count
 * @param hasFreeze       Whether the user has a Streak Freeze to absorb a missed week
 * @returns               { newStreak: number, freezeUsed: boolean }
 */
export function calculateWeeklyStreak(
  lastActiveWeek: string | null,
  currentWeek: string,
  currentStreak: number,
  hasFreeze: boolean = false
): { newStreak: number; freezeUsed: boolean } {
  if (!lastActiveWeek) {
    return { newStreak: 1, freezeUsed: false };
  }

  // If same week, maintain current streak
  if (lastActiveWeek === currentWeek) {
    return { newStreak: Math.max(1, currentStreak), freezeUsed: false };
  }

  const parseWeek = (w: string) => {
    if (w.includes("-W")) {
      const parts = w.split("-W");
      return { year: parseInt(parts[0], 10), week: parseInt(parts[1], 10) };
    }
    const d = new Date(w);
    const bounds = getWeeklyBounds(isNaN(d.getTime()) ? new Date() : d);
    const parts = bounds.weekKey.split("-W");
    return { year: parseInt(parts[0], 10), week: parseInt(parts[1], 10) };
  };

  const last = parseWeek(lastActiveWeek);
  const curr = parseWeek(currentWeek);

  const weekDiff = (curr.year - last.year) * 52 + (curr.week - last.week);

  if (weekDiff === 0) {
    return { newStreak: currentStreak, freezeUsed: false };
  }
  if (weekDiff === 1) {
    return { newStreak: currentStreak + 1, freezeUsed: false };
  }
  if (weekDiff === 2 && hasFreeze) {
    return { newStreak: currentStreak + 1, freezeUsed: true };
  }

  return { newStreak: 1, freezeUsed: false };
}

/**
 * Determine the new streak count (legacy compatibility wrapper).
 */
export function calculateStreak(
  lastActiveDate: string | null,
  todayDate: string,
  currentStreak: number
): number {
  if (!lastActiveDate) return 1;

  const last = new Date(lastActiveDate);
  const today = new Date(todayDate);
  const diffDays = Math.floor(
    (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return currentStreak;
  if (diffDays === 1 || diffDays === 2) return currentStreak + 1;
  return 1;
}

// ─── Sylph System Math ────────────────────────────────────────

/**
 * Global Sylph multiplier based on consecutive weekly streaks.
 * Capped strictly at 1.5x.
 */
export function getStreakMultiplier(streakWeeks: number): number {
  if (streakWeeks >= 8) return 1.5;
  if (streakWeeks >= 4) return 1.3;
  if (streakWeeks >= 2) return 1.15;
  if (streakWeeks >= 1) return 1.05;
  return 1.0;
}

/**
 * Calculate Sylph yields for focus timer sessions.
 * Base: 1 Sylph per minute.
 * Bonus: +10 Sylph per continuous 30-min block.
 */
export function calculateTimerSylph(exactMinutes: number): number {
  const base = exactMinutes;
  // Bonus: +10 Sylph for every full 30-minute block completed
  const bonus = Math.floor(exactMinutes / 30) * 10;
  return base + bonus;
}

// ─── Effort Adjustment Preview ───────────────────────────────

export interface EffortPreview {
  originalWeeks: number;
  newWeeks: number;
  originalDailyMinutes: number;
  newDailyMinutes: number;
  suggestedEffortLevel: EffortLevel;
  intensityWarning: string | null;
}

/**
 * Preview what happens when a user changes their goal timeline.
 * This is the core of the mentor-requested "effort adjustment" feature.
 *
 * Example: If a goal was planned for 8 weeks at NORMAL (60 min/day),
 * compressing to 4 weeks means ~120 min/day → auto-suggests EXTREME.
 */
export function previewEffortAdjustment(
  totalStudyHours: number,
  originalWeeks: number,
  newWeeks: number
): EffortPreview {
  const totalMinutes = totalStudyHours * 60;
  const originalDailyMinutes = Math.ceil(totalMinutes / (originalWeeks * 7));
  const newDailyMinutes = Math.ceil(totalMinutes / (newWeeks * 7));

  // Auto-suggest effort level based on daily minutes
  let suggestedEffortLevel: EffortLevel;
  if (newDailyMinutes <= 40)       suggestedEffortLevel = "RELAXED";
  else if (newDailyMinutes <= 75)  suggestedEffortLevel = "NORMAL";
  else if (newDailyMinutes <= 105) suggestedEffortLevel = "INTENSE";
  else                             suggestedEffortLevel = "EXTREME";

  // Generate warning for high-intensity plans
  let intensityWarning: string | null = null;
  if (newDailyMinutes > 120) {
    intensityWarning = `Warning: This pace requires ${newDailyMinutes} minutes/day. This exceeds the recommended maximum and may lead to burnout.`;
  } else if (newDailyMinutes > 90) {
    intensityWarning = `Caution: This pace requires ${newDailyMinutes} minutes/day. Maintain rest days to avoid fatigue.`;
  }

  return {
    originalWeeks,
    newWeeks,
    originalDailyMinutes,
    newDailyMinutes,
    suggestedEffortLevel,
    intensityWarning,
  };
}

// ─── Long-Session Bonus Logic ───────────────────────────────

/**
 * Global multiplier for EXP and Sylph based on continuous session duration.
 * This rewards users for deeper, unbroken focus sessions.
 */
export function getLongSessionMultiplier(sessionMinutes: number): number {
  if (sessionMinutes >= 120) return 1.3;
  if (sessionMinutes >= 60) return 1.2;
  if (sessionMinutes >= 30) return 1.1;
  return 1.0;
}
