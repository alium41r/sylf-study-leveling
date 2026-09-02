import { resolveFormUrl, resolvePedestalUrl, resolveRelicUrl } from "./asset-manifest";

export interface CharacterConfig {
  outfit: string; // Active Hunter Form key (default: "form_tanjiro")
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
  outfit: "form_tanjiro",
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

// ─── 1. Baseline Hunter Forms ────────────────────────────────────

export const FULL_BODY_FORMS: TraitOption[] = [
  {
    id: "form_tanjiro",
    label: "Tanjiro Kamado",
    value: "form_tanjiro",
    tier: 2,
    rarity: "RARE",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Sun-breathing demon slayer swordsman clad in the iconic black and green checkered haori.",
    imagePath: "/sprites/character/forms/form_tanjiro.png",
  },
  {
    id: "form_gojo",
    label: "Satoru Gojo",
    value: "form_gojo",
    tier: 5,
    rarity: "MYTHIC",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Special Grade jujutsu sorcerer wielding the Six Eyes and limitless spatial infinity.",
    imagePath: "/sprites/character/forms/form_gojo.png",
  },
  {
    id: "form_uzui",
    label: "Tengen Uzui",
    value: "form_uzui",
    tier: 4,
    rarity: "EPIC",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Flamboyant Sound Hashira adorned in gemstone headwear and tactical shinobi garb.",
    imagePath: "/sprites/character/forms/form_uzui.png",
  },
  {
    id: "form_itadori",
    label: "Yuji Itadori",
    value: "form_itadori",
    tier: 2,
    rarity: "RARE",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Superhuman jujutsu vessel with radiant red hood collar and explosive physical prowess.",
    imagePath: "/sprites/character/forms/form_itadori.png",
  },
  {
    id: "form_shinobu",
    label: "Shinobu Kocho",
    value: "form_shinobu",
    tier: 3,
    rarity: "EPIC",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Insect Hashira moving with butterfly lightness and lethal wisteria poison finesse.",
    imagePath: "/sprites/character/forms/form_shinobu.png",
  },
  {
    id: "form_mitsuri",
    label: "Mitsuri Kanroji",
    value: "form_mitsuri",
    tier: 3,
    rarity: "EPIC",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Love Hashira wielding flexible whip-like blade with boundless passion and power.",
    imagePath: "/sprites/character/forms/form_mitsuri.png",
  },
  {
    id: "form_megumi",
    label: "Megumi Fushiguro",
    value: "form_megumi",
    tier: 3,
    rarity: "RARE",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Ten Shadows sorcerer summoning divine hounds and shadow shikigami.",
    imagePath: "/sprites/character/forms/form_megumi.png",
  },
  {
    id: "form_nezuko",
    label: "Nezuko Kamado",
    value: "form_nezuko",
    tier: 4,
    rarity: "EPIC",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Awakened demon girl wielding ferocious blood demon art pyrokinesis in pink kimono.",
    imagePath: "/sprites/character/forms/form_nezuko.png",
  },
  {
    id: "form_nobara",
    label: "Nobara Kugisaki",
    value: "form_nobara",
    tier: 2,
    rarity: "RARE",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Fearless Tokyo sorceress wielding straw doll resonance with hammer and nails.",
    imagePath: "/sprites/character/forms/form_nobara.png",
  },
  {
    id: "form_rengoku",
    label: "Kyojuro Rengoku",
    value: "form_rengoku",
    tier: 5,
    rarity: "MYTHIC",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Valiant Flame Hashira setting his heart ablaze with devastating ninth form flame breathing.",
    imagePath: "/sprites/character/forms/form_rengoku.png",
  },
  {
    id: "form_megumin",
    label: "Megumin",
    value: "form_megumin",
    tier: 4,
    rarity: "EPIC",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Crimson Magic arch-wizard unleashing unrivaled Explosion magic with wizard hat and staff.",
    imagePath: "/sprites/character/forms/form_megumin.png",
  },
  {
    id: "form_choso",
    label: "Choso",
    value: "form_choso",
    tier: 4,
    rarity: "EPIC",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Eldest Death Painting Womb master wielding lethal Blood Manipulation and Piercing Blood.",
    imagePath: "/sprites/character/forms/form_choso.png",
  },
  {
    id: "form_eren",
    label: "Eren Yeager",
    value: "form_eren",
    tier: 4,
    rarity: "LEGENDARY",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Scout Regiment vanguard equipped with Omni-Directional Mobility gear and dual snap-blades.",
    imagePath: "/sprites/character/forms/form_eren.png",
  },
  {
    id: "form_deadpool",
    label: "Deadpool",
    value: "form_deadpool",
    tier: 5,
    rarity: "MYTHIC",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "The Merc with a Mouth armed with dual katanas, twin pistols, and an unstoppable healing factor.",
    imagePath: "/sprites/character/forms/form_deadpool.png",
  },
  {
    id: "form_venom",
    label: "Venom",
    value: "form_venom",
    tier: 5,
    rarity: "MYTHIC",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Lethal alien symbiote boasting razor fangs, extended prehensile tongue, and monstrous strength.",
    imagePath: "/sprites/character/forms/form_venom.png",
  },
  {
    id: "form_spiderman",
    label: "Spider-Man",
    value: "form_spiderman",
    tier: 4,
    rarity: "LEGENDARY",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "The friendly neighborhood wall-crawler hanging upside down from an acrobatic webline.",
    imagePath: "/sprites/character/forms/form_spiderman.png",
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
    outfit: "form_tanjiro",
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
    outfit: "form_tanjiro",
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
  const outfitKey = cfg.outfit && cfg.outfit !== "default_hunter" ? cfg.outfit : "form_tanjiro";
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
