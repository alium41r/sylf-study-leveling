import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  FORGE_CORES,
  ForgeDisciplineType,
  calculateForgeDelta,
  getForgeCoreProgress,
  matchSubjectToForgeTopic,
} from "@/lib/concept-forge";

describe("Gamification Engine Phase 4 — Academic Concept Forge Subsystem", () => {
  describe("Catalog Integrity & Structural Matrix (4 Cores, 16 Topics)", () => {
    const expectedDisciplines: ForgeDisciplineType[] = [
      "PHYSICS",
      "MATHEMATICS",
      "COMPUTER_SCIENCE",
      "CHEMISTRY",
    ];

    it("defines exactly 4 discipline cores and 16 sub-topics", () => {
      expect(FORGE_CORES).toHaveLength(4);

      for (const discipline of expectedDisciplines) {
        const core = FORGE_CORES.find((c) => c.discipline === discipline);
        expect(core).toBeDefined();
        expect(core!.topics).toHaveLength(4);
        expect(core!.rewardXp).toBeGreaterThanOrEqual(1000);
        expect(core!.rewardSylph).toBeGreaterThanOrEqual(500);
        expect(core!.rewardSp).toBeGreaterThanOrEqual(1);
        expect(core!.rewardPedestalKey).toBeDefined();

        for (const topic of core!.topics) {
          expect(topic.topicKey).toBeDefined();
          expect(topic.name).toBeDefined();
          expect(topic.subjectKey).toBeDefined();
          expect(topic.targetProgress).toBe(100);
          expect(topic.structuralWeight).toBeGreaterThanOrEqual(1.0);
        }
      }
    });

    it("assigns unique topic keys across all cores", () => {
      const allTopicKeys = FORGE_CORES.flatMap((c) => c.topics.map((t) => t.topicKey));
      const uniqueKeys = new Set(allTopicKeys);
      expect(uniqueKeys.size).toBe(16);
    });
  });

  describe("Pure Mathematical Utilities (calculateForgeDelta & getForgeCoreProgress)", () => {
    it("calculates deterministic progress delta based on difficulty, duration, and weight", () => {
      // Difficulty 1, 0 mins, weight 1.0 -> (1*5 + 0) * 1.0 = 5
      expect(calculateForgeDelta(1, 0, 1.0)).toBe(5);

      // Difficulty 3, 30 mins, weight 1.0 -> (3*5 + 2) * 1.0 = 17
      expect(calculateForgeDelta(3, 30, 1.0)).toBe(17);

      // Difficulty 5, 120 mins, weight 1.0 -> (5*5 + 8) * 1.0 = 33
      expect(calculateForgeDelta(5, 120, 1.0)).toBe(33);

      // Difficulty 5, 120 mins, weight 1.2 -> (25 + 8) * 1.2 = 39.6 -> 39
      expect(calculateForgeDelta(5, 120, 1.2)).toBe(39);

      // Difficulty 5, 120 mins, weight 1.5 -> (25 + 8) * 1.5 = 49.5 -> clamped to 40
      expect(calculateForgeDelta(5, 120, 1.5)).toBe(40);

      // Lower bound clamp (at least 1)
      expect(calculateForgeDelta(0, 0, 0.05)).toBe(1);
    });

    it("calculates overall Forge Core % progress", () => {
      expect(getForgeCoreProgress([])).toBe(0);

      // All complete
      expect(
        getForgeCoreProgress([
          { progress: 100, targetProgress: 100 },
          { progress: 100, targetProgress: 100 },
          { progress: 100, targetProgress: 100 },
          { progress: 100, targetProgress: 100 },
        ])
      ).toBe(100);

      // Half complete
      expect(
        getForgeCoreProgress([
          { progress: 50, targetProgress: 100 },
          { progress: 50, targetProgress: 100 },
          { progress: 50, targetProgress: 100 },
          { progress: 50, targetProgress: 100 },
        ])
      ).toBe(50);

      // Partial
      expect(
        getForgeCoreProgress([
          { progress: 100, targetProgress: 100 },
          { progress: 50, targetProgress: 100 },
          { progress: 0, targetProgress: 100 },
          { progress: 0, targetProgress: 100 },
        ])
      ).toBe(37);
    });
  });

  describe("Strict Subject Normalization (matchSubjectToForgeTopic)", () => {
    it("normalizes and matches Mathematics variations", () => {
      expect(matchSubjectToForgeTopic("Maths")).toBe("math-calculus");
      expect(matchSubjectToForgeTopic("Mathematics")).toBe("math-calculus");
      expect(matchSubjectToForgeTopic("Further Mathematics", "Linear Algebra")).toBe("math-linear-algebra");
      expect(matchSubjectToForgeTopic("Maths", "Differential Equations")).toBe("math-differential-eq");
      expect(matchSubjectToForgeTopic("Maths", "Discrete Combinatorics")).toBe("math-discrete");
    });

    it("normalizes and matches Physics variations", () => {
      expect(matchSubjectToForgeTopic("Physics")).toBe("phys-kinematics");
      expect(matchSubjectToForgeTopic("Theoretical Physics", "Newtonian Forces")).toBe("phys-forces");
      expect(matchSubjectToForgeTopic("Physics", "Work Energy")).toBe("phys-energy");
      expect(matchSubjectToForgeTopic("Mechanics", "Electromagnetic Fields")).toBe("phys-electromagnetism");
    });

    it("normalizes and matches Computer Science variations", () => {
      expect(matchSubjectToForgeTopic("Computer Science")).toBe("cs-dsa");
      expect(matchSubjectToForgeTopic("CS", "Operating Systems")).toBe("cs-systems");
      expect(matchSubjectToForgeTopic("Programming", "Networking Protocols")).toBe("cs-networking");
      expect(matchSubjectToForgeTopic("Software", "Relational Databases")).toBe("cs-databases");
    });

    it("normalizes and matches Chemistry variations", () => {
      expect(matchSubjectToForgeTopic("Chemistry")).toBe("chem-stoichiometry");
      expect(matchSubjectToForgeTopic("Chemistry", "Thermodynamics Enthalpy")).toBe("chem-thermodynamics");
      expect(matchSubjectToForgeTopic("Organic Chemistry")).toBe("chem-organic");
      expect(matchSubjectToForgeTopic("Physical Chemistry", "Reaction Kinetics")).toBe("chem-kinetics");
    });

    it("returns null for unrelated subjects", () => {
      expect(matchSubjectToForgeTopic("History")).toBeNull();
      expect(matchSubjectToForgeTopic("Art & Drawing")).toBeNull();
      expect(matchSubjectToForgeTopic("")).toBeNull();
    });
  });
});
