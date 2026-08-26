/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH as patchQuest } from "@/app/api/quests/[id]/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    quest: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    goal: {
      findFirst: vi.fn(),
    },
    systemMessage: {
      create: vi.fn(),
    },
    hpLedger: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
  },
}));

describe("quest completion atomicity (T3 regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function makeReq(body: Record<string, unknown>) {
    const token = await signToken({ userId: 101, username: "t3" });
    return new NextRequest("http://localhost/api/quests/9", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  function mockQuest() {
    (prisma.quest.findFirst as any).mockResolvedValue({
      id: 9,
      userId: 101,
      status: "ACTIVE",
      title: "T3 Atomicity Quest",
      xpReward: 150,
      sylphReward: 25,
      difficulty: "NORMAL",
      isGateKeyApplied: false,
      isKamishWardActive: false,
      scheduledFor: "",
      targetMinutes: 45,
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 101,
      timezone: "UTC",
      hp: 80,
      maxHp: 100,
      level: 1,
      currentXP: 0,
      xpToNextLevel: 282,
      hunterRank: "E",
    });
  }

  it("claims the reward BEFORE writing quest status (no lost-reward window)", async () => {
    mockQuest();
    const claimSpy = (prisma.$queryRaw as any).mockResolvedValue([
      {
        claim_quest_reward: {
          success: true,
          status: "COMPLETED",
          xpGained: 150,
          sylphGained: 25,
          totalSylphEarned: 25,
          hpHealed: 20,
          level: 1,
          currentXP: 150,
          xpToNextLevel: 282,
          hunterRank: "E",
          levelsGained: 0,
          didRankUp: false,
        },
      },
    ]);
    const updateSpy = (prisma.quest.update as any).mockResolvedValue({
      id: 9,
      status: "COMPLETED",
    });

    const res = await patchQuest(await makeReq({ status: "COMPLETED" }), {
      params: Promise.resolve({ id: "9" }),
    });

    expect(res.status).toBe(200);
    expect(claimSpy.mock.invocationCallOrder[0]).toBeLessThan(
      updateSpy.mock.invocationCallOrder[0]
    );
  });

  it("never writes COMPLETED status when the claim fails (retry-safe)", async () => {
    mockQuest();
    (prisma.$queryRaw as any).mockRejectedValue(new Error("connection lost"));
    const updateSpy = (prisma.quest.update as any).mockResolvedValue({});

    const res = await patchQuest(await makeReq({ status: "COMPLETED" }), {
      params: Promise.resolve({ id: "9" }),
    });

    expect(res.status).toBe(500);
    // Status was NOT written → no orphaned COMPLETED quest without rewards.
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("preserves the FAILED status when the claim reports a late quest", async () => {
    mockQuest();
    (prisma.$queryRaw as any).mockResolvedValue([
      {
        claim_quest_reward: {
          success: true,
          status: "FAILED",
          penalty: { hpLost: 10, currentHp: 70 },
        },
      },
    ]);
    const updateSpy = (prisma.quest.update as any).mockResolvedValue({
      id: 9,
      status: "FAILED",
    });

    const res = await patchQuest(await makeReq({ status: "COMPLETED", title: "Renamed" }), {
      params: Promise.resolve({ id: "9" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.quest.status).toBe("FAILED");
    // Field edits are persisted WITHOUT clobbering the FAILED status.
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 9 },
      data: expect.not.objectContaining({ status: "COMPLETED" }),
    });
  });
});
