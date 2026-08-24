/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateFallbackSyllabus,
  validateAndSanitizeCompiledNodes,
  compileSyllabus,
} from "@/lib/ai/syllabus-compiler";
import { SKELETON_NODES } from "@/lib/skill-tree-skeleton";
import { POST } from "@/app/api/subjects/[id]/compile/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });

  return {
    prisma: {
      subject: {
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 42, lastCompiledAt: new Date() }),
      },
      subjectNode: {
        updateMany: updateManyMock,
      },
      user: {
        findUnique: vi.fn(),
      },
      userQuota: {
        findUnique: vi.fn(),
      },
      $queryRawUnsafe: vi.fn(),
      $transaction: vi.fn(async (input: any) => {
        if (typeof input === "function") {
          return input({ subjectNode: { updateMany: updateManyMock } });
        }
        return input;
      }),
      _updateManyMock: updateManyMock,
    },
  };
});

describe("Background AI Syllabus Compiler Service & Node Ingestion (Phase 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue(null); // 0 used today
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ used: 1 }] as any); // atomic consumeQuota
  });

  describe("1. Curriculum Schema & Topological Parity Invariant", () => {
    it("generates deterministic fallback syllabus with exactly 48 nodes and valid tier distributions", () => {
      const result = generateFallbackSyllabus({
        name: "Mathematics",
        code: "9709",
        examBoard: "CAIE",
        level: "A-Level",
      });

      expect(result.subjectName).toBe("Mathematics");
      expect(result.code).toBe("9709");
      expect(result.nodes).toHaveLength(48);

      // Verify exact ID alignment
      const expectedIds = SKELETON_NODES.map((n) => n.id);
      const generatedIds = result.nodes.map((n) => n.nodeId);
      expect(generatedIds).toEqual(expectedIds);

      // Verify Tier 1 and Apex Tier 10 titles
      const tier1 = result.nodes.find((n) => n.nodeId === "N1_1");
      const apex = result.nodes.find((n) => n.nodeId === "N10_1");

      expect(tier1?.title).toContain("Foundational Axioms");
      expect(apex?.title).toContain("Apex Mastery Capstone");
      expect(apex?.difficulty).toBe(5);
    });

    it("sanitizes malformed LLM outputs and clamps difficulties between 1 and 5", () => {
      const rawNodes = [
        { nodeId: "N1_1", tier: 1, title: "Custom Pure Math Intro", description: "Learn fundamentals", difficulty: 0 },
        { nodeId: "N10_1", tier: 10, title: "Ultimate Apex Keystone", description: "Synthesis", difficulty: 99 },
        // Missing all other 46 nodes intentionally to test fallback backfilling
      ];

      const sanitized = validateAndSanitizeCompiledNodes(rawNodes, {
        name: "Physics",
        code: "9702",
        examBoard: "CAIE",
        level: "A-Level",
      });

      expect(sanitized).toHaveLength(48);

      const n1 = sanitized.find((n) => n.nodeId === "N1_1")!;
      expect(n1.title).toBe("Custom Pure Math Intro");
      expect(n1.difficulty).toBe(1); // Clamped from 0 to 1

      const n10 = sanitized.find((n) => n.nodeId === "N10_1")!;
      expect(n10.title).toBe("Ultimate Apex Keystone");
      expect(n10.difficulty).toBe(5); // Clamped from 99 to 5

      // Missing nodes should be cleanly populated by fallback
      const n2 = sanitized.find((n) => n.nodeId === "N2_1")!;
      expect(n2.title).toBeDefined();
      expect(n2.difficulty).toBeGreaterThanOrEqual(1);
      expect(n2.difficulty).toBeLessThanOrEqual(5);
    });

    it("compileSyllabus returns full compilation result with graceful offline handling", async () => {
      const result = await compileSyllabus({
        name: "Computer Science",
        code: "9618",
        examBoard: "CAIE",
        level: "A-Level",
      });

      expect(result.nodes).toHaveLength(48);
      expect(result.subjectName).toBe("Computer Science");
      expect(result.code).toBe("9618");
    });
  });

  describe("2. Transactional Node Compilation API (`POST /api/subjects/[id]/compile`)", () => {
    it("returns 401 if request is unauthorized", async () => {
      const req = new NextRequest("http://localhost:3000/api/subjects/1/compile", {
        method: "POST",
      });

      const res = await POST(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 404 if subject does not belong to the user", async () => {
      const token = await signToken({ userId: 101, username: "scholar_test" });
      (prisma.subject.findFirst as any).mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/subjects/999/compile", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await POST(req, { params: Promise.resolve({ id: "999" }) });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Subject not found");
    });

    it("blocks recompiling a subject that has already been compiled (one-time per subject)", async () => {
      const token = await signToken({ userId: 101, username: "scholar_test" });
      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 42,
        userId: 101,
        name: "Mathematics",
        code: "9709",
        examBoard: "CAIE",
        level: "A-Level",
        lastCompiledAt: new Date("2026-08-01T00:00:00.000Z"),
        user: { username: "scholar_test" },
      });

      const req = new NextRequest("http://localhost:3000/api/subjects/42/compile", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await POST(req, { params: Promise.resolve({ id: "42" }) });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("SUBJECT_ALREADY_COMPILED");
    });

    it("transactionally updates all 48 nodes while preserving progress and isMastered state", async () => {
      const token = await signToken({ userId: 101, username: "scholar_test" });
      const updateManyMock = (prisma as any)._updateManyMock;

      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 42,
        userId: 101,
        name: "Mathematics",
        code: "9709",
        examBoard: "CAIE",
        level: "A-Level",
        user: { username: "scholar_test" },
      });

      const req = new NextRequest("http://localhost:3000/api/subjects/42/compile", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await POST(req, { params: Promise.resolve({ id: "42" }) });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.updatedCount).toBe(48);
      expect(data.nodes).toHaveLength(48);

      // Verify transaction updateMany was called 48 times
      expect(updateManyMock).toHaveBeenCalledTimes(48);

      // Verify strict whitelist guardrail: progress, isMastered, spAward are NOT in the update payload
      const firstUpdateCall = updateManyMock.mock.calls[0][0];
      expect(firstUpdateCall.where.subjectId).toBe(42);
      expect(firstUpdateCall.where.nodeId).toBeDefined();

      const updateData = firstUpdateCall.data;
      expect(updateData.title).toBeDefined();
      expect(updateData.description).toBeDefined();
      expect(updateData.difficulty).toBeDefined();
      expect(updateData.updatedAt).toBeDefined();

      // Invariant: progress & isMastered must never be overwritten
      expect(updateData.progress).toBeUndefined();
      expect(updateData.isMastered).toBeUndefined();
      expect(updateData.spAward).toBeUndefined();
    });
  });
});
