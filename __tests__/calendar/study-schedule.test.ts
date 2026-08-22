import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../lib/prisma";
import * as auth from "../../lib/auth";
import { GET as getStudySchedule, PATCH as patchStudySchedule } from "../../app/api/user/study-schedule/route";
import { GET as getCalendarMonth } from "../../app/api/calendar/month/route";
import { StudyScheduleService } from "../../lib/study-schedule-service";
import { HpPenaltyService } from "../../lib/hp-penalty-service";
import { calculateDailyCapacity } from "../../lib/ai/planning-engine";
import { TimezoneService } from "../../lib/timezone-service";

vi.mock("../../lib/auth", () => ({
  getSession: vi.fn(),
  verifyToken: vi.fn(),
}));

describe("Study Schedule & Calendar Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("API: /api/user/study-schedule", () => {
    it("returns 401 when unauthorized", async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce(null);
      const req = new NextRequest("http://localhost/api/user/study-schedule");
      const res = await getStudySchedule(req);
      expect(res.status).toBe(401);
    });

    it("returns user study schedule settings on GET", async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce({ userId: 1 });
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: 1,
        dailyGoalMinutes: 90,
        restDays: [0, 6],
        enableHpPenalty: true,
      } as any);

      const req = new NextRequest("http://localhost/api/user/study-schedule");
      const res = await getStudySchedule(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual({
        dailyGoalMinutes: 90,
        restDays: [0, 6],
        enableHpPenalty: true,
      });
    });

    it("updates study schedule settings on PATCH", async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce({ userId: 1 });
      vi.spyOn(prisma.user, "update").mockResolvedValueOnce({
        dailyGoalMinutes: 150,
        restDays: [0],
        enableHpPenalty: false,
      } as any);

      const req = new NextRequest("http://localhost/api/user/study-schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyGoalMinutes: 150,
          restDays: [0],
          enableHpPenalty: false,
        }),
      });

      const res = await patchStudySchedule(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.dailyGoalMinutes).toBe(150);
      expect(data.restDays).toEqual([0]);
      expect(data.enableHpPenalty).toBe(false);
    });

    it("rejects invalid goal minutes (e.g. < 10) on PATCH", async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce({ userId: 1 });

      const req = new NextRequest("http://localhost/api/user/study-schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyGoalMinutes: 5,
        }),
      });

      const res = await patchStudySchedule(req);
      expect(res.status).toBe(400);
    });
  });

  describe("StudyScheduleService", () => {
    it("accurately identifies rest days", () => {
      // 2026-08-16 is a Sunday (day 0)
      expect(StudyScheduleService.getDayOfWeekIndex("2026-08-16")).toBe(0);
      expect(StudyScheduleService.isRestDay("2026-08-16", [0])).toBe(true);
      expect(StudyScheduleService.isRestDay("2026-08-16", [1, 2, 3])).toBe(false);

      // 2026-08-17 is a Monday (day 1)
      expect(StudyScheduleService.getDayOfWeekIndex("2026-08-17")).toBe(1);
      expect(StudyScheduleService.isRestDay("2026-08-17", [1])).toBe(true);
    });

    it("computes enriched month calendar data with subject breakdown", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: 1,
        timezone: "UTC",
        dailyGoalMinutes: 60,
        restDays: [0],
        enableHpPenalty: true,
      } as any);

      vi.spyOn(prisma.studySession, "findMany").mockResolvedValueOnce([
        {
          id: 101,
          userId: 1,
          durationMinutes: 45,
          durationSeconds: 2700,
          startedAt: new Date("2026-08-17T10:00:00Z"),
          subjectId: 10,
          subject: { id: 10, name: "Mathematics", color: "#3b82f6" },
          quest: null,
        } as any,
        {
          id: 102,
          userId: 1,
          durationMinutes: 30,
          durationSeconds: 1800,
          startedAt: new Date("2026-08-17T14:00:00Z"),
          subjectId: 20,
          subject: { id: 20, name: "Physics", color: "#10b981" },
          quest: null,
        } as any,
      ]);

      vi.spyOn(prisma.quest, "findMany").mockResolvedValueOnce([
        {
          id: 501,
          userId: 1,
          title: "Calculus Problem Set",
          description: "Chapter 4",
          status: "COMPLETED",
          difficulty: "NORMAL",
          requiredMinutes: 45,
          elapsedSeconds: 2700,
          xpReward: 50,
          sylphReward: 10,
          scheduledFor: "2026-08-17",
          createdAt: new Date(),
        } as any,
      ]);

      const result = await StudyScheduleService.getMonthCalendarData(1, 2026, 7); // August 2026

      expect(result.year).toBe(2026);
      expect(result.month).toBe(7);
      expect(result.monthName).toBe("August");
      expect(result.days.length).toBe(31);

      const aug17 = result.days.find((d) => d.date === "2026-08-17");
      expect(aug17).toBeDefined();
      expect(aug17!.totalMinutes).toBe(75); // 45m + 30m
      expect(aug17!.goalMet).toBe(true); // 75m >= 60m
      expect(aug17!.completionPercentage).toBe(125); // 75/60 = 125%
      expect(aug17!.sessionsCount).toBe(2);
      expect(aug17!.questsCount).toBe(1);
      expect(aug17!.questsCompleted).toBe(1);
      expect(aug17!.subjectBreakdown.length).toBe(2);
      expect(aug17!.subjectBreakdown[0].subjectName).toBe("Mathematics");
      expect(aug17!.subjectBreakdown[0].minutes).toBe(45);
      expect(aug17!.subjectBreakdown[1].subjectName).toBe("Physics");
      expect(aug17!.subjectBreakdown[1].minutes).toBe(30);
    });
  });

  describe("HpPenaltyService", () => {
    it("exempts rest days from HP penalties", async () => {
      const todayStr = TimezoneService.getUserLocalDate("UTC");
      const todayObj = new Date(`${todayStr}T12:00:00Z`);
      const yesterdayObj = new Date(todayObj.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterdayObj.toISOString().split("T")[0];
      const dayBeforeObj = new Date(yesterdayObj.getTime() - 24 * 60 * 60 * 1000);
      const dayBeforeStr = dayBeforeObj.toISOString().split("T")[0];

      // Make yesterday a designated rest day
      const yesterdayDayOfWeek = yesterdayObj.getDay();

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 1,
        hp: 100,
        maxHp: 100,
        timezone: "UTC",
        dailyGoalMinutes: 120,
        restDays: [yesterdayDayOfWeek], // Yesterday is rest
        enableHpPenalty: true,
        lastDailyPenaltyEvaluatedDate: dayBeforeStr, // Needs evaluation of yesterday
        createdAt: new Date("2026-08-01"),
      } as any);

      vi.spyOn(prisma.studySession, "findMany").mockResolvedValue([]);
      const updateSpy = vi.spyOn(prisma.user, "update").mockResolvedValue({} as any);
      const ledgerSpy = vi.spyOn(prisma.hpLedger, "create").mockResolvedValue({} as any);

      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
        return cb({
          user: { update: updateSpy },
          hpLedger: { create: ledgerSpy },
          systemMessage: { create: vi.fn() },
        });
      });

      const res = await HpPenaltyService.reconcileDailyHpPenalty(1);

      // Yesterday was evaluated and determined to be a rest day: 0 penalties applied
      expect(res.penaltiesApplied).toBe(0);
      expect(res.totalHpDeducted).toBe(0);
      expect(res.newHp).toBe(100);
      expect(ledgerSpy).not.toHaveBeenCalled();
    });

    it("exempts floating (ad-hoc) rest days from HP penalties", async () => {
      const todayStr = TimezoneService.getUserLocalDate("UTC");
      const todayObj = new Date(`${todayStr}T12:00:00Z`);
      const yesterdayObj = new Date(todayObj.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterdayObj.toISOString().split("T")[0];
      const dayBeforeObj = new Date(yesterdayObj.getTime() - 24 * 60 * 60 * 1000);
      const dayBeforeStr = dayBeforeObj.toISOString().split("T")[0];

      // Yesterday is NOT a fixed rest day, but IS designated floating-rest.
      const yesterdayDayOfWeek = yesterdayObj.getDay();
      const nonMatchingRestDay = (yesterdayDayOfWeek + 1) % 7;

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 1,
        hp: 100,
        maxHp: 100,
        timezone: "UTC",
        dailyGoalMinutes: 120,
        restDays: [nonMatchingRestDay],
        enableHpPenalty: true,
        lastDailyPenaltyEvaluatedDate: dayBeforeStr, // Evaluate exactly yesterday
        createdAt: new Date("2026-08-01"),
      } as any);

      // No study sessions logged — but the day is exempt anyway.
      vi.spyOn(prisma.studySession, "findMany").mockResolvedValue([]);
      // Yesterday is a floating rest day record.
      vi.spyOn(prisma.floatingRestDay, "findMany").mockResolvedValueOnce([
        { dateKey: yesterdayStr },
      ] as any);

      const updateSpy = vi.spyOn(prisma.user, "update").mockResolvedValue({} as any);

      const res = await HpPenaltyService.reconcileDailyHpPenalty(1);

      // 0 HP deducted, evaluation pointer advanced, day recorded as exempt.
      expect(res.penaltiesApplied).toBe(0);
      expect(res.totalHpDeducted).toBe(0);
      expect(res.restExemptDays).toContain(yesterdayStr);
      expect(updateSpy).toHaveBeenCalled();
    });

    it("deducts HP on missed non-rest days", async () => {
      const todayStr = TimezoneService.getUserLocalDate("UTC");
      const todayObj = new Date(`${todayStr}T12:00:00Z`);
      const yesterdayObj = new Date(todayObj.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterdayObj.toISOString().split("T")[0];
      const dayBeforeObj = new Date(yesterdayObj.getTime() - 24 * 60 * 60 * 1000);
      const dayBeforeStr = dayBeforeObj.toISOString().split("T")[0];

      // Make sure yesterday is not a rest day for this test
      const yesterdayDayOfWeek = yesterdayObj.getDay();
      const nonMatchingRestDay = (yesterdayDayOfWeek + 1) % 7;

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 1,
        hp: 100,
        maxHp: 100,
        timezone: "UTC",
        dailyGoalMinutes: 120,
        restDays: [nonMatchingRestDay],
        enableHpPenalty: true,
        lastDailyPenaltyEvaluatedDate: dayBeforeStr, // Evaluate exactly yesterday
        createdAt: new Date("2026-08-01"),
      } as any);

      // Studied only 20 mins out of 120 mins yesterday
      vi.spyOn(prisma.studySession, "findMany").mockResolvedValueOnce([
        {
          durationMinutes: 20,
          durationSeconds: 1200,
          startedAt: new Date(`${yesterdayStr}T12:00:00Z`),
        } as any,
      ]);

      const updateSpy = vi.spyOn(prisma.user, "update").mockResolvedValue({} as any);
      const ledgerSpy = vi.spyOn(prisma.hpLedger, "create").mockResolvedValue({} as any);
      const messageSpy = vi.spyOn(prisma.systemMessage, "create").mockResolvedValue({} as any);

      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
        return cb({
          user: { update: updateSpy },
          hpLedger: { create: ledgerSpy },
          systemMessage: { create: messageSpy },
        });
      });

      const res = await HpPenaltyService.reconcileDailyHpPenalty(1);

      expect(res.penaltiesApplied).toBe(1);
      expect(res.totalHpDeducted).toBe(15);
      expect(res.newHp).toBe(85);
      expect(ledgerSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          amount: -15,
          source: "MISSED_DAILY_GOAL",
        }),
      });
    });
  });

  describe("calculateDailyCapacity with Rest Days", () => {
    it("sets capacity to 0 on designated rest days", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 1,
        hp: 100,
        streakDays: 5,
        timezone: "UTC",
        restDays: [0], // Sunday is rest
      } as any);

      vi.spyOn(prisma.goal, "findFirst").mockResolvedValue({
        effortLevel: "NORMAL",
      } as any);

      vi.spyOn(prisma.quest, "aggregate").mockResolvedValue({
        _sum: { requiredMinutes: 0 },
      } as any);

      vi.spyOn(prisma.quest, "findMany").mockResolvedValue([]);

      // 2026-08-15 (Sat), 2026-08-16 (Sun = rest), 2026-08-17 (Mon)
      const matrix = await calculateDailyCapacity(1, "NORMAL", "2026-08-15", "2026-08-17");

      expect(matrix["2026-08-15"]).toBe(120); // Saturday: normal capacity (2h/day)
      expect(matrix["2026-08-16"]).toBe(-999999);  // Sunday: negative capacity on designated rest day
      expect(matrix["2026-08-17"]).toBe(120); // Monday: normal capacity
    });
  });
});
