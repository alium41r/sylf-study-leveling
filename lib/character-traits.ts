
export interface CharacterConfig {
  outfit: string; // Selected Pixel companion key (default: "none")
  pedestal: string; // Selected Pixel ground (default: "none")
  pedestalKey?: string; // Backwards-compatible alias for pedestal
  aura?: string; // Active aura key (default: "none")
  relic?: string; // Active off-hand relic (default: "none")
  weapon?: string; // Weapon overlay key alias
  stage?: string; // Progression stage identifier
  seed?: string;

  /**
   * Pixel Display density preset — `"original" | "chunky" | "balanced" | "detailed" | "finest"`.
   *
   * Stored in the existing `characterConfig` JSON, so **no schema migration** was
   * needed. It is a preference about how the companion is *drawn*, like the
   * appearance mode, not a cosmetic the Shop owns: nothing prices it, unlocks it
   * or gates it.
   *
   * Added by Phase 7. Absent in every existing configuration, and read through a
   * default rather than migrated, so no scholar has to re-equip anything.
   */
  density?: string;
  /** Optional six-digit hex outline; presentation only, independent of artwork. */
  displayBorder?: string;
  /** Cell separator as a fraction of pitch, 0..0.3. Native drawings default to 0. */
  pixelGap?: number;

  // Optional legacy fields maintained for backwards compatibility
  skin?: string;
  hairStyle?: string;
  hairColor?: string;
  eyewear?: string;
  accessory?: string;
  body?: string;
  hair?: string;
  helmet?: string;
  chestplate?: string;
  pants?: string;
  boots?: string;
}

export const DEFAULT_CHARACTER_CONFIG: CharacterConfig = {
  outfit: "none",
  pedestal: "none",
  pedestalKey: "none",
  aura: "none",
  relic: "none",
  stage: "STAGE_1",
};

export interface TraitOption {
  id: string;
  label: string;
  value: string;
  previewColor?: string;
  imagePath?: string;
  category?: string;
  tier?: 1 | 2 | 3 | 4 | 5;
  rarity?: "COMMON" | "RARE" | "EPIC" | "LEGENDARY" | "MYTHIC";
  requiredRank?: string;
  requiredLevel?: number;
  description?: string;
}

// ─── 1. Baseline Hunter Forms ────────────────────────────────────

/** Characters come exclusively from the scholar’s Pixel Studio library. */
export const PIXEL_COMPANIONS: TraitOption[] = [];

export const PEDESTAL_OPTIONS: TraitOption[] = [
  {
    id: "pedestal_cyber",
    label: "Meadow",
    value: "pedestal_cyber",
    tier: 1,
    rarity: "COMMON",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "A pixel meadow beneath your companion.",
  },
];

// ─── 3. Baseline Auras ─────────────────────────────────────────

export const AURA_PRESETS: {
  id: string;
  label: string;
  color: string;
  glowClass: string;
  tier: 1 | 2 | 3 | 4 | 5;
  rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY" | "MYTHIC";
  requiredRank: string;
  requiredLevel: number;
}[] = [
  {
    id: "none",
    label: "No Aura",
    color: "transparent",
    glowClass: "",
    tier: 1,
    rarity: "COMMON",
    requiredRank: "RANK E",
    requiredLevel: 1,
  },
];

// ─── 4. Baseline Relics & Weapons ──────────────────────────────

export const RELIC_OPTIONS: TraitOption[] = [
  {
    id: "relic_none",
    label: "None (Unequipped)",
    value: "none",
    tier: 1,
    rarity: "COMMON",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Hands unencumbered for maximum cognitive focus.",
  },
];

/**
 * Returns default character configuration.
 */
export function getDefaultCharacterConfig(seed: string = "scholar"): CharacterConfig {
  return {
    outfit: "none",
    pedestal: "none",
    pedestalKey: "none",
    aura: "none",
    relic: "none",
    stage: "STAGE_1",
    seed,
  };
}
