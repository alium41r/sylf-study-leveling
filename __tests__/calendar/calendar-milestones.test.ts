import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../lib/prisma";
import { StudyScheduleService } from "../../lib/study-schedule-service";

const USER = {
  id: 1,
  timezone: "UTC",
  dailyGoalMinutes: 120,
  restDays: [0],
  enableHpPenalty: true,
};

describe("Calendar Milestones & Goal Color Linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes objective milestone banners and goal-colored quests in the month payload", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(USER as any);
    vi.spyOn(prisma.studySession, "findMany").mockResolvedValueOnce([] as any);

    vi.spyOn(prisma.quest, "findMany").mockResolvedValueOnce([
      {
        id: 501,
        userId: 1,
        title: "Past Paper",
        description: null,
        status: "ACTIVE",
        difficulty: "NORMAL",
        requiredMinutes: 60,
        elapsedSeconds: 0,
        xpReward: 300,
        sylphReward: 30,
        scheduledFor: "2026-08-22",
        createdAt: new Date(),
        goal: { id: 7, title: "Physics", color: "VIOLET" },
      } as any,
    ]);

    vi.spyOn(prisma.goal, "findMany").mockResolvedValueOnce([
      { id: 7, title: "Physics", color: "VIOLET", targetDate: new Date("2026-08-31T00:00:00Z") } as any,
    ] as any);

    const result = await StudyScheduleService.getMonthCalendarData(1, 2026, 7); // August 2026

    // Milestone banner for the objective deadline
    expect(result.milestones).toHaveLength(1);
    expect(result.milestones[0]).toMatchObject({
      id: 7,
      title: "Physics",
      color: "VIOLET",
      date: "2026-08-31",
    });
    expect(typeof result.milestones[0].targetDate).toBe("string");

    // Linked quests carry their parent goal's accent for color inheritance
    const aug22 = result.days.find((d) => d.date === "2026-08-22");
    expect(aug22).toBeDefined();
    expect(aug22!.quests[0].goal).toEqual({ id: 7, title: "Physics", color: "VIOLET" });
  });

  it("excludes objective deadlines that fall outside the displayed month", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(USER as any);
    vi.spyOn(prisma.studySession, "findMany").mockResolvedValueOnce([] as any);
    vi.spyOn(prisma.quest, "findMany").mockResolvedValueOnce([] as any);
    vi.spyOn(prisma.goal, "findMany").mockResolvedValueOnce([
      { id: 7, title: "Physics", color: "VIOLET", targetDate: new Date("2026-09-30T00:00:00Z") } as any,
    ] as any);

    const result = await StudyScheduleService.getMonthCalendarData(1, 2026, 7);

    expect(result.milestones).toHaveLength(0);
  });

  it("survives an unavailable goals query without breaking the grid", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(USER as any);
    vi.spyOn(prisma.studySession, "findMany").mockResolvedValueOnce([] as any);
    vi.spyOn(prisma.quest, "findMany").mockResolvedValueOnce([] as any);
    vi.spyOn(prisma.goal, "findMany").mockRejectedValueOnce(new Error("goals table unavailable"));

    const result = await StudyScheduleService.getMonthCalendarData(1, 2026, 7);

    expect(result.milestones).toEqual([]);
    expect(result.days).toHaveLength(31);
  });

  it("includes floating rest days in the month payload", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(USER as any);
    vi.spyOn(prisma.studySession, "findMany").mockResolvedValueOnce([] as any);
    vi.spyOn(prisma.quest, "findMany").mockResolvedValueOnce([] as any);
    vi.spyOn(prisma.goal, "findMany").mockResolvedValueOnce([] as any);
    vi.spyOn(prisma.floatingRestDay, "findMany").mockResolvedValueOnce([
      { dateKey: "2026-08-22" },
      { dateKey: "2026-08-29" },
    ] as any);

    const result = await StudyScheduleService.getMonthCalendarData(1, 2026, 7);

    expect(result.floatingRestDays).toEqual(["2026-08-22", "2026-08-29"]);
  });
});
