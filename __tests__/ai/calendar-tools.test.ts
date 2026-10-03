import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeChatTool } from "../../lib/ai/chat-tool-executor";
import { prisma } from "../../lib/prisma";
import { calculateDailyCapacity } from "../../lib/ai/planning-engine";
import { StudyScheduleService } from "../../lib/study-schedule-service";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    quest: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    goal: {
      findFirst: vi.fn().mockResolvedValue({ effortLevel: "NORMAL" }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        timezone: "UTC",
        hp: 100,
        streakDays: 5,
        level: 1,
        currentXP: 0,
        xpToNextLevel: 1000,
        maxHp: 100,
        sylph: 0,
        totalStudyMinutes: 0,
        hasCompletedOnboarding: true,
      })
    },
    // Planner Modes are permanent, so the guards protecting planner-linked rows
    // always run. Nothing in these fixtures is planner-linked.
    plannerPlan: { findFirst: vi.fn().mockResolvedValue(null) },
    plannerQuestLink: { findFirst: vi.fn().mockResolvedValue(null) },
    floatingRestDay: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
}));

vi.mock("../../lib/ai/planning-engine", () => ({
  calculateDailyCapacity: vi.fn(),
  getHighestEffortLevel: vi.fn().mockResolvedValue("NORMAL"),
}));

vi.mock("../../lib/timezone-service", () => ({
  TimezoneService: {
    getUserLocalDate: vi.fn().mockReturnValue("2026-08-01"),
    getUserLocalTime: vi.fn().mockReturnValue("12:00"),
    getUserDayOfWeek: vi.fn().mockReturnValue("Saturday"),
    getDateRangeInUserTimezone: vi.fn().mockReturnValue(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]),
    getDateOffset: vi.fn().mockReturnValue("2026-08-02"),
    getDateString: vi.fn().mockReturnValue("2026-08-01"),
    getStartOfDayUTC: vi.fn().mockReturnValue(new Date("2026-08-01T00:00:00Z")),
    getEndOfDayUTC: vi.fn().mockReturnValue(new Date("2026-08-01T23:59:59.999Z")),
    getNextMidnightUTC: vi.fn().mockReturnValue(new Date("2026-08-02T00:00:00Z")),
    validateTimezone: vi.fn().mockReturnValue(true),
    getUserLocalDateOffset: vi.fn().mockReturnValue("2026-08-01"),
  }
}));

vi.mock("../../lib/timezone-server", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("UTC"),
  TimezoneServerService: {
    getUserTimezone: vi.fn().mockResolvedValue("UTC"),
  },
}));

describe("Phase 3A: Calendar Tools", () => {
  const userId = 1;
  const mockQuest = {
    id: 100,
    userId: 1,
    title: "Test Quest",
    requiredMinutes: 60,
    scheduledFor: "2026-08-01",
    status: "PENDING"
  };

  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockImplementation(async (run: any) => run(prisma));
    vi.clearAllMocks();
    vi.mocked(calculateDailyCapacity).mockReset();
  });

  describe("moveQuestTool", () => {
    it("fails if quest is not found or unauthorized", async () => {
      vi.mocked(prisma.quest.findUnique).mockResolvedValue(null);
      const res = await executeChatTool("moveQuest", { questId: 999, targetDate: "2026-08-05" }, userId);
      expect(res.error).toContain("not found or unauthorized");
    });

    it("fails if targetDate is malformed", async () => {
      const res = await executeChatTool("moveQuest", { questId: 100, targetDate: "2026/08/05" }, userId);
      expect(res.error).toContain("Invalid targetDate format");
    });

    it("fails if quest is already completed or failed", async () => {
      vi.mocked(prisma.quest.findUnique).mockResolvedValue({ ...mockQuest, status: "COMPLETED" } as any);
      let res = await executeChatTool("moveQuest", { questId: 100, targetDate: "2026-08-05" }, userId);
      expect(res.error).toContain("Only PENDING or IN_PROGRESS quests can be moved");

      vi.mocked(prisma.quest.findUnique).mockResolvedValue({ ...mockQuest, status: "FAILED" } as any);
      res = await executeChatTool("moveQuest", { questId: 100, targetDate: "2026-08-05" }, userId);
      expect(res.error).toContain("Only PENDING or IN_PROGRESS");
    });

    it("fails if target date is overloaded", async () => {
      vi.mocked(prisma.quest.findUnique).mockResolvedValue(mockQuest as any);
      vi.mocked(calculateDailyCapacity).mockResolvedValue({ "2026-08-05": 30 }); // 30m capacity, 60m required
      
      const res = await executeChatTool("moveQuest", { questId: 100, targetDate: "2026-08-05" }, userId);
      expect(res.error).toContain("overloaded");
    });

    it("successfully moves quest if capacity allows", async () => {
      vi.mocked(prisma.quest.findUnique).mockResolvedValue(mockQuest as any);
      vi.mocked(calculateDailyCapacity).mockResolvedValue({ "2026-08-05": 90 }); // 90m capacity, 60m required
      
      const res = await executeChatTool("moveQuest", { questId: 100, targetDate: "2026-08-05" }, userId);
      expect(res.success).toBe(true);
      expect(prisma.quest.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { scheduledFor: "2026-08-05" }
      });
    });

    it("blocks moving a quest onto a floating rest day with a repath hint", async () => {
      vi.spyOn(StudyScheduleService, "isUserRestDay").mockResolvedValueOnce(true);
      vi.mocked(prisma.quest.findUnique).mockResolvedValue(mockQuest as any);

      const res = await executeChatTool("moveQuest", { questId: 100, targetDate: "2026-08-05" }, userId);

      expect(res.error).toContain("REST_DAY_BLOCKED");
      expect(res.error).toContain("active study day");
      expect(prisma.quest.update).not.toHaveBeenCalled();
    });
  });

  describe("createQuestTool", () => {
    it("blocks AI quest creation on a designated rest day", async () => {
      vi.spyOn(StudyScheduleService, "isUserRestDay").mockResolvedValueOnce(true);

      const res = await executeChatTool(
        "createQuest",
        { title: "Physics Set B", requiredMinutes: 60, scheduledFor: "2026-08-25" },
        userId
      );

      expect(res.error).toContain("REST_DAY_BLOCKED");
    });
  });

  describe("swapQuestsTool", () => {
    it("fails if swapping the same quest", async () => {
      const res = await executeChatTool("swapQuests", { questIdA: 100, questIdB: 100 }, userId);
      expect(res.error).toContain("Cannot swap a quest with itself");
    });

    it("fails if either quest is completed or failed", async () => {
      const qA = { ...mockQuest, id: 101, status: "COMPLETED" };
      const qB = { ...mockQuest, id: 102, status: "PENDING" };
      vi.mocked(prisma.quest.findUnique).mockResolvedValueOnce(qA as any).mockResolvedValueOnce(qB as any);
      
      const res = await executeChatTool("swapQuests", { questIdA: 101, questIdB: 102 }, userId);
      expect(res.error).toContain("Only PENDING or IN_PROGRESS");
    });

    it("fails if swapping overloads a day", async () => {
      const qA = { ...mockQuest, id: 101, requiredMinutes: 90, scheduledFor: "2026-08-01" };
      const qB = { ...mockQuest, id: 102, requiredMinutes: 30, scheduledFor: "2026-08-02" };
      
      vi.mocked(prisma.quest.findUnique).mockResolvedValueOnce(qA as any).mockResolvedValueOnce(qB as any);
      
      vi.mocked(calculateDailyCapacity).mockResolvedValueOnce({ "2026-08-01": 0 });
      vi.mocked(calculateDailyCapacity).mockResolvedValueOnce({ "2026-08-02": 20 }); 

      const res = await executeChatTool("swapQuests", { questIdA: 101, questIdB: 102 }, userId);
      expect(res.error).toContain("overloaded");
    });

    it("successfully swaps if capacity allows", async () => {
      const qA = { ...mockQuest, id: 101, requiredMinutes: 30, scheduledFor: "2026-08-01" };
      const qB = { ...mockQuest, id: 102, requiredMinutes: 30, scheduledFor: "2026-08-02" };
      
      vi.mocked(prisma.quest.findUnique).mockResolvedValueOnce(qA as any).mockResolvedValueOnce(qB as any);
      vi.mocked(calculateDailyCapacity).mockResolvedValueOnce({ "2026-08-01": 60 });
      vi.mocked(calculateDailyCapacity).mockResolvedValueOnce({ "2026-08-02": 60 });

      const res = await executeChatTool("swapQuests", { questIdA: 101, questIdB: 102 }, userId);
      expect(res.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe("clearDayTool", () => {
    it("fails if date is malformed", async () => {
      const res = await executeChatTool("clearDay", { date: "August 1st 2026" }, userId);
      expect(res.error).toContain("Invalid date format");
    });

    it("successfully clears day when there is enough future capacity", async () => {
      const questsToClear = [
        { id: 1, requiredMinutes: 30, title: "A" },
        { id: 2, requiredMinutes: 60, title: "B" }
      ];
      vi.mocked(prisma.quest.findMany).mockResolvedValue(questsToClear as any);
      
      vi.mocked(calculateDailyCapacity).mockResolvedValue({
        "2026-08-02": 30, // only enough for A
        "2026-08-03": 90, // enough for B
      });

      const res = await executeChatTool("clearDay", { date: "2026-08-01" }, userId);
      expect(res.success).toBe(true);
      expect(res.message).toContain("Pushed 2 quests");
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("fails and prompts user when future capacity is exhausted", async () => {
      const questsToClear = [
        { id: 1, requiredMinutes: 90, title: "A" },
        { id: 2, requiredMinutes: 90, title: "B" }
      ];
      vi.mocked(prisma.quest.findMany).mockResolvedValue(questsToClear as any);
      
      // All future days are booked tight
      vi.mocked(calculateDailyCapacity).mockResolvedValue({
        "2026-08-02": 0, 
        "2026-08-03": 10,
        "2026-08-04": 20,
      });

      const res = await executeChatTool("clearDay", { date: "2026-08-01" }, userId);
      expect(res.error).toContain("Not enough capacity");
      expect(res.unplacedQuests).toContain("A");
    });
  });
});
