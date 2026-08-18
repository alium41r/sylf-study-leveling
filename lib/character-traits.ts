export interface CharacterConfig {
  skin: string; // e.g. "fair", "peach", "olive", "bronze", "caramel", "espresso", "shadow", "cyber"
  hairStyle: string; // e.g. "crop", "spiky", "undercut", "part", "flowing", "ponytail", "bun", "dreads", "swoop", "afro", "twintails"
  hairColor: string; // e.g. "black", "brown", "blond", "TRUred", "ghostwhite", "blue", "ppurple", "green"
  outfit: string; // e.g. "armor_scholar_robes", "armor_heroic_tunic", "armor_techwear_stealth", etc.
  eyewear: string; // e.g. "none", "eyewear_black_top", "eyewear_cyber_visor", etc.
  accessory?: string; // e.g. "none", "headgear_bard_beret", "headband_black", "circlet_heroic", etc.
  aura?: string; // e.g. "aura_monarch", "aura_cyber", "aura_emerald", "aura_crimson", "aura_obsidian", "none"
  seed?: string;
}

export interface TraitOption {
  id: string;
  label: string;
  value: string;
  previewColor?: string;
  imagePath?: string;
  category?: string;
}

export interface HairStyleOption extends TraitOption {
  bangs: number;
  base: number;
}

// ─── 1. Skin Tone Slices (8 Palettes) ─────────────────────────

export const SKIN_TONES: TraitOption[] = [
  { id: "fair", label: "Fair Porcelain", value: "fair", previewColor: "#ddc994", imagePath: "/sprites/character/body/skin_fair.png" },
  { id: "peach", label: "Warm Sand", value: "peach", previewColor: "#f5a76e", imagePath: "/sprites/character/body/skin_peach.png" },
  { id: "olive", label: "Sunlit Olive", value: "olive", previewColor: "#ea8349", imagePath: "/sprites/character/body/skin_olive.png" },
  { id: "bronze", label: "Cyber Bronze", value: "bronze", previewColor: "#c06534", imagePath: "/sprites/character/body/skin_bronze.png" },
  { id: "caramel", label: "Rich Caramel", value: "caramel", previewColor: "#98461a", imagePath: "/sprites/character/body/skin_caramel.png" },
  { id: "espresso", label: "Deep Espresso", value: "espresso", previewColor: "#915533", imagePath: "/sprites/character/body/skin_espresso.png" },
  { id: "shadow", label: "Void Shadow", value: "shadow", previewColor: "#27272a", imagePath: "/sprites/character/body/skin_shadow.png" },
  { id: "cyber", label: "Cyber Blue", value: "cyber", previewColor: "#38bdf8", imagePath: "/sprites/character/body/skin_cyber.png" },
];

// ─── 2. Hairstyles (11 Variations) ────────────────────────────

export const HAIR_STYLES: HairStyleOption[] = [
  { id: "crop", label: "Short Crop & Bangs", value: "crop", bangs: 1, base: 1 },
  { id: "spiky", label: "Spiky Anime Locks", value: "spiky", bangs: 3, base: 3 },
  { id: "undercut", label: "Undercut Fade", value: "undercut", bangs: 1, base: 2 },
  { id: "part", label: "Sleek Middle Part", value: "part", bangs: 2, base: 1 },
  { id: "flowing", label: "Long Flowing Locks", value: "flowing", bangs: 2, base: 2 },
  { id: "ponytail", label: "Messy Ponytail", value: "ponytail", bangs: 1, base: 4 },
  { id: "bun", label: "High Topknot Bun", value: "bun", bangs: 2, base: 5 },
  { id: "dreads", label: "Braids & Dreadlocks", value: "dreads", bangs: 3, base: 6 },
  { id: "swoop", label: "Side Swoop Fringe", value: "swoop", bangs: 4, base: 2 },
  { id: "afro", label: "Afro Volume Coils", value: "afro", bangs: 1, base: 7 },
  { id: "twintails", label: "Dual Braided Tails", value: "twintails", bangs: 2, base: 8 },
];

export const HAIR_COLORS: TraitOption[] = [
  { id: "black", label: "Obsidian Black", value: "black", previewColor: "#1c1c1c" },
  { id: "brown", label: "Dark Chestnut", value: "brown", previewColor: "#6b4226" },
  { id: "blond", label: "Golden Blonde", value: "blond", previewColor: "#e8be6b" },
  { id: "TRUred", label: "Crimson Red", value: "TRUred", previewColor: "#b91c1c" },
  { id: "ghostwhite", label: "Ash Silver", value: "ghostwhite", previewColor: "#e2e8f0" },
  { id: "blue", label: "Cyber Neon Cyan", value: "blue", previewColor: "#06b6d4" },
  { id: "ppurple", label: "Electric Violet", value: "ppurple", previewColor: "#8b5cf6" },
  { id: "green", label: "Deep Emerald", value: "green", previewColor: "#10b981" },
];

// ─── 3. Attire, Robes & Armor (18 Outfits) ────────────────────

export const OUTFIT_STYLES: TraitOption[] = [
  { id: "armor_scholar_robes", label: "Grand Scholar Robes", value: "armor_scholar_robes", category: "Robes", imagePath: "/sprites/character/outfits/armor_scholar_robes.png" },
  { id: "armor_archmage", label: "Archmage Celestial Robes", value: "armor_archmage", category: "Robes", imagePath: "/sprites/character/outfits/armor_archmage.png" },
  { id: "armor_flame_robes", label: "Pyromancer Arcane Robes", value: "armor_flame_robes", category: "Robes", imagePath: "/sprites/character/outfits/armor_flame_robes.png" },
  { id: "armor_grand_scholar", label: "Academy Master Coat", value: "armor_grand_scholar", category: "Coats", imagePath: "/sprites/character/outfits/armor_grand_scholar.png" },
  { id: "armor_alchemist_vest", label: "Alchemist Research Tunic", value: "armor_alchemist_vest", category: "Tunics", imagePath: "/sprites/character/outfits/armor_alchemist_vest.png" },
  { id: "armor_heroic_tunic", label: "Heroic Adventurer Tunic", value: "armor_heroic_tunic", category: "Armor", imagePath: "/sprites/character/outfits/armor_heroic_tunic.png" },
  { id: "armor_warrior_tunic", label: "Tactical Knight Armor", value: "armor_warrior_tunic", category: "Armor", imagePath: "/sprites/character/outfits/armor_warrior_tunic.png" },
  { id: "armor_paladin_plate", label: "Paladin Aegis Plate", value: "armor_paladin_plate", category: "Armor", imagePath: "/sprites/character/outfits/armor_paladin_plate.png" },
  { id: "armor_techwear_stealth", label: "Techwear Stealth Gear", value: "armor_techwear_stealth", category: "Techwear", imagePath: "/sprites/character/outfits/armor_techwear_stealth.png" },
  { id: "armor_shadow_assassin", label: "Midnight Assassin Robes", value: "armor_shadow_assassin", category: "Techwear", imagePath: "/sprites/character/outfits/armor_shadow_assassin.png" },
  { id: "armor_academy_blazer", label: "Scholar Academy Blazer", value: "armor_academy_blazer", category: "Formal", imagePath: "/sprites/character/outfits/armor_academy_blazer.png" },
  { id: "armor_formal_suit", label: "Noble Dandy Suit", value: "armor_formal_suit", category: "Formal", imagePath: "/sprites/character/outfits/armor_formal_suit.png" },
  { id: "shirt_black", label: "Obsidian Tech Shirt", value: "shirt_black", category: "Shirts", imagePath: "/sprites/character/outfits/shirt_black.png" },
  { id: "shirt_blue", label: "Cyan Focus Shirt", value: "shirt_blue", category: "Shirts", imagePath: "/sprites/character/outfits/shirt_blue.png" },
  { id: "shirt_purple", label: "Monarch Violet Shirt", value: "shirt_purple", category: "Shirts", imagePath: "/sprites/character/outfits/shirt_purple.png" },
  { id: "shirt_crimson", label: "Crimson Tech Shirt", value: "shirt_crimson", category: "Shirts", imagePath: "/sprites/character/outfits/shirt_crimson.png" },
  { id: "shirt_green", label: "Emerald Focus Shirt", value: "shirt_green", category: "Shirts", imagePath: "/sprites/character/outfits/shirt_green.png" },
  { id: "shirt_white", label: "Scholar White Shirt", value: "shirt_white", category: "Shirts", imagePath: "/sprites/character/outfits/shirt_white.png" },
];

// ─── 4. Eyewear & Optics (7 Options) ──────────────────────────

export const EYEWEAR_STYLES: TraitOption[] = [
  { id: "none", label: "No Eyewear", value: "none" },
  { id: "eyewear_black_top", label: "Black Top-Frame Glasses", value: "eyewear_black_top", imagePath: "/sprites/character/face/eyewear_black_top.png" },
  { id: "eyewear_blue_top", label: "Cyber Blue Frames", value: "eyewear_blue_top", imagePath: "/sprites/character/face/eyewear_blue_top.png" },
  { id: "eyewear_red_top", label: "Crimson Reading Glasses", value: "eyewear_red_top", imagePath: "/sprites/character/face/eyewear_red_top.png" },
  { id: "eyewear_white_top", label: "White Wireframes", value: "eyewear_white_top", imagePath: "/sprites/character/face/eyewear_white_top.png" },
  { id: "eyewear_black_half", label: "Half-Moon Wireframes", value: "eyewear_black_half", imagePath: "/sprites/character/face/eyewear_black_half.png" },
  { id: "eyewear_cyber_visor", label: "Aether Tactical Visor", value: "eyewear_cyber_visor", imagePath: "/sprites/character/face/eyewear_cyber_visor.png" },
];

// ─── 5. Headgear & Accessories (8 Options) ────────────────────

export const ACCESSORY_STYLES: TraitOption[] = [
  { id: "none", label: "No Headgear", value: "none" },
  { id: "headgear_bard_beret", label: "Scholar Beret", value: "headgear_bard_beret", imagePath: "/sprites/character/accessories/headgear_bard_beret.png" },
  { id: "headgear_shadow_cowl", label: "Shadow Assassin Cowl", value: "headgear_shadow_cowl", imagePath: "/sprites/character/accessories/headgear_shadow_cowl.png" },
  { id: "headgear_dandy_tophat", label: "Noble Top Hat", value: "headgear_dandy_tophat", imagePath: "/sprites/character/accessories/headgear_dandy_tophat.png" },
  { id: "headband_black", label: "Combat Focus Headband", value: "headband_black", imagePath: "/sprites/character/accessories/headband_black.png" },
  { id: "headband_blue", label: "Cyber Comm-Headset Band", value: "headband_blue", imagePath: "/sprites/character/accessories/headband_blue.png" },
  { id: "headband_red", label: "Crimson Discipline Band", value: "headband_red", imagePath: "/sprites/character/accessories/headband_red.png" },
  { id: "circlet_heroic", label: "Heroic Scholar Circlet", value: "circlet_heroic", imagePath: "/sprites/character/accessories/circlet_heroic.png" },
];

// ─── 6. Holographic Auras (6 Options) ─────────────────────────

export const AURA_PRESETS: { id: string; label: string; color: string; glowClass: string }[] = [
  { id: "none", label: "No Aura", color: "transparent", glowClass: "" },
  { id: "aura_monarch", label: "Monarch Purple Surge", color: "#8b5cf6", glowClass: "shadow-[0_0_40px_rgba(139,92,246,0.65)] ring-2 ring-purple-500" },
  { id: "aura_cyber", label: "Cyber Cyan Glow", color: "#06b6d4", glowClass: "shadow-[0_0_40px_rgba(6,182,212,0.65)] ring-2 ring-cyan-400" },
  { id: "aura_emerald", label: "Emerald Focus Shield", color: "#10b981", glowClass: "shadow-[0_0_40px_rgba(16,185,129,0.65)] ring-2 ring-emerald-400" },
  { id: "aura_crimson", label: "Crimson Flame Glow", color: "#ef4444", glowClass: "shadow-[0_0_40px_rgba(239,68,68,0.65)] ring-2 ring-rose-500" },
  { id: "aura_obsidian", label: "Void Obsidian Shadow", color: "#64748b", glowClass: "shadow-[0_0_40px_rgba(100,116,139,0.65)] ring-2 ring-slate-400" },
];

// ─── Deterministic Hash Generator ─────────────────────────────
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Generates a 100% deterministic default character configuration from seed/username.
 */
export function getDefaultCharacterConfig(seed: string = "scholar"): CharacterConfig {
  const hash = simpleHash(seed.toLowerCase());

  const skin = SKIN_TONES[hash % SKIN_TONES.length].value;
  const hairStyle = HAIR_STYLES[hash % HAIR_STYLES.length].value;
  const hairColor = HAIR_COLORS[(hash >> 2) % HAIR_COLORS.length].value;
  const outfit = OUTFIT_STYLES[(hash >> 3) % OUTFIT_STYLES.length].value;
  const aura = AURA_PRESETS[(hash >> 4) % AURA_PRESETS.length].id;

  return {
    skin,
    hairStyle,
    hairColor,
    outfit,
    eyewear: "none",
    accessory: "none",
    aura,
    seed,
  };
}

/**
 * Generates a randomized character configuration with calibrated slot probabilities.
 */
export function generateRandomCharacterConfig(): CharacterConfig {
  const pick = <T extends TraitOption>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const hasEyewear = Math.random() > 0.6;
  const hasAccessory = Math.random() > 0.65;
  const randomSeed = Math.random().toString(36).substring(2, 9);

  return {
    skin: pick(SKIN_TONES).value,
    hairStyle: pick(HAIR_STYLES).value,
    hairColor: pick(HAIR_COLORS).value,
    outfit: pick(OUTFIT_STYLES).value,
    eyewear: hasEyewear ? pick(EYEWEAR_STYLES.filter((e) => e.id !== "none")).value : "none",
    accessory: hasAccessory ? pick(ACCESSORY_STYLES.filter((a) => a.id !== "none")).value : "none",
    aura: AURA_PRESETS[Math.floor(Math.random() * AURA_PRESETS.length)].id,
    seed: randomSeed,
  };
}

/**
 * Helper to compute sprite layer image paths from a CharacterConfig.
 */
export function getSpriteLayers(config?: CharacterConfig | null, seedFallback: string = "scholar") {
  const cfg = config && config.skin ? config : getDefaultCharacterConfig(seedFallback);
  const skinKey = cfg.skin || "fair";
  const hairStyleKey = cfg.hairStyle || "crop";
  const hairColorKey = cfg.hairColor || "black";
  const outfitKey = cfg.outfit || "armor_scholar_robes";
  const eyewearKey = cfg.eyewear || "none";
  const accessoryKey = cfg.accessory || "none";
  const auraKey = cfg.aura || "none";

  // Find hair style option to determine bangs and base indices
  const styleDef = HAIR_STYLES.find((h) => h.value === hairStyleKey) || HAIR_STYLES[0];
  const bangsNum = styleDef.bangs || 1;
  const baseNum = styleDef.base || 1;

  return {
    aura: AURA_PRESETS.find((a) => a.id === auraKey) || AURA_PRESETS[0],
    pedestal: "/sprites/character/pedestals/pedestal_cyber.svg",
    hairBase: `/sprites/character/hair/hair_base_${baseNum}_${hairColorKey}.png`,
    body: `/sprites/character/body/skin_${skinKey}.png`,
    outfit: `/sprites/character/outfits/${outfitKey}.png`,
    eyewear: eyewearKey !== "none" ? `/sprites/character/face/${eyewearKey}.png` : null,
    hairBangs: `/sprites/character/hair/hair_bangs_${bangsNum}_${hairColorKey}.png`,
    accessory: accessoryKey !== "none" ? `/sprites/character/accessories/${accessoryKey}.png` : null,
  };
}
