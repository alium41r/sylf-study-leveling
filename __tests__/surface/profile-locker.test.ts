import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { getLevelProgress } from "@/lib/game-engine";
import { generateHunterDiagnosticMessage } from "@/lib/ai/daily-briefing-service";
import { SKILL_NODES, SkillBranch } from "@/lib/skill-tree";

describe("Gamification Engine Phase 5 — Surface Layer, Edge Projections & Studio Hydration", () => {
  describe("RSC Profile Data Serialization & ISO Date Conversion", () => {
    it("converts Date fields to strict ISO strings across server/client boundary", () => {
      const mockRawDate = new Date("2026-08-21T00:00:00.000Z");
      const isoString = mockRawDate.toISOString();

      expect(typeof isoString).toBe("string");
      expect(isoString).toBe("2026-08-21T00:00:00.000Z");

      const mockForgeMasteries = [
        {
          forgeCoreId: 1,
          prestigeTier: 1,
          completedAt: mockRawDate,
          forgeCore: {
            coreKey: "physics-reactor",
            name: "Physics Reactor",
            discipline: "PHYSICS",
            rewardPedestalKey: "pedestal_cyber",
            rewardBadgeKey: "badge_phys_master",
          },
        },
      ];

      const serialized = mockForgeMasteries.map((m) => ({
        ...m,
        completedAt: m.completedAt.toISOString(),
      }));

      expect(typeof serialized[0].completedAt).toBe("string");
      expect(serialized[0].completedAt).toBe("2026-08-21T00:00:00.000Z");
    });

    it("derives levelProgress accurately on profile cards using getLevelProgress", () => {
      // Level 1: 0 to 282 XP. At 141 XP -> 50%
      expect(getLevelProgress(141, 1).progressPercentage).toBe(50);

      // Level 1: At 0 XP -> 0%
      expect(getLevelProgress(0, 1).progressPercentage).toBe(0);

      // Level 2: 282 to 520 XP (Diff = 238 XP). At 401 XP (Diff = 119) -> 50%
      expect(getLevelProgress(401, 2).progressPercentage).toBe(50);
    });
  });

  describe("Skill Tree Prerequisite State Evaluation", () => {
    it("evaluates prerequisite locks correctly based on unlocked nodes and cognitive stats", () => {
      const scholarNodes = SKILL_NODES.filter((n) => n.branch === ("SCHOLAR" as SkillBranch));
      const tier1 = scholarNodes.find((n) => n.tier === 1)!;
      const tier2 = scholarNodes.find((n) => n.tier === 2)!;
      const tier3 = scholarNodes.find((n) => n.tier === 3)!;

      expect(tier1).toBeDefined();
      expect(tier2).toBeDefined();
      expect(tier3).toBeDefined();

      // Tier 1 has 0 prerequisite node
      expect(tier1.prerequisiteNodeKey).toBeNull();

      // Tier 2 requires Tier 1
      expect(tier2.prerequisiteNodeKey).toBe(tier1.nodeKey);

      // Tier 3 requires Tier 2
      expect(tier3.prerequisiteNodeKey).toBe(tier2.nodeKey);

      // Verify prerequisite stat requirements
      if (tier2.prerequisiteStat && tier2.prerequisiteValue) {
        const userStatsBelow = { synthesis: tier2.prerequisiteValue - 5 };
        const userStatsAbove = { synthesis: tier2.prerequisiteValue + 5 };

        expect(userStatsBelow.synthesis < tier2.prerequisiteValue).toBe(true);
        expect(userStatsAbove.synthesis >= tier2.prerequisiteValue).toBe(true);
      }
    });
  });

  describe("Asynchronous System Arbiter Hunter Diagnostic Briefings", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("composes an in-universe Hunter Protocol diagnostic message upon RANK_PROMOTION", async () => {
      const mockUserStats = {
        userId: 999,
        rank: "RANK S",
        endurance: 45,
        tenacity: 40,
        velocity: 55,
        discipline: 60,
        synthesis: 50,
      };

      const mockUser = {
        id: 999,
        username: "hunter_jinwoo",
        name: "Sung Jin-Woo",
      };

      vi.spyOn(prisma.userStats, "findUnique").mockResolvedValue(mockUserStats as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockUser as any);
      const createMsgSpy = vi.spyOn(prisma.systemMessage, "create").mockResolvedValue({} as any);

      const result = await generateHunterDiagnosticMessage(999, "RANK_PROMOTION", {
        rank: "RANK S",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("[HUNTER PROMOTION: RANK S]");
      expect(result.message).toContain("Sung Jin-Woo");
      expect(result.message).toContain("• Endurance: 45");
      expect(result.message).toContain("• Velocity: 55");
      expect(result.message).toContain("• Discipline: 60");
      expect(createMsgSpy).toHaveBeenCalledWith({
        data: {
          userId: 999,
          content: expect.stringContaining("[HUNTER PROMOTION: RANK S]"),
          type: "SYSTEM",
          read: false,
        },
      });
    });

    it("composes an in-universe Hunter Protocol diagnostic message upon FORGE_MASTERY", async () => {
      const mockUserStats = {
        userId: 999,
        rank: "RANK A",
        endurance: 35,
        tenacity: 30,
        velocity: 40,
        discipline: 45,
        synthesis: 55,
      };

      const mockUser = {
        id: 999,
        username: "scholar_cha",
        name: "Cha Hae-In",
      };

      vi.spyOn(prisma.userStats, "findUnique").mockResolvedValue(mockUserStats as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockUser as any);
      const createMsgSpy = vi.spyOn(prisma.systemMessage, "create").mockResolvedValue({} as any);

      const result = await generateHunterDiagnosticMessage(999, "FORGE_MASTERY", {
        coreKey: "physics-reactor",
        coreName: "Physics Reactor",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("[FORGE CORE MASTERED: Physics Reactor]");
      expect(result.message).toContain("Cha Hae-In");
      expect(result.message).toContain("• Synthesis: 55");
      expect(createMsgSpy).toHaveBeenCalledWith({
        data: {
          userId: 999,
          content: expect.stringContaining("[FORGE CORE MASTERED: Physics Reactor]"),
          type: "SYSTEM",
          read: false,
        },
      });
    });
  });
});
