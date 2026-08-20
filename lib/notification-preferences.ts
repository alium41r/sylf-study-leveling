import { z } from "zod";

export interface NotificationPreferences {
  masterEnabled: boolean;

  // Progression & Milestones
  levelRankPromotions: boolean;
  streakMilestones: boolean;
  unlockedAchievements: boolean;

  // Study & Quest Management
  aiStudyPlans: boolean;
  questAssignments: boolean;
  scheduledFocusReminders: boolean;

  // Social & Community
  incomingFriendRequests: boolean;
  directMessages: boolean;
  groupActivity: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  masterEnabled: true,

  // Progression & Milestones
  levelRankPromotions: true,
  streakMilestones: true,
  unlockedAchievements: true,

  // Study & Quest Management
  aiStudyPlans: true,
  questAssignments: true,
  scheduledFocusReminders: true,

  // Social & Community
  incomingFriendRequests: true,
  directMessages: true,
  groupActivity: true,
};

export const NotificationPreferencesSchema = z.object({
  masterEnabled: z.boolean().optional(),
  levelRankPromotions: z.boolean().optional(),
  streakMilestones: z.boolean().optional(),
  unlockedAchievements: z.boolean().optional(),
  aiStudyPlans: z.boolean().optional(),
  questAssignments: z.boolean().optional(),
  scheduledFocusReminders: z.boolean().optional(),
  incomingFriendRequests: z.boolean().optional(),
  directMessages: z.boolean().optional(),
  groupActivity: z.boolean().optional(),
});

/**
 * Merges raw stored JSON preferences with system defaults to guarantee
 * all boolean keys are safely defined and typed.
 */
export function sanitizeNotificationPreferences(raw: unknown): NotificationPreferences {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  const data = raw as Record<string, unknown>;

  return {
    masterEnabled: typeof data.masterEnabled === "boolean" ? data.masterEnabled : DEFAULT_NOTIFICATION_PREFERENCES.masterEnabled,
    levelRankPromotions: typeof data.levelRankPromotions === "boolean" ? data.levelRankPromotions : DEFAULT_NOTIFICATION_PREFERENCES.levelRankPromotions,
    streakMilestones: typeof data.streakMilestones === "boolean" ? data.streakMilestones : DEFAULT_NOTIFICATION_PREFERENCES.streakMilestones,
    unlockedAchievements: typeof data.unlockedAchievements === "boolean" ? data.unlockedAchievements : DEFAULT_NOTIFICATION_PREFERENCES.unlockedAchievements,
    aiStudyPlans: typeof data.aiStudyPlans === "boolean" ? data.aiStudyPlans : DEFAULT_NOTIFICATION_PREFERENCES.aiStudyPlans,
    questAssignments: typeof data.questAssignments === "boolean" ? data.questAssignments : DEFAULT_NOTIFICATION_PREFERENCES.questAssignments,
    scheduledFocusReminders: typeof data.scheduledFocusReminders === "boolean" ? data.scheduledFocusReminders : DEFAULT_NOTIFICATION_PREFERENCES.scheduledFocusReminders,
    incomingFriendRequests: typeof data.incomingFriendRequests === "boolean" ? data.incomingFriendRequests : DEFAULT_NOTIFICATION_PREFERENCES.incomingFriendRequests,
    directMessages: typeof data.directMessages === "boolean" ? data.directMessages : DEFAULT_NOTIFICATION_PREFERENCES.directMessages,
    groupActivity: typeof data.groupActivity === "boolean" ? data.groupActivity : DEFAULT_NOTIFICATION_PREFERENCES.groupActivity,
  };
}

/**
 * Checks whether a notification of a given type and content should be displayed
 * according to the user's active notification preferences.
 */
export function isNotificationAllowed(
  type: string,
  content: string = "",
  prefs: NotificationPreferences
): boolean {
  if (!prefs.masterEnabled) {
    return false;
  }

  const upperType = (type || "").toUpperCase();
  const lowerContent = (content || "").toLowerCase();

  // 1. Level & Rank Promotions
  if (
    upperType === "LEVEL_UP" ||
    lowerContent.includes("level up") ||
    lowerContent.includes("promoted to rank") ||
    lowerContent.includes("rank promotion") ||
    lowerContent.includes("rank up")
  ) {
    return prefs.levelRankPromotions;
  }

  // 2. Daily & Weekly Streaks
  if (
    upperType === "STREAK" ||
    lowerContent.includes("streak") ||
    lowerContent.includes("weekly mission") ||
    lowerContent.includes("weekly quest")
  ) {
    return prefs.streakMilestones;
  }

  // 3. Unlocked Achievements & Titles
  if (
    upperType === "REWARD" ||
    upperType === "ACHIEVEMENT" ||
    lowerContent.includes("[achievement]") ||
    lowerContent.includes("achievement") ||
    lowerContent.includes("title unlocked")
  ) {
    return prefs.unlockedAchievements;
  }

  // 4. AI Study Plans
  if (
    lowerContent.includes("[quota:ai_planner]") ||
    lowerContent.includes("[ai_planner]") ||
    lowerContent.includes("study plan generated") ||
    lowerContent.includes("ai study plan") ||
    lowerContent.includes("study schedule")
  ) {
    return prefs.aiStudyPlans;
  }

  // 5. Quest Assignments & Deadlines
  if (
    upperType === "QUEST" ||
    lowerContent.includes("[quest]") ||
    (upperType === "WARNING" && (lowerContent.includes("quest") || lowerContent.includes("deadline"))) ||
    lowerContent.includes("quest assignment") ||
    lowerContent.includes("quest deadline")
  ) {
    return prefs.questAssignments;
  }

  // 6. Focus Reminders
  if (
    lowerContent.includes("[focus_reminder]") ||
    lowerContent.includes("focus session") ||
    lowerContent.includes("pomodoro") ||
    lowerContent.includes("focus reminder")
  ) {
    return prefs.scheduledFocusReminders;
  }

  // 7. Incoming Friend Requests
  if (
    upperType === "FRIEND_REQUEST" ||
    lowerContent.includes("[friend_request]") ||
    lowerContent.includes("friend request") ||
    lowerContent.includes("study buddy request")
  ) {
    return prefs.incomingFriendRequests;
  }

  // 8. Private Direct Messages
  if (
    upperType === "DIRECT_MESSAGE" ||
    lowerContent.includes("[direct_message]") ||
    lowerContent.includes("direct message") ||
    lowerContent.includes("private message")
  ) {
    return prefs.directMessages;
  }

  // 9. Group Chat Activity & Mentions
  if (
    upperType === "GROUP_CHAT" ||
    upperType === "MENTION" ||
    lowerContent.includes("[group_chat]") ||
    lowerContent.includes("group chat") ||
    lowerContent.includes("study room") ||
    lowerContent.includes("mentioned you")
  ) {
    return prefs.groupActivity;
  }

  // Default allowed for general system warnings/info if master switch is ON
  return true;
}
