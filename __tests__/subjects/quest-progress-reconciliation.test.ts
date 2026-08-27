/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateScopeWeight, POST as createQuestPOST } from "@/app/api/quests/route";
import { POST as evaluateScopePOST } from "@/app/api/quests/evaluate-scope/route";
import { PATCH as endSessionPATCH } from "@/app/api/sessions/route";
import { POST as forgeApexPOST } from "@/app/api/subjects/[id]/forge-apex/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subject: {
      findFirst: vi.fn(),
    },
    subjectNode: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    quest: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    studySession: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { durationMinutes: 0 } }),
    },
    inventoryItem: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    systemMessage: {
      create: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([
      {
        settle_study_session_atomic: {
          success: true,
          sessionId: 1,
          isFinal: false,
          alreadyClaimed: false,
          durationSeconds: 2700,
          breakSeconds: 0,
          deltaSeconds: 2700,
          awarded: true,
          xpGained: 225,
          sylphGained: 22,
          totalSylphEarned: 22,
          questCompleted: true,
          questXp: 225,
          questSylph: 22,
          hpHealed: 0,
          level: 1,
          currentXP: 225,
          xpToNextLevel: 500,
          hunterRank: "E",
          levelsGained: 0,
          didRankUp: false,
          nodeProgress: 100.0,
          masteryGranted: false,
        },
      },
    ]),
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(prisma);
    }),
  },
}));

describe("Phase 5: Contextual Quest Modal & Progress Reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. AI Scope Weight Calculator (calculateScopeWeight)", () => {
    it("evaluates 'complete chapter' with full 100% (1.00) scope weight", () => {
      const node = {
        title: "Physical Quantities and Units",
        description: "Understand fundamental and derived SI units, use prefixes, and apply significant figures.",
        tier: 1,
      };
      const quest = {
        title: "Practice: Physical Quantities and Units",
        description: "complete chapter",
        targetMinutes: 45,
      };

      const weight = calculateScopeWeight(node, quest);
      expect(weight).toBe(1.00);
    });

    it("evaluates 'half the chapter' with 50% (0.50) scope weight", () => {
      const node = {
        title: "Physical Quantities and Units",
        description: "Understand fundamental and derived SI units, use prefixes, and apply significant figures.",
        tier: 1,
      };
      const quest = {
        title: "Practice: Physical Quantities and Units",
        description: "half the chapter",
        targetMinutes: 45,
      };

      const weight = calculateScopeWeight(node, quest);
      expect(weight).toBe(0.50);
    });

    it("evaluates comprehensive scope description with high weight", () => {
      const node = { title: "Differential Equations", description: "First order", tier: 4 };
      const quest = {
        title: "Master Differential Equations",
        description: "Complete full chapter topical past papers and comprehensive mock exam",
        targetMinutes: 60,
      };

      const weight = calculateScopeWeight(node, quest);
      expect(weight).toBe(1.00);
    });

    it("evaluates focused exercise with standard practice weight", () => {
      const node = { title: "Trigonometry", description: "Identities and formulas", tier: 2 };
      const quest = {
        title: "Practice Trig",
        description: "Solve 5 practice problems and exercise questions",
        targetMinutes: 45,
      };

      const weight = calculateScopeWeight(node, quest);
      expect(weight).toBeGreaterThanOrEqual(0.25);
      expect(weight).toBeLessThanOrEqual(0.60);
    });

    it("clamps minimum scope weight to 0.10", () => {
      const node = { title: "Complex Analysis", description: "De Moivre", tier: 9 };
      const quest = {
        title: "Quick Read",
        description: "quick read",
        targetMinutes: 5,
      };

      const weight = calculateScopeWeight(node, quest);
      expect(weight).toBeGreaterThanOrEqual(0.10);
      expect(weight).toBeLessThanOrEqual(1.00);
    });

    it("accurately evaluates partial subtopic plan with 'only' constraint (e.g. 50-75% coverage)", () => {
      const node = {
        title: "Work, Energy and Power Basics",
        description: "Define work done, kinetic energy, and gravitational potential energy, and calculate power and efficiency in straightforward physical scenarios.",
        tier: 1,
      };
      const quest = {
        title: "Practice: Work, Energy and Power Basics",
        description: "studying work and different types of energy only.",
        targetMinutes: 45,
      };

      const weight = calculateScopeWeight(node, quest);
      expect(weight).toBeGreaterThanOrEqual(0.35);
      expect(weight).toBeLessThanOrEqual(0.80);
      expect(weight).not.toBe(1.00);
    });

    it("evaluates scope via evaluate-scope API endpoint (`POST /api/quests/evaluate-scope`)", async () => {
      // S4: the route reserves the "scope" quota atomically before the AI call.
      (prisma.$queryRawUnsafe as any).mockResolvedValue([{ used: 1 }]);
      const token = await signToken({ userId: 101, username: "scholar_test" });
      const req = new NextRequest("http://localhost:3000/api/quests/evaluate-scope", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nodeTitle: "Physical Quantities and Units",
          nodeDescription: "Understand fundamental and derived SI units, use prefixes, and apply significant figures.",
          nodeTier: 1,
          questTitle: "Practice: Physical Quantities and Units",
          planDescription: "complete chapter",
          targetMinutes: 45,
        }),
      });

      const res = await evaluateScopePOST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.chapterPortionPercent).toBe(100);
      expect(data.scopeWeight).toBe(1.00);
      expect(data.isFullChapter).toBe(true);
    });
  });

  describe("2. Contextual Quest Creation API (`POST /api/quests`)", () => {
    it("returns 401 if unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/quests", {
        method: "POST",
        body: JSON.stringify({ title: "Solve Problems" }),
      });

      const res = await createQuestPOST(req);
      expect(res.status).toBe(401);
    });

    it("returns 404 if subjectNodeId does not belong to the user", async () => {
      const token = await signToken({ userId: 101, username: "scholar_test" });
      (prisma.subjectNode.findFirst as any).mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/quests", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: "Math Quest",
          subjectNodeId: 9999,
          targetMinutes: 45,
        }),
      });

      const res = await createQuestPOST(req);
      expect(res.status).toBe(404);
    });

    it("creates node-bound quest with computed scope weight, xpReward, and sylphReward", async () => {
      // S4: quest creation reserves the "scope" quota before the AI evaluation.
      (prisma.$queryRawUnsafe as any).mockResolvedValue([{ used: 1 }]);
      const token = await signToken({ userId: 101, username: "scholar_test" });

      (prisma.subjectNode.findFirst as any).mockResolvedValue({
        id: 10,
        title: "Calculus Derivatives",
        description: "Chain rule and product rule",
        tier: 2,
        difficulty: 2,
        subjectId: 1,
      });

      (prisma.quest.create as any).mockImplementation(({ data }: any) => {
        return {
          id: 501,
          ...data,
          subjectNode: { id: 10, nodeId: "N2_1", title: "Calculus Derivatives", tier: 2, progress: 0, spAward: 1 },
          subject: { id: 1, name: "Mathematics", code: "9709", color: "#8B5CF6" },
        };
      });

      (prisma.user.findUnique as any).mockResolvedValue({ id: 101, username: "scholar_test" });

      const req = new NextRequest("http://localhost:3000/api/quests", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subjectNodeId: 10,
          title: "Practice Calculus Derivatives",
          description: "Solve 5 chain rule exercise problems",
          targetMinutes: 45,
        }),
      });

      const res = await createQuestPOST(req);
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.id).toBe(501);
      expect(data.subjectNodeId).toBe(10);
      expect(data.targetMinutes).toBe(45);
      expect(data.xpReward).toBe(225); // 45 * 5
      expect(data.sylphReward).toBe(22); // Math.floor(45 / 2)
      expect(data.scopeWeight).toBeGreaterThanOrEqual(0.10);
    });
  });

  describe("3. Focus Session Progress Reconciliation (`PATCH /api/sessions`)", () => {
    it("settles quest + node progress + mastery inside the unified atomic RPC", async () => {
      const token = await signToken({ userId: 101, username: "scholar_test" });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: 101,
        username: "scholar_test",
        timezone: "UTC",
        lastActiveDate: "",
        streakDays: 1,
        level: 1,
      });

      // Unified settlement RPC result: quest completed, node mastered, HP healed.
      (prisma.$queryRaw as any).mockResolvedValue([
        {
          settle_study_session_atomic: {
            success: true,
            sessionId: 701,
            isFinal: false,
            alreadyClaimed: false,
            durationSeconds: 2700,
            breakSeconds: 0,
            deltaSeconds: 2700,
            awarded: true,
            xpGained: 225,
            sylphGained: 22,
            totalSylphEarned: 22,
            questCompleted: true,
            questXp: 225,
            questSylph: 22,
            hpHealed: 20,
            level: 1,
            currentXP: 225,
            xpToNextLevel: 282,
            hunterRank: "E",
            levelsGained: 0,
            didRankUp: false,
            nodeProgress: 100.0,
            masteryGranted: true,
          },
        },
      ]);

      const req = new NextRequest("http://localhost:3000/api/sessions", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: 701,
          durationMinutes: 45,
          durationSeconds: 2700,
          questId: 501,
        }),
      });

      const res = await endSessionPATCH(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      // Everything settles in ONE RPC call (no two-step claim, no separate
      // quest.update or message writes in Node).
      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.anything(),
        101,
        701,
        2700,
        0,
        501,
        null,
        false,
        false,
        expect.any(String)
      );
      expect(prisma.quest.update).not.toHaveBeenCalled();
      expect(data.questCompletedNow).toBe(true);
      expect(data.masteryGranted).toBe(true);
      expect(data.hpHealed).toBe(20);
    });

    it("does NOT re-mint mastery for an already mastered node", async () => {
      const token = await signToken({ userId: 101, username: "scholar_test" });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: 101,
        username: "scholar_test",
        timezone: "UTC",
        lastActiveDate: "",
        streakDays: 1,
        level: 1,
      });

      // Unified settlement RPC: node already at 100% → no mastery transition.
      (prisma.$queryRaw as any).mockResolvedValue([
        {
          settle_study_session_atomic: {
            success: true,
            sessionId: 702,
            isFinal: false,
            alreadyClaimed: false,
            durationSeconds: 2700,
            breakSeconds: 0,
            deltaSeconds: 2700,
            awarded: true,
            xpGained: 225,
            sylphGained: 22,
            totalSylphEarned: 22,
            questCompleted: true,
            questXp: 225,
            questSylph: 22,
            hpHealed: 0,
            level: 1,
            currentXP: 225,
            xpToNextLevel: 282,
            hunterRank: "E",
            levelsGained: 0,
            didRankUp: false,
            nodeProgress: 100.0,
            masteryGranted: false,
          },
        },
      ]);

      const req = new NextRequest("http://localhost:3000/api/sessions", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: 702,
          durationMinutes: 45,
          durationSeconds: 2700,
          questId: 502,
        }),
      });

      const res = await endSessionPATCH(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      // Settled via the unified RPC; no mastery side effects in Node.
      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.anything(),
        101,
        702,
        2700,
        0,
        502,
        null,
        false,
        false,
        expect.any(String)
      );
      expect(data.questCompletedNow).toBe(true);
      expect(data.masteryGranted).toBe(false);
      expect(prisma.systemMessage.create).not.toHaveBeenCalled();
    });

    it("keeps quest ACTIVE when the user ends early without reaching target duration", async () => {
      const token = await signToken({ userId: 101, username: "scholar_test" });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: 101,
        username: "scholar_test",
        timezone: "UTC",
        lastActiveDate: "",
        streakDays: 1,
        level: 1,
      });

      // Unified settlement RPC result for this 10-second flush.
      (prisma.$queryRaw as any).mockResolvedValue([
        {
          settle_study_session_atomic: {
            success: true,
            sessionId: 703,
            isFinal: false,
            alreadyClaimed: false,
            durationSeconds: 10,
            breakSeconds: 0,
            deltaSeconds: 10,
            awarded: false,
            xpGained: 0,
            sylphGained: 0,
            totalSylphEarned: 0,
            questCompleted: false,
            questXp: 0,
            questSylph: 0,
            hpHealed: 0,
            level: 1,
            currentXP: 0,
            xpToNextLevel: 282,
            hunterRank: "E",
            levelsGained: 0,
            didRankUp: false,
            nodeProgress: 0.0,
            masteryGranted: false,
          },
        },
      ]);

      const req = new NextRequest("http://localhost:3000/api/sessions", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: 703,
          durationMinutes: 0,
          durationSeconds: 10, // 10 seconds of 60 mins
          questId: 503,
          completeQuest: false,
        }),
      });

      const res = await endSessionPATCH(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      // Quest stays ACTIVE — the RPC decides completion internally.
      expect(prisma.quest.update).not.toHaveBeenCalled();
      expect(data.questCompletedNow).toBe(false);

      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.anything(),
        101,
        703,
        10,
        0,
        503,
        null,
        false,
        false,
        expect.any(String)
      );
    });

    it("marks quest COMPLETED and awards XP when completeQuest flag is explicitly set true", async () => {
      const token = await signToken({ userId: 101, username: "scholar_test" });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: 101,
        username: "scholar_test",
        timezone: "UTC",
        lastActiveDate: "",
        streakDays: 1,
        level: 1,
      });

      // Unified settlement RPC result: full quest rewards granted.
      (prisma.$queryRaw as any).mockResolvedValue([
        {
          settle_study_session_atomic: {
            success: true,
            sessionId: 704,
            isFinal: false,
            alreadyClaimed: false,
            durationSeconds: 300,
            breakSeconds: 0,
            deltaSeconds: 300,
            awarded: true,
            xpGained: 30,
            sylphGained: 5,
            totalSylphEarned: 5,
            questCompleted: true,
            questXp: 300,
            questSylph: 30,
            hpHealed: 20,
            level: 1,
            currentXP: 300,
            xpToNextLevel: 282,
            hunterRank: "E",
            levelsGained: 1,
            didRankUp: false,
            nodeProgress: 60.0,
            masteryGranted: false,
          },
        },
      ]);

      const req = new NextRequest("http://localhost:3000/api/sessions", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: 704,
          durationMinutes: 5,
          durationSeconds: 300,
          questId: 504,
          completeQuest: true, // User pressed Complete Quest!
        }),
      });

      const res = await endSessionPATCH(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      // completeQuest flag plumbed into the unified RPC (arg index 7).
      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.anything(),
        101,
        704,
        300,
        0,
        504,
        null,
        true,
        false,
        expect.any(String)
      );
      expect(prisma.quest.update).not.toHaveBeenCalled();
      expect(data.questCompletedNow).toBe(true);
      expect(data.questXp).toBe(300);
    });
  });

  describe("4. Apex Keystone Forging Endpoint (`POST /api/subjects/[id]/forge-apex`)", () => {
    it("rejects forging when total minted SP < 115", async () => {
      const token = await signToken({ userId: 101, username: "scholar_test" });

      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 1,
        userId: 101,
        name: "Mathematics",
        code: "9709",
      });

      // Mock only 10 mastered nodes giving 10 SP (< 115 SP)
      (prisma.subjectNode.findMany as any).mockResolvedValue([
        { id: 1, nodeId: "N1_1", isMastered: true, spAward: 1, progress: 100 },
        { id: 2, nodeId: "N1_2", isMastered: true, spAward: 1, progress: 100 },
        { id: 48, nodeId: "N10_1", isMastered: false, spAward: 0, progress: 0 },
      ]);

      const req = new NextRequest("http://localhost:3000/api/subjects/1/forge-apex", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await forgeApexPOST(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("115 Subject SP required");
    });

    it("successfully forges Apex Keystone, awards +5,000 XP and +500 Sylph when total minted SP >= 115", async () => {
      const token = await signToken({ userId: 101, username: "scholar_test" });

      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 1,
        userId: 101,
        name: "Mathematics",
        code: "9709",
        user: { username: "scholar_test" },
      });

      // Generate 47 mastered nodes satisfying 115 SP
      const mockNodes = Array.from({ length: 47 }, (_, i) => ({
        id: i + 1,
        nodeId: `N_CONTENT_${i + 1}`,
        isMastered: true,
        progress: 100.0,
        spAward: i < 10 ? 1 : i < 24 ? 2 : i < 39 ? 3 : 4,
      }));

      // Add N10_1
      mockNodes.push({
        id: 48,
        nodeId: "N10_1",
        isMastered: false,
        progress: 0.0,
        spAward: 0,
      });

      (prisma.subjectNode.findMany as any).mockResolvedValue(mockNodes);

      // The route delegates the mutation to the atomic SECURITY DEFINER RPC.
      (prisma.$queryRawUnsafe as any).mockResolvedValue([
        {
          success: true,
          already_forged: false,
          xp_awarded: 5000,
          sylph_awarded: 500,
          sp_awarded: 1,
          new_level: 1,
          new_xp_within_level: 5000,
          new_rank: "E",
          new_total_xp: 5000,
          minted_sp: 115,
        },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/subjects/1/forge-apex", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await forgeApexPOST(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.totalMintedSP).toBe(115);
      expect(data.xpAwarded).toBe(5000);
      expect(data.sylphAwarded).toBe(500);
      expect(data.spAwarded).toBe(1);

      // Verify the atomic RPC was invoked with explicit TEXT parameters
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("forge_apex_node_atomic"),
        "101",
        "1",
        "N10_1"
      );

      // Verify the milestone message was emitted after the atomic claim
      expect(prisma.systemMessage.create).toHaveBeenCalled();
    });

    it("rejects re-forging when the apex node is already mastered (idempotency)", async () => {
      const token = await signToken({ userId: 101, username: "scholar_test" });

      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 1,
        userId: 101,
        name: "Mathematics",
        code: "9709",
        user: { username: "scholar_test" },
      });

      (prisma.subjectNode.findMany as any).mockResolvedValue(
        Array.from({ length: 48 }, (_, i) => ({
          id: i + 1,
          nodeId: i === 47 ? "N10_1" : `N_CONTENT_${i + 1}`,
          isMastered: i === 47,
          progress: 100.0,
          spAward: 3,
        }))
      );

      const rpcError: any = new Error("ALREADY_FORGED: Apex node N10_1 for subject 1 has already been forged");
      rpcError.code = "A0001";
      (prisma.$queryRawUnsafe as any).mockRejectedValue(rpcError);

      const req = new NextRequest("http://localhost:3000/api/subjects/1/forge-apex", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await forgeApexPOST(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.alreadyForged).toBe(true);
    });
  });
});
