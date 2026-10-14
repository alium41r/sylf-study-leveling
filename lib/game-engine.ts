// ============================================================
// Game Engine — XP, Leveling, and Rank Calculation
// ============================================================
// Pure functions with zero side effects. These handle the RPG
// math for the Study Leveling system. No database calls here —
// API routes call these and then persist the results.
// ============================================================

/**
 * Canonical 8-Tier Hunter Rank Ladder — SINGLE SOURCE OF TRUTH.
 *
 * Entering level (inclusive) for each tier:
 *   RANK E (1+) → RANK D (10+) → RANK C (25+) → RANK B (50+)
 *   → RANK A (75+) → RANK S (100+) → NATIONAL (125+) → MONARCH (150+)
 *
 * Two string encodings derive from this one ladder:
 *  - `display` tokens are stored in `User.hunterRank` and rendered by the UI
 *    (`rank-E` … `rank-S` CSS classes, `{rank}-Rank` labels).
 *  - `db` tokens are stored in `UserStats.rank` and used by the SQL RPCs.
 */
export const RANK_LADDER = [
  { display: "MONARCH",  db: "MONARCH",  level: 150 },
  { display: "NATIONAL", db: "NATIONAL", level: 125 },
  { display: "S",        db: "RANK S",   level: 100 },
  { display: "A",        db: "RANK A",   level: 75 },
  { display: "B",        db: "RANK B",   level: 50 },
  { display: "C",        db: "RANK C",   level: 25 },
  { display: "D",        db: "RANK D",   level: 10 },
  { display: "E",        db: "RANK E",   level: 1 },
] as const;

/** Display token stored in `User.hunterRank` (UI-facing). */
export type HunterRank = (typeof RANK_LADDER)[number]["display"];

/** Database token stored in `UserStats.rank` (RPC-facing). */
export type RankTier = (typeof RANK_LADDER)[number]["db"];

/**
 * 8-Tier Master Rank Thresholds mapping ranks to their level boundaries.
 * Backwards-compatible map derived from RANK_LADDER (kept as a plain object
 * because tests and call sites index it by key).
 */
export const RANK_THRESHOLDS = {
  MONARCH: 150,
  NATIONAL: 125,
  "RANK S": 100,
  "RANK A": 75,
  "RANK B": 50,
  "RANK C": 25,
  "RANK D": 10,
  "RANK E": 1,
} as const;

/**
 * Maps effort level strings to daily study minutes and XP multipliers.
 *
 * Base effort levels calibrated to high-intensity study markets:
 *   RELAXED -> 1 hour/day (Casual)
 *   NORMAL  -> 2 hours/day (Standard)
 *   INTENSE -> 4 hours/day (Focused)
 *   EXTREME -> 6+ hours/day (Hardcore)
 */
export const EFFORT_CONFIG = {
  RELAXED:  { dailyMinutes: 60,  xpMultiplier: 0.8, label: "Casual"   },
  NORMAL:   { dailyMinutes: 120, xpMultiplier: 1.0, label: "Standard" },
  INTENSE:  { dailyMinutes: 240, xpMultiplier: 1.3, label: "Focused"  },
  EXTREME:  { dailyMinutes: 360, xpMultiplier: 1.6, label: "Hardcore" },
} as const;

export type EffortLevel = keyof typeof EFFORT_CONFIG;

// ─── Deterministic Progression Math ──────────────────────────

/**
 * XP required to reach a specific level governed by XP_req(L) = floor(100 * L^1.5).
 * Level 1 entry threshold is 100 XP (cumulative base for the level-1 bracket).
 */
export function calculateRequiredXp(level: number): number {
  if (level <= 1) return 100;
  return Math.floor(100 * Math.pow(level, 1.5));
}

/**
 * Calculate user level deterministically from total lifetime XP.
 * Uses inverse power L = floor((XP / 100)^(2/3)) with discrete boundary guards
 * to ensure 100% mathematical parity with PostgreSQL stored procedures.
 */
export function calculateLevelFromXp(xp: number): number {
  if (xp < 282) return 1;
  let level = Math.max(1, Math.floor(Math.pow(xp / 100, 2 / 3)));
  while (calculateRequiredXp(level + 1) <= xp) {
    level++;
  }
  while (level > 1 && calculateRequiredXp(level) > xp) {
    level--;
  }
  return level;
}

/**
 * Determine the DB rank tier (`UserStats.rank` encoding) for a given level
 * according to the canonical 8-tier progression matrix.
 */
export function getRankFromLevel(level: number): RankTier {
  const safeLevel = Math.max(0, Math.floor(level));
  for (const rung of RANK_LADDER) {
    if (safeLevel >= rung.level) return rung.db;
  }
  return "RANK E";
}

/**
 * Determine the display Hunter Rank (`User.hunterRank` encoding) for a given
 * level according to the canonical 8-tier progression matrix.
 * This is the single rank ladder used everywhere — the legacy 6/13/21/31/46
 * thresholds are retired.
 */
export function rankForLevel(level: number): HunterRank {
  const safeLevel = Math.max(0, Math.floor(level));
  for (const rung of RANK_LADDER) {
    if (safeLevel >= rung.level) return rung.display;
  }
  return "E";
}

/**
 * Determine the next promotion tier above the current level in the canonical rank ladder.
 * Returns null if the scholar has achieved the apex tier (MONARCH).
 */
export function getNextRank(level: number) {
  const safeLevel = Math.max(1, Math.floor(level));
  for (let i = RANK_LADDER.length - 1; i >= 0; i--) {
    if (RANK_LADDER[i].level > safeLevel) {
      return RANK_LADDER[i];
    }
  }
  return null;
}

export interface LevelProgress {
  currentLevelBaseXp: number;
  nextLevelTargetXp: number;
  xpIntoCurrentLevel: number;
  xpForCurrentBracket: number;
  progressPercentage: number;
}

/**
 * Derives UI level progress metrics for a given total XP and level bracket.
 */
export function getLevelProgress(totalXp: number, currentLevel: number): LevelProgress {
  const safeLevel = Math.max(1, currentLevel);
  // Base = the cumulative XP required to ENTER this level — including level 1
  // (XP_req(1) = 100). This keeps the per-level bucket strictly monotonic:
  // 1→2 = 182, 2→3 = 237, 3→4 = 281 … (the old level-1 base of 0 made the
  // first bucket 282, larger than the second — a non-monotonic curve).
  const currentLevelBaseXp = calculateRequiredXp(safeLevel);
  const nextLevelTargetXp = calculateRequiredXp(safeLevel + 1);
  const xpForCurrentBracket = Math.max(1, nextLevelTargetXp - currentLevelBaseXp);
  const xpIntoCurrentLevel = Math.max(0, totalXp - currentLevelBaseXp);
  const progressPercentage = Math.min(
    100,
    Math.max(0, Math.floor((xpIntoCurrentLevel / xpForCurrentBracket) * 100))
  );

  return {
    currentLevelBaseXp,
    nextLevelTargetXp,
    xpIntoCurrentLevel,
    xpForCurrentBracket,
    progressPercentage,
  };
}

// ─── Cognitive Behavioral Vectors ────────────────────────────

export const COGNITIVE_STAT_MIN = 10;
export const COGNITIVE_STAT_MAX = 100;

/**
 * Clamps cognitive behavioral vector values within the valid [10, 100] attribute bounds.
 */
export function clampCognitiveStat(value: number): number {
  return Math.min(COGNITIVE_STAT_MAX, Math.max(COGNITIVE_STAT_MIN, Math.round(value)));
}

// ─── XP Calculation (Canonical Curve) ────────────────────────

/**
 * XP required to advance from the CURRENT level to the NEXT level
 * (the within-level bucket size shown in the UI as `xpToNextLevel`).
 *
 * Derived strictly from the canonical cumulative curve
 * XP_req(L) = floor(100 * L^1.5):
 *
 *   xpForNextLevel(L) = XP_req(L + 1) − XP_req(L)      (for EVERY L)
 *
 * Level 1 → 182 XP, Level 2 → 237, Level 3 → 281, Level 5 → 351,
 * Level 10 → 486 … — strictly increasing, so no level is harder than
 * the next one (the old level-1 base of 0 made 1→2 cost 282, more
 * than 2→3's 237).
 * This replaces the retired legacy curve 200 * L^1.2.
 */
export function xpForNextLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return calculateRequiredXp(safeLevel + 1) - calculateRequiredXp(safeLevel);
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
 * Award XP to a user and calculate level-ups using the canonical curve.
 * Handles overflow (e.g., gaining enough XP for multiple level-ups at once).
 *
 * NOTE: `currentXP` is the XP within the current level. The legacy
 * `xpToNextLevel` parameter is retained for API compatibility but is NO
 * LONGER TRUSTED — the threshold is always recomputed from the canonical
 * curve so that stale legacy-curve values stored on older rows cannot leak
 * divergent math back into the progression system.
 *
 * @param currentLevel    The user's current level
 * @param currentXP       The user's current XP within this level
 * @param _xpToNextLevel  DEPRECATED — ignored; canonical value recomputed
 * @param xpGained        How much XP to award
 * @returns               Updated stats after processing all level-ups
 */
export function awardXP(
  currentLevel: number,
  currentXP: number,
  _xpToNextLevel: number,
  xpGained: number
): LevelUpResult {
  const safeGained = Math.max(0, Math.floor(xpGained || 0));
  const previousRank = rankForLevel(currentLevel);
  let level = Math.max(1, Math.floor(currentLevel || 1));
  let xp = Math.max(0, currentXP || 0) + safeGained;
  let threshold = xpForNextLevel(level);

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
    levelsGained: level - Math.max(1, Math.floor(currentLevel || 1)),
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

  const weekStart = TimezoneService.getStartOfLocalDateUTC(safeTz, localMondayStr);
  const nextMondayStart = TimezoneService.getStartOfLocalDateUTC(safeTz, localNextMondayStr);
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
  const year = target.getUTCFullYear();
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
 * EXP is calibrated to ~100% of the canonical within-level capacity
 * (282 XP at Level 1 under floor(100 * L^1.5)),
 * while Sylph is a tight, balanced currency reward (65 Sylph at Level 1).
 */
export function calculateWeeklyQuestReward(level: number): { xpReward: number; sylphReward: number } {
  const nextLevelCapacity = xpForNextLevel(level);
  // Milestone XP payout for 3-hour weekly focus, scaled to the level bucket
  // (min 200 XP at Level 1 — the 182 XP bucket is floored up to 200).
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

  const monday = (week: { year: number; week: number }) => {
    const januaryFourth = new Date(Date.UTC(week.year, 0, 4));
    januaryFourth.setUTCDate(4 - (januaryFourth.getUTCDay() + 6) % 7 + (week.week - 1) * 7);
    return januaryFourth.getTime();
  };
  const weekDiff = Math.round((monday(curr) - monday(last)) / 604800000);

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

  // Auto-suggest effort level based on daily minutes.
  // Thresholds sit halfway between neighboring base levels:
  //   <= 1.5h -> RELAXED · <= 3h -> NORMAL · <= 5h -> INTENSE · else EXTREME
  let suggestedEffortLevel: EffortLevel;
  if (newDailyMinutes <= 90)        suggestedEffortLevel = "RELAXED";
  else if (newDailyMinutes <= 180)  suggestedEffortLevel = "NORMAL";
  else if (newDailyMinutes <= 300)  suggestedEffortLevel = "INTENSE";
  else                              suggestedEffortLevel = "EXTREME";

  // Generate warning for high-intensity plans
  let intensityWarning: string | null = null;
  if (newDailyMinutes > 420) {
    intensityWarning = `Warning: This pace requires ${newDailyMinutes} minutes/day. This exceeds the recommended maximum and may lead to burnout.`;
  } else if (newDailyMinutes > 300) {
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

// ─── Cognitive Skill Tree Session Rewards ───────────────────

import { getActiveSkillModifiers, ActiveSkillModifiers } from "./skill-tree";

export interface SessionRewardContext {
  durationMinutes: number;
  streakWeeks?: number;
  isHumanities?: boolean;
  isMathOrQuantitative?: boolean;
  isStemHighDifficulty?: boolean;
  isTimedProblemSetUnderQuota?: boolean;
  isOnSchedule?: boolean;
  isSameSubjectChain?: boolean;
  isReviewQuest?: boolean;
  isCrossDiscipline?: boolean;
  unlockedSkills?: string[];
  activeModifiers?: ActiveSkillModifiers;
}

export interface SessionRewardBreakdown {
  baseXp: number;
  totalXp: number;
  baseSylph: number;
  totalSylph: number;
  xpMultiplier: number;
  sylphMultiplier: number;
  appliedPerks: string[];
}

/**
 * Pure calculation function that determines session rewards and applies active skill perks.
 * Zero database IOPS.
 */
export function calculateSessionRewards(ctx: SessionRewardContext): SessionRewardBreakdown {
  const duration = Math.max(1, ctx.durationMinutes);
  const baseXp = duration * 10;
  const baseSylph = calculateTimerSylph(duration);

  const mods = ctx.activeModifiers || getActiveSkillModifiers(ctx.unlockedSkills || []);
  const appliedPerks: string[] = [];

  // 1. Duration Multiplier
  let xpMult = getLongSessionMultiplier(duration);

  // 2. Scholar perks
  if (duration > 45 && mods.xpMultiplier45m > 0) {
    xpMult += mods.xpMultiplier45m;
    appliedPerks.push("scholar-deep-work (+10% XP)");
  }
  if (ctx.isReviewQuest && mods.reviewXpBonus > 0) {
    xpMult += mods.reviewXpBonus;
    appliedPerks.push("scholar-revision-loop (+15% XP)");
  }
  if (ctx.isHumanities && mods.humanitiesXpMultiplier > 0) {
    xpMult += mods.humanitiesXpMultiplier;
    appliedPerks.push("scholar-monarch-retention (+20% XP)");
  }

  // 3. Analyst perks
  if (ctx.isTimedProblemSetUnderQuota && mods.timedProblemSetXpMultiplier > 0) {
    xpMult += mods.timedProblemSetXpMultiplier;
    appliedPerks.push("analyst-monarch-derivation (+25% XP)");
  }

  // 4. Scientist perks
  if (ctx.isStemHighDifficulty && mods.stemHighDifficultyXpBonus > 0) {
    xpMult += mods.stemHighDifficultyXpBonus;
    appliedPerks.push("scientist-rigorous-proof (+20% XP)");
  }

  // 5. Researcher perks
  if (duration >= 60 && mods.durationOver60mXpMultiplier > 0) {
    xpMult += mods.durationOver60mXpMultiplier;
    appliedPerks.push("researcher-deep-dive (+20% continuous XP)");
  }

  // 6. Creative perks
  if (ctx.isCrossDiscipline && mods.crossDisciplineXpBonus > 0) {
    xpMult += mods.crossDisciplineXpBonus;
    appliedPerks.push("creative-unorthodox-flow (+10% XP)");
  }

  // 7. Sylph Multipliers
  let sylphMult = getStreakMultiplier(ctx.streakWeeks || 0);

  if (ctx.isMathOrQuantitative && mods.mathSylphBonus > 0) {
    sylphMult += mods.mathSylphBonus;
    appliedPerks.push("analyst-pattern-scan (+10% Sylph)");
  }
  if (ctx.isOnSchedule && mods.onScheduleSylphBonus > 0) {
    sylphMult += mods.onScheduleSylphBonus;
    appliedPerks.push("engineer-fast-start (+5% Sylph)");
  }
  if (ctx.isSameSubjectChain && mods.sameSubjectChainSylphBonus > 0) {
    sylphMult += mods.sameSubjectChainSylphBonus;
    appliedPerks.push("engineer-batch-processor (+15% Sylph)");
  }
  if (mods.plannedAgendaSylphBonus > 0) {
    sylphMult += mods.plannedAgendaSylphBonus;
    appliedPerks.push("strategist-milestone-forecast (+20% Sylph)");
  }

  let totalXp = Math.round(baseXp * xpMult);
  let totalSylph = Math.round(baseSylph * sylphMult);

  if (ctx.isStemHighDifficulty && mods.highDiffBonusXp > 0) {
    totalXp += mods.highDiffBonusXp;
    appliedPerks.push("scientist-monarch-discovery (+10 XP)");
  }
  if (ctx.isStemHighDifficulty && mods.highDiffBonusSylph > 0) {
    totalSylph += mods.highDiffBonusSylph;
    appliedPerks.push("scientist-monarch-discovery (+2 Sylph)");
  }

  return {
    baseXp,
    totalXp,
    baseSylph,
    totalSylph,
    xpMultiplier: Number(xpMult.toFixed(2)),
    sylphMultiplier: Number(sylphMult.toFixed(2)),
    appliedPerks,
  };
}
