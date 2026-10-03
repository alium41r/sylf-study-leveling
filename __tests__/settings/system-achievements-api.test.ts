/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/achievements/route";
import { prisma } from "@/lib/prisma";
import {
  ACHIEVEMENTS_CATALOG,
  type EnrichedAchievement,
} from "@/lib/achievements-catalog";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    quest: { count: vi.fn() },
    friendship: { findMany: vi.fn() },
    studySession: { count: vi.fn() },
    subject: { count: vi.fn() },
    plannerPlan: { count: vi.fn() },
    focusSessionMember: { count: vi.fn() },
    userFocusBackground: { count: vi.fn() },
    userInventory: { count: vi.fn() },
    sylphLedger: { aggregate: vi.fn() },
    userAchievement: { findMany: vi.fn(), findUnique: vi.fn() },
    systemMessage: { create: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
}));
vi.mock("@/lib/cache-service", () => ({ invalidateRankingsCache: vi.fn() }));
const request = (id?: string) =>
  new Request("http://localhost/api/achievements", {
    method: id ? "POST" : "GET",
    headers: {
      authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    ...(id ? { body: JSON.stringify({ achievementId: id }) } : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 1,
    totalStudySeconds: 3600,
    totalStudyMinutes: 0,
    streakDays: 7,
    hunterRank: "MONARCH",
    level: 150,
  } as never);
  for (const count of [
    prisma.quest.count,
    prisma.studySession.count,
    prisma.subject.count,
    prisma.plannerPlan.count,
    prisma.focusSessionMember.count,
    prisma.userFocusBackground.count,
    prisma.userInventory.count,
  ])
    vi.mocked(count).mockResolvedValue(1);
  vi.mocked(prisma.friendship.findMany).mockResolvedValue([
    { userId: 1, friendId: 2 },
    { userId: 2, friendId: 1 },
  ] as never);
  vi.mocked(prisma.sylphLedger.aggregate).mockResolvedValue({
    _sum: { amount: -120 },
  } as never);
  vi.mocked(prisma.userAchievement.findMany).mockResolvedValue([
    { achievementId: "study_1_hour" },
    { achievementId: "exploration_theme" },
  ] as never);
  vi.mocked(prisma.userAchievement.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.systemMessage.create).mockResolvedValue({} as never);
  vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
    { claim_achievement_reward_atomic: { success: true } },
  ]);
});
describe("System milestone source of truth", () => {
  it("uses seconds, weekly streaks, the full rank ladder, distinct friends and new persisted systems", async () => {
    const response = await GET(request());
    const { achievements, retiredClaimedCount } = (await response.json()) as {
      achievements: EnrichedAchievement[];
      retiredClaimedCount: number;
    };
    const find = (id: string) => achievements.find((entry) => entry.id === id)!;
    expect(find("study_1_hour")).toMatchObject({
      currentProgress: 60,
      isClaimed: true,
    });
    expect(find("streak_7_day")).toMatchObject({
      currentProgress: 7,
      title: "7 week streak",
    });
    expect(find("rank_monarch").currentProgress).toBe(150);
    expect(find("rank_s").currentProgress).toBe(100);
    expect(find("social_10_friends").currentProgress).toBe(1);
    for (const id of [
      "subject_first",
      "planning_first",
      "social_party_session",
      "exploration_background",
      "exploration_inventory",
    ])
      expect(find(id).currentProgress).toBe(1);
    expect(find("exploration_spend_100").currentProgress).toBe(100);
    expect(achievements.some((entry) => entry.id === "exploration_theme")).toBe(
      false
    );
    expect(retiredClaimedCount).toBe(1);
    expect(prisma.studySession.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          endedAt: { not: null },
          OR: [
            { durationSeconds: { gte: 60 } },
            { durationMinutes: { gte: 1 } },
          ],
        }),
      })
    );
    expect(prisma.plannerPlan.count).toHaveBeenCalledWith({
      where: { userId: 1, activeRevisionId: { not: null } },
    });
  });
  it("validates redemption using the same live facts and awards only supported atomic XP/Sylph rewards", async () => {
    expect(
      ACHIEVEMENTS_CATALOG.every((entry) =>
        ["XP", "SYLPH"].includes(entry.reward.type)
      )
    ).toBe(true);
    expect((await POST(request("planning_first"))).status).toBe(200);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("claim_achievement_reward_atomic"),
      "1",
      "planning_first",
      0,
      100,
      "From Plan to Practice"
    );
    vi.mocked(prisma.studySession.count).mockResolvedValue(0);
    expect((await POST(request("study_first_session"))).status).toBe(400);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });
  it("retains claims and prevents a duplicate reward when the atomic race backstop fires", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockRejectedValueOnce({
      code: "S0001",
      message: "ALREADY_CLAIMED",
    });
    expect((await POST(request("rank_s"))).status).toBe(400);
    vi.mocked(prisma.userAchievement.findUnique).mockResolvedValueOnce({
      achievementId: "planning_first",
    } as never);
    expect((await POST(request("planning_first"))).status).toBe(400);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });
  it("fails visibly on data errors rather than silently resetting earned progress", async () => {
    vi.mocked(prisma.subject.count).mockRejectedValueOnce(
      new Error("database unavailable")
    );
    expect((await GET(request())).status).toBe(500);
  });
  it("rejects unauthenticated access and removed achievements", async () => {
    expect(
      (await GET(new Request("http://localhost/api/achievements"))).status
    ).toBe(401);
    expect((await POST(request("exploration_theme"))).status).toBe(404);
  });
});
