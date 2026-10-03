// ============================================================
// Cognitive Stats — investment, ability tiers & live effects
// ============================================================
// Single source of truth for the five cognitive vectors
// (Endurance, Tenacity, Velocity, Discipline, Synthesis).
//
//  • COSTS     — dual currency, scaling with the stat band:
//                +5 per invest; band = floor((value-10)/10);
//                cost = (band+1) SP  OR  (band+1) × 60 Sylph.
//  • TIERS     — abilities upgrade at 20 / 35 / 50 / 65 / 80 / 100.
//  • EFFECTS   — getCognitiveEffects() computes the concrete numbers
//                every other service applies (XP multiplier, HP bonus,
//                streak target, chat quota, mastery multiplier, apex SP).
// ============================================================

import { COGNITIVE_STAT_MAX, COGNITIVE_STAT_MIN, clampCognitiveStat } from "./game-engine";

export type CognitiveStatKey =
  | "endurance"
  | "tenacity"
  | "velocity"
  | "discipline"
  | "synthesis";

export const COGNITIVE_STAT_KEYS: CognitiveStatKey[] = [
  "endurance",
  "tenacity",
  "velocity",
  "discipline",
  "synthesis",
];

export type InvestCurrency = "sp" | "sylph";

/** Ability upgrade thresholds — one tier per crossing. */
export const ABILITY_TIERS: readonly number[] = [20, 35, 50, 65, 80, 100];
export const MAX_ABILITY_TIER = ABILITY_TIERS.length; // 6

/** Points granted per invest. */
export const INVEST_STEP = 5;

/** Sylph cost per SP cost unit. */
export const SYLPH_PER_SP = 60;

/**
 * Level-gated attribute cap (mirrors the "MAX: n (Level X)" profile design):
 *   cap(level) = min(100, 10 + (level − 1) × 5)
 * Level 1 → 10, Level 2 → 15, Level 3 → 20 … Level 19+ → 100.
 */
export function getStatCap(level: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  return Math.min(COGNITIVE_STAT_MAX, COGNITIVE_STAT_MIN + (lv - 1) * 5);
}

export interface CognitiveStatMeta {
  key: CognitiveStatKey;
  label: string;
  description: string;
  perkName: string;
  /** Human-readable effect ladder for the UI. */
  perkLadder: string;
}

export const COGNITIVE_STATS: Record<CognitiveStatKey, CognitiveStatMeta> = {
  endurance: {
    key: "endurance",
    label: "Endurance",
    description: "Focus Stamina — last longer, burn out slower.",
    perkName: "Aegis",
    perkLadder:
      "Each tier: +5 max HP and −5% HP damage from missed daily goals.",
  },
  tenacity: {
    key: "tenacity",
    label: "Tenacity",
    description: "Streak Resilience — protect your weekly streak.",
    perkName: "Iron Will",
    perkLadder:
      "Each tier: the weekly 3-hour milestone requirement drops by 5% (down to 2.1h at tier 6).",
  },
  velocity: {
    key: "velocity",
    label: "Velocity",
    description: "Pacing Speed — level faster.",
    perkName: "Flow State",
    perkLadder: "Each tier: +2% XP from every focus session (max +12%).",
  },
  discipline: {
    key: "discipline",
    label: "Discipline",
    description: "Daily Consistency — more capacity every day.",
    perkName: "Regimen",
    perkLadder: "Each tier: +1 AI chat message per day.",
  },
  synthesis: {
    key: "synthesis",
    label: "Synthesis",
    description: "Complex Output — deeper mastery yields.",
    perkName: "Insight",
    perkLadder:
      "Each tier: +5% syllabus-node mastery progress; tier 4+ adds +1 bonus SP when forging an Apex Keystone.",
  },
};

/** Number of ability tiers the stat value has crossed. */
export function getStatTier(value: number): number {
  const v = Math.max(0, Math.floor(value));
  let tier = 0;
  for (const t of ABILITY_TIERS) {
    if (v >= t) tier++;
  }
  return tier;
}

/** Next threshold that will raise the tier (null when maxed). */
export function getNextTierAt(value: number): number | null {
  const v = Math.max(0, Math.floor(value));
  for (const t of ABILITY_TIERS) {
    if (v < t) return t;
  }
  return null;
}

export function clampStatValue(value: number): number {
  return clampCognitiveStat(value);
}

/** A full +5 invest must fit inside the (level-gated) cap. */
export function canInvest(statValue: number, cap: number = COGNITIVE_STAT_MAX): boolean {
  const c = Math.min(COGNITIVE_STAT_MAX, Math.max(COGNITIVE_STAT_MIN, Math.floor(cap)));
  return statValue >= COGNITIVE_STAT_MIN && statValue + INVEST_STEP <= c;
}

/**
 * Cost of the next +INVEST_STEP purchase. Band 0 (value 10-19) → 1 SP or
 * 60 Sylph; band 9 (value 100 capped at 90-99) → 10 SP or 600 Sylph.
 */
export function getInvestCost(statValue: number, currency: InvestCurrency): number {
  const band = Math.min(9, Math.max(0, Math.floor((Math.max(0, statValue) - 10) / 10)));
  const spCost = band + 1;
  return currency === "sp" ? spCost : spCost * SYLPH_PER_SP;
}

export interface CognitiveStatsSnapshot {
  endurance: number;
  tenacity: number;
  velocity: number;
  discipline: number;
  synthesis: number;
}

export interface CognitiveEffects {
  tiers: Record<CognitiveStatKey, number>;
  /** Endurance — Aegis */
  bonusMaxHp: number;
  hpPenaltyMultiplier: number; // 1 − 0.05×tier
  /** Tenacity — Iron Will */
  weeklyTargetMinutes: number; // 180 × (1 − 0.05×tier)
  weeklyTargetMultiplier: number;
  /** Velocity — Flow State */
  sessionXpMultiplier: number; // 1 + 0.02×tier
  /** Discipline — Regimen */
  bonusChatQuota: number; // tier
  /** Synthesis — Insight */
  masteryProgressMultiplier: number; // 1 + 0.05×tier
  apexForgeBonusSp: number; // 1 at tier ≥ 4, else 0
}

const DEFAULT_STATS: CognitiveStatsSnapshot = {
  endurance: COGNITIVE_STAT_MIN,
  tenacity: COGNITIVE_STAT_MIN,
  velocity: COGNITIVE_STAT_MIN,
  discipline: COGNITIVE_STAT_MIN,
  synthesis: COGNITIVE_STAT_MIN,
};

export function normalizeCognitiveStats(
  stats?: Partial<CognitiveStatsSnapshot> | null
): CognitiveStatsSnapshot {
  const out = { ...DEFAULT_STATS };
  if (stats) {
    for (const key of COGNITIVE_STAT_KEYS) {
      const v = (stats as any)[key];
      if (typeof v === "number") {
        out[key] = clampStatValue(v);
      }
    }
  }
  return out;
}

/**
 * Computes the concrete, live effects from the five stat values. Every
 * service (session RPC parity, HP penalties, weekly streak, AI quota,
 * mastery progress) reads from THIS function so the numbers can never
 * drift between layers.
 */
export function getCognitiveEffects(
  stats?: Partial<CognitiveStatsSnapshot> | null
): CognitiveEffects {
  const s = normalizeCognitiveStats(stats);
  const enduranceTier = getStatTier(s.endurance);
  const tenacityTier = getStatTier(s.tenacity);
  const velocityTier = getStatTier(s.velocity);
  const disciplineTier = getStatTier(s.discipline);
  const synthesisTier = getStatTier(s.synthesis);

  const weeklyTargetMultiplier = Math.max(0.7, 1 - 0.05 * tenacityTier);

  return {
    tiers: {
      endurance: enduranceTier,
      tenacity: tenacityTier,
      velocity: velocityTier,
      discipline: disciplineTier,
      synthesis: synthesisTier,
    },
    bonusMaxHp: enduranceTier * 5,
    hpPenaltyMultiplier: Math.max(0.7, 1 - 0.05 * enduranceTier),
    weeklyTargetMinutes: Math.round(180 * weeklyTargetMultiplier),
    weeklyTargetMultiplier,
    sessionXpMultiplier: 1 + 0.02 * velocityTier,
    bonusChatQuota: disciplineTier,
    masteryProgressMultiplier: 1 + 0.05 * synthesisTier,
    apexForgeBonusSp: synthesisTier >= 4 ? 1 : 0,
  };
}

/** Velocity XP multiplier, expressed for the SQL RPC (tier-based). */
export function getVelocityXpMultiplier(velocity: number): number {
  return 1 + 0.02 * getStatTier(velocity);
}

/** Summary for one stat — used by the invest UI. */
export function getAbilitySummary(key: CognitiveStatKey, value: number) {
  const v = clampStatValue(value);
  const meta = COGNITIVE_STATS[key];
  const tier = getStatTier(v);
  const nextTierAt = getNextTierAt(v);
  return {
    key,
    label: meta.label,
    description: meta.description,
    perkName: meta.perkName,
    perkLadder: meta.perkLadder,
    value: v,
    tier,
    maxTier: MAX_ABILITY_TIER,
    nextTierAt,
  };
}
