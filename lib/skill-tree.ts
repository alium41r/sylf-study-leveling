/**
 * 8-Class Cognitive Skill Tree Infrastructure
 * Defines all 24 SkillNodes across 8 archetypes, TypeScript types, and pure modifier resolution.
 */

export type SkillBranch =
  | "SCHOLAR"
  | "ANALYST"
  | "ENGINEER"
  | "SCIENTIST"
  | "RESEARCHER"
  | "PSYCHOLOGIST"
  | "STRATEGIST"
  | "CREATIVE";

export type CognitiveStat = "endurance" | "tenacity" | "velocity" | "discipline" | "synthesis";

export interface SkillNodeDefinition {
  nodeKey: string;
  name: string;
  description: string;
  branch: SkillBranch;
  tier: 1 | 2 | 3;
  costSp: number;
  prerequisiteStat: CognitiveStat;
  prerequisiteValue: number;
  prerequisiteNodeKey: string | null;
  effectPayload: Record<string, any>;
}

export interface ActiveSkillModifiers {
  // Scholar
  xpMultiplier45m: number; // e.g. 0.10 (+10% on sessions > 45m)
  reviewXpBonus: number; // e.g. 0.15 (+15% on review quests)
  humanitiesXpMultiplier: number; // e.g. 0.20 (+20% on humanities)

  // Analyst
  mathSylphBonus: number; // e.g. 0.10 (+10% Sylph on math)
  latexSpeedBoost: boolean;
  instantTheoremSearch: boolean;
  timedProblemSetXpMultiplier: number; // e.g. 0.25 (1.25x XP)

  // Engineer
  onScheduleSylphBonus: number; // e.g. 0.05 (+5% Sylph)
  sameSubjectChainSylphBonus: number; // e.g. 0.15 (+15% Sylph)
  doubleStreakHighIntensity: boolean;

  // Scientist
  unlockFormulaPinning: boolean;
  stemHighDifficultyXpBonus: number; // e.g. 0.20 (+20% XP)
  highDiffBonusSylph: number; // +2 Sylph
  highDiffBonusXp: number; // +10 XP

  // Researcher
  durationOver60mXpMultiplier: number; // e.g. 0.20 (1.2x continuous XP)
  doubleAiContextMemory: boolean;
  instant90mDisciplineCap: boolean;

  // Psychologist
  pauseGraceMinutes: number; // +3 minutes
  damageReductionPercent: number; // e.g. 25 (25% less HP damage)
  weeklyFirstMissZeroDamage: boolean; // 1st failed/missed goal deals 0 damage

  // Strategist
  highlightBottlenecks: boolean;
  plannedAgendaSylphBonus: number; // e.g. 0.20 (+20% Sylph)
  doubleStreakAbove7DaysXp: boolean;

  // Creative
  unlockMindMapping: boolean;
  unlockSketching: boolean;
  crossDisciplineXpBonus: number; // e.g. 0.10 (+10% XP)
  unlockStudioAuras: boolean;
}

export const DEFAULT_ACTIVE_MODIFIERS: ActiveSkillModifiers = {
  xpMultiplier45m: 0,
  reviewXpBonus: 0,
  humanitiesXpMultiplier: 0,

  mathSylphBonus: 0,
  latexSpeedBoost: false,
  instantTheoremSearch: false,
  timedProblemSetXpMultiplier: 0,

  onScheduleSylphBonus: 0,
  sameSubjectChainSylphBonus: 0,
  doubleStreakHighIntensity: false,

  unlockFormulaPinning: false,
  stemHighDifficultyXpBonus: 0,
  highDiffBonusSylph: 0,
  highDiffBonusXp: 0,

  durationOver60mXpMultiplier: 0,
  doubleAiContextMemory: false,
  instant90mDisciplineCap: false,

  pauseGraceMinutes: 0,
  damageReductionPercent: 0,
  weeklyFirstMissZeroDamage: false,

  highlightBottlenecks: false,
  plannedAgendaSylphBonus: 0,
  doubleStreakAbove7DaysXp: false,

  unlockMindMapping: false,
  unlockSketching: false,
  crossDisciplineXpBonus: 0,
  unlockStudioAuras: false,
};

export const SKILL_BRANCH_METADATA: Record<
  SkillBranch,
  {
    displayName: string;
    primaryVectors: [CognitiveStat, CognitiveStat];
    fieldFit: string;
    playstyle: string;
  }
> = {
  SCHOLAR: {
    displayName: "Scholar",
    primaryVectors: ["synthesis", "discipline"],
    fieldFit: "Humanities, Literature, History, Languages",
    playstyle: "Knowledge retention, spaced repetition loops, high-volume review multipliers.",
  },
  ANALYST: {
    displayName: "Analyst",
    primaryVectors: ["synthesis", "velocity"],
    fieldFit: "Mathematics, Economics, Finance, Data Science",
    playstyle: "Rapid problem breakdown, proof verification efficiency, quantitative session boosts.",
  },
  ENGINEER: {
    displayName: "Engineer",
    primaryVectors: ["velocity", "discipline"],
    fieldFit: "Computer Science, Software, Engineering, Robotics",
    playstyle: "Task batching, study pipeline automation, quest chaining velocity.",
  },
  SCIENTIST: {
    displayName: "Scientist",
    primaryVectors: ["synthesis", "tenacity"],
    fieldFit: "Medicine, Biology, Chemistry, Experimental Physics",
    playstyle: "Empirical hypothesis validation, high-difficulty quest breakthroughs, formula mastery.",
  },
  RESEARCHER: {
    displayName: "Researcher",
    primaryVectors: ["synthesis", "endurance"],
    fieldFit: "Law, Legal Briefs, Postgraduate & Academic Research",
    playstyle: "Deep-literature marathons (90m+ focus blocks), source synthesis, expanded AI context.",
  },
  PSYCHOLOGIST: {
    displayName: "Psychologist",
    primaryVectors: ["endurance", "tenacity"],
    fieldFit: "Psychology, Neuroscience, High-Stress Pre-Med",
    playstyle: "Mental stamina regulation, burnout mitigation, flow-state stabilization, HP shields.",
  },
  STRATEGIST: {
    displayName: "Strategist",
    primaryVectors: ["discipline", "velocity"],
    fieldFit: "Competitive Exams (SAT, MCAT, LSAT), Business",
    playstyle: "Long-term campaign planning, milestone forecasting, daily streak compounding.",
  },
  CREATIVE: {
    displayName: "Creative",
    primaryVectors: ["tenacity", "synthesis"],
    fieldFit: "Architecture, Design, Music, Creative Writing",
    playstyle: "Lateral concept synthesis, unorthodox problem solving, anti-procrastination bursts.",
  },
};

export const SKILL_NODES: SkillNodeDefinition[] = [
  // ==========================================
  // 1. SCHOLAR BRANCH (Synthesis + Discipline)
  // ==========================================
  {
    nodeKey: "scholar-deep-work",
    name: "Deep Work Protocol",
    description: "Intense cognitive focus grants +10% XP bonus on sessions lasting longer than 45 minutes.",
    branch: "SCHOLAR",
    tier: 1,
    costSp: 1,
    prerequisiteStat: "synthesis",
    prerequisiteValue: 15,
    prerequisiteNodeKey: null,
    effectPayload: { xpMultiplier45m: 0.1 },
  },
  {
    nodeKey: "scholar-revision-loop",
    name: "Spaced Revision Loop",
    description: "Systematic recall loops award +15% XP on review and flashcard quests.",
    branch: "SCHOLAR",
    tier: 2,
    costSp: 2,
    prerequisiteStat: "discipline",
    prerequisiteValue: 25,
    prerequisiteNodeKey: "scholar-deep-work",
    effectPayload: { reviewXpBonus: 0.15 },
  },
  {
    nodeKey: "scholar-monarch-retention",
    name: "Monarch's Total Retention",
    description: "Permanent +20% XP boost on humanities, historical synthesis, and foundational quests.",
    branch: "SCHOLAR",
    tier: 3,
    costSp: 3,
    prerequisiteStat: "synthesis",
    prerequisiteValue: 50,
    prerequisiteNodeKey: "scholar-revision-loop",
    effectPayload: { humanitiesXpMultiplier: 0.2 },
  },

  // ==========================================
  // 2. ANALYST BRANCH (Synthesis + Velocity)
  // ==========================================
  {
    nodeKey: "analyst-pattern-scan",
    name: "Quantitative Pattern Scan",
    description: "Accelerated numerical parsing grants +10% bonus Sylph on mathematics and finance quests.",
    branch: "ANALYST",
    tier: 1,
    costSp: 1,
    prerequisiteStat: "velocity",
    prerequisiteValue: 15,
    prerequisiteNodeKey: null,
    effectPayload: { mathSylphBonus: 0.1 },
  },
  {
    nodeKey: "analyst-logic-breakdown",
    name: "Axiomatic Logic Breakdown",
    description: "Scratchpad LaTeX rendering speed boost and instant theorem search shortcuts.",
    branch: "ANALYST",
    tier: 2,
    costSp: 2,
    prerequisiteStat: "synthesis",
    prerequisiteValue: 25,
    prerequisiteNodeKey: "analyst-pattern-scan",
    effectPayload: { latexSpeedBoost: true, instantTheoremSearch: true },
  },
  {
    nodeKey: "analyst-monarch-derivation",
    name: "Monarch's Derivation",
    description: "1.25x XP multiplier on all quantitative problem sets completed under time quota.",
    branch: "ANALYST",
    tier: 3,
    costSp: 3,
    prerequisiteStat: "velocity",
    prerequisiteValue: 50,
    prerequisiteNodeKey: "analyst-logic-breakdown",
    effectPayload: { timedProblemSetXpMultiplier: 0.25 },
  },

  // ==========================================
  // 3. ENGINEER BRANCH (Velocity + Discipline)
  // ==========================================
  {
    nodeKey: "engineer-fast-start",
    name: "Pipeline Fast Start",
    description: "Setup grace boost granting +5% Sylph on sessions started on schedule.",
    branch: "ENGINEER",
    tier: 1,
    costSp: 1,
    prerequisiteStat: "velocity",
    prerequisiteValue: 15,
    prerequisiteNodeKey: null,
    effectPayload: { onScheduleSylphBonus: 0.05 },
  },
  {
    nodeKey: "engineer-batch-processor",
    name: "Batch Processor",
    description: "Chaining 2+ consecutive quests of the same technical subject grants +15% bonus Sylph.",
    branch: "ENGINEER",
    tier: 2,
    costSp: 2,
    prerequisiteStat: "discipline",
    prerequisiteValue: 25,
    prerequisiteNodeKey: "engineer-fast-start",
    effectPayload: { sameSubjectChainSylphBonus: 0.15 },
  },
  {
    nodeKey: "engineer-monarch-overclock",
    name: "Monarch's Overclock",
    description: "Doubles daily streak multiplier during high-intensity focus blocks.",
    branch: "ENGINEER",
    tier: 3,
    costSp: 3,
    prerequisiteStat: "velocity",
    prerequisiteValue: 50,
    prerequisiteNodeKey: "engineer-batch-processor",
    effectPayload: { doubleStreakHighIntensity: true },
  },

  // ==========================================
  // 4. SCIENTIST BRANCH (Synthesis + Tenacity)
  // ==========================================
  {
    nodeKey: "scientist-empirical-focus",
    name: "Empirical Focus",
    description: "Unlocks advanced Formula Deck reference pinning and quick constants table.",
    branch: "SCIENTIST",
    tier: 1,
    costSp: 1,
    prerequisiteStat: "synthesis",
    prerequisiteValue: 15,
    prerequisiteNodeKey: null,
    effectPayload: { unlockFormulaPinning: true },
  },
  {
    nodeKey: "scientist-rigorous-proof",
    name: "Rigorous Proof",
    description: "+20% XP boost on high-difficulty STEM problem blocks and lab analysis.",
    branch: "SCIENTIST",
    tier: 2,
    costSp: 2,
    prerequisiteStat: "tenacity",
    prerequisiteValue: 25,
    prerequisiteNodeKey: "scientist-empirical-focus",
    effectPayload: { stemHighDifficultyXpBonus: 0.2 },
  },
  {
    nodeKey: "scientist-monarch-discovery",
    name: "Monarch's Discovery",
    description: "High-difficulty quest completions grant +2 bonus Sylph and +10 bonus XP.",
    branch: "SCIENTIST",
    tier: 3,
    costSp: 3,
    prerequisiteStat: "synthesis",
    prerequisiteValue: 50,
    prerequisiteNodeKey: "scientist-rigorous-proof",
    effectPayload: { highDiffBonusSylph: 2, highDiffBonusXp: 10 },
  },

  // ==========================================
  // 5. RESEARCHER BRANCH (Synthesis + Endurance)
  // ==========================================
  {
    nodeKey: "researcher-deep-dive",
    name: "Deep Literature Dive",
    description: "Focus sessions extending past 60 minutes grant 1.2x continuous XP multiplier.",
    branch: "RESEARCHER",
    tier: 1,
    costSp: 1,
    prerequisiteStat: "endurance",
    prerequisiteValue: 15,
    prerequisiteNodeKey: null,
    effectPayload: { durationOver60mXpMultiplier: 0.2 },
  },
  {
    nodeKey: "researcher-literature-synthesis",
    name: "Comprehensive Synthesis",
    description: "Doubles AI Study Assistant context and historical memory ingestion limits.",
    branch: "RESEARCHER",
    tier: 2,
    costSp: 2,
    prerequisiteStat: "synthesis",
    prerequisiteValue: 25,
    prerequisiteNodeKey: "researcher-deep-dive",
    effectPayload: { doubleAiContextMemory: true },
  },
  {
    nodeKey: "researcher-monarch-thesis",
    name: "Monarch's Grand Thesis",
    description: "Unbroken 90m+ focus marathons instantly award the full daily discipline cap.",
    branch: "RESEARCHER",
    tier: 3,
    costSp: 3,
    prerequisiteStat: "endurance",
    prerequisiteValue: 50,
    prerequisiteNodeKey: "researcher-literature-synthesis",
    effectPayload: { instant90mDisciplineCap: true },
  },

  // ==========================================
  // 6. PSYCHOLOGIST BRANCH (Endurance + Tenacity)
  // ==========================================
  {
    nodeKey: "psychologist-flow-state",
    name: "Flow State Anchor",
    description: "Increases focus timer pause grace period by 3 minutes before breaking flow.",
    branch: "PSYCHOLOGIST",
    tier: 1,
    costSp: 1,
    prerequisiteStat: "endurance",
    prerequisiteValue: 15,
    prerequisiteNodeKey: null,
    effectPayload: { pauseGraceMinutes: 3 },
  },
  {
    nodeKey: "psychologist-mental-shield",
    name: "Cognitive Mental Shield",
    description: "Failed or missed daily study sessions deal 25% less HP damage.",
    branch: "PSYCHOLOGIST",
    tier: 2,
    costSp: 2,
    prerequisiteStat: "tenacity",
    prerequisiteValue: 25,
    prerequisiteNodeKey: "psychologist-flow-state",
    effectPayload: { damageReductionPercent: 25 },
  },
  {
    nodeKey: "psychologist-monarch-resilience",
    name: "Monarch's Absolute Resilience",
    description: "The first failed or missed daily focus goal of each week deals 0 HP damage.",
    branch: "PSYCHOLOGIST",
    tier: 3,
    costSp: 3,
    prerequisiteStat: "tenacity",
    prerequisiteValue: 50,
    prerequisiteNodeKey: "psychologist-mental-shield",
    effectPayload: { weeklyFirstMissZeroDamage: true },
  },

  // ==========================================
  // 7. STRATEGIST BRANCH (Discipline + Velocity)
  // ==========================================
  {
    nodeKey: "strategist-campaign-scout",
    name: "Campaign Scout",
    description: "Study calendar auto-highlights critical pacing bottlenecks and milestone risks.",
    branch: "STRATEGIST",
    tier: 1,
    costSp: 1,
    prerequisiteStat: "discipline",
    prerequisiteValue: 15,
    prerequisiteNodeKey: null,
    effectPayload: { highlightBottlenecks: true },
  },
  {
    nodeKey: "strategist-milestone-forecast",
    name: "Milestone Forecast",
    description: "Completing your planned daily agenda grants +20% bonus Sylph currency.",
    branch: "STRATEGIST",
    tier: 2,
    costSp: 2,
    prerequisiteStat: "velocity",
    prerequisiteValue: 25,
    prerequisiteNodeKey: "strategist-campaign-scout",
    effectPayload: { plannedAgendaSylphBonus: 0.2 },
  },
  {
    nodeKey: "strategist-monarch-trajectory",
    name: "Monarch's Strategic Trajectory",
    description: "Daily streaks above 7 days yield double XP compounding bonuses.",
    branch: "STRATEGIST",
    tier: 3,
    costSp: 3,
    prerequisiteStat: "discipline",
    prerequisiteValue: 50,
    prerequisiteNodeKey: "strategist-milestone-forecast",
    effectPayload: { doubleStreakAbove7DaysXp: true },
  },

  // ==========================================
  // 8. CREATIVE BRANCH (Tenacity + Synthesis)
  // ==========================================
  {
    nodeKey: "creative-lateral-spark",
    name: "Lateral Creative Spark",
    description: "Scratchpad unlocks dynamic mind-mapping and freeform vector sketching tools.",
    branch: "CREATIVE",
    tier: 1,
    costSp: 1,
    prerequisiteStat: "tenacity",
    prerequisiteValue: 15,
    prerequisiteNodeKey: null,
    effectPayload: { unlockMindMapping: true, unlockSketching: true },
  },
  {
    nodeKey: "creative-unorthodox-flow",
    name: "Unorthodox Flow State",
    description: "Switching between different quest subjects grants +10% cross-discipline XP bonus.",
    branch: "CREATIVE",
    tier: 2,
    costSp: 2,
    prerequisiteStat: "synthesis",
    prerequisiteValue: 25,
    prerequisiteNodeKey: "creative-lateral-spark",
    effectPayload: { crossDisciplineXpBonus: 0.1 },
  },
  {
    nodeKey: "creative-monarch-synthesis",
    name: "Monarch's Synthesis",
    description: "Completing creative milestones awards custom aura particle effects in Profile Studio.",
    branch: "CREATIVE",
    tier: 3,
    costSp: 3,
    prerequisiteStat: "synthesis",
    prerequisiteValue: 50,
    prerequisiteNodeKey: "creative-unorthodox-flow",
    effectPayload: { unlockStudioAuras: true },
  },
];

/**
 * Pure helper function to check if a specific skill node is unlocked.
 */
export function hasUserSkill(
  userSkills: Array<{ nodeKey?: string; skillNode?: { nodeKey: string } }> | undefined | null,
  nodeKey: string
): boolean {
  if (!userSkills || !Array.isArray(userSkills)) return false;
  return userSkills.some(
    (s) => s.nodeKey === nodeKey || (s.skillNode && s.skillNode.nodeKey === nodeKey)
  );
}

/**
 * Pure, deterministic modifier resolver for Zero-IOPS session engines.
 * Resolves all active numerical multipliers and boolean perks from unlocked node keys.
 */
export function getActiveSkillModifiers(unlockedNodeKeys: string[]): ActiveSkillModifiers {
  const modifiers: ActiveSkillModifiers = { ...DEFAULT_ACTIVE_MODIFIERS };
  if (!unlockedNodeKeys || !Array.isArray(unlockedNodeKeys) || unlockedNodeKeys.length === 0) {
    return modifiers;
  }

  const keySet = new Set(unlockedNodeKeys);

  for (const node of SKILL_NODES) {
    if (keySet.has(node.nodeKey)) {
      const payload = node.effectPayload;
      if (!payload) continue;

      // Scholar
      if (payload.xpMultiplier45m) modifiers.xpMultiplier45m += payload.xpMultiplier45m;
      if (payload.reviewXpBonus) modifiers.reviewXpBonus += payload.reviewXpBonus;
      if (payload.humanitiesXpMultiplier) modifiers.humanitiesXpMultiplier += payload.humanitiesXpMultiplier;

      // Analyst
      if (payload.mathSylphBonus) modifiers.mathSylphBonus += payload.mathSylphBonus;
      if (payload.latexSpeedBoost) modifiers.latexSpeedBoost = true;
      if (payload.instantTheoremSearch) modifiers.instantTheoremSearch = true;
      if (payload.timedProblemSetXpMultiplier) modifiers.timedProblemSetXpMultiplier += payload.timedProblemSetXpMultiplier;

      // Engineer
      if (payload.onScheduleSylphBonus) modifiers.onScheduleSylphBonus += payload.onScheduleSylphBonus;
      if (payload.sameSubjectChainSylphBonus) modifiers.sameSubjectChainSylphBonus += payload.sameSubjectChainSylphBonus;
      if (payload.doubleStreakHighIntensity) modifiers.doubleStreakHighIntensity = true;

      // Scientist
      if (payload.unlockFormulaPinning) modifiers.unlockFormulaPinning = true;
      if (payload.stemHighDifficultyXpBonus) modifiers.stemHighDifficultyXpBonus += payload.stemHighDifficultyXpBonus;
      if (payload.highDiffBonusSylph) modifiers.highDiffBonusSylph += payload.highDiffBonusSylph;
      if (payload.highDiffBonusXp) modifiers.highDiffBonusXp += payload.highDiffBonusXp;

      // Researcher
      if (payload.durationOver60mXpMultiplier) modifiers.durationOver60mXpMultiplier += payload.durationOver60mXpMultiplier;
      if (payload.doubleAiContextMemory) modifiers.doubleAiContextMemory = true;
      if (payload.instant90mDisciplineCap) modifiers.instant90mDisciplineCap = true;

      // Psychologist
      if (payload.pauseGraceMinutes) modifiers.pauseGraceMinutes += payload.pauseGraceMinutes;
      if (payload.damageReductionPercent) modifiers.damageReductionPercent = Math.max(modifiers.damageReductionPercent, payload.damageReductionPercent);
      if (payload.weeklyFirstMissZeroDamage) modifiers.weeklyFirstMissZeroDamage = true;

      // Strategist
      if (payload.highlightBottlenecks) modifiers.highlightBottlenecks = true;
      if (payload.plannedAgendaSylphBonus) modifiers.plannedAgendaSylphBonus += payload.plannedAgendaSylphBonus;
      if (payload.doubleStreakAbove7DaysXp) modifiers.doubleStreakAbove7DaysXp = true;

      // Creative
      if (payload.unlockMindMapping) modifiers.unlockMindMapping = true;
      if (payload.unlockSketching) modifiers.unlockSketching = true;
      if (payload.crossDisciplineXpBonus) modifiers.crossDisciplineXpBonus += payload.crossDisciplineXpBonus;
      if (payload.unlockStudioAuras) modifiers.unlockStudioAuras = true;
    }
  }

  return modifiers;
}
