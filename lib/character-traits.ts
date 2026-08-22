import { resolveFormUrl, resolvePedestalUrl, resolveRelicUrl } from "./asset-manifest";

export interface CharacterConfig {
  outfit: string; // Active Hunter Form key (default: "default_hunter")
  pedestal: string; // Active platform SVG (default: "pedestal_cyber")
  pedestalKey?: string; // Backwards-compatible alias for pedestal
  aura?: string; // Active aura key (default: "none")
  relic?: string; // Active off-hand relic (default: "none")
  weapon?: string; // Weapon overlay key alias
  stage?: string; // Progression stage identifier
  seed?: string;

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
  outfit: "default_hunter",
  pedestal: "pedestal_cyber",
  pedestalKey: "pedestal_cyber",
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

export interface HairStyleOption extends TraitOption {
  bangs: number;
  base: number;
}

// ─── 1. Baseline Hunter Forms (Single Default Base Model) ───────

export const FULL_BODY_FORMS: TraitOption[] = [
  {
    id: "form_default_hunter",
    label: "Default Hunter Base",
    value: "default_hunter",
    tier: 1,
    rarity: "COMMON",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Standard Hunter recruit base model with neural focus readiness.",
    imagePath: "/sprites/character/forms/default_hunter.png",
  },
];

// ─── 2. Baseline Platform Pedestals ────────────────────────────

export const PEDESTAL_OPTIONS: TraitOption[] = [
  {
    id: "pedestal_cyber",
    label: "Cyber Matrix",
    value: "pedestal_cyber",
    tier: 1,
    rarity: "COMMON",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Standard issue glowing cyan holographic telemetry platform.",
    imagePath: "/sprites/character/pedestals/pedestal_cyber.svg",
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

// ─── Legacy Trait Option Arrays (Retained for Backwards Compatibility) ──

export const SKIN_TONES: TraitOption[] = [
  { id: "default_hunter", label: "Hunter Base", value: "default_hunter", previewColor: "#7c3aed", imagePath: "/sprites/character/forms/default_hunter.png" },
];

export const HAIR_STYLES: HairStyleOption[] = [
  { id: "crop", label: "Short Crop", value: "crop", bangs: 1, base: 1 },
];

export const HAIR_COLORS: TraitOption[] = [
  { id: "black", label: "Obsidian Black", value: "black", previewColor: "#1c1c1c" },
];

export const OUTFIT_STYLES: TraitOption[] = FULL_BODY_FORMS;
export const EYEWEAR_STYLES: TraitOption[] = [{ id: "none", label: "No Eyewear", value: "none" }];
export const ACCESSORY_STYLES: TraitOption[] = [{ id: "none", label: "No Headgear", value: "none" }];

/**
 * Returns default character configuration.
 */
export function getDefaultCharacterConfig(seed: string = "scholar"): CharacterConfig {
  return {
    outfit: "default_hunter",
    pedestal: "pedestal_cyber",
    pedestalKey: "pedestal_cyber",
    aura: "none",
    relic: "none",
    stage: "STAGE_1",
    seed,
  };
}

/**
 * Generates character configuration.
 */
export function generateRandomCharacterConfig(): CharacterConfig {
  const randomSeed = Math.random().toString(36).substring(2, 9);
  return {
    outfit: "default_hunter",
    pedestal: "pedestal_cyber",
    pedestalKey: "pedestal_cyber",
    aura: "none",
    relic: "none",
    stage: "STAGE_1",
    seed: randomSeed,
  };
}

/**
 * Helper to compute sprite layer image paths from a CharacterConfig.
 * Resolves the 4-layer unified evolution architecture:
 *   1. Pedestal (SVG)
 *   2. Full-Body Form (PNG with SVG silhouette fallback)
 *   3. Aura (CSS Glow / Ring)
 *   4. Relic / Weapon Overlay (PNG)
 */
export function getSpriteLayers(config?: CharacterConfig | null, seedFallback: string = "scholar") {
  const cfg = config && (config.outfit || config.skin) ? config : getDefaultCharacterConfig(seedFallback);

  const pedestalKey = cfg.pedestal || cfg.pedestalKey || "pedestal_cyber";
  const auraKey = cfg.aura || "none";
  const outfitKey = cfg.outfit || "default_hunter";
  const relicKey = cfg.relic && cfg.relic !== "none" ? cfg.relic : cfg.weapon && cfg.weapon !== "none" ? cfg.weapon : null;

  const pedestalUrl = resolvePedestalUrl(pedestalKey);
  const formUrl = resolveFormUrl(outfitKey);
  const relicUrl = resolveRelicUrl(relicKey);

  return {
    aura: AURA_PRESETS.find((a) => a.id === auraKey) || AURA_PRESETS[0],
    pedestal: pedestalUrl,
    form: formUrl,
    relic: relicUrl,

    // Legacy fields maintained for backwards compatibility
    body: formUrl,
    outfit: formUrl,
    hairBase: null,
    hairBangs: null,
    eyewear: null,
    accessory: null,
    helmet: null,
    chestplate: null,
    pants: null,
    boots: null,
    weapon: relicUrl,
  };
}
