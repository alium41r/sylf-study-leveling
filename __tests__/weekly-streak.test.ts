import { describe, it, expect } from "vitest";
import {
  getWeeklyBounds,
  calculateWeeklyQuestReward,
  calculateWeeklyStreak,
  getStreakMultiplier,
  xpForNextLevel,
} from "@/lib/game-engine";

describe("Weekly Bounds Calculation", () => {
  it("computes correct Monday start and Sunday end in UTC", () => {
    // 2026-08-14 is a Friday
    const testDate = new Date("2026-08-14T12:00:00Z");
    const bounds = getWeeklyBounds(testDate, "UTC");

    expect(bounds.weekStart.getUTCDay()).toBe(1); // Monday
    expect(bounds.weekEnd.getUTCDay()).toBe(0); // Sunday
    expect(bounds.weekKey).toBe("2026-W33");
    expect(bounds.timeRemainingMs).toBeGreaterThan(0);
    expect(bounds.daysRemaining).toBeGreaterThanOrEqual(1);
  });

  it("computes exact local Monday and Sunday bounds for Tokyo (UTC+9)", () => {
    // 2026-08-14 12:00 UTC is 2026-08-14 21:00 JST (Friday)
    const testDate = new Date("2026-08-14T12:00:00Z");
    const bounds = getWeeklyBounds(testDate, "Asia/Tokyo");

    // Tokyo Monday 00:00 JST = Sunday 15:00 UTC
    expect(bounds.weekStart.toISOString()).toBe("2026-08-09T15:00:00.000Z");
    // Tokyo Sunday 23:59:59.999 JST = Sunday 14:59:59.999 UTC
    expect(bounds.weekEnd.toISOString()).toBe("2026-08-16T14:59:59.999Z");
    expect(bounds.weekKey).toBe("2026-W33");
  });

  it("computes exact local Monday and Sunday bounds for New York (EDT, UTC-4)", () => {
    // 2026-08-14 12:00 UTC is 2026-08-14 08:00 EDT (Friday)
    const testDate = new Date("2026-08-14T12:00:00Z");
    const bounds = getWeeklyBounds(testDate, "America/New_York");

    // NY Monday 00:00 EDT = Monday 04:00 UTC
    expect(bounds.weekStart.toISOString()).toBe("2026-08-10T04:00:00.000Z");
    // NY Sunday 23:59:59.999 EDT = Monday 03:59:59.999 UTC
    expect(bounds.weekEnd.toISOString()).toBe("2026-08-17T03:59:59.999Z");
    expect(bounds.weekKey).toBe("2026-W33");
  });
});

describe("Level-Scaled Weekly Quest Rewards", () => {
  it("ensures EXP reward is substantially higher than Sylph and scales with level", () => {
    for (const level of [1, 3, 5, 10, 25, 50]) {
      const rewards = calculateWeeklyQuestReward(level);

      // EXP must always exceed Sylph
      expect(rewards.xpReward).toBeGreaterThan(rewards.sylphReward);
      // Base EXP reward at level 1 is >= 200 XP (282 XP under the canonical curve)
      expect(rewards.xpReward).toBeGreaterThanOrEqual(200);
      // Sylph reward is tightly balanced (starts around 65 at Lv 1, scales smoothly)
      expect(rewards.sylphReward).toBeGreaterThanOrEqual(50);
      expect(rewards.sylphReward).toBeLessThan(1000);
    }
    // Canonical within-level bucket at Lv 1: XP_req(2) = floor(100*2^1.5) = 282
    expect(calculateWeeklyQuestReward(1).xpReward).toBe(282);
  });

  it("scales rewards progressively higher for higher level hunters", () => {
    const r1 = calculateWeeklyQuestReward(1);
    const r5 = calculateWeeklyQuestReward(5);
    const r10 = calculateWeeklyQuestReward(10);

    expect(r5.xpReward).toBeGreaterThan(r1.xpReward);
    expect(r10.xpReward).toBeGreaterThan(r5.xpReward);
    expect(r10.sylphReward).toBeGreaterThan(r5.sylphReward);
  });
});

describe("Weekly Streak Calculation", () => {
  it("initializes streak to 1 for first completed week", () => {
    const result = calculateWeeklyStreak(null, "2026-W33", 0);
    expect(result.newStreak).toBe(1);
    expect(result.freezeUsed).toBe(false);
  });

  it("maintains streak when already credited in the same week", () => {
    const result = calculateWeeklyStreak("2026-W33", "2026-W33", 4);
    expect(result.newStreak).toBe(4);
    expect(result.freezeUsed).toBe(false);
  });

  it("increments streak when completed in consecutive weeks", () => {
    const result = calculateWeeklyStreak("2026-W32", "2026-W33", 4);
    expect(result.newStreak).toBe(5);
    expect(result.freezeUsed).toBe(false);
  });

  it("preserves and increments streak when 1 week is missed but Streak Freeze is present", () => {
    const result = calculateWeeklyStreak("2026-W31", "2026-W33", 4, true);
    expect(result.newStreak).toBe(5);
    expect(result.freezeUsed).toBe(true);
  });

  it("resets streak to 1 if a week is missed without Streak Freeze", () => {
    const result = calculateWeeklyStreak("2026-W31", "2026-W33", 4, false);
    expect(result.newStreak).toBe(1);
    expect(result.freezeUsed).toBe(false);
  });
});

describe("Weekly Streak Multiplier", () => {
  it("provides tiered Sylph multipliers capped at 1.5x", () => {
    expect(getStreakMultiplier(0)).toBe(1.0);
    expect(getStreakMultiplier(1)).toBe(1.05);
    expect(getStreakMultiplier(2)).toBe(1.15);
    expect(getStreakMultiplier(4)).toBe(1.3);
    expect(getStreakMultiplier(8)).toBe(1.5);
    expect(getStreakMultiplier(20)).toBe(1.5);
  });
});
