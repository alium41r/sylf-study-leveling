/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/profile/[username]/route";
import { PATCH } from "@/app/api/profile/customization/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

describe("Profile System APIs", () => {
  const mockUser = {
    id: 999,
    username: "hunter_test",
    name: "Jin-Woo Test",
    email: "hunter_test@system.dev",
    avatarUrl: "/avatars/test.png",
    bannerUrl: "/banners/cyber.png",
    bio: "Focusing on deep mathematics and distributed systems.",
    hunterRank: "S",
    level: 42,
    currentXP: 850,
    xpToNextLevel: 1000,
    hp: 100,
    maxHp: 100,
    streakDays: 14,
    totalStudyMinutes: 2400,
    activeAvatar: "class_scholar",
    activeFrame: "frame_monarch",
    activeTitle: "title_grandmaster",
    activeAura: "aura_monarch",
    activeNameColor: "color_purple",
    characterConfig: {
      skin: "fair",
      hairStyle: "crop",
      hairColor: "black",
      outfit: "armor_scholar_robes",
      eyewear: "eyewear_black_top",
      accessory: "none",
      aura: "aura_monarch",
    },
    socialLinks: { github: "hunter_test", linkedin: "hunter-jinwoo" },
    connectedAccounts: [
      {
        provider: "GITHUB",
        providerAccountId: "12345",
        providerEmail: "hunter_test@gh.com",
        providerUsername: "hunter_test",
      },
    ],
    statEndurance: 85,
    statTenacity: 90,
    statVelocity: 75,
    statSynthesis: 80,
    statDiscipline: 95,
    lastActiveDate: "2026-08-16",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    privacy: null,
    achievements: [
      {
        achievementId: "first_quest_cleared",
        claimedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/profile/[username]", () => {
    it("returns public dossier with characterConfig, cognitive stats and social links", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockUser as any);
      vi.spyOn(prisma.quest, "count").mockResolvedValue(18);

      const req = new NextRequest("http://localhost:3000/api/profile/hunter_test");
      const res = await GET(req, { params: Promise.resolve({ username: "hunter_test" }) });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("profile");
      expect(data.profile.username).toBe("hunter_test");
      expect(data.profile.bio).toBe("Focusing on deep mathematics and distributed systems.");
      expect(data.profile.characterConfig).toEqual({
        skin: "fair",
        hairStyle: "crop",
        hairColor: "black",
        outfit: "armor_scholar_robes",
        eyewear: "eyewear_black_top",
        accessory: "none",
        aura: "aura_monarch",
      });
      expect(data.profile.stats).toEqual({
        endurance: 85,
        tenacity: 90,
        velocity: 75,
        synthesis: 80,
        discipline: 95,
      });
      expect(data.profile.connectedAccounts).toEqual({
        github: "hunter_test",
        discord: null,
        instagram: null,
      });
      expect(data.profile.socialLinks).toEqual({
        github: "hunter_test",
      });
      expect(data.profile.completedQuestsCount).toBe(18);
      expect(data).toHaveProperty("permissions");
    });

    it("returns 404 when target scholar does not exist", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/profile/non_existent");
      const res = await GET(req, { params: Promise.resolve({ username: "non_existent" }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not found");
    });

    it("enforces profileVisibility: PRIVATE for unauthenticated/public viewers", async () => {
      const privateUser = {
        ...mockUser,
        privacy: {
          profileVisibility: "PRIVATE",
          showOnlineStatus: "PUBLIC",
          showCurrentSession: "PUBLIC",
          showStudyHours: "PUBLIC",
          showRank: "PUBLIC",
          showAchievements: "PUBLIC",
          allowFriendRequests: "PUBLIC",
          allowDirectMessages: "PUBLIC",
        },
      };

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(privateUser as any);
      vi.spyOn(prisma.quest, "count").mockResolvedValue(10);

      const req = new NextRequest("http://localhost:3000/api/profile/hunter_test");
      const res = await GET(req, { params: Promise.resolve({ username: "hunter_test" }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.profile.isRestricted).toBe(true);
      expect(data.profile.bio).toBeUndefined();
      expect(data.profile.characterConfig).toBeUndefined();
      expect(data.profile.socialLinks).toBeUndefined();
      expect(data.privacySettings.isProfileVisible).toBe(false);
    });

    it("enforces granular privacy controls (hidden rank, hidden study hours & stats, hidden achievements)", async () => {
      const granularUser = {
        ...mockUser,
        privacy: {
          profileVisibility: "PUBLIC",
          showOnlineStatus: "PRIVATE",
          showCurrentSession: "PUBLIC",
          showStudyHours: "PRIVATE",
          showRank: "PRIVATE",
          showAchievements: "PRIVATE",
          allowFriendRequests: "PRIVATE",
          allowDirectMessages: "PRIVATE",
        },
      };

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(granularUser as any);
      vi.spyOn(prisma.quest, "count").mockResolvedValue(10);

      const req = new NextRequest("http://localhost:3000/api/profile/hunter_test");
      const res = await GET(req, { params: Promise.resolve({ username: "hunter_test" }) });

      expect(res.status).toBe(200);
      const data = await res.json();

      // Rank is hidden
      expect(data.profile.hunterRank).toBeUndefined();
      expect(data.profile.level).toBeUndefined();
      expect(data.profile.currentXP).toBeUndefined();

      // Study hours & stats are hidden
      expect(data.profile.totalStudyMinutes).toBeUndefined();
      expect(data.profile.streakDays).toBeUndefined();
      expect(data.profile.stats).toBeUndefined();

      // Achievements are hidden
      expect(data.profile.recentAchievements).toBeUndefined();

      // Online status is hidden
      expect(data.profile.lastActiveDate).toBeUndefined();

      // Permissions are disabled
      expect(data.permissions.canSendFriendRequest).toBe(false);
      expect(data.permissions.canSendMessage).toBe(false);
    });
  });

  describe("PATCH /api/profile/customization", () => {
    it("rejects unauthenticated customization requests", async () => {
      const req = new NextRequest("http://localhost:3000/api/profile/customization", {
        method: "PATCH",
        body: JSON.stringify({ bio: "New bio" }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(401);
    });

    it("updates characterConfig, bio, banner, and social links for authenticated user", async () => {
      const token = await signToken({ userId: 999, email: "hunter_test@system.dev" });

      const updatedCharacterConfig = {
        skin: "olive",
        hairStyle: "spiky",
        hairColor: "ppurple",
        outfit: "armor_techwear_stealth",
        eyewear: "eyewear_cyber_visor",
        accessory: "headband_blue",
        aura: "aura_cyber",
      };

      vi.spyOn(prisma.user, "update").mockResolvedValue({
        id: 999,
        username: "hunter_test",
        name: "Jin-Woo Test",
        email: "hunter_test@system.dev",
        avatarUrl: "/avatars/custom.png",
        bannerUrl: "/banners/custom.png",
        bio: "Updated academic thesis statement.",
        activeAvatar: "class_scholar",
        activeFrame: "frame_monarch",
        activeTitle: "title_grandmaster",
        activeAura: "aura_cyber",
        activeNameColor: "color_purple",
        socialLinks: { github: "hunter_updated" },
        characterConfig: updatedCharacterConfig,
        level: 42,
        hunterRank: "S",
        currentXP: 850,
      } as any);

      const req = new NextRequest("http://localhost:3000/api/profile/customization", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bio: "Updated academic thesis statement.",
          bannerUrl: "/banners/custom.png",
          avatarUrl: "/avatars/custom.png",
          characterConfig: updatedCharacterConfig,
          socialLinks: { github: "hunter_updated" },
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.message).toContain("updated successfully");
      expect(data.user.bio).toBe("Updated academic thesis statement.");
      expect(data.user.characterConfig).toEqual(updatedCharacterConfig);
      expect(data.user.socialLinks.github).toBe("hunter_updated");
    });
  });
});
