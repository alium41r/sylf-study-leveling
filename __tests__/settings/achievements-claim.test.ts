/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET as getAchievements,
  POST as claimAchievement,
} from "@/app/api/achievements/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

describe("Achievements System - Progress & Reward Claiming", () => {
  const userId = 101;
  let validToken: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);
    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => callback(prisma));
    validToken = await signToken({ userId, email: "hunter101@system.dev" });
    vi.spyOn(prisma.quest, "count").mockResolvedValue(0);
    vi.spyOn(prisma.studySession, "count").mockResolvedValue(0);
    vi.spyOn(prisma.friendship, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma.subject, "count").mockResolvedValue(0);
    vi.spyOn(prisma.plannerPlan, "count").mockResolvedValue(0);
    vi.spyOn(prisma.focusSessionMember, "count").mockResolvedValue(0);
    vi.spyOn(prisma.userFocusBackground, "count").mockResolvedValue(0);
    vi.spyOn(prisma.userInventory, "count").mockResolvedValue(0);
    vi.spyOn(prisma.sylphLedger, "aggregate").mockResolvedValue({
      _sum: { amount: 0 },
    } as never);
  });

  describe("GET /api/achievements", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/achievements");
      const res = await getAchievements(req);
      expect(res.status).toBe(401);
    });

    it("returns all 32 achievements with accurate dynamic progress and claim states", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        totalStudyMinutes: 120,
        totalStudySeconds: 7200,
        streakDays: 7,
        hunterRank: "RANK C",
        level: 25,
      } as any);

      vi.spyOn(prisma.quest, "count").mockResolvedValue(15);
      vi.spyOn(prisma.friendship, "findMany").mockResolvedValue([
        { userId, friendId: 2 },
        { userId, friendId: 3 },
      ] as never);
      vi.spyOn(prisma.studySession, "count").mockResolvedValue(5);
      vi.spyOn(prisma.sylphLedger, "aggregate").mockResolvedValue({
        _sum: { amount: -500 },
      } as any);
      vi.spyOn(prisma.userAchievement, "findMany").mockResolvedValue([
        { achievementId: "study_first_session", claimedAt: new Date() },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/achievements", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getAchievements(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.achievements).toHaveLength(32);

      // Study first session is claimed
      const firstSession = data.achievements.find(
        (a: any) => a.id === "study_first_session"
      );
      expect(firstSession.isClaimed).toBe(true);

      // Study 1 hour (target 60 min, user has 120 min)
      const study1h = data.achievements.find(
        (a: any) => a.id === "study_1_hour"
      );
      expect(study1h.currentProgress).toBe(60);
      expect(study1h.isClaimed).toBe(false);

      // Seven consecutive weeks, preserving the stored claim ID
      const streak7 = data.achievements.find(
        (a: any) => a.id === "streak_7_day"
      );
      expect(streak7.currentProgress).toBe(7);

      // C-Rank begins at canonical level 25
      const rankC = data.achievements.find((a: any) => a.id === "rank_c");
      expect(rankC.currentProgress).toBe(25);

      // Social 1st friend (target 1, user has 2)
      const social1 = data.achievements.find(
        (a: any) => a.id === "social_first_friend"
      );
      expect(social1.currentProgress).toBe(1);

      // Quest 10 (target 10, user has 15)
      const quest10 = data.achievements.find((a: any) => a.id === "quest_10");
      expect(quest10.currentProgress).toBe(10);

      // Exploration spend 100 (target 100, user spent 500)
      const spend100 = data.achievements.find(
        (a: any) => a.id === "exploration_spend_100"
      );
      expect(spend100.currentProgress).toBe(100);
    });
  });

  describe("POST /api/achievements - Claiming Rewards", () => {
    it("rejects claim when requirements are not met", async () => {
      vi.spyOn(prisma.userAchievement, "findUnique").mockResolvedValue(null);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        totalStudyMinutes: 10, // Target is 60
        streakDays: 0,
        hunterRank: "E",
      } as any);

      const req = new NextRequest("http://localhost:3000/api/achievements", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ achievementId: "study_1_hour" }),
      });

      const res = await claimAchievement(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Requirements not met");
    });

    it("rejects claim when already claimed", async () => {
      vi.spyOn(prisma.userAchievement, "findUnique").mockResolvedValue({
        id: 1,
        userId,
        achievementId: "study_1_hour",
      } as any);

      const req = new NextRequest("http://localhost:3000/api/achievements", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ achievementId: "study_1_hour" }),
      });

      const res = await claimAchievement(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Already claimed");
    });

    it("successfully claims SYLPH reward and creates ledger record", async () => {
      vi.spyOn(prisma.userAchievement, "findUnique").mockResolvedValue(null);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        totalStudyMinutes: 65,
        streakDays: 1,
        hunterRank: "E",
        sylph: 200,
      } as any);
      vi.spyOn(prisma.systemMessage, "create").mockResolvedValue({} as any);

      vi.spyOn(prisma, "$queryRawUnsafe").mockResolvedValue([
        {
          claim_achievement_reward_atomic: {
            success: true,
            achievementId: "study_1_hour",
            xpGained: 0,
            sylphGained: 50,
            level: 1,
            currentXP: 0,
            xpToNextLevel: 282,
            hunterRank: "E",
            levelsGained: 0,
            didRankUp: false,
          },
        },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/achievements", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ achievementId: "study_1_hour" }), // reward: 50 SYLPH
      });

      const res = await claimAchievement(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Delegated to the atomic SECURITY DEFINER RPC (no read-modify-write loop)
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("claim_achievement_reward_atomic"),
        "101",
        "study_1_hour",
        0,
        50,
        expect.any(String)
      );
    });

    it("successfully claims XP reward and performs level-up calculation", async () => {
      vi.spyOn(prisma.userAchievement, "findUnique").mockResolvedValue(null);
      vi.spyOn(prisma.studySession, "count").mockResolvedValue(1);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        level: 1,
        currentXP: 250,
        xpToNextLevel: 200, // stale legacy value — the RPC must ignore it
        hunterRank: "E",
        totalStudyMinutes: 30,
        streakDays: 1,
      } as any);
      vi.spyOn(prisma.systemMessage, "create").mockResolvedValue({} as any);

      vi.spyOn(prisma, "$queryRawUnsafe").mockResolvedValue([
        {
          claim_achievement_reward_atomic: {
            success: true,
            achievementId: "study_first_session",
            xpGained: 50,
            sylphGained: 600,
            level: 2,
            currentXP: 18,
            xpToNextLevel: 237,
            hunterRank: "E",
            levelsGained: 1,
            didRankUp: false,
          },
        },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/achievements", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ achievementId: "study_first_session" }), // reward: 50 XP
      });

      const res = await claimAchievement(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // The XP leg of the reward is fully delegated to the atomic RPC
      // (User had 250 XP within level 1, +50 XP = 300 ≥ canonical 282 bucket).
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("claim_achievement_reward_atomic"),
        "101",
        "study_first_session",
        50,
        0,
        expect.any(String)
      );
    });

    it("maps ALREADY_CLAIMED RPC errors to a 400 response (idempotency)", async () => {
      vi.spyOn(prisma.userAchievement, "findUnique").mockResolvedValue(null);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        totalStudyMinutes: 65,
        streakDays: 1,
        hunterRank: "E",
      } as any);

      const rpcError: any = new Error(
        "ALREADY_CLAIMED: Achievement study_1_hour already claimed"
      );
      rpcError.code = "S0001";
      vi.spyOn(prisma, "$queryRawUnsafe").mockRejectedValue(rpcError);

      const req = new NextRequest("http://localhost:3000/api/achievements", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ achievementId: "study_1_hour" }),
      });

      const res = await claimAchievement(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Already claimed");
    });

    it("replaces retired item rewards with supported atomic Sylph rewards", async () => {
      vi.spyOn(prisma.userAchievement, "findUnique").mockResolvedValue(null);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        totalStudyMinutes: 30000,
        streakDays: 1,
        level: 75,
        hunterRank: "RANK A",
      } as never);
      vi.spyOn(prisma.systemMessage, "create").mockResolvedValue({} as never);
      vi.spyOn(prisma, "$queryRawUnsafe").mockResolvedValue([
        {
          claim_achievement_reward_atomic: { success: true, sylphGained: 3500 },
        },
      ]);
      const legacyWrite = vi.spyOn(prisma.inventoryItem, "update");
      const req = new NextRequest("http://localhost:3000/api/achievements", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ achievementId: "study_500_hours" }),
      });
      expect((await claimAchievement(req)).status).toBe(200);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("claim_achievement_reward_atomic"),
        "101",
        "study_500_hours",
        0,
        3500,
        expect.any(String)
      );
      expect(legacyWrite).not.toHaveBeenCalled();
    });
  });
});
