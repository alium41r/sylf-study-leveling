export type CosmeticCategory = "THEME" | "BACKGROUND" | "AVATAR" | "FRAME" | "TITLE" | "NAME_COLOR";
export type Rarity = "Common" | "Rare" | "Epic" | "Legendary" | "Mythic";

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  unlockCondition: string; // e.g., "Level 5", "E-Rank", "Default"
  value: string; // the CSS class, image URL, or hex code
  bgCategory?: "gradient" | "pattern" | "ambient"; // for backgrounds
  rarity: Rarity;
  source: string; // e.g., "Base System", "Level Reward", "Rank Reward", "Achievement"
}

export const COSMETICS_CATALOG: Record<CosmeticCategory, CosmeticItem[]> = {
  THEME: [
    { id: "cyberpunk", category: "THEME", name: "Cyberpunk", description: "The default — electric purple across the entire UI.", unlockCondition: "Default", value: "cyberpunk", rarity: "Common", source: "Base System" },
    { id: "sakura", category: "THEME", name: "Sakura", description: "Soft, elegant pink with warm rose tones.", unlockCondition: "Level 5", value: "sakura", rarity: "Common", source: "Level Reward" },
    { id: "emerald", category: "THEME", name: "Emerald", description: "Deep calming greens for focused concentration.", unlockCondition: "Level 10", value: "emerald", rarity: "Rare", source: "Level Reward" },
    { id: "crimson", category: "THEME", name: "Crimson", description: "Intense fiery reds for high-energy sessions.", unlockCondition: "E-Rank", value: "crimson", rarity: "Rare", source: "Rank Reward" },
    { id: "amber", category: "THEME", name: "Amber", description: "Warm, prestigious tones of gold — rewarding and bold.", unlockCondition: "B-Rank", value: "amber", rarity: "Epic", source: "Rank Reward" },
    { id: "abyss", category: "THEME", name: "Abyss", description: "Ultra-cool indigo for immersive deep work.", unlockCondition: "S-Rank", value: "abyss", rarity: "Mythic", source: "Rank Reward" },
  ],
  BACKGROUND: [
    { id: "void", category: "BACKGROUND", name: "The Void", description: "Pure, distraction-free darkness. The original.", unlockCondition: "Default", value: "void", bgCategory: "gradient", rarity: "Common", source: "Base System" },
    { id: "cyber-grid", category: "BACKGROUND", name: "Cyber Grid", description: "Tron-inspired digital grid lines pulsing beneath the surface.", unlockCondition: "Level 5", value: "cyber-grid", bgCategory: "pattern", rarity: "Common", source: "Level Reward" },
    { id: "sakura-fall", category: "BACKGROUND", name: "Sakura Dusk", description: "A warm rose glow fading into the dark — gentle and meditative.", unlockCondition: "Level 10", value: "sakura-fall", bgCategory: "ambient", rarity: "Rare", source: "Level Reward" },
    { id: "abyssal-glow", category: "BACKGROUND", name: "Abyssal Glow", description: "A deep purple nebula radiating from the center of the screen.", unlockCondition: "E-Rank", value: "abyssal-glow", bgCategory: "ambient", rarity: "Rare", source: "Rank Reward" },
    { id: "neon-sunrise", category: "BACKGROUND", name: "Neon Sunrise", description: "Fiery warm tones rising from the bottom edge — dawn of a new session.", unlockCondition: "D-Rank", value: "neon-sunrise", bgCategory: "gradient", rarity: "Rare", source: "Rank Reward" },
    { id: "matrix-rain", category: "BACKGROUND", name: "Digital Rain", description: "Subtle cascading green lines — pure hacker aesthetic.", unlockCondition: "C-Rank", value: "matrix-rain", bgCategory: "pattern", rarity: "Epic", source: "Rank Reward" },
    { id: "aurora-borealis", category: "BACKGROUND", name: "Aurora Borealis", description: "Shimmering cyan and purple light drifting across the northern sky.", unlockCondition: "B-Rank", value: "aurora-borealis", bgCategory: "ambient", rarity: "Legendary", source: "Rank Reward" },
    { id: "deep-ocean", category: "BACKGROUND", name: "Deep Ocean", description: "Cool blue bioluminescence glowing from the ocean floor.", unlockCondition: "A-Rank", value: "deep-ocean", bgCategory: "ambient", rarity: "Legendary", source: "Rank Reward" },
  ],
  AVATAR: [
    { id: "avatar_default", category: "AVATAR", name: "Rookie", description: "Standard issue avatar.", unlockCondition: "Default", value: "👤", rarity: "Common", source: "Base System" },
    { id: "avatar_shadow", category: "AVATAR", name: "Shadow Soldier", description: "Arise.", unlockCondition: "Level 5", value: "🥷", rarity: "Rare", source: "Level Reward" },
    { id: "avatar_monarch", category: "AVATAR", name: "Monarch", description: "The ruler of shadows.", unlockCondition: "S-Rank", value: "👑", rarity: "Mythic", source: "Rank Reward" },
  ],
  FRAME: [
    { id: "frame_default", category: "FRAME", name: "None", description: "No frame.", unlockCondition: "Default", value: "none", rarity: "Common", source: "Base System" },
    { id: "frame_iron", category: "FRAME", name: "Iron Frame", description: "A sturdy iron border.", unlockCondition: "E-Rank", value: "border-2 border-gray-400", rarity: "Rare", source: "Rank Reward" },
    { id: "frame_gold", category: "FRAME", name: "Gold Frame", description: "A glowing golden border.", unlockCondition: "B-Rank", value: "border-2 border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]", rarity: "Epic", source: "Rank Reward" },
  ],
  TITLE: [
    { id: "title_novice", category: "TITLE", name: "Novice", description: "Just starting out.", unlockCondition: "Default", value: "Novice", rarity: "Common", source: "Base System" },
    { id: "title_scholar", category: "TITLE", name: "Scholar", description: "Dedicated to the books.", unlockCondition: "Level 5", value: "Scholar", rarity: "Rare", source: "Level Reward" },
    { id: "title_hunter", category: "TITLE", name: "Hunter", description: "Preying on deadlines.", unlockCondition: "C-Rank", value: "Hunter", rarity: "Epic", source: "Rank Reward" },
  ],
  NAME_COLOR: [
    { id: "color_default", category: "NAME_COLOR", name: "Standard", description: "Default name color.", unlockCondition: "Default", value: "text-gray-300", rarity: "Common", source: "Base System" },
    { id: "color_cyan", category: "NAME_COLOR", name: "System Cyan", description: "A bright cyan glow.", unlockCondition: "Level 3", value: "text-cyan-400 font-bold drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]", rarity: "Rare", source: "Level Reward" },
    { id: "color_purple", category: "NAME_COLOR", name: "Shadow Purple", description: "Deep monarch purple.", unlockCondition: "Level 10", value: "text-purple-500 font-bold drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]", rarity: "Epic", source: "Level Reward" },
  ]
};
