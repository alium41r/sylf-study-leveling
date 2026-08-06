export type Rarity = "Common" | "Rare" | "Epic" | "Legendary" | "Mythic";

export interface RewardDef {
  type: "SYLPH" | "ITEM" | "XP";
  amount: number;
  itemKey?: string; // If type is ITEM
}

export interface AchievementDef {
  id: string;
  category: "Study" | "Subjects" | "Streaks" | "Rank" | "Social" | "Quests" | "Exploration";
  title: string;
  description: string;
  rarity: Rarity;
  target: number; // The target value for progress
  reward: RewardDef;
}

export const ACHIEVEMENTS_CATALOG: AchievementDef[] = [
  // --- STUDY ---
  {
    id: "study_first_session",
    category: "Study",
    title: "First Session",
    description: "Complete your very first study session.",
    rarity: "Common",
    target: 1, // 1 session
    reward: { type: "XP", amount: 50 },
  },
  {
    id: "study_1_hour",
    category: "Study",
    title: "Study 1 hour",
    description: "Accumulate a total of 1 hour of study time.",
    rarity: "Common",
    target: 60, // 60 minutes
    reward: { type: "SYLPH", amount: 50 },
  },
  {
    id: "study_10_hours",
    category: "Study",
    title: "Study 10 hours",
    description: "Accumulate a total of 10 hours of study time.",
    rarity: "Rare",
    target: 600,
    reward: { type: "SYLPH", amount: 300 },
  },
  {
    id: "study_100_hours",
    category: "Study",
    title: "Study 100 hours",
    description: "Accumulate a total of 100 hours of study time.",
    rarity: "Epic",
    target: 6000,
    reward: { type: "SYLPH", amount: 1500 },
  },
  {
    id: "study_500_hours",
    category: "Study",
    title: "Study 500 hours",
    description: "Accumulate a total of 500 hours of study time.",
    rarity: "Legendary",
    target: 30000,
    reward: { type: "ITEM", itemKey: "ELIXIR_OF_INSIGHT", amount: 1 },
  },
  {
    id: "study_1000_hours",
    category: "Study",
    title: "Study 1000 hours",
    description: "The ultimate dedication. 1000 hours of focused study.",
    rarity: "Mythic",
    target: 60000,
    reward: { type: "ITEM", itemKey: "KAMISH_WARD", amount: 3 },
  },

  // --- STREAKS ---
  {
    id: "streak_3_day",
    category: "Streaks",
    title: "3 day streak",
    description: "Maintain a study streak for 3 consecutive days.",
    rarity: "Common",
    target: 3,
    reward: { type: "SYLPH", amount: 100 },
  },
  {
    id: "streak_7_day",
    category: "Streaks",
    title: "7 day streak",
    description: "Maintain a study streak for 7 consecutive days.",
    rarity: "Rare",
    target: 7,
    reward: { type: "SYLPH", amount: 400 },
  },
  {
    id: "streak_30_day",
    category: "Streaks",
    title: "30 day streak",
    description: "Maintain a study streak for 30 consecutive days.",
    rarity: "Epic",
    target: 30,
    reward: { type: "SYLPH", amount: 2000 },
  },
  {
    id: "streak_100_day",
    category: "Streaks",
    title: "100 day streak",
    description: "Maintain a study streak for 100 consecutive days.",
    rarity: "Legendary",
    target: 100,
    reward: { type: "ITEM", itemKey: "GATE_KEY_RED", amount: 1 },
  },

  // --- RANK ---
  {
    id: "rank_d",
    category: "Rank",
    title: "Reach D Rank",
    description: "Ascend to D Rank Hunter status.",
    rarity: "Common",
    target: 2, // Rank mappings: E=1, D=2, C=3, B=4, A=5, S=6
    reward: { type: "SYLPH", amount: 200 },
  },
  {
    id: "rank_c",
    category: "Rank",
    title: "Reach C Rank",
    description: "Ascend to C Rank Hunter status.",
    rarity: "Rare",
    target: 3,
    reward: { type: "SYLPH", amount: 500 },
  },
  {
    id: "rank_b",
    category: "Rank",
    title: "Reach B Rank",
    description: "Ascend to B Rank Hunter status.",
    rarity: "Epic",
    target: 4,
    reward: { type: "SYLPH", amount: 1000 },
  },
  {
    id: "rank_a",
    category: "Rank",
    title: "Reach A Rank",
    description: "Ascend to A Rank Hunter status.",
    rarity: "Legendary",
    target: 5,
    reward: { type: "SYLPH", amount: 3000 },
  },
  {
    id: "rank_s",
    category: "Rank",
    title: "Reach S Rank",
    description: "Achieve the absolute pinnacle. S Rank Hunter.",
    rarity: "Mythic",
    target: 6,
    reward: { type: "ITEM", itemKey: "SHADOW_EXTRACTION", amount: 1 },
  },

  // --- SOCIAL ---
  {
    id: "social_first_friend",
    category: "Social",
    title: "Add first friend",
    description: "Make a connection and add a friend.",
    rarity: "Common",
    target: 1,
    reward: { type: "SYLPH", amount: 50 },
  },
  {
    id: "social_10_friends",
    category: "Social",
    title: "Guild Master",
    description: "Gather 10 friends.",
    rarity: "Rare",
    target: 10,
    reward: { type: "SYLPH", amount: 300 },
  },

  // --- QUESTS ---
  {
    id: "quest_10",
    category: "Quests",
    title: "Complete 10 quests",
    description: "Finish 10 system quests.",
    rarity: "Common",
    target: 10,
    reward: { type: "SYLPH", amount: 150 },
  },
  {
    id: "quest_100",
    category: "Quests",
    title: "100 quests",
    description: "Finish 100 system quests.",
    rarity: "Rare",
    target: 100,
    reward: { type: "SYLPH", amount: 800 },
  },
  {
    id: "quest_500",
    category: "Quests",
    title: "500 quests",
    description: "Finish 500 system quests.",
    rarity: "Epic",
    target: 500,
    reward: { type: "SYLPH", amount: 2500 },
  },
  {
    id: "quest_legendary",
    category: "Quests",
    title: "Legendary Quest",
    description: "Complete a total of 1000 quests.",
    rarity: "Mythic",
    target: 1000,
    reward: { type: "ITEM", itemKey: "SHADOW_EXTRACTION", amount: 2 },
  },

  // --- EXPLORATION ---
  {
    id: "exploration_theme",
    category: "Exploration",
    title: "Buy first theme",
    description: "Acquire or equip your first custom theme.",
    rarity: "Common",
    target: 1, // Number of cosmetics > 0
    reward: { type: "SYLPH", amount: 100 },
  },
  {
    id: "exploration_spend_100",
    category: "Exploration",
    title: "Spend 100 Sylph",
    description: "Spend your first 100 Sylph in the System Shop.",
    rarity: "Common",
    target: 100,
    reward: { type: "XP", amount: 200 },
  },
  {
    id: "exploration_spend_10000",
    category: "Exploration",
    title: "Big Spender",
    description: "Spend a total of 10,000 Sylph.",
    rarity: "Epic",
    target: 10000,
    reward: { type: "ITEM", itemKey: "ELIXIR_OF_INSIGHT", amount: 1 },
  }
];

export const RARITY_COLORS: Record<Rarity, { main: string, glow: string }> = {
  Common: { main: "#22c55e", glow: "rgba(34, 197, 94, 0.2)" },      // Green
  Rare: { main: "#3b82f6", glow: "rgba(59, 130, 246, 0.2)" },        // Blue
  Epic: { main: "#a855f7", glow: "rgba(168, 85, 247, 0.2)" },        // Purple
  Legendary: { main: "#f97316", glow: "rgba(249, 115, 22, 0.2)" },   // Orange
  Mythic: { main: "#eab308", glow: "rgba(234, 179, 8, 0.25)" },      // Gold
};
