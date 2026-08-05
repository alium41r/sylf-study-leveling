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
  return Math.floor(100 * Math.pow(level, 1.2));
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

// ─── Quest Reward Calculation ────────────────────────────────

/**
 * Calculate XP and Sylph rewards for a quest based on its required
 * study minutes and the goal's effort level.
 */
export function questRewards(
  requiredMinutes: number,
  effortLevel: EffortLevel,
  userLevel: number = 1
): { xp: number; sylph: number } {
  const config = EFFORT_CONFIG[effortLevel];
  const baseXP = Math.floor(requiredMinutes * 1.5);
  let xp = Math.floor(baseXP * config.xpMultiplier);
  
  // Scale XP based on user level to keep up with leveling curve
  // A modest 15% bonus per level
  xp = Math.floor(xp * (1 + (userLevel - 1) * 0.15));
  
  // Sylph calculation based on intensity
  let sylph = 25; // Casual
  if (effortLevel === "EXTREME" || requiredMinutes >= 120) sylph = 250;
  else if (effortLevel === "INTENSE" || requiredMinutes >= 90) sylph = 130;
  else if (effortLevel === "NORMAL" || requiredMinutes >= 60) sylph = 60;

  return { xp, sylph };
}

// ─── HP Penalty ──────────────────────────────────────────────

/**
 * Calculate HP penalty for a failed/missed quest based on intensity tiers.
 */
export function hpPenalty(requiredMinutes: number): number {
  if (requiredMinutes >= 120) return 50; // Hardcore
  if (requiredMinutes >= 90) return 35;  // Focused
  if (requiredMinutes >= 60) return 20;  // Standard
  return 10; // Casual
}

// ─── Streak Logic ────────────────────────────────────────────

/**
 * Determine the new streak count based on today's date and the user's
 * last active date.
 *
 * @param lastActiveDate  ISO date string (e.g., "2026-07-21") or null
 * @param todayDate       ISO date string (e.g., "2026-07-22")
 * @param currentStreak   The user's current streak count
 * @returns               Updated streak count
 */
export function calculateStreak(
  lastActiveDate: string | null,
  todayDate: string,
  currentStreak: number
): number {
  if (!lastActiveDate) return 1; // First session ever

  const last = new Date(lastActiveDate);
  const today = new Date(todayDate);
  const diffDays = Math.floor(
    (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return currentStreak;      // Same day — no change
  if (diffDays === 1) return currentStreak + 1;   // Consecutive day — streak grows
  if (diffDays === 2) return currentStreak + 1;   // Forgiveness: missed 1 day, didn't break
  return 1;                                        // Missed > 1 day — streak resets
}

// ─── Sylph System Math ────────────────────────────────────────

/**
 * Global Sylph multiplier based on consecutive days active.
 * Capped strictly at 1.5x.
 */
export function getStreakMultiplier(streakDays: number): number {
  if (streakDays >= 7) return 1.5;
  if (streakDays >= 5) return 1.25;
  if (streakDays >= 3) return 1.1;
  return 1.0;
}

/**
 * Calculate Sylph yields for focus timer sessions.
 * Base: 1 Sylph per minute.
 * Bonus: +10 Sylph per continuous 30-min block.
 */
export function calculateTimerSylph(minutes: number): number {
  const base = minutes;
  const bonus = Math.floor(minutes / 30) * 10;
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
