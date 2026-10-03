import { RANK_LADDER } from "./game-engine";

export type Rarity = "Common" | "Rare" | "Epic" | "Legendary" | "Mythic";
export type AchievementCategory =
  | "Study"
  | "Subjects"
  | "Streaks"
  | "Rank"
  | "Social"
  | "Quests"
  | "Planning"
  | "Exploration";
export type AchievementMetric =
  | "sessions"
  | "studyMinutes"
  | "streakWeeks"
  | "level"
  | "friends"
  | "quests"
  | "subjects"
  | "plans"
  | "partySessions"
  | "backgrounds"
  | "items"
  | "sylphSpent";
export interface RewardDef {
  type: "SYLPH" | "XP";
  amount: number;
}
export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  metric: AchievementMetric;
  title: string;
  description: string;
  rarity: Rarity;
  target: number;
  reward: RewardDef;
}
export type EnrichedAchievement = AchievementDef & {
  currentProgress: number;
  isClaimed: boolean;
};
export const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  "Study",
  "Subjects",
  "Streaks",
  "Rank",
  "Quests",
  "Planning",
  "Social",
  "Exploration",
];

export function rankTitle(rank: string) {
  return rank.length === 1
    ? `${rank}-Rank`
    : rank === "NATIONAL"
      ? "National Hunter"
      : "Monarch";
}

function milestone(
  id: string,
  category: AchievementCategory,
  metric: AchievementMetric,
  title: string,
  description: string,
  target: number,
  rarity: Rarity,
  amount: number,
  type: RewardDef["type"] = "SYLPH"
): AchievementDef {
  return {
    id,
    category,
    metric,
    title,
    description,
    target,
    rarity,
    reward: { type, amount },
  };
}

// Preserve existing IDs and claim records. Retired theme purchases are omitted from
// the active register. Retired item rewards now pay currency via the atomic reward RPC.
export const ACHIEVEMENTS_CATALOG: AchievementDef[] = [
  milestone(
    "study_first_session",
    "Study",
    "sessions",
    "First Session",
    "Finish a study session with at least one minute of recorded focus.",
    1,
    "Common",
    50,
    "XP"
  ),
  ...([1, 10, 100, 500, 1000] as const).map((hours, index) =>
    milestone(
      `study_${hours}_${hours === 1 ? "hour" : "hours"}`,
      "Study",
      "studyMinutes",
      `Study ${hours.toLocaleString()} ${hours === 1 ? "hour" : "hours"}`,
      `Record ${hours.toLocaleString()} ${hours === 1 ? "hour" : "hours"} of total focus time.`,
      hours * 60,
      (["Common", "Rare", "Epic", "Legendary", "Mythic"] as Rarity[])[index],
      [50, 300, 1500, 3500, 5000][index]
    )
  ),
  milestone(
    "subject_first",
    "Subjects",
    "subjects",
    "A Place to Begin",
    "Create your first study subject in the Timer.",
    1,
    "Common",
    50,
    "XP"
  ),
  milestone(
    "subject_three",
    "Subjects",
    "subjects",
    "Across Disciplines",
    "Create three study subjects.",
    3,
    "Rare",
    150
  ),
  // streakDays is a compatibility name: it stores consecutive weeks.
  ...([3, 7, 30, 100] as const).map((weeks, index) =>
    milestone(
      `streak_${weeks}_day`,
      "Streaks",
      "streakWeeks",
      `${weeks} week streak`,
      `Complete the weekly focus milestone for ${weeks} consecutive weeks.`,
      weeks,
      (["Common", "Rare", "Epic", "Legendary"] as Rarity[])[index],
      [100, 400, 2000, 3500][index]
    )
  ),
  ...[...RANK_LADDER]
    .reverse()
    .slice(1)
    .map((rank, index) =>
      milestone(
        `rank_${rank.display.toLowerCase()}`,
        "Rank",
        "level",
        `Reach ${rankTitle(rank.display)}`,
        `Reach Level ${rank.level} and attain ${rankTitle(rank.display)} standing.`,
        rank.level,
        (
          [
            "Common",
            "Rare",
            "Epic",
            "Legendary",
            "Mythic",
            "Mythic",
            "Mythic",
          ] as Rarity[]
        )[index],
        [200, 500, 1000, 3000, 5000, 6500, 8000][index]
      )
    ),
  milestone(
    "social_first_friend",
    "Social",
    "friends",
    "First Connection",
    "Add a friend to your study circle.",
    1,
    "Common",
    50
  ),
  milestone(
    "social_10_friends",
    "Social",
    "friends",
    "Study Circle",
    "Build a circle of ten friends.",
    10,
    "Rare",
    300
  ),
  milestone(
    "social_party_session",
    "Social",
    "partySessions",
    "Together in Focus",
    "Finish a Focus Party session with at least one minute of personal focus.",
    1,
    "Common",
    100
  ),
  ...[10, 100, 500, 1000].map((count, index) =>
    milestone(
      index === 3 ? "quest_legendary" : `quest_${count}`,
      "Quests",
      "quests",
      `Complete ${count.toLocaleString()} quests`,
      `Complete ${count.toLocaleString()} quests across your objectives and study plans.`,
      count,
      (["Common", "Rare", "Epic", "Mythic"] as Rarity[])[index],
      [150, 800, 2500, 5000][index]
    )
  ),
  milestone(
    "planning_first",
    "Planning",
    "plans",
    "From Plan to Practice",
    "Confirm your first Planner Modes plan and create its quests.",
    1,
    "Common",
    100
  ),
  milestone(
    "planning_five",
    "Planning",
    "plans",
    "A Steady Direction",
    "Confirm five Exam, Roadmap, or Mastery plans.",
    5,
    "Rare",
    300
  ),
  milestone(
    "exploration_background",
    "Exploration",
    "backgrounds",
    "Your Own Sanctuary",
    "Save a personal focus background to your gallery.",
    1,
    "Common",
    50,
    "XP"
  ),
  milestone(
    "exploration_inventory",
    "Exploration",
    "items",
    "First Acquisition",
    "Own an item in your Locker inventory.",
    1,
    "Common",
    50,
    "XP"
  ),
  milestone(
    "exploration_spend_100",
    "Exploration",
    "sylphSpent",
    "Spend 100 Sylph",
    "Spend a total of 100 Sylph, including purchases and attribute investments.",
    100,
    "Common",
    200,
    "XP"
  ),
  milestone(
    "exploration_spend_10000",
    "Exploration",
    "sylphSpent",
    "Invested in the Journey",
    "Spend a total of 10,000 Sylph.",
    10000,
    "Epic",
    1500
  ),
];

// Public profile compatibility: all badge hues inherit Sylf's appearance tokens.
export const RARITY_COLORS: Record<Rarity, { main: string; glow: string }> = {
  Common: { main: "var(--text-secondary)", glow: "var(--border-subtle)" },
  Rare: { main: "var(--accent-text)", glow: "var(--accent-primary-dim)" },
  Epic: { main: "var(--accent-text)", glow: "var(--accent-primary-dim)" },
  Legendary: { main: "var(--accent-gold)", glow: "var(--accent-primary-dim)" },
  Mythic: { main: "var(--accent-text)", glow: "var(--accent-primary-dim)" },
};
