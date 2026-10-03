/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getSubjectById, PATCH as patchSubject, DELETE as deleteSubject } from "@/app/api/subjects/[id]/route";
import { POST as restoreSubject } from "@/app/api/subjects/[id]/restore/route";
import { GET as getSubjects, POST as postSubject } from "@/app/api/subjects/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const mockTx = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subject: {
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
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
        findFirst: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      subjectNode: {
        createMany: vi.fn(),
      },
      studySession: {
        findFirst: vi.fn(),
        count: vi.fn(),
      },
      quest: {
        count: vi.fn(),
      },
      plannerPlan: {
        count: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
        return cb(mockTx);
      }),
      _mockTx: mockTx,
    },
  };
});

// Mock next/cache revalidateTag
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

describe("Subject Edit & Safe Deletion Suite (Cross-App Consistency)", () => {
  const user101 = { userId: 101, username: "scholar_aliumair" };
  const user202 = { userId: 202, username: "imposter" };
  let validToken: string;
  let imposterToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const tx = (prisma as any)._mockTx;
    Object.assign(tx, { $queryRaw: vi.fn().mockResolvedValue([]), studySession: prisma.studySession, quest: prisma.quest, plannerPlan: prisma.plannerPlan });
    tx.user.findUnique = prisma.user.findUnique;
    tx.subject.findFirst = prisma.subject.findFirst;
    tx.subject.update = prisma.subject.update;
    validToken = await signToken(user101);
    imposterToken = await signToken(user202);
  });

  describe("1. GET /api/subjects/[id] (Metadata & Dependency Telemetry)", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "GET",
      });
      const res = await getSubjectById(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });

    it("rejects invalid subject ID with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/subjects/invalid", {
        method: "GET",
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await getSubjectById(req, { params: Promise.resolve({ id: "invalid" }) });
      expect(res.status).toBe(400);
    });

    it("returns 404 if subject does not exist or belongs to another user", async () => {
      (prisma.subject.findFirst as any).mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/subjects/999", {
        method: "GET",
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await getSubjectById(req, { params: Promise.resolve({ id: "999" }) });
      expect(res.status).toBe(404);
    });

    it("returns subject details and dependency counts", async () => {
      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 1,
        name: "Mathematics",
        code: "9709",
        examBoard: "CAIE",
        level: "A-Level",
        color: "#8B5CF6",
        syllabusNote: "Cambridge 9709",
        archivedAt: null,
      });
      (prisma.studySession.findFirst as any).mockResolvedValue(null);
      (prisma.quest.count as any).mockResolvedValue(3);
      (prisma.plannerPlan.count as any).mockResolvedValue(1);
      (prisma.studySession.count as any).mockResolvedValue(42);

      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "GET",
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await getSubjectById(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(1);
      expect(data.name).toBe("Mathematics");
      expect(data.hasActiveSession).toBe(false);
      expect(data.activeQuestsCount).toBe(3);
      expect(data.activePlansCount).toBe(1);
      expect(data.totalSessionsCount).toBe(42);
    });
  });

  describe("2. PATCH /api/subjects/[id] (Edit Subject Semantics)", () => {
    it("rejects unauthorized edits with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Maths v2" }),
      });
      const res = await patchSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });

    it("rejects invalid payload (empty name or code) with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "" }),
      });
      const res = await patchSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(400);
    });

    it("rejects editing a subject owned by another user (404)", async () => {
      // Imposter tries to edit user 101's subject
      (prisma.subject.findFirst as any).mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${imposterToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Hacked Maths" }),
      });
      const res = await patchSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(404);
    });

    it("rejects editing an archived subject with 400", async () => {
      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 1,
        userId: 101,
        name: "Old Maths",
        code: "9709",
        archivedAt: new Date(),
        user: { username: "scholar_aliumair" },
      });

      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Cannot Edit Archived" }),
      });
      const res = await patchSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Cannot edit an archived subject");
    });

    it("rejects duplicate code conflict when another subject with that code exists (409)", async () => {
      (prisma.subject.findFirst as any)
        .mockResolvedValueOnce({
          id: 1,
          userId: 101,
          code: "9709",
          archivedAt: null,
          user: { username: "scholar_aliumair" },
        })
        .mockResolvedValueOnce({
          id: 2,
          code: "9702",
          archivedAt: null,
        });

      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: "9702" }),
      });
      const res = await patchSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toBe("DUPLICATE_CODE");
    });

    it("successfully edits subject metadata and normalizes uppercase codes", async () => {
      (prisma.subject.findFirst as any)
        .mockResolvedValueOnce({
          id: 1,
          userId: 101,
          name: "Maths",
          code: "9709",
          archivedAt: null,
          user: { username: "scholar_aliumair" },
        })
        .mockResolvedValueOnce(null); // No code conflict

      (prisma.subject.update as any).mockResolvedValue({
        id: 1,
        userId: 101,
        name: "Pure Mathematics",
        code: "9709",
        examBoard: "EDEXCEL",
        level: "International A-Level",
        color: "#6366F1",
        syllabusNote: "Updated P1-P4 syllabus notes",
        archivedAt: null,
      });

      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Pure Mathematics",
          examBoard: "edexcel",
          level: "International A-Level",
          color: "#6366F1",
          syllabusNote: "Updated P1-P4 syllabus notes",
        }),
      });
      const res = await patchSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("Pure Mathematics");
      expect(data.examBoard).toBe("EDEXCEL");
      expect(prisma.subject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            name: "Pure Mathematics",
            examBoard: "EDEXCEL",
          }),
        })
      );
    });
  });

  describe("3. DELETE /api/subjects/[id] (Safe Deletion & Active Session Guard)", () => {
    it("rejects unauthorized deletion with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "DELETE",
      });
      const res = await deleteSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });

    it("returns 404 when subject does not exist or is not owned by user", async () => {
      (prisma.subject.findFirst as any).mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${imposterToken}` },
      });
      const res = await deleteSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(404);
    });

    it("BLOCKS deletion (409 Conflict) when an active Focus session is currently running", async () => {
      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 1,
        userId: 101,
        name: "Maths",
        archivedAt: null,
        user: { username: "scholar_aliumair" },
      });

      // Active running focus session exists (endedAt === null)
      (prisma.studySession.findFirst as any).mockResolvedValue({
        id: 55,
        startedAt: new Date(),
      });

      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await deleteSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toBe("ACTIVE_SESSION_RUNNING");
      expect(json.message).toBe("Maths is being used in your current Focus session. End the session before deleting this subject.");
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });

    it("successfully soft-deletes (archives) the subject when no session is running", async () => {
      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 1,
        userId: 101,
        name: "Maths",
        archivedAt: null,
        user: { username: "scholar_aliumair" },
      });

      // No running session
      (prisma.studySession.findFirst as any).mockResolvedValue(null);

      const archiveDate = new Date();
      (prisma.subject.update as any).mockResolvedValue({
        id: 1,
        name: "Maths",
        archivedAt: archiveDate,
      });

      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await deleteSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("removed from active subjects");
      expect(prisma.subject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { archivedAt: expect.any(Date) },
        })
      );
    });

    it("is idempotent if the subject is already archived", async () => {
      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 1,
        userId: 101,
        name: "Maths",
        archivedAt: new Date("2026-09-20T00:00:00Z"),
        user: { username: "scholar_aliumair" },
      });

      const req = new NextRequest("http://localhost:3000/api/subjects/1", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await deleteSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toContain("already archived");
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });
  });

  describe("4. POST /api/subjects/[id]/restore (Undo / Restoration Semantics)", () => {
    it("rejects unauthorized restore with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/subjects/1/restore", {
        method: "POST",
      });
      const res = await restoreSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });

    it("returns 404 when subject does not exist or belongs to another user", async () => {
      (prisma.subject.findFirst as any).mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/subjects/1/restore", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await restoreSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(404);
    });

    it("restores an archived subject by resetting archivedAt to null", async () => {
      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 1,
        userId: 101,
        name: "Maths",
        archivedAt: new Date(),
        user: { username: "scholar_aliumair" },
      });

      (prisma.subject.update as any).mockResolvedValue({
        id: 1,
        userId: 101,
        name: "Maths",
        archivedAt: null,
      });

      const req = new NextRequest("http://localhost:3000/api/subjects/1/restore", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await restoreSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("restored successfully");
      expect(prisma.subject.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { archivedAt: null },
      });
    });

    it("returns success if the subject is already active (idempotent)", async () => {
      (prisma.subject.findFirst as any).mockResolvedValue({
        id: 1,
        userId: 101,
        name: "Maths",
        archivedAt: null,
        user: { username: "scholar_aliumair" },
      });

      const req = new NextRequest("http://localhost:3000/api/subjects/1/restore", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await restoreSubject(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toContain("already active");
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });
  });

  describe("5. Active vs. Historical Query Filtering & Reactivation", () => {
    it("GET /api/subjects excludes archived subjects via activeSubjectWhere", async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 101, timezone: "UTC" });
      (prisma.subject.findMany as any).mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/subjects", {
        method: "GET",
        headers: { Authorization: `Bearer ${validToken}` },
      });
      await getSubjects(req);

      expect(prisma.subject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 101,
            archivedAt: null,
          },
        })
      );
    });

    it("POST /api/subjects re-activates an archived subject with the same code", async () => {
      const mockTx = (prisma as any)._mockTx;
      mockTx.user.findUnique.mockResolvedValue({ username: "scholar_aliumair" });
      mockTx.subject.upsert.mockResolvedValue({
        id: 99,
        userId: 101,
        name: "Physics",
        code: "9702",
        examBoard: "CAIE",
        level: "A-Level",
        color: "#06B6D4",
        archivedAt: null,
      });
      mockTx.subjectNode.createMany.mockResolvedValue({ count: 48 });

      const req = new NextRequest("http://localhost:3000/api/subjects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Physics",
          code: "9702",
          examBoard: "CAIE",
          level: "A-Level",
          color: "#06B6D4",
        }),
      });

      const res = await postSubject(req);
      expect(res.status).toBe(201);
      // Verify upsert sets archivedAt: null in update clause to cleanly reactivate
      expect(mockTx.subject.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_code: { userId: 101, code: "9702" } },
          update: expect.objectContaining({
            archivedAt: null,
          }),
        })
      );
    });
  });
});
