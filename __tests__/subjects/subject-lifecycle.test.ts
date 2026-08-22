/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SKELETON_NODES, SKELETON_EDGES } from "@/lib/skill-tree-skeleton";
import { GET as getSubjects, POST as postSubject } from "@/app/api/subjects/route";
import { POST as postOnboarding } from "@/app/api/user/onboarding/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const mockTx = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userCosmetic: {
      upsert: vi.fn(),
    },
    subject: {
      upsert: vi.fn(),
      create: vi.fn(),
    },
    subjectNode: {
      createMany: vi.fn(),
    },
  };

  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      subject: {
        findMany: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
      subjectNode: {
        createMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
        return cb(mockTx);
      }),
      _mockTx: mockTx,
    },
  };
});

describe("Subject-Syllabus Constellation & Focus Timer Auto-Sync (Phase 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. 48-Node Constellation Topology & 115 SP Deterministic Ledger", () => {
    it("contains exactly 48 nodes from N1_1 to N10_1", () => {
      expect(SKELETON_NODES).toHaveLength(48);
      expect(SKELETON_NODES[0].id).toBe("N1_1");
      expect(SKELETON_NODES[47].id).toBe("N10_1");
    });

    it("satisfies the exact 115 SP tier distribution invariant", () => {
      const tier1to3 = SKELETON_NODES.filter((n) => n.tier >= 1 && n.tier <= 3);
      const tier4to5 = SKELETON_NODES.filter((n) => n.tier >= 4 && n.tier <= 5);
      const tier6to7 = SKELETON_NODES.filter((n) => n.tier >= 6 && n.tier <= 7);
      const tier8to9 = SKELETON_NODES.filter((n) => n.tier >= 8 && n.tier <= 9);
      const tier10 = SKELETON_NODES.filter((n) => n.tier === 10);

      expect(tier1to3).toHaveLength(10);
      expect(tier4to5).toHaveLength(14);
      expect(tier6to7).toHaveLength(15);
      expect(tier8to9).toHaveLength(8);
      expect(tier10).toHaveLength(1);

      // Verify SP calculation
      const getSpAward = (tier: number) => {
        if (tier <= 3) return 1;
        if (tier <= 5) return 2;
        if (tier <= 7) return 3;
        if (tier <= 9) return 4;
        return 0; // Apex Keystone
      };

      const totalSp = SKELETON_NODES.reduce((acc, node) => acc + getSpAward(node.tier), 0);
      expect(totalSp).toBe(115);
    });

    it("verifies graph edge connectivity is well-formed", () => {
      expect(SKELETON_EDGES.length).toBeGreaterThan(0);
      const nodeIds = new Set(SKELETON_NODES.map((n) => n.id));
      for (const [source, target] of SKELETON_EDGES) {
        expect(nodeIds.has(source)).toBe(true);
        expect(nodeIds.has(target)).toBe(true);
      }
    });
  });

  describe("2. Onboarding Subject Intake Flow (`POST /api/user/onboarding`)", () => {
    it("transactionally provisions subjects and 48-node skeletons", async () => {
      const token = await signToken({ userId: 101, username: "scholar_aliumair" });
      const mockTx = (prisma as any)._mockTx;

      (prisma.user.findUnique as any).mockResolvedValue({
        id: 101,
        username: "scholar_aliumair",
        name: "Ali Umair",
        email: "ali@sylf.dev",
        hasCompletedOnboarding: false,
      });

      mockTx.subject.upsert
        .mockResolvedValueOnce({
          id: 1,
          userId: 101,
          name: "Mathematics",
          code: "9709",
          examBoard: "CAIE",
          level: "A-Level",
          color: "#8B5CF6",
        })
        .mockResolvedValueOnce({
          id: 2,
          userId: 101,
          name: "Physics",
          code: "9702",
          examBoard: "CAIE",
          level: "A-Level",
          color: "#06B6D4",
        });

      mockTx.subjectNode.createMany.mockResolvedValue({ count: 48 });

      mockTx.user.update.mockResolvedValue({
        id: 101,
        username: "scholar_aliumair",
        hasCompletedOnboarding: true,
      });

      const payload = {
        themeId: "cyberpunk",
        backgroundId: "void",
        subjects: [
          { name: "Mathematics", code: " 9709 ", examBoard: "caie ", level: "A-Level", color: "#8B5CF6" },
          { name: "Physics", code: "9702", examBoard: "CAIE", level: "A-Level", color: "#06B6D4" },
        ],
      };

      const req = new NextRequest("http://localhost:3000/api/user/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const res = await postOnboarding(req);
      expect(res.status).toBe(200);

      // Verify subject upsert sanitization
      expect(mockTx.subject.upsert).toHaveBeenCalledTimes(2);
      expect(mockTx.subject.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_code: { userId: 101, code: "9709" } },
          create: expect.objectContaining({
            code: "9709",
            examBoard: "CAIE",
          }),
        })
      );

      // Verify 48 nodes batch created per subject
      expect(mockTx.subjectNode.createMany).toHaveBeenCalledTimes(2);
      const firstCallArgs = mockTx.subjectNode.createMany.mock.calls[0][0];
      expect(firstCallArgs.data).toHaveLength(48);
      expect(firstCallArgs.data[0].nodeId).toBe("N1_1");
      expect(firstCallArgs.data[0].spAward).toBe(1);
      expect(firstCallArgs.data[47].nodeId).toBe("N10_1");
      expect(firstCallArgs.data[47].spAward).toBe(0);
    });
  });

  describe("3. Subject CRUD & Focus Timer Auto-Sync (`/api/subjects`)", () => {
    it("GET /api/subjects returns strict projections with todaySeconds calculation", async () => {
      const token = await signToken({ userId: 101, username: "scholar_aliumair" });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: 101,
        timezone: "UTC",
      });

      (prisma.subject.findMany as any).mockResolvedValue([
        {
          id: 1,
          name: "Mathematics",
          code: "9709",
          examBoard: "CAIE",
          level: "A-Level",
          color: "#8B5CF6",
          createdAt: new Date("2026-08-20T00:00:00Z"),
          _count: { nodes: 48 },
          sessions: [
            { durationSeconds: 1800, durationMinutes: 30, endedAt: new Date() },
            { durationSeconds: 900, durationMinutes: 15, endedAt: new Date() },
          ],
        },
      ]);

      const req = new NextRequest("http://localhost:3000/api/subjects", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await getSubjects(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({
        id: 1,
        name: "Mathematics",
        code: "9709",
        examBoard: "CAIE",
        level: "A-Level",
        color: "#8B5CF6",
        createdAt: "2026-08-20T00:00:00.000Z",
        nodesCount: 48,
        todaySeconds: 2700,
      });
    });

    it("POST /api/subjects transactionally provisions new subject and 48 nodes", async () => {
      const token = await signToken({ userId: 101, username: "scholar_aliumair" });
      const mockTx = (prisma as any)._mockTx;

      mockTx.user.findUnique.mockResolvedValue({ username: "scholar_aliumair" });
      mockTx.subject.upsert.mockResolvedValue({
        id: 12,
        userId: 101,
        name: "Computer Science",
        code: "9618",
        examBoard: "CAIE",
        level: "A-Level",
        color: "#EC4899",
      });
      mockTx.subjectNode.createMany.mockResolvedValue({ count: 48 });

      const req = new NextRequest("http://localhost:3000/api/subjects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Computer Science",
          code: "9618",
          examBoard: "CAIE",
          level: "A-Level",
          color: "#EC4899",
        }),
      });

      const res = await postSubject(req);
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.code).toBe("9618");
      expect(data.nodesCount).toBe(48);
      expect(data.todaySeconds).toBe(0);
      expect(mockTx.subjectNode.createMany).toHaveBeenCalledTimes(1);
      expect(mockTx.subjectNode.createMany.mock.calls[0][0].data).toHaveLength(48);
    });
  });
});
