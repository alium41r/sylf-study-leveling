import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  SKILL_NODES,
  SKILL_BRANCH_METADATA,
  SkillBranch,
  getActiveSkillModifiers,
  hasUserSkill,
  DEFAULT_ACTIVE_MODIFIERS,
} from "@/lib/skill-tree";
import { calculateSessionRewards } from "@/lib/game-engine";
import { HpPenaltyService } from "@/lib/hp-penalty-service";

describe("Gamification Engine Phase 3 — 8-Class Cognitive Skill Tree Infrastructure", () => {
  describe("Catalog Integrity & Structural Constraints (24 Nodes Across 8 Classes)", () => {
    const expectedBranches: SkillBranch[] = [
      "SCHOLAR",
      "ANALYST",
      "ENGINEER",
      "SCIENTIST",
      "RESEARCHER",
      "PSYCHOLOGIST",
      "STRATEGIST",
      "CREATIVE",
    ];

    it("defines exactly 24 progressive skill nodes across all 8 archetypes", () => {
      expect(SKILL_NODES).toHaveLength(24);

      for (const branch of expectedBranches) {
        const branchNodes = SKILL_NODES.filter((n) => n.branch === branch);
        expect(branchNodes).toHaveLength(3);

        const tier1 = branchNodes.find((n) => n.tier === 1);
        const tier2 = branchNodes.find((n) => n.tier === 2);
        const tier3 = branchNodes.find((n) => n.tier === 3);

        expect(tier1).toBeDefined();
        expect(tier2).toBeDefined();
        expect(tier3).toBeDefined();

        // Tier 1 must have null prerequisite
        expect(tier1!.prerequisiteNodeKey).toBeNull();
        expect(tier1!.costSp).toBe(1);

        // Tier 2 must require Tier 1
        expect(tier2!.prerequisiteNodeKey).toBe(tier1!.nodeKey);
        expect(tier2!.costSp).toBe(2);

        // Tier 3 must require Tier 2
        expect(tier3!.prerequisiteNodeKey).toBe(tier2!.nodeKey);
        expect(tier3!.costSp).toBe(3);

        // Verify valid cognitive stats
        const validStats = ["endurance", "tenacity", "velocity", "discipline", "synthesis"];
        expect(validStats).toContain(tier1!.prerequisiteStat);
        expect(validStats).toContain(tier2!.prerequisiteStat);
        expect(validStats).toContain(tier3!.prerequisiteStat);

        expect(tier1!.prerequisiteValue).toBeLessThanOrEqual(tier2!.prerequisiteValue);
        expect(tier2!.prerequisiteValue).toBeLessThanOrEqual(tier3!.prerequisiteValue);
      }
    });

    it("provides valid metadata and vector alignments for all 8 branches", () => {
      for (const branch of expectedBranches) {
        const meta = SKILL_BRANCH_METADATA[branch];
        expect(meta).toBeDefined();
        expect(meta.displayName).toBeDefined();
        expect(meta.primaryVectors).toHaveLength(2);
        expect(meta.fieldFit.length).toBeGreaterThan(5);
        expect(meta.playstyle.length).toBeGreaterThan(10);
      }
    });
  });

  describe("Pure Modifier Resolution (getActiveSkillModifiers & hasUserSkill)", () => {
    it("returns zeroed default modifiers when no skills are unlocked", () => {
      const modifiers = getActiveSkillModifiers([]);
      expect(modifiers).toEqual(DEFAULT_ACTIVE_MODIFIERS);
    });

    it("resolves Scholar active perks and XP multipliers", () => {
      const modifiers = getActiveSkillModifiers([
        "scholar-deep-work",
        "scholar-revision-loop",
        "scholar-monarch-retention",
      ]);

      expect(modifiers.xpMultiplier45m).toBe(0.1);
      expect(modifiers.reviewXpBonus).toBe(0.15);
      expect(modifiers.humanitiesXpMultiplier).toBe(0.2);
    });

    it("resolves Analyst perks and math bonuses", () => {
      const modifiers = getActiveSkillModifiers([
        "analyst-pattern-scan",
        "analyst-logic-breakdown",
        "analyst-monarch-derivation",
      ]);

      expect(modifiers.mathSylphBonus).toBe(0.1);
      expect(modifiers.latexSpeedBoost).toBe(true);
      expect(modifiers.instantTheoremSearch).toBe(true);
      expect(modifiers.timedProblemSetXpMultiplier).toBe(0.25);
    });

    it("resolves Psychologist resilience perks", () => {
      const modifiers = getActiveSkillModifiers([
        "psychologist-flow-state",
        "psychologist-mental-shield",
        "psychologist-monarch-resilience",
      ]);

      expect(modifiers.pauseGraceMinutes).toBe(3);
      expect(modifiers.damageReductionPercent).toBe(25);
      expect(modifiers.weeklyFirstMissZeroDamage).toBe(true);
    });

    it("accurately detects unlocked skills via hasUserSkill helper", () => {
      const userSkills = [
        { nodeKey: "engineer-fast-start" },
        { skillNode: { nodeKey: "engineer-batch-processor" } },
      ];

      expect(hasUserSkill(userSkills, "engineer-fast-start")).toBe(true);
      expect(hasUserSkill(userSkills, "engineer-batch-processor")).toBe(true);
      expect(hasUserSkill(userSkills, "engineer-monarch-overclock")).toBe(false);
      expect(hasUserSkill(null, "engineer-fast-start")).toBe(false);
    });
  });

  describe("Session Rewards Engine Integration (calculateSessionRewards)", () => {
    it("calculates base rewards without active skills", () => {
      const rewards = calculateSessionRewards({
        durationMinutes: 30,
        unlockedSkills: [],
      });

      // 30m base XP: 300 * 1.1 (duration mult) = 330
      // 30m base Sylph: 30 + 10 = 40
      expect(rewards.baseXp).toBe(300);
      expect(rewards.totalXp).toBe(330);
      expect(rewards.baseSylph).toBe(40);
      expect(rewards.totalSylph).toBe(40);
    });

    it("applies Scholar and Researcher duration multipliers on long sessions", () => {
      const rewards = calculateSessionRewards({
        durationMinutes: 60,
        isHumanities: true,
        unlockedSkills: [
          "scholar-deep-work", // +10% XP for > 45m
          "scholar-monarch-retention", // +20% XP for humanities
          "researcher-deep-dive", // +20% XP for >= 60m
        ],
      });

      // Base XP = 600
      // Base Duration Mult = 1.2 (for >= 60m)
      // + 0.10 (scholar-deep-work) + 0.20 (scholar-monarch-retention) + 0.20 (researcher-deep-dive) = 1.70x
      // Total XP = 600 * 1.70 = 1020
      expect(rewards.totalXp).toBe(1020);
      expect(rewards.appliedPerks).toContain("scholar-deep-work (+10% XP)");
      expect(rewards.appliedPerks).toContain("scholar-monarch-retention (+20% XP)");
      expect(rewards.appliedPerks).toContain("researcher-deep-dive (+20% continuous XP)");
    });

    it("applies Analyst, Engineer, and Scientist bonuses to Sylph and XP", () => {
      const rewards = calculateSessionRewards({
        durationMinutes: 30,
        isMathOrQuantitative: true,
        isOnSchedule: true,
        isStemHighDifficulty: true,
        unlockedSkills: [
          "analyst-pattern-scan", // +10% Sylph on math
          "engineer-fast-start", // +5% Sylph on schedule
          "scientist-rigorous-proof", // +20% XP on high difficulty STEM
          "scientist-monarch-discovery", // +10 bonus XP, +2 bonus Sylph
        ],
      });

      // Base XP = 300, Mult = 1.1 + 0.20 = 1.30 -> 390 + 10 (flat bonus) = 400
      // Base Sylph = 40, Mult = 1.0 + 0.10 + 0.05 = 1.15 -> 46 + 2 (flat bonus) = 48
      expect(rewards.totalXp).toBe(400);
      expect(rewards.totalSylph).toBe(48);
      expect(rewards.appliedPerks).toContain("scientist-monarch-discovery (+10 XP)");
      expect(rewards.appliedPerks).toContain("scientist-monarch-discovery (+2 Sylph)");
    });
  });

  describe("HP Penalty Service Psychologist Integration", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("mitigates penalty with psychologist-mental-shield (25% damage reduction)", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 1,
        hp: 50,
        maxHp: 100,
        timezone: "UTC",
        dailyGoalMinutes: 60,
        restDays: [],
        enableHpPenalty: true,
        lastDailyPenaltyEvaluatedDate: "",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      } as any);

      vi.spyOn(prisma.studySession, "findMany").mockResolvedValue([]);

      const mockSkills = [
        { skillNode: { nodeKey: "psychologist-mental-shield" } },
      ];

      const mockHpLedgerCreate = vi.fn().mockResolvedValue({});
      const mockUserUpdate = vi.fn().mockResolvedValue({});

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        return callback({
          userInventory: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          userSkill: {
            findMany: vi.fn().mockResolvedValue(mockSkills),
          },
          hpLedger: {
            create: mockHpLedgerCreate,
          },
          systemMessage: {
            create: vi.fn(),
          },
          user: {
            update: mockUserUpdate,
          },
        });
      });

      const result = await HpPenaltyService.reconcileDailyHpPenalty(1);
      // Standard damage is 15. With 25% reduction -> Math.round(15 * 0.75) = 11.
      expect(result.totalHpDeducted).toBe(11);
      expect(result.newHp).toBe(39);
      expect(result.mitigatedByItem).toBe("Cognitive Mental Shield");
    });

    it("negates first weekly missed goal with psychologist-monarch-resilience (0 damage)", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 1,
        hp: 50,
        maxHp: 100,
        timezone: "UTC",
        dailyGoalMinutes: 60,
        restDays: [],
        enableHpPenalty: true,
        lastDailyPenaltyEvaluatedDate: "",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      } as any);

      vi.spyOn(prisma.studySession, "findMany").mockResolvedValue([]);

      const mockSkills = [
        { skillNode: { nodeKey: "psychologist-monarch-resilience" } },
      ];

      const mockHpLedgerCreate = vi.fn().mockResolvedValue({});
      const mockUserUpdate = vi.fn().mockResolvedValue({});

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        return callback({
          userInventory: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          userSkill: {
            findMany: vi.fn().mockResolvedValue(mockSkills),
          },
          hpLedger: {
            create: mockHpLedgerCreate,
          },
          systemMessage: {
            create: vi.fn(),
          },
          user: {
            update: mockUserUpdate,
          },
        });
      });

      const result = await HpPenaltyService.reconcileDailyHpPenalty(1);
      // Monarch resilience absorbs first miss -> 0 damage
      expect(result.totalHpDeducted).toBe(0);
      expect(result.newHp).toBe(50);
      expect(result.mitigatedByItem).toBe("Monarch's Absolute Resilience");
    });
  });
});
