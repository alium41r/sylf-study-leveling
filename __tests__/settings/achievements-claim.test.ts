/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getAchievements, POST as claimAchievement } from "@/app/api/achievements/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

describe("Achievements System - Progress & Reward Claiming", () => {
  const userId = 101;
  let validToken: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    validToken = await signToken({ userId, email: "hunter101@system.dev" });
  });

  describe("GET /api/achievements", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/achievements");
      const res = await getAchievements(req);
      expect(res.status).toBe(401);
    });

    it("returns all 24 achievements with accurate dynamic progress and claim states", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        totalStudyMinutes: 120,
        totalStudySeconds: 7200,
        streakDays: 7,
        hunterRank: "C",
      } as any);

      vi.spyOn(prisma.quest, "count").mockResolvedValue(15);
      vi.spyOn(prisma.friendship, "count").mockResolvedValue(2);
      vi.spyOn(prisma.userCosmetic, "count").mockResolvedValue(3);
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

      expect(data.achievements).toHaveLength(24);

      // Study first session is claimed
      const firstSession = data.achievements.find((a: any) => a.id === "study_first_session");
      expect(firstSession.isClaimed).toBe(true);

      // Study 1 hour (target 60 min, user has 120 min)
      const study1h = data.achievements.find((a: any) => a.id === "study_1_hour");
      expect(study1h.currentProgress).toBe(60);
      expect(study1h.isClaimed).toBe(false);

      // Streak 7 days (target 7, user has 7)
      const streak7 = data.achievements.find((a: any) => a.id === "streak_7_day");
      expect(streak7.currentProgress).toBe(7);

      // Rank C (Rank mappings: E=1, D=2, C=3)
      const rankC = data.achievements.find((a: any) => a.id === "rank_c");
      expect(rankC.currentProgress).toBe(3);

      // Social 1st friend (target 1, user has 2)
      const social1 = data.achievements.find((a: any) => a.id === "social_first_friend");
      expect(social1.currentProgress).toBe(1);

      // Quest 10 (target 10, user has 15)
      const quest10 = data.achievements.find((a: any) => a.id === "quest_10");
      expect(quest10.currentProgress).toBe(10);

      // Exploration spend 100 (target 100, user spent 500)
      const spend100 = data.achievements.find((a: any) => a.id === "exploration_spend_100");
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

      const mockTx = {
        userAchievement: { create: vi.fn().mockResolvedValue({}) },
        user: { update: vi.fn().mockResolvedValue({}) },
        sylphLedger: { create: vi.fn().mockResolvedValue({}) },
        systemMessage: { create: vi.fn().mockResolvedValue({}) },
      };
      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => cb(mockTx));

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

      expect(mockTx.userAchievement.create).toHaveBeenCalledWith({
        data: { userId, achievementId: "study_1_hour" },
      });
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { sylph: { increment: 50 } },
      });
      expect(mockTx.sylphLedger.create).toHaveBeenCalled();
    });

    it("successfully claims XP reward and performs level-up calculation", async () => {
      vi.spyOn(prisma.userAchievement, "findUnique").mockResolvedValue(null);
      vi.spyOn(prisma.studySession, "count").mockResolvedValue(1);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        level: 1,
        currentXP: 180,
        xpToNextLevel: 200,
        hunterRank: "E",
        totalStudyMinutes: 30,
        streakDays: 1,
      } as any);

      const mockTx = {
        userAchievement: { create: vi.fn().mockResolvedValue({}) },
        user: { update: vi.fn().mockResolvedValue({}) },
        sylphLedger: { create: vi.fn().mockResolvedValue({}) },
        systemMessage: { create: vi.fn().mockResolvedValue({}) },
      };
      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => cb(mockTx));

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

      expect(mockTx.userAchievement.create).toHaveBeenCalledWith({
        data: { userId, achievementId: "study_first_session" },
      });
      // User had 180 XP, + 50 XP = 230 XP (level 1 requires 200 XP -> level up to 2!)
      expect(mockTx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: userId },
          data: expect.objectContaining({
            level: 2,
          }),
        })
      );
    });

    it("successfully claims ITEM reward and updates inventory", async () => {
      vi.spyOn(prisma.userAchievement, "findUnique").mockResolvedValue(null);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        totalStudyMinutes: 30000,
        streakDays: 1,
        hunterRank: "A",
      } as any);

      const mockTx = {
        userAchievement: { create: vi.fn().mockResolvedValue({}) },
        inventoryItem: {
          findFirst: vi.fn().mockResolvedValue({ id: 9, quantity: 1 }),
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({}),
        },
        systemMessage: { create: vi.fn().mockResolvedValue({}) },
      };
      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => cb(mockTx));

      const req = new NextRequest("http://localhost:3000/api/achievements", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ achievementId: "study_500_hours" }), // reward: 1x ELIXIR_OF_INSIGHT
      });

      const res = await claimAchievement(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { quantity: { increment: 1 } },
      });
    });
  });
});
