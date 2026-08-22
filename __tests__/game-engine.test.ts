import { describe, it, expect } from "vitest";
import {
  calculateRequiredXp,
  calculateLevelFromXp,
  getRankFromLevel,
  getLevelProgress,
  RANK_THRESHOLDS,
  clampCognitiveStat,
  COGNITIVE_STAT_MIN,
  COGNITIVE_STAT_MAX,
} from "@/lib/game-engine";

describe("Game Engine Phase 1 — Deterministic Progression & Cognitive Vectors", () => {
  describe("XP Curve: XP_req(L) = floor(100 * L^1.5)", () => {
    it("evaluates exact discrete required XP milestones", () => {
      expect(calculateRequiredXp(1)).toBe(100);
      expect(calculateRequiredXp(2)).toBe(282); // floor(100 * 2^1.5) = floor(282.84)
      expect(calculateRequiredXp(3)).toBe(519); // floor(100 * 3^1.5) = floor(519.61)
      expect(calculateRequiredXp(4)).toBe(800); // floor(100 * 4^1.5) = 800
      expect(calculateRequiredXp(10)).toBe(3162); // floor(100 * 10^1.5) = floor(3162.27)
      expect(calculateRequiredXp(25)).toBe(12500); // floor(100 * 25^1.5) = 12500
      expect(calculateRequiredXp(50)).toBe(35355); // floor(100 * 50^1.5) = floor(35355.33)
      expect(calculateRequiredXp(100)).toBe(100000); // floor(100 * 100^1.5) = 100000
      expect(calculateRequiredXp(150)).toBe(183711); // floor(100 * 150^1.5) = floor(183711.73)
    });

    it("handles boundary/edge level inputs gracefully", () => {
      expect(calculateRequiredXp(0)).toBe(100);
      expect(calculateRequiredXp(-5)).toBe(100);
    });
  });

  describe("Inverse Level Derivation: calculateLevelFromXp", () => {
    it("accurately computes level for sub-level 2 XP values", () => {
      expect(calculateLevelFromXp(0)).toBe(1);
      expect(calculateLevelFromXp(50)).toBe(1);
      expect(calculateLevelFromXp(100)).toBe(1);
      expect(calculateLevelFromXp(281)).toBe(1);
    });

    it("evaluates exact boundary transitions with zero off-by-one errors", () => {
      // Level 2 boundary (282 XP)
      expect(calculateLevelFromXp(281)).toBe(1);
      expect(calculateLevelFromXp(282)).toBe(2);

      // Level 3 boundary (519 XP)
      expect(calculateLevelFromXp(518)).toBe(2);
      expect(calculateLevelFromXp(519)).toBe(3);

      // Level 4 boundary (800 XP)
      expect(calculateLevelFromXp(799)).toBe(3);
      expect(calculateLevelFromXp(800)).toBe(4);

      // Rank D boundary (Level 10: 3162 XP)
      expect(calculateLevelFromXp(3161)).toBe(9);
      expect(calculateLevelFromXp(3162)).toBe(10);

      // Rank C boundary (Level 25: 12500 XP)
      expect(calculateLevelFromXp(12499)).toBe(24);
      expect(calculateLevelFromXp(12500)).toBe(25);

      // Rank S boundary (Level 100: 100000 XP)
      expect(calculateLevelFromXp(99999)).toBe(99);
      expect(calculateLevelFromXp(100000)).toBe(100);

      // Monarch boundary (Level 150: 183711 XP)
      expect(calculateLevelFromXp(183710)).toBe(149);
      expect(calculateLevelFromXp(183711)).toBe(150);
    });

    it("guarantees 100% mathematical parity across levels 2 through 200", () => {
      for (let lvl = 2; lvl <= 200; lvl++) {
        const thresholdXp = calculateRequiredXp(lvl);
        expect(calculateLevelFromXp(thresholdXp)).toBe(lvl);
        expect(calculateLevelFromXp(thresholdXp - 1)).toBe(lvl - 1);
      }
    });
  });

  describe("Rank Thresholds & Hunter Rank Promotion Matrix", () => {
    it("defines the standard 8-tier rank thresholds", () => {
      expect(RANK_THRESHOLDS.MONARCH).toBe(150);
      expect(RANK_THRESHOLDS.NATIONAL).toBe(125);
      expect(RANK_THRESHOLDS["RANK S"]).toBe(100);
      expect(RANK_THRESHOLDS["RANK A"]).toBe(75);
      expect(RANK_THRESHOLDS["RANK B"]).toBe(50);
      expect(RANK_THRESHOLDS["RANK C"]).toBe(25);
      expect(RANK_THRESHOLDS["RANK D"]).toBe(10);
      expect(RANK_THRESHOLDS["RANK E"]).toBe(1);
    });

    it("maps levels to appropriate hunter rank tiers", () => {
      // RANK E: 1 - 9
      expect(getRankFromLevel(1)).toBe("RANK E");
      expect(getRankFromLevel(9)).toBe("RANK E");

      // RANK D: 10 - 24
      expect(getRankFromLevel(10)).toBe("RANK D");
      expect(getRankFromLevel(24)).toBe("RANK D");

      // RANK C: 25 - 49
      expect(getRankFromLevel(25)).toBe("RANK C");
      expect(getRankFromLevel(49)).toBe("RANK C");

      // RANK B: 50 - 74
      expect(getRankFromLevel(50)).toBe("RANK B");
      expect(getRankFromLevel(74)).toBe("RANK B");

      // RANK A: 75 - 99
      expect(getRankFromLevel(75)).toBe("RANK A");
      expect(getRankFromLevel(99)).toBe("RANK A");

      // RANK S: 100 - 124
      expect(getRankFromLevel(100)).toBe("RANK S");
      expect(getRankFromLevel(124)).toBe("RANK S");

      // NATIONAL: 125 - 149
      expect(getRankFromLevel(125)).toBe("NATIONAL");
      expect(getRankFromLevel(149)).toBe("NATIONAL");

      // MONARCH: 150+
      expect(getRankFromLevel(150)).toBe("MONARCH");
      expect(getRankFromLevel(250)).toBe("MONARCH");
    });
  });

  describe("UI Progress Bracket Derivation: getLevelProgress", () => {
    it("calculates progress inside Level 1 bracket", () => {
      const startProg = getLevelProgress(0, 1);
      expect(startProg.currentLevelBaseXp).toBe(0);
      expect(startProg.nextLevelTargetXp).toBe(282);
      expect(startProg.xpIntoCurrentLevel).toBe(0);
      expect(startProg.xpForCurrentBracket).toBe(282);
      expect(startProg.progressPercentage).toBe(0);

      const midProg = getLevelProgress(141, 1);
      expect(midProg.xpIntoCurrentLevel).toBe(141);
      expect(midProg.progressPercentage).toBe(50);
    });

    it("calculates progress inside Level 2 bracket", () => {
      const baseProg = getLevelProgress(282, 2);
      expect(baseProg.currentLevelBaseXp).toBe(282);
      expect(baseProg.nextLevelTargetXp).toBe(519);
      expect(baseProg.xpIntoCurrentLevel).toBe(0);
      expect(baseProg.xpForCurrentBracket).toBe(237); // 519 - 282
      expect(baseProg.progressPercentage).toBe(0);

      const partialProg = getLevelProgress(400, 2);
      expect(partialProg.xpIntoCurrentLevel).toBe(118); // 400 - 282
      expect(partialProg.progressPercentage).toBe(Math.floor((118 / 237) * 100)); // 49%
    });

    it("clamps progress percentage strictly between 0 and 100", () => {
      const overflowProg = getLevelProgress(1000, 2);
      expect(overflowProg.progressPercentage).toBe(100);

      const underflowProg = getLevelProgress(-50, 1);
      expect(underflowProg.progressPercentage).toBe(0);
    });
  });

  describe("Cognitive Vectors & Attribute Clamping", () => {
    it("enforces attribute boundaries [10, 100]", () => {
      expect(COGNITIVE_STAT_MIN).toBe(10);
      expect(COGNITIVE_STAT_MAX).toBe(100);

      expect(clampCognitiveStat(5)).toBe(10);
      expect(clampCognitiveStat(10)).toBe(10);
      expect(clampCognitiveStat(55.4)).toBe(55);
      expect(clampCognitiveStat(55.6)).toBe(56);
      expect(clampCognitiveStat(100)).toBe(100);
      expect(clampCognitiveStat(150)).toBe(100);
    });
  });
});
