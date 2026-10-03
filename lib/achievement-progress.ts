import type { AchievementDef, AchievementMetric } from "./achievements-catalog";

export type AchievementFacts = Record<AchievementMetric, number>;

export function achievementProgress(
  achievement: AchievementDef,
  facts: AchievementFacts
): number {
  return Math.max(
    0,
    Math.min(achievement.target, facts[achievement.metric] || 0)
  );
}
