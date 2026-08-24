/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getPreferences, PATCH, PUT } from "@/app/api/notifications/preferences/route";
import { GET as getNotifications } from "@/app/api/notifications/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  sanitizeNotificationPreferences,
  isNotificationAllowed,
  NotificationPreferences,
} from "@/lib/notification-preferences";

describe("Notification Preferences & Alert Configuration System", () => {
  const userId = 777;
  let validToken: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    validToken = await signToken({ userId, email: "hunter777@system.dev" });
  });

  describe("Helper: sanitizeNotificationPreferences", () => {
    it("returns all defaults when input is null, undefined, or invalid", () => {
      expect(sanitizeNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
      expect(sanitizeNotificationPreferences(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
      expect(sanitizeNotificationPreferences("invalid")).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it("preserves explicitly set boolean preferences and fills missing with defaults", () => {
      const partial = {
        masterEnabled: false,
        streakMilestones: false,
      };
      const sanitized = sanitizeNotificationPreferences(partial);
      expect(sanitized.masterEnabled).toBe(false);
      expect(sanitized.streakMilestones).toBe(false);
      expect(sanitized.levelRankPromotions).toBe(true);
      expect(sanitized.aiStudyPlans).toBe(true);
    });
  });

  describe("Helper: isNotificationAllowed for Every Setting", () => {
    const basePrefs: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };

    it("1. Master Switch: Mutes everything when false", () => {
      const disabledMaster = { ...basePrefs, masterEnabled: false };
      expect(isNotificationAllowed("LEVEL_UP", "Level up!", disabledMaster)).toBe(false);
      expect(isNotificationAllowed("STREAK", "Streak active!", disabledMaster)).toBe(false);
      expect(isNotificationAllowed("REWARD", "Achievement unlocked!", disabledMaster)).toBe(false);
      expect(isNotificationAllowed("SYSTEM", "Study Plan Generated", disabledMaster)).toBe(false);
      expect(isNotificationAllowed("QUEST", "Quest assigned", disabledMaster)).toBe(false);
      expect(isNotificationAllowed("INFO", "Focus session reminder", disabledMaster)).toBe(false);
      expect(isNotificationAllowed("FRIEND_REQUEST", "New friend request", disabledMaster)).toBe(false);
      expect(isNotificationAllowed("DIRECT_MESSAGE", "Private message", disabledMaster)).toBe(false);
      expect(isNotificationAllowed("GROUP_CHAT", "Group chat message", disabledMaster)).toBe(false);
    });

    it("2. Level & Rank Promotions", () => {
      const on = { ...basePrefs, levelRankPromotions: true };
      const off = { ...basePrefs, levelRankPromotions: false };
      expect(isNotificationAllowed("LEVEL_UP", "You reached Level 5!", on)).toBe(true);
      expect(isNotificationAllowed("LEVEL_UP", "You reached Level 5!", off)).toBe(false);
      expect(isNotificationAllowed("SYSTEM", "Promoted to Rank B", off)).toBe(false);
    });

    it("3. Daily & Weekly Streaks", () => {
      const on = { ...basePrefs, streakMilestones: true };
      const off = { ...basePrefs, streakMilestones: false };
      expect(isNotificationAllowed("STREAK", "Weekly streak is now 3 weeks!", on)).toBe(true);
      expect(isNotificationAllowed("STREAK", "Weekly streak is now 3 weeks!", off)).toBe(false);
      expect(isNotificationAllowed("SYSTEM", "Weekly Mission Complete: 3 Hours of Focus!", off)).toBe(false);
    });

    it("4. Unlocked Achievements & Titles", () => {
      const on = { ...basePrefs, unlockedAchievements: true };
      const off = { ...basePrefs, unlockedAchievements: false };
      expect(isNotificationAllowed("REWARD", "Achievement Unlocked: Night Owl", on)).toBe(true);
      expect(isNotificationAllowed("ACHIEVEMENT", "Title Unlocked: Grandmaster", on)).toBe(true);
      expect(isNotificationAllowed("REWARD", "Achievement Unlocked: Night Owl", off)).toBe(false);
      expect(isNotificationAllowed("ACHIEVEMENT", "Title Unlocked: Grandmaster", off)).toBe(false);
    });

    it("5. AI Study Plan Generation", () => {
      const on = { ...basePrefs, aiStudyPlans: true };
      const off = { ...basePrefs, aiStudyPlans: false };
      expect(isNotificationAllowed("SYSTEM", "### 🎓 Study Plan Generated", on)).toBe(true);
      expect(isNotificationAllowed("SYSTEM", "[QUOTA:AI_PLANNER] You used 1/1 free plan", on)).toBe(true);
      expect(isNotificationAllowed("SYSTEM", "### 🎓 Study Plan Generated", off)).toBe(false);
      expect(isNotificationAllowed("SYSTEM", "[QUOTA:AI_PLANNER] You used 1/1 free plan", off)).toBe(false);
    });

    it("6. Quest Assignments & Deadlines", () => {
      const on = { ...basePrefs, questAssignments: true };
      const off = { ...basePrefs, questAssignments: false };
      expect(isNotificationAllowed("QUEST", "New quest assigned: Calculus Problem Set", on)).toBe(true);
      expect(isNotificationAllowed("WARNING", "Quest deadline approaching in 1 hour!", on)).toBe(true);
      expect(isNotificationAllowed("QUEST", "New quest assigned: Calculus Problem Set", off)).toBe(false);
      expect(isNotificationAllowed("WARNING", "Quest deadline approaching in 1 hour!", off)).toBe(false);
    });

    it("7. Scheduled Focus Reminders", () => {
      const on = { ...basePrefs, scheduledFocusReminders: true };
      const off = { ...basePrefs, scheduledFocusReminders: false };
      expect(isNotificationAllowed("INFO", "Time for your scheduled Pomodoro block!", on)).toBe(true);
      expect(isNotificationAllowed("INFO", "Focus session reminder for Mathematics", on)).toBe(true);
      expect(isNotificationAllowed("INFO", "Time for your scheduled Pomodoro block!", off)).toBe(false);
      expect(isNotificationAllowed("INFO", "Focus session reminder for Mathematics", off)).toBe(false);
    });

    it("8. Incoming Friend Requests", () => {
      const on = { ...basePrefs, incomingFriendRequests: true };
      const off = { ...basePrefs, incomingFriendRequests: false };
      expect(isNotificationAllowed("FRIEND_REQUEST", "Hunter Jin-Woo sent you a friend request", on)).toBe(true);
      expect(isNotificationAllowed("FRIEND_REQUEST", "Hunter Jin-Woo sent you a friend request", off)).toBe(false);
    });

    it("9. Private Direct Messages — chat messages NEVER notify (hard block)", () => {
      const on = { ...basePrefs, directMessages: true };
      const off = { ...basePrefs, directMessages: false };
      // Text-message echoes are permanently excluded from the inbox,
      // regardless of the (legacy) toggle state.
      expect(isNotificationAllowed("DIRECT_MESSAGE", "New direct message from Elena", on)).toBe(false);
      expect(isNotificationAllowed("DIRECT_MESSAGE", "New direct message from Elena", off)).toBe(false);
      expect(isNotificationAllowed("INFO", "[DIRECT_MESSAGE] testing (@testing): Hello", on)).toBe(false);
      expect(isNotificationAllowed("INFO", "[DIRECT_MESSAGE] testing (@testing): Hello", off)).toBe(false);
    });

    it("10. Group Chat Activity & Mentions — chat echoes never notify (hard block)", () => {
      const on = { ...basePrefs, groupActivity: true };
      const off = { ...basePrefs, groupActivity: false };
      expect(isNotificationAllowed("GROUP_CHAT", "New activity in STEM Study Guild", on)).toBe(false);
      expect(isNotificationAllowed("MENTION", "Elena mentioned you in Group Chat", on)).toBe(false);
      expect(isNotificationAllowed("GROUP_CHAT", "New activity in STEM Study Guild", off)).toBe(false);
      expect(isNotificationAllowed("MENTION", "Elena mentioned you in Group Chat", off)).toBe(false);
      // Important group events (added to a group) still honor the toggle
      expect(isNotificationAllowed("INFO", "[GROUP_ADDED] you were added to the group", on)).toBe(true);
      expect(isNotificationAllowed("INFO", "[GROUP_ADDED] you were added to the group", off)).toBe(false);
    });
  });

  describe("GET /api/notifications/preferences", () => {
    it("rejects unauthorized request with 401", async () => {
      const req = new NextRequest("http://localhost/api/notifications/preferences");
      const res = await getPreferences(req);
      expect(res.status).toBe(401);
    });

    it("returns default preferences if user has none stored in DB", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([] as any);

      const req = new NextRequest("http://localhost/api/notifications/preferences", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getPreferences(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it("returns stored preferences when present", async () => {
      const customPrefs = {
        masterEnabled: true,
        levelRankPromotions: false,
        streakMilestones: true,
        unlockedAchievements: false,
        aiStudyPlans: true,
        questAssignments: false,
        scheduledFocusReminders: true,
        incomingFriendRequests: false,
        directMessages: true,
        groupActivity: false,
      };

      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([
        { notificationPreferences: customPrefs },
      ] as any);

      const req = new NextRequest("http://localhost/api/notifications/preferences", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getPreferences(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.preferences).toEqual(customPrefs);
    });
  });

  describe("PATCH / PUT /api/notifications/preferences", () => {
    it("rejects unauthorized request with 401", async () => {
      const req = new NextRequest("http://localhost/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ masterEnabled: false }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(401);
    });

    it("updates specific preferences while keeping others intact", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([
        {
          notificationPreferences: {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            directMessages: true,
          },
        },
      ] as any);

      vi.spyOn(prisma, "$executeRaw").mockResolvedValueOnce(1 as any);

      const req = new NextRequest("http://localhost/api/notifications/preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          masterEnabled: false,
          directMessages: false,
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.preferences.masterEnabled).toBe(false);
      expect(data.preferences.directMessages).toBe(false);
      expect(data.preferences.levelRankPromotions).toBe(true);
    });

    it("PUT endpoint functions as an alias to PATCH", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([] as any);
      vi.spyOn(prisma, "$executeRaw").mockResolvedValueOnce(1 as any);

      const req = new NextRequest("http://localhost/api/notifications/preferences", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aiStudyPlans: false,
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.preferences.aiStudyPlans).toBe(false);
    });
  });

  describe("GET /api/notifications with Preferences Filtering", () => {
    const mockDbNotifications = [
      { id: 1, type: "LEVEL_UP", content: "You reached Level 10!", read: false, createdAt: new Date() },
      { id: 2, type: "STREAK", content: "Weekly streak is now 2 weeks!", read: false, createdAt: new Date() },
      { id: 3, type: "REWARD", content: "Achievement Unlocked: Night Owl", read: false, createdAt: new Date() },
      { id: 4, type: "SYSTEM", content: "### 🎓 Study Plan Generated", read: false, createdAt: new Date() },
      { id: 5, type: "QUEST", content: "Quest assigned: Data Structures", read: false, createdAt: new Date() },
    ];

    it("returns empty array when masterEnabled is false", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([
        { notificationPreferences: { masterEnabled: false } },
      ] as any);

      const req = new NextRequest("http://localhost/api/notifications", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getNotifications(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });

    it("filters out streak and level-up notifications when their respective toggles are disabled", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([
        {
          notificationPreferences: {
            masterEnabled: true,
            levelRankPromotions: false,
            streakMilestones: false,
            unlockedAchievements: true,
            aiStudyPlans: true,
            questAssignments: true,
          },
        },
      ] as any);

      vi.spyOn(prisma.systemMessage, "findMany").mockResolvedValueOnce(mockDbNotifications as any);

      const req = new NextRequest("http://localhost/api/notifications", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getNotifications(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      // LEVEL_UP and STREAK should be filtered out
      const types = data.map((n: any) => n.type);
      expect(types).not.toContain("LEVEL_UP");
      expect(types).not.toContain("STREAK");
      expect(types).toContain("REWARD");
      expect(types).toContain("SYSTEM");
      expect(types).toContain("QUEST");
    });

    it("filters out friend requests and chat messages (chat is hard-blocked even when enabled)", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([
        {
          notificationPreferences: {
            masterEnabled: true,
            incomingFriendRequests: false,
            directMessages: true, // even ON — chat echoes never show
            groupActivity: true,
          },
        },
      ] as any);

      const socialNotifications = [
        { id: 10, type: "INFO", content: "[FRIEND_REQUEST] @alice sent you a friend request.", read: false, createdAt: new Date() },
        { id: 11, type: "INFO", content: "[DIRECT_MESSAGE] @bob: Hey, let's study!", read: false, createdAt: new Date() },
        { id: 12, type: "INFO", content: "[GROUP_CHAT] @guild: Study session starting now!", read: false, createdAt: new Date() },
        { id: 13, type: "INFO", content: "[GROUP_ADDED] @alice added you to the group \"Guild\".", read: false, createdAt: new Date() },
      ];

      vi.spyOn(prisma.systemMessage, "findMany").mockResolvedValueOnce(socialNotifications as any);

      const req = new NextRequest("http://localhost/api/notifications", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getNotifications(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      // Friend request filtered by toggle; BOTH chat echoes hard-blocked;
      // the important group-added event survives (groupActivity = true).
      expect(data).toHaveLength(1);
      expect(data[0].content).toContain("[GROUP_ADDED]");
      expect(data[0].content).not.toContain("[DIRECT_MESSAGE]");
      expect(data[0].content).not.toContain("[GROUP_CHAT]");
    });
  });
});
