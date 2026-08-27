/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/cognitive-stats/invest/route";
import {
  getStatTier,
  getInvestCost,
  getStatCap,
  canInvest,
  getCognitiveEffects,
  getAbilitySummary,
  ABILITY_TIERS,
  MAX_ABILITY_TIER,
} from "@/lib/cognitive-stats";

vi.mock("@/lib/prisma", () => {
  const updateSpy = vi.fn();
  return {
    prisma: {
      user: { findUnique: vi.fn(), update: vi.fn() },
      userStats: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: updateSpy,
      },
      sylphLedger: { create: vi.fn().mockResolvedValue({}) },
      statInvestLedger: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (input: any) => {
        if (typeof input === "function") {
          return input({
            user: { findUnique: prisma.user.findUnique, update: prisma.user.update },
            userStats: { findUnique: prisma.userStats.findUnique, create: prisma.userStats.create, update: prisma.userStats.update },
            sylphLedger: { create: prisma.sylphLedger.create },
            statInvestLedger: { create: prisma.statInvestLedger.create },
          });
        }
        return input;
      }),
      _updateSpy: updateSpy,
    },
  };
});

const authed = (body?: unknown) =>
  new NextRequest("http://localhost:3000/api/cognitive-stats/invest", {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const baseStats = {
  userId: 1,
  skillPoints: 5,
  endurance: 10,
  tenacity: 10,
  velocity: 10,
  discipline: 10,
  synthesis: 10,
};

describe("Cognitive Stats — cost curve, tiers & effects", () => {
  it("derives ability tiers at the exact thresholds", () => {
    expect(ABILITY_TIERS).toEqual([20, 35, 50, 65, 80, 100]);
    expect(MAX_ABILITY_TIER).toBe(6);
    expect(getStatTier(10)).toBe(0);
    expect(getStatTier(19)).toBe(0);
    expect(getStatTier(20)).toBe(1);
    expect(getStatTier(34)).toBe(1);
    expect(getStatTier(35)).toBe(2);
    expect(getStatTier(100)).toBe(6);
  });

  it("scales invest costs with the stat band (dual currency)", () => {
    expect(getInvestCost(10, "sp")).toBe(1);
    expect(getInvestCost(10, "sylph")).toBe(60);
    expect(getInvestCost(20, "sp")).toBe(2);
    expect(getInvestCost(20, "sylph")).toBe(120);
    expect(getInvestCost(50, "sp")).toBe(5);
    expect(getInvestCost(95, "sp")).toBe(9);
    expect(getInvestCost(95, "sylph")).toBe(540);
  });

  it("only allows a full +5 step inside the cap", () => {
    expect(canInvest(10)).toBe(true);
    expect(canInvest(95)).toBe(true); // 95 + 5 = 100
    expect(canInvest(96)).toBe(false);
    expect(canInvest(100)).toBe(false);
  });

  it("gates attributes by level: cap = 10 + (level − 1) × 5", () => {
    expect(getStatCap(1)).toBe(10);
    expect(getStatCap(2)).toBe(15);
    expect(getStatCap(3)).toBe(20);
    expect(getStatCap(19)).toBe(100);
    expect(getStatCap(99)).toBe(100);

    // Level 2 cap 15: only one +5 invest fits.
    expect(canInvest(10, 15)).toBe(true);
    expect(canInvest(15, 15)).toBe(false);
    // Level 1 cap 10: nothing investable yet.
    expect(canInvest(10, 10)).toBe(false);
  });

  it("computes the exact ability effects per stat", () => {
    const fx = getCognitiveEffects({
      endurance: 20, // tier 1
      tenacity: 50, // tier 3
      velocity: 65, // tier 4
      discipline: 35, // tier 2
      synthesis: 80, // tier 5
    });
    expect(fx.bonusMaxHp).toBe(5);
    expect(fx.hpPenaltyMultiplier).toBe(0.95);
    expect(fx.weeklyTargetMinutes).toBe(180 * 0.85); // 153
    expect(fx.sessionXpMultiplier).toBe(1.08);
    expect(fx.bonusChatQuota).toBe(2);
    expect(fx.masteryProgressMultiplier).toBe(1.25);
    expect(fx.apexForgeBonusSp).toBe(1);
  });

  it("synthesis apex bonus only unlocks at tier 4+ (value 65)", () => {
    expect(getCognitiveEffects({ synthesis: 50 }).apexForgeBonusSp).toBe(0);
    expect(getCognitiveEffects({ synthesis: 65 }).apexForgeBonusSp).toBe(1);
    expect(getCognitiveEffects({ synthesis: 80 }).apexForgeBonusSp).toBe(1);
  });

  it("tenacity weekly target floors at −30% (126 minutes)", () => {
    expect(getCognitiveEffects({ tenacity: 100 }).weeklyTargetMinutes).toBe(126);
  });

  it("summarizes abilities with next-tier info", () => {
    const s = getAbilitySummary("velocity", 25);
    expect(s.tier).toBe(1);
    expect(s.nextTierAt).toBe(35);
    expect(s.perkName).toBe("Flow State");
  });
});

describe("Cognitive Stats — invest API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 1,
      level: 5, // cap = 10 + 4×5 = 30 → a +5 invest from 10 fits
      currentXP: 0,
      sylph: 500,
    } as any);
    vi.mocked(prisma.userStats.findUnique).mockResolvedValue({ ...baseStats } as any);
    vi.mocked(prisma.userStats.create).mockResolvedValue({ ...baseStats } as any);
    vi.mocked(prisma.userStats.update).mockResolvedValue({
      ...baseStats,
      velocity: 15,
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);
  });

  it("GET returns stats, balances and per-stat costs", async () => {
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stats.endurance).toBe(10);
    expect(data.skillPoints).toBe(5);
    expect(data.sylph).toBe(500);
    expect(data.abilities).toHaveLength(5);
    expect(data.abilities[0].costSp).toBe(1);
    expect(data.abilities[0].costSylph).toBe(60);
  });

  it("invests Sylph into a stat (+5, deducts 60, audits the ledger)", async () => {
    // First read (existing state) → velocity 10; fresh re-read after the
    // update → velocity 15.
    vi.mocked(prisma.userStats.findUnique).mockResolvedValue({
      ...baseStats,
      velocity: 15,
    } as any);
    vi.mocked(prisma.userStats.findUnique).mockResolvedValueOnce({ ...baseStats } as any);

    const res = await POST(authed({ stat: "velocity", currency: "sylph" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.stats.velocity).toBe(15);
    expect(data.cost).toBe(60);
    expect(data.sylph).toBe(440);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { sylph: { decrement: 60 } },
      })
    );
    expect(prisma.statInvestLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statKey: "velocity",
          currencyUsed: "sylph",
          cost: 60,
          statValueAfter: 15,
        }),
      })
    );
  });

  it("invests SP into a stat (+5, deducts 1 SP)", async () => {
    const res = await POST(authed({ stat: "endurance", currency: "sp" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.cost).toBe(1);
    expect(prisma.userStats.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ skillPoints: { decrement: 1 }, endurance: 15 }),
      })
    );
  });

  it("rejects when Sylph balance is too low", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 1,
      level: 5,
      currentXP: 0,
      sylph: 30,
    } as any);
    const res = await POST(authed({ stat: "velocity", currency: "sylph" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Not enough Sylph");
  });

  it("rejects a stat at its cap", async () => {
    vi.mocked(prisma.userStats.findUnique).mockResolvedValue({
      ...baseStats,
      velocity: 99,
    } as any);
    const res = await POST(authed({ stat: "velocity", currency: "sylph" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid stat / currency", async () => {
    const badStat = await POST(authed({ stat: "luck", currency: "sp" }));
    expect(badStat.status).toBe(400);
    const badCurrency = await POST(authed({ stat: "velocity", currency: "xp" }));
    expect(badCurrency.status).toBe(400);
  });
});
