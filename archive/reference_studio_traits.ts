/**
 * REFERENCE ONLY: Archived Character Studio Trait Definitions & Mock Builds
 * 
 * Saved for reference when designing future PixelLab MCP generation batches.
 */

export interface ReferenceTraitOption {
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

export const ARCHIVED_FULL_BODY_FORMS: ReferenceTraitOption[] = [
  {
    id: "form_recruit_tier1",
    label: "Hunter Recruit",
    value: "default_hunter",
    tier: 1,
    rarity: "COMMON",
    requiredRank: "RANK E",
    requiredLevel: 1,
    description: "Athletic hunter recruit base model generated with custom 2D pixel anatomy.",
    imagePath: "/sprites/character/forms/default_hunter.png",
  },
  {
    id: "form_shadow_tier2",
    label: "Shadow Apprentice",
    value: "form_shadow_tier2",
    tier: 2,
    rarity: "RARE",
    requiredRank: "RANK D",
    requiredLevel: 5,
    description: "Tactical techwear stealth form designed for high-velocity dungeon raids.",
    imagePath: "/sprites/character/forms/form_shadow_tier2.png",
  },
  {
    id: "form_scholar_tier3",
    label: "Arcane Scholar",
    value: "form_scholar_tier3",
    tier: 3,
    rarity: "EPIC",
    requiredRank: "RANK C",
    requiredLevel: 15,
    description: "Grand Scholar Robes woven from high-density mana-conducting weave.",
    imagePath: "/sprites/character/forms/form_scholar_tier3.png",
  },
  {
    id: "form_paladin_tier4",
    label: "Paladin Aegis",
    value: "form_paladin_tier4",
    tier: 4,
    rarity: "LEGENDARY",
    requiredRank: "RANK A",
    requiredLevel: 30,
    description: "Reinforced alloy plate armor radiating unbreakable concentration.",
    imagePath: "/sprites/character/forms/form_paladin_tier4.png",
  },
  {
    id: "form_monarch_tier5",
    label: "Shadow Monarch",
    value: "form_monarch_tier5",
    tier: 5,
    rarity: "MYTHIC",
    requiredRank: "RANK S",
    requiredLevel: 50,
    description: "Transcendent sovereign battle form forged in the abyssal void.",
    imagePath: "/sprites/character/forms/form_monarch_tier5.png",
  },
];

export const ARCHIVED_PEDESTALS: ReferenceTraitOption[] = [
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
  {
    id: "pedestal_monarch",
    label: "Monarch Surge",
    value: "pedestal_monarch",
    tier: 4,
    rarity: "LEGENDARY",
    requiredRank: "RANK A",
    requiredLevel: 25,
    description: "Electric violet particle platform resonant with monarch authority.",
    imagePath: "/sprites/character/pedestals/pedestal_monarch.svg",
  },
  {
    id: "pedestal_shadow",
    label: "Void Shadow",
    value: "pedestal_shadow",
    tier: 5,
    rarity: "MYTHIC",
    requiredRank: "RANK S",
    requiredLevel: 45,
    description: "Dark matter circular pedestal pulsing with deep void energy.",
    imagePath: "/sprites/character/pedestals/pedestal_shadow.svg",
  },
];

export const ARCHIVED_AURAS = [
  {
    id: "none",
    label: "No Aura",
    color: "transparent",
    glowClass: "",
    tier: 1,
    rarity: "COMMON" as const,
    requiredRank: "RANK E",
    requiredLevel: 1,
  },
  {
    id: "aura_cyber",
    label: "Cyber Cyan Glow",
    color: "#06b6d4",
    glowClass: "shadow-[0_0_40px_rgba(6,182,212,0.65)] ring-2 ring-cyan-400",
    tier: 2,
    rarity: "RARE" as const,
    requiredRank: "RANK D",
    requiredLevel: 10,
  },
  {
    id: "aura_emerald",
    label: "Emerald Focus Shield",
    color: "#10b981",
    glowClass: "shadow-[0_0_40px_rgba(16,185,129,0.65)] ring-2 ring-emerald-400",
    tier: 2,
    rarity: "RARE" as const,
    requiredRank: "RANK D",
    requiredLevel: 15,
  },
  {
    id: "aura_crimson",
    label: "Crimson Flame Glow",
    color: "#ef4444",
    glowClass: "shadow-[0_0_40px_rgba(239,68,68,0.65)] ring-2 ring-rose-500",
    tier: 3,
    rarity: "EPIC" as const,
    requiredRank: "RANK C",
    requiredLevel: 25,
  },
  {
    id: "aura_monarch",
    label: "Monarch Purple Surge",
    color: "#8b5cf6",
    glowClass: "shadow-[0_0_40px_rgba(139,92,246,0.65)] ring-2 ring-purple-500",
    tier: 4,
    rarity: "LEGENDARY" as const,
    requiredRank: "RANK A",
    requiredLevel: 35,
  },
  {
    id: "aura_obsidian",
    label: "Void Obsidian Shadow",
    color: "#64748b",
    glowClass: "shadow-[0_0_40px_rgba(100,116,139,0.65)] ring-2 ring-slate-400",
    tier: 5,
    rarity: "MYTHIC" as const,
    requiredRank: "RANK S",
    requiredLevel: 50,
  },
];

export const ARCHIVED_RELICS: ReferenceTraitOption[] = [
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
  {
    id: "weapon_obsidian_edge",
    label: "Obsidian Edge",
    value: "weapon_obsidian_edge",
    tier: 2,
    rarity: "RARE",
    requiredRank: "RANK D",
    requiredLevel: 8,
    description: "A finely honed shadow dagger radiating acute precision.",
    imagePath: "/sprites/character/relics/weapon_obsidian_edge.png",
  },
  {
    id: "relic_chrono_hourglass",
    label: "Chrono Hourglass",
    value: "relic_chrono_hourglass",
    tier: 3,
    rarity: "EPIC",
    requiredRank: "RANK C",
    requiredLevel: 20,
    description: "Temporal artifact providing focus time stabilization.",
    imagePath: "/sprites/character/relics/relic_chrono_hourglass.png",
  },
  {
    id: "weapon_asura_greatsword",
    label: "Asura Greatsword",
    value: "weapon_asura_greatsword",
    tier: 4,
    rarity: "LEGENDARY",
    requiredRank: "RANK A",
    requiredLevel: 35,
    description: "Massive dark-steel blade commanding battlefield authority.",
    imagePath: "/sprites/character/relics/weapon_asura_greatsword.png",
  },
  {
    id: "relic_eternity_core",
    label: "Eternity Core",
    value: "relic_eternity_core",
    tier: 5,
    rarity: "MYTHIC",
    requiredRank: "RANK S",
    requiredLevel: 50,
    description: "Transcendent crystalline nucleus humming with perpetual mana.",
    imagePath: "/sprites/character/relics/relic_eternity_core.png",
  },
];
