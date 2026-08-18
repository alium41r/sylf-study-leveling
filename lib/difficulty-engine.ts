import { EffortLevel } from "./game-engine";

export type QuestDifficulty = "EASY" | "NORMAL" | "HARD" | "EXPERT";

export const DIFFICULTY_CONFIG = {
  EASY: { label: "Easy", hpPenalty: 5, xpMultiplier: 0.8, sylphBase: 25 },
  NORMAL: { label: "Normal", hpPenalty: 10, xpMultiplier: 1.0, sylphBase: 60 },
  HARD: { label: "Hard", hpPenalty: 20, xpMultiplier: 1.5, sylphBase: 130 },
  EXPERT: { label: "Expert", hpPenalty: 40, xpMultiplier: 2.0, sylphBase: 250 },
} as const;

/**
 * AI-driven algorithmic determination of quest difficulty.
 */
export function calculateRecommendedDifficulty(
  estimatedMinutes: number,
  taskType?: string,
  cognitiveComplexity?: string, // Remember, Understand, Apply, Analyze, Evaluate, Create
  daysUntilDeadline?: number
): QuestDifficulty {
  let score = 0;
  
  // 1. Time factor
  if (estimatedMinutes >= 120) score += 4;
  else if (estimatedMinutes >= 90) score += 3;
  else if (estimatedMinutes >= 45) score += 2;
  else score += 1;

  // 2. Cognitive Complexity (Bloom's Taxonomy)
  if (cognitiveComplexity) {
    const l = cognitiveComplexity.toLowerCase();
    if (["analyze", "evaluate", "create"].includes(l)) score += 2;
    else if (["apply"].includes(l)) score += 1;
  }

  // 3. Task Type
  if (taskType) {
    const l = taskType.toLowerCase();
    if (["exam preparation", "problem solving", "mock exam"].includes(l)) score += 2;
    else if (["practice", "revision", "active recall"].includes(l)) score += 1;
  }

  // 4. Proximity to Deadline
  if (daysUntilDeadline !== undefined) {
    if (daysUntilDeadline <= 1) score += 2;
    else if (daysUntilDeadline <= 3) score += 1;
  }
  
  if (score >= 8) return "EXPERT";
  if (score >= 5) return "HARD";
  if (score >= 3) return "NORMAL";
  return "EASY";
}

/**
 * Calculates rewards based on quest difficulty.
 */
export function calculateQuestRewards(
  requiredMinutes: number,
  difficulty: QuestDifficulty,
  userLevel: number = 1
): { xp: number; sylph: number } {
  const config = DIFFICULTY_CONFIG[difficulty];
  const baseXP = Math.floor(requiredMinutes * 1.5);
  
  let xp = Math.floor(baseXP * config.xpMultiplier);
  xp = Math.floor(xp * (1 + (userLevel - 1) * 0.15)); // level scaling
  
  let sylph = config.sylphBase;
  // Small boost for unusually long quests for their difficulty tier
  if (requiredMinutes >= 120 && difficulty !== "EXPERT") sylph += 50;

  return { xp, sylph };
}
