export type CosmeticCategory = "THEME" | "BACKGROUND" | "CLASS" | "AVATAR" | "FRAME" | "TITLE" | "NAME_COLOR";
export type Rarity = "Common" | "Rare" | "Epic" | "Legendary" | "Mythic";

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  unlockCondition: string;
  value: string; // Image path or glyph
  fallbackIcon?: string;
  bgCategory?: "gradient" | "pattern" | "ambient";
  rarity: Rarity;
  source: string;
}

const CLASS_CATALOG: CosmeticItem[] = [
  {
    id: "class_scholar",
    category: "CLASS",
    name: "Scholar",
    description: "The archetype of relentless dedication. Excels at knowledge retention, structured review cycles, and foundational mastery.",
    unlockCondition: "Default",
    value: "/classes/scholar.png",
    fallbackIcon: "📖",
    rarity: "Common",
    source: "Base System",
  },
  {
    id: "class_analyst",
    category: "CLASS",
    name: "Analyst",
    description: "Master of dissection and data. Detects hidden patterns, optimizes study efficiency, and breaks down complex problems.",
    unlockCondition: "Default",
    value: "/classes/analyst.png",
    fallbackIcon: "📊",
    rarity: "Common",
    source: "Base System",
  },
  {
    id: "class_engineer",
    category: "CLASS",
    name: "Engineer",
    description: "Architect of workflows and systems. Constructs structured learning pipelines and transforms theory into functional mechanics.",
    unlockCondition: "Default",
    value: "/classes/engineer.png",
    fallbackIcon: "⚙️",
    rarity: "Common",
    source: "Base System",
  },
  {
    id: "class_scientist",
    category: "CLASS",
    name: "Scientist",
    description: "The empirical explorer. Driven by hypothesis testing, rigorous experimentation, and unyielding intellectual curiosity.",
    unlockCondition: "Default",
    value: "/classes/scientist.png",
    fallbackIcon: "🔬",
    rarity: "Common",
    source: "Base System",
  },
  {
    id: "class_researcher",
    category: "CLASS",
    name: "Researcher",
    description: "The deep-diver into source literature. Synthesizes disparate knowledge domains and unearths obscure breakthroughs.",
    unlockCondition: "Default",
    value: "/classes/researcher.png",
    fallbackIcon: "🧭",
    rarity: "Common",
    source: "Base System",
  },
  {
    id: "class_psychologist",
    category: "CLASS",
    name: "Psychologist",
    description: "Master of cognition and mental endurance. Regulates focus states, unlocks peak flow, and masters mental resilience.",
    unlockCondition: "Default",
    value: "/classes/psychologist.png",
    fallbackIcon: "🧠",
    rarity: "Common",
    source: "Base System",
  },
  {
    id: "class_strategist",
    category: "CLASS",
    name: "Strategist",
    description: "The long-term tactician. Plans study campaigns, forecasts milestones, and executes goal trajectories with precision.",
    unlockCondition: "Default",
    value: "/classes/strategist.png",
    fallbackIcon: "♟️",
    rarity: "Common",
    source: "Base System",
  },
  {
    id: "class_creative",
    category: "CLASS",
    name: "Creative",
    description: "The intuitive innovator. Bridges disparate concepts with lateral thinking, unorthodox insights, and imaginative leaps.",
    unlockCondition: "Default",
    value: "/classes/creative.png",
    fallbackIcon: "✨",
    rarity: "Common",
    source: "Base System",
  },
];

export const COSMETICS_CATALOG: Record<CosmeticCategory, CosmeticItem[]> = {
  THEME: [
    { id: "cyberpunk", category: "THEME", name: "Cyberpunk", description: "The default — electric purple across the entire UI.", unlockCondition: "Default", value: "cyberpunk", rarity: "Common", source: "Base System" },
    { id: "sakura", category: "THEME", name: "Sakura", description: "Soft, elegant pink with warm rose tones.", unlockCondition: "Level 5", value: "sakura", rarity: "Common", source: "Level Reward" },
    { id: "emerald", category: "THEME", name: "Emerald", description: "Deep calming greens for focused concentration.", unlockCondition: "Level 10", value: "emerald", rarity: "Rare", source: "Level Reward" },
    { id: "crimson", category: "THEME", name: "Crimson", description: "Intense fiery reds for high-energy sessions.", unlockCondition: "E-Rank", value: "crimson", rarity: "Rare", source: "Rank Reward" },
    { id: "amber", category: "THEME", name: "Amber", description: "Warm, prestigious tones of gold — rewarding and bold.", unlockCondition: "B-Rank", value: "amber", rarity: "Epic", source: "Rank Reward" },
    { id: "abyss", category: "THEME", name: "Abyss", description: "Ultra-cool indigo for immersive deep work.", unlockCondition: "S-Rank", value: "abyss", rarity: "Mythic", source: "Rank Reward" },
    { id: "volt", category: "THEME", name: "Volt", description: "Electric lime — high-voltage energy for sprint sessions.", unlockCondition: "A-Rank", value: "volt", rarity: "Legendary", source: "Rank Reward" },
    { id: "plasma", category: "THEME", name: "Plasma", description: "Hot magenta — a neon glow for pumping sessions.", unlockCondition: "S-Rank", value: "plasma", rarity: "Mythic", source: "Rank Reward" },
    { id: "glacier", category: "THEME", name: "Glacier", description: "Icy cyan — crisp, cold and razor sharp focus.", unlockCondition: "B-Rank", value: "glacier", rarity: "Epic", source: "Rank Reward" },
    { id: "solar", category: "THEME", name: "Solar", description: "Vivid orange — a burning drive for long grind sessions.", unlockCondition: "A-Rank", value: "solar", rarity: "Legendary", source: "Rank Reward" },
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
  CLASS: CLASS_CATALOG,
  AVATAR: CLASS_CATALOG, // Backward compatibility alias
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
    { id: "color_purple", category: "NAME_COLOR", name: "Shadow Purple", description: "Deep monarch purple.", unlockCondition: "Level 10", value: "text-accent-primary font-bold drop-shadow-[0_0_5px_var(--accent-primary)]", rarity: "Epic", source: "Level Reward" },
  ]
};

export const LEGACY_CLASS_MAP: Record<string, string> = {
  avatar_default: "class_scholar",
  avatar_shadow: "class_strategist",
  avatar_monarch: "class_analyst",
  default: "class_scholar",
};

export function getClassInfo(id?: string | null): CosmeticItem {
  const safeId = id ? (LEGACY_CLASS_MAP[id] || id) : "class_scholar";
  const found = CLASS_CATALOG.find((c) => c.id === safeId);
  return found || CLASS_CATALOG[0];
}
