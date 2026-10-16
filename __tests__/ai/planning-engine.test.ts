import { describe, it, expect, vi, beforeEach } from "vitest";
import { 
  normalizeDifficulty, 
  scheduleQuestsDeterministically, 
  calculateDailyCapacity,
  ProposedQuest,
  CapacityMatrix
} from "../../lib/ai/planning-engine";
import { prisma } from "../../lib/prisma";
import { EFFORT_CONFIG } from "../../lib/game-engine";

// Mock prisma for capacity tests
vi.mock("../../lib/prisma", () => ({
  prisma: {
    quest: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    hpLedger: {
      findMany: vi.fn(),
    },
    goal: {
      findFirst: vi.fn(),
    },
    floatingRestDay: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  }
}));

describe("Planning Engine", () => {
  describe("normalizeDifficulty", () => {
    it("assigns EASY when quest is much shorter than average", () => {
      expect(normalizeDifficulty(20, 60)).toBe("EASY"); // ratio: 0.33
      expect(normalizeDifficulty(30, 60)).toBe("EASY"); // ratio: 0.5
    });

    it("assigns NORMAL when quest is around average", () => {
      expect(normalizeDifficulty(45, 60)).toBe("NORMAL"); // ratio: 0.75
      expect(normalizeDifficulty(60, 60)).toBe("NORMAL"); // ratio: 1.0
      expect(normalizeDifficulty(70, 60)).toBe("NORMAL"); // ratio: 1.16
    });

    it("assigns HARD when quest is longer than average", () => {
      expect(normalizeDifficulty(90, 60)).toBe("HARD"); // ratio: 1.5
      expect(normalizeDifficulty(110, 60)).toBe("HARD"); // ratio: 1.83
    });

    it("assigns EXPERT when quest is extremely long relative to average", () => {
      expect(normalizeDifficulty(150, 60)).toBe("EXPERT"); // ratio: 2.5
    });
  });

  describe("getSituationalFlags", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(prisma.goal.findFirst).mockResolvedValue({ effortLevel: "NORMAL" } as any);
      vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _sum: { requiredMinutes: 0 } } as any);
      vi.mocked(prisma.quest.findMany).mockResolvedValue([]);
      vi.mocked(prisma.hpLedger.findMany).mockResolvedValue([]);
    });

    it("returns all false for a healthy user", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 100, streakDays: 5 } as any);
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags).toEqual({ isBurnoutRisk: false, isOverloaded: false, isStruggling: false });
    });

    it("detects burnout when HP is critically low", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 20, streakDays: 5 } as any);
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isBurnoutRisk).toBe(true);
    });

    it("detects burnout when HP is < 50 and taking more damage than healing", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 45, streakDays: 5 } as any);
      vi.mocked(prisma.hpLedger.findMany).mockResolvedValue([
        { amount: -20 }, { amount: -15 }, { amount: 10 }
      ] as any);
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isBurnoutRisk).toBe(true);
    });

    it("detects overloaded when scheduled minutes > 90% capacity", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 100, streakDays: 5 } as any);
      // NORMAL effort = 120/day. 7 days = 840. 90% = 756.
      vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _sum: { requiredMinutes: 760 } } as any);
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isOverloaded).toBe(true);
    });

    it("detects struggling when streak is 0 and completion is poor", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 100, streakDays: 0 } as any);
      vi.mocked(prisma.quest.findMany).mockResolvedValue([
        { status: "FAILED" }, { status: "FAILED" }, { status: "COMPLETED" }
      ] as any);
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isStruggling).toBe(true);
    });

    // --- Boundary Tests ---
    
    it("boundary: exactly 30 HP is not automatic burnout (requires negative trend)", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 30, streakDays: 5 } as any);
      vi.mocked(prisma.hpLedger.findMany).mockResolvedValue([{ amount: 10 }] as any); // positive trend
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isBurnoutRisk).toBe(false);
    });

    it("boundary: 29 HP is automatic burnout regardless of trend", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 29, streakDays: 5 } as any);
      vi.mocked(prisma.hpLedger.findMany).mockResolvedValue([{ amount: 50 }] as any); // positive trend
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isBurnoutRisk).toBe(true);
    });

    it("boundary: exactly 50 HP is not burnout even with negative trend", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 50, streakDays: 5 } as any);
      vi.mocked(prisma.hpLedger.findMany).mockResolvedValue([{ amount: -50 }] as any); // negative trend
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isBurnoutRisk).toBe(false);
    });

    it("boundary: exactly 90% capacity is not overloaded", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 100, streakDays: 5 } as any);
      // NORMAL effort = 120/day. 7 days = 840. 90% = 756.
      vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _sum: { requiredMinutes: 756 } } as any);
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isOverloaded).toBe(false);
    });

    it("boundary: just above 90% capacity is overloaded", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 100, streakDays: 5 } as any);
      vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _sum: { requiredMinutes: 757 } } as any);
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isOverloaded).toBe(true);
    });

    it("boundary: zero capacity (no scheduled quests) is not overloaded", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 100, streakDays: 5 } as any);
      vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _sum: { requiredMinutes: 0 } } as any);
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isOverloaded).toBe(false);
    });

    it("boundary: new user with no history does not trigger flags", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 100, streakDays: 0 } as any);
      vi.mocked(prisma.quest.findMany).mockResolvedValue([]); // no quests yet
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      // 0 streak but 0 quests means struggling is true by current logic ("struggling to start")
      // which is expected per the implementation. Burnout/Overload should be false.
      expect(flags.isBurnoutRisk).toBe(false);
      expect(flags.isOverloaded).toBe(false);
      expect(flags.isStruggling).toBe(true);
    });

    it("boundary: missing health data defaults to safe", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isBurnoutRisk).toBe(false);
      expect(flags.isOverloaded).toBe(false);
      expect(flags.isStruggling).toBe(false);
    });

    it("boundary: simultaneous burnout and overload", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 20, streakDays: 5 } as any); // Burnout
      vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _sum: { requiredMinutes: 760 } } as any); // Overload
      const { getSituationalFlags } = await import("../../lib/ai/planning-engine");
      const flags = await getSituationalFlags(1);
      expect(flags.isBurnoutRisk).toBe(true);
      expect(flags.isOverloaded).toBe(true);
      expect(flags.isStruggling).toBe(false);
    });
  });

  describe("calculateDailyCapacity", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns full budget when no quests exist", async () => {
      vi.mocked(prisma.quest.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 100, streakDays: 5 } as any);
      vi.mocked(prisma.goal.findFirst).mockResolvedValue({ effortLevel: "NORMAL" } as any);
      vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _sum: { requiredMinutes: 0 } } as any);
      
      const matrix = await calculateDailyCapacity(1, "NORMAL", "2026-08-01", "2026-08-03");
      const budget = EFFORT_CONFIG["NORMAL"].dailyMinutes; // 120
      
      expect(matrix).toEqual({
        "2026-08-01": budget,
        "2026-08-02": budget,
        "2026-08-03": budget,
      });
    });

    it("subtracts scheduled minutes from budget", async () => {
      vi.mocked(prisma.quest.findMany).mockResolvedValueOnce([
        { scheduledFor: "2026-08-01", requiredMinutes: 40 } as any,
        { scheduledFor: "2026-08-02", requiredMinutes: 60 } as any,
      ]);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 100, streakDays: 5 } as any);
      vi.mocked(prisma.goal.findFirst).mockResolvedValue({ effortLevel: "INTENSE" } as any);
      vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _sum: { requiredMinutes: 0 } } as any);
      
      const matrix = await calculateDailyCapacity(1, "INTENSE", "2026-08-01", "2026-08-03");
      const budget = EFFORT_CONFIG["INTENSE"].dailyMinutes; // 240
      
      expect(matrix).toEqual({
        "2026-08-01": 200, // 240 - 40
        "2026-08-02": 180, // 240 - 60
        "2026-08-03": 240, // empty
      });
    });

    it("floors capacity at 0 if overloaded", async () => {
      vi.mocked(prisma.quest.findMany).mockResolvedValueOnce([
        { scheduledFor: "2026-08-01", requiredMinutes: 120 } as any, // user scheduled more manually
      ]);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 100, streakDays: 5 } as any);
      vi.mocked(prisma.goal.findFirst).mockResolvedValue({ effortLevel: "RELAXED" } as any);
      vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _sum: { requiredMinutes: 0 } } as any);
      
      const matrix = await calculateDailyCapacity(1, "RELAXED", "2026-08-01", "2026-08-01");
      
      expect(matrix["2026-08-01"]).toBe(0); // 60 - 120 -> 0
    });

    it("does not silently stack burnout and overload reductions (prioritizes burnout 50%)", async () => {
      vi.mocked(prisma.quest.findMany).mockResolvedValueOnce([]);
      // Burnout
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ hp: 20, streakDays: 5 } as any);
      // Overload
      vi.mocked(prisma.goal.findFirst).mockResolvedValue({ effortLevel: "NORMAL" } as any);
      vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _sum: { requiredMinutes: 400 } } as any); 
      
      const matrix = await calculateDailyCapacity(1, "NORMAL", "2026-08-01", "2026-08-01");
      const budget = EFFORT_CONFIG["NORMAL"].dailyMinutes; // 120
      
      // Should be Math.floor(120 * 0.5) = 60. Not (120 * 0.5 * 0.75) = 45.
      expect(matrix["2026-08-01"]).toBe(60); 
    });

    it("hard-blocks floating rest days in the capacity matrix", async () => {
      vi.mocked(prisma.quest.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        hp: 100,
        streakDays: 5,
        restDays: [],
      } as any);
      vi.mocked(prisma.goal.findFirst).mockResolvedValue({ effortLevel: "NORMAL" } as any);
      vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _sum: { requiredMinutes: 0 } } as any);
      // 2026-08-02 is designated a floating rest day
      vi.mocked(prisma.floatingRestDay.findMany).mockResolvedValueOnce([
        { dateKey: "2026-08-02" },
      ] as any);

      const matrix = await calculateDailyCapacity(1, "NORMAL", "2026-08-01", "2026-08-03");

      expect(matrix["2026-08-02"]).toBe(-999999); // no capacity on floating rest days
      expect(matrix["2026-08-01"]).toBe(120);
      expect(matrix["2026-08-03"]).toBe(120);
    });
  });

  describe("scheduleQuestsDeterministically", () => {
    const makeQuest = (proposedDate: string, requiredMinutes: number): ProposedQuest => ({
      title: "Test",
      description: "Test",
      requiredMinutes,
      xpReward: 10,
      sylphReward: 0,
      proposedDate,
    });

    it("schedules on proposed date if capacity allows", () => {
      const quests = [makeQuest("2026-08-02", 30)];
      const matrix: CapacityMatrix = { "2026-08-01": 60, "2026-08-02": 60, "2026-08-03": 60 };
      
      const result = scheduleQuestsDeterministically(quests, matrix, "2026-08-01", "2026-08-03");
      
      expect(result[0].finalDate).toBe("2026-08-02");
    });

    it("pushes to next available day if proposed date lacks capacity", () => {
      const quests = [makeQuest("2026-08-01", 60)];
      const matrix: CapacityMatrix = { "2026-08-01": 30, "2026-08-02": 30, "2026-08-03": 60 };
      
      const result = scheduleQuestsDeterministically(quests, matrix, "2026-08-01", "2026-08-03");
      
      expect(result[0].finalDate).toBe("2026-08-03");
    });

    it("handles multiple quests sequentially reducing capacity", () => {
      const quests = [
        makeQuest("2026-08-01", 40),
        makeQuest("2026-08-01", 40), // wants the same day
      ];
      const matrix: CapacityMatrix = { "2026-08-01": 60, "2026-08-02": 60 };
      
      const result = scheduleQuestsDeterministically(quests, matrix, "2026-08-01", "2026-08-02");
      
      expect(result[0].finalDate).toBe("2026-08-01"); // Takes 40m, 20m left
      expect(result[1].finalDate).toBe("2026-08-02"); // Pushed to next day because 40 > 20
    });

    it("finds the day with most capacity if no single day can fit the quest (fallback)", () => {
      const quests = [makeQuest("2026-08-01", 90)];
      // All days are constrained
      const matrix: CapacityMatrix = { "2026-08-01": 20, "2026-08-02": 60, "2026-08-03": 40 };
      
      const result = scheduleQuestsDeterministically(quests, matrix, "2026-08-01", "2026-08-03");
      
      // Even though 90 > 60, it picks 2026-08-02 because it has the most capacity
      expect(result[0].finalDate).toBe("2026-08-02");
    });

    it("repairs a completely hallucinated date out of range", () => {
      const quests = [makeQuest("2099-12-31", 30)]; // Way out of range
      const matrix: CapacityMatrix = { "2026-08-01": 60, "2026-08-02": 60 };
      
      const result = scheduleQuestsDeterministically(quests, matrix, "2026-08-01", "2026-08-02");
      
      // Should fallback to first available valid day
      expect(result[0].finalDate).toBe("2026-08-01");
    });
  });
});
