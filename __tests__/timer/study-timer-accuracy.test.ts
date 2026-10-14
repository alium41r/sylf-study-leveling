/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getUserStats } from "@/app/api/user/stats/route";
import { GET as getQuests } from "@/app/api/quests/route";
import { GET as getFriends } from "@/app/api/friends/route";
import { GET as getProfile } from "@/app/api/profile/[username]/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

// Companion lookup is unrelated to session aggregation and must not connect
// to a hosted database from these route unit tests.
vi.mock("@/lib/pixel-companion-service", () => ({ selectedCompanionsForUsers: async () => new Map() }));

describe("Study Timer Accuracy & Synchronization Tests", () => {
  const userId = 505;
  let validToken: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    validToken = await signToken({ userId, email: "hunter505@system.dev" });
  });

  describe("GET /api/user/stats - Today's Study Time Calculation", () => {
    it("accurately calculates todayStudySeconds, completedTodaySeconds and active session", async () => {
      const mockUser = {
        id: userId,
        email: "hunter505@system.dev",
        username: "hunter505",
        name: "Hunter Five",
        password: "hash",
        scholarId: "SCH-000505",
        verificationStatus: "VERIFIED",
        hunterRank: "C",
        level: 10,
        currentXP: 100,
        hp: 100,
        maxHp: 100,
        streakDays: 5,
        totalStudyMinutes: 120,
        totalStudySeconds: 7200,
        timezone: "UTC",
        hasCompletedOnboarding: true,
      };

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockUser as any);

      const pastStarted = new Date(Date.now() - 30 * 60 * 1000);
      const pastEnded = new Date(Date.now() - 10 * 60 * 1000);
      const activeStarted = new Date(Date.now() - 120 * 1000); // 2 min ago

      vi.spyOn(prisma.studySession, "findMany").mockResolvedValue([
        {
          durationMinutes: 20,
          durationSeconds: 1200,
          startedAt: pastStarted,
          endedAt: pastEnded,
        },
        {
          durationMinutes: 0,
          durationSeconds: 0,
          startedAt: activeStarted,
          endedAt: null, // active session
        },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/user/stats", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getUserStats(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.completedTodaySeconds).toBe(1200);
      // The active session contributes its stored (flushed) seconds only —
      // a pre-first-flush session has 0 stored, so no heuristic inflation.
      expect(data.todayStudySeconds).toBe(1200);
      expect(data.todayStudyMinutes).toBe(20);
      expect(data.activeSessionStartedAt).toBe(activeStarted.toISOString());
    });
  });

  describe("GET /api/quests - Today's Seconds Calculation", () => {
    it("returns todaySeconds accurately alongside elapsedSeconds", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ timezone: "UTC" } as any);

      vi.spyOn(prisma.quest, "findMany").mockResolvedValue([
        {
          id: 1,
          userId,
          title: "Ch 1: Alkanes - Structure & Properties",
          requiredMinutes: 180,
          elapsedSeconds: 187,
          status: "IN_PROGRESS",
          difficulty: "NORMAL",
          scheduledFor: "2026-08-19",
          sessions: [
            {
              durationMinutes: 3,
              durationSeconds: 187,
              startedAt: new Date(),
              endedAt: new Date(),
            },
          ],
        },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/quests?date=2026-08-19", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getQuests(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveLength(1);
      expect(data[0].elapsedSeconds).toBe(187);
      expect(data[0].todaySeconds).toBe(187);
    });
  });

  describe("GET /api/friends - Accurate study seconds & active sessions", () => {
    it("returns completedTodaySeconds and live todaySeconds for friends", async () => {
      const friendId = 606;
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ timezone: "UTC" } as any);

      const pastStarted = new Date(Date.now() - 40 * 60 * 1000);
      const pastEnded = new Date(Date.now() - 10 * 60 * 1000);

      vi.spyOn(prisma.friendship, "findMany").mockResolvedValue([
        {
          id: 1,
          userId,
          friendId,
          friend: {
            id: friendId,
            name: "Study Pal",
            username: "studypal",
            hunterRank: "B",
            level: 15,
            totalStudyMinutes: 500,
            totalStudySeconds: 30000,
            lastSeenAt: new Date(),
            avatarUrl: null,
            activeAvatar: "class_scholar",
          },
        },
      ] as any);

      // The route computes today's study aggregates via grouped raw SQL
      // queries instead of loading every session row per friend.
      vi.spyOn(prisma, "$queryRaw").mockImplementation((async (...args: any[]) => {
        const template = args[0] as any;
        const sql = Array.isArray(template)
          ? template.join("?")
          : typeof template === "string"
            ? template
            : template?.strings?.join("?") ?? "";
        if (sql.includes("BlockedUser")) return [];
        if (sql.includes('SUM("durationSeconds")')) {
          return [{ userId: friendId, seconds: 1800 }];
        }
        if (sql.includes('MAX("startedAt")')) return [];
        return [];
      }) as any);

      const req = new NextRequest("http://localhost:3000/api/friends", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getFriends(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveLength(1);
      expect(data[0].todaySeconds).toBe(1800);
      expect(data[0].completedTodaySeconds).toBe(1800);
      expect(data[0].todayMinutes).toBe(30);
      expect(data[0].isStudying).toBe(false);
    });
  });

  describe("GET /api/profile/[username] - Today's study time", () => {
    it("calculates todayStudySeconds and todayStudyMinutes for target scholar profile", async () => {
      const targetUser = {
        id: 707,
        username: "target_scholar",
        name: "Target Scholar",
        privacy: null,
        achievements: [],
        totalStudyMinutes: 600,
        totalStudySeconds: 36000,
        timezone: "UTC",
      };

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(targetUser as any);
      vi.spyOn(prisma.quest, "count").mockResolvedValue(5);
      vi.spyOn(prisma.friendship, "findFirst").mockResolvedValue(null);
      vi.spyOn(prisma.conversationParticipant, "findFirst").mockResolvedValue(null);
      vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);

      vi.spyOn(prisma.studySession, "findMany").mockResolvedValue([
        {
          durationMinutes: 45,
          durationSeconds: 2700,
          startedAt: new Date(Date.now() - 3600 * 1000),
          endedAt: new Date(Date.now() - 900 * 1000),
        },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/profile/target_scholar", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getProfile(req, { params: Promise.resolve({ username: "target_scholar" }) });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.profile.todayStudySeconds).toBe(2700);
      expect(data.profile.todayStudyMinutes).toBe(45);
      expect(data.profile.completedTodaySeconds).toBe(2700);
    });
  });
});
