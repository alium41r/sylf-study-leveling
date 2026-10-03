"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIFFICULTY_CONFIG = void 0;
exports.calculateRecommendedDifficulty = calculateRecommendedDifficulty;
exports.calculateQuestRewards = calculateQuestRewards;
/**
 * Canonical difficulty matrix. This is the SINGLE source of truth for quest
 * difficulty configuration across the app (HP penalties and reward math).
 *
 * Reward standard (see calculateQuestRewards):
 *   XP    = floor(5 × minutes × xpMultiplier)
 *   Sylph = max(5, floor(0.5 × minutes × sylphMultiplier))
 */
exports.DIFFICULTY_CONFIG = {
    EASY: { label: "Easy", hpPenalty: 5, xpMultiplier: 0.8, sylphMultiplier: 1 },
    NORMAL: { label: "Normal", hpPenalty: 10, xpMultiplier: 1.0, sylphMultiplier: 1 },
    HARD: { label: "Hard", hpPenalty: 20, xpMultiplier: 1.5, sylphMultiplier: 2 },
    EXPERT: { label: "Expert", hpPenalty: 40, xpMultiplier: 2.0, sylphMultiplier: 3 },
};
/**
 * AI-driven algorithmic determination of quest difficulty.
 */
function calculateRecommendedDifficulty(estimatedMinutes, taskType, cognitiveComplexity, // Remember, Understand, Apply, Analyze, Evaluate, Create
daysUntilDeadline) {
    let score = 0;
    // 1. Time factor
    if (estimatedMinutes >= 120)
        score += 4;
    else if (estimatedMinutes >= 90)
        score += 3;
    else if (estimatedMinutes >= 45)
        score += 2;
    else
        score += 1;
    // 2. Cognitive Complexity (Bloom's Taxonomy)
    if (cognitiveComplexity) {
        const l = cognitiveComplexity.toLowerCase();
        if (["analyze", "evaluate", "create"].includes(l))
            score += 2;
        else if (["apply"].includes(l))
            score += 1;
    }
    // 3. Task Type
    if (taskType) {
        const l = taskType.toLowerCase();
        if (["exam preparation", "problem solving", "mock exam"].includes(l))
            score += 2;
        else if (["practice", "revision", "active recall"].includes(l))
            score += 1;
    }
    // 4. Proximity to Deadline
    if (daysUntilDeadline !== undefined) {
        if (daysUntilDeadline <= 1)
            score += 2;
        else if (daysUntilDeadline <= 3)
            score += 1;
    }
    if (score >= 8)
        return "EXPERT";
    if (score >= 5)
        return "HARD";
    if (score >= 3)
        return "NORMAL";
    return "EASY";
}
/**
 * Calculates quest rewards using the CANONICAL unified standard:
 * a deterministic function of duration and difficulty tier only.
 *
 *   XP    = floor(5 × minutes × xpMultiplier)
 *   Sylph = max(5, floor(0.5 × minutes × sylphMultiplier))
 *
 * Examples (45-minute quest):
 *   EASY → 180 XP / 23 Sylph   NORMAL → 225 XP / 23 Sylph
 *   HARD → 337 XP / 45 Sylph   EXPERT → 450 XP / 68 Sylph
 *
 * This replaces the three formerly divergent formulas (min×5 in
 * app/api/quests, min×1.5×diff×level in this file, 1 XP/min in the
 * AI planner). Level scaling has been REMOVED — rewards must never
 * depend on the player's level, only on the work performed.
 */
function calculateQuestRewards(requiredMinutes, difficulty, _userLevel // DEPRECATED — retained for call-site compatibility, unused
) {
    const config = exports.DIFFICULTY_CONFIG[difficulty] ?? exports.DIFFICULTY_CONFIG.NORMAL;
    const minutes = Math.max(1, Math.round(Number(requiredMinutes) || 0));
    const xp = Math.floor(minutes * 5 * config.xpMultiplier);
    const sylph = Math.max(5, Math.floor(minutes * 0.5 * config.sylphMultiplier));
    return { xp, sylph };
}
