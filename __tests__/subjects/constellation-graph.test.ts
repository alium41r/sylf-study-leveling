/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/subjects/[id]/nodes/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subject: {
      findFirst: vi.fn(),
    },
    subjectNode: {
      findMany: vi.fn(),
    },
  },
}));

describe("Dynamic Subject Constellation Graph API (`GET /api/subjects/[id]/nodes`)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthorized (missing/invalid token)", async () => {
    const req = new NextRequest("http://localhost:3000/api/subjects/1/nodes", {
      method: "GET",
    });

    const res = await GET(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 if subject ID is invalid", async () => {
    const token = await signToken({ userId: 101, username: "scholar_test" });
    const req = new NextRequest("http://localhost:3000/api/subjects/abc/nodes", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const res = await GET(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid subject ID");
  });

  it("returns 404 if subject does not belong to the user", async () => {
    const token = await signToken({ userId: 101, username: "scholar_test" });
    (prisma.subject.findFirst as any).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/subjects/999/nodes", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const res = await GET(req, { params: Promise.resolve({ id: "999" }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Subject not found");
  });

  it("returns 48 strictly projected nodes, calculated mintedSP, and isApexReady = false when < 115 SP", async () => {
    const token = await signToken({ userId: 101, username: "scholar_test" });

    (prisma.subject.findFirst as any).mockResolvedValue({
      id: 1,
      name: "Mathematics",
      code: "9709",
      examBoard: "CAIE",
      level: "A-Level",
      color: "#8B5CF6",
    });

    const mockNodes = [
      {
        id: 101,
        nodeId: "N1_1",
        tier: 1,
        title: "Mathematics - Root Foundation",
        description: "Limits and continuity",
        difficulty: 1,
        spAward: 1,
        progress: 100.0,
        isMastered: true,
        masteredAt: new Date("2026-08-20T10:00:00Z"),
      },
      {
        id: 102,
        nodeId: "N2_1",
        tier: 2,
        title: "Mathematics - Calculus Derivatives",
        description: "Product and quotient rules",
        difficulty: 2,
        spAward: 1,
        progress: 50.0,
        isMastered: false,
        masteredAt: null,
      },
      {
        id: 103,
        nodeId: "N4_1",
        tier: 4,
        title: "Mathematics - Differential Equations",
        description: "First-order separation of variables",
        difficulty: 3,
        spAward: 2,
        progress: 100.0,
        isMastered: true,
        masteredAt: new Date("2026-08-21T10:00:00Z"),
      },
    ];

    (prisma.subjectNode.findMany as any).mockResolvedValue(mockNodes);

    const req = new NextRequest("http://localhost:3000/api/subjects/1/nodes", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const res = await GET(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.subject.name).toBe("Mathematics");
    expect(data.nodes).toHaveLength(3);

    // Sum of mastered node spAward: 1 (N1_1) + 2 (N4_1) = 3 SP
    expect(data.mintedSP).toBe(3);
    expect(data.totalSP).toBe(115);
    expect(data.isApexReady).toBe(false);
  });

  it("correctly sets isApexReady = true when mintedSP reaches 115 SP", async () => {
    const token = await signToken({ userId: 101, username: "scholar_test" });

    (prisma.subject.findFirst as any).mockResolvedValue({
      id: 2,
      name: "Physics",
      code: "9702",
      examBoard: "CAIE",
      level: "A-Level",
      color: "#06B6D4",
    });

    // Generate 47 mastered content nodes satisfying 115 SP
    const mockNodes: any[] = Array.from({ length: 47 }, (_, i) => ({
      id: i + 1,
      nodeId: `N_MOCK_${i + 1}`,
      tier: i < 10 ? 1 : i < 24 ? 4 : i < 39 ? 6 : 8,
      title: `Topic ${i + 1}`,
      description: `Objective ${i + 1}`,
      difficulty: 3,
      spAward: i < 10 ? 1 : i < 24 ? 2 : i < 39 ? 3 : 4,
      progress: 100.0,
      isMastered: true,
      masteredAt: new Date(),
    }));

    // Add unmastered apex node (Tier 10, 0 SP)
    mockNodes.push({
      id: 48,
      nodeId: "N10_1",
      tier: 10,
      title: "Physics - Apex Keystone",
      description: "Apex syllabus synthesis",
      difficulty: 5,
      spAward: 0,
      progress: 0.0,
      isMastered: false,
      masteredAt: null,
    });

    (prisma.subjectNode.findMany as any).mockResolvedValue(mockNodes);

    const req = new NextRequest("http://localhost:3000/api/subjects/2/nodes", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const res = await GET(req, { params: Promise.resolve({ id: "2" }) });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.mintedSP).toBe(115);
    expect(data.isApexReady).toBe(true);
  });

  describe("Sequential Node Display Nomenclature (#01–#47 / APEX)", () => {
    it("maps N1_1 to #01 and sequential nodes up to #47", async () => {
      const { getNodeDisplayCode, getNodeFullDisplayTitle, NODE_INDEX_MAP } = await import(
        "@/lib/skill-tree-skeleton"
      );

      expect(getNodeDisplayCode("N1_1")).toBe("#01");
      expect(getNodeDisplayCode("N2_1")).toBe("#02");
      expect(getNodeDisplayCode("N2_2")).toBe("#03");
      expect(getNodeDisplayCode("N2_3")).toBe("#04");
      expect(getNodeDisplayCode("N3_1")).toBe("#05");
      expect(getNodeDisplayCode("N4_1")).toBe("#11");
      expect(getNodeDisplayCode("N5_1")).toBe("#19");
      expect(getNodeDisplayCode("N9_3")).toBe("#47");
      expect(getNodeDisplayCode("N10_1")).toBe("APEX");

      // Verify full display title helper
      expect(getNodeFullDisplayTitle("N1_1", "Kinematics")).toBe("#01 · Kinematics");
      expect(getNodeFullDisplayTitle("N10_1", "Apex Keystone")).toBe("APEX · Apex Keystone");
      expect(getNodeFullDisplayTitle("N2_1")).toBe("#02");

      // Verify all 48 nodes are accounted for in the map
      expect(Object.keys(NODE_INDEX_MAP)).toHaveLength(48);
    });
  });

  describe("Topic & Subtopic Search Matching Logic", () => {
    it("matches syllabus nodes by title, description subtopics, unit codes, and tiers", async () => {
      const { SKELETON_NODES, getNodeDisplayCode } = await import("@/lib/skill-tree-skeleton");

      const mockLiveNodes = [
        {
          nodeId: "N1_1",
          title: "Physical Quantities and Units",
          description: "SI base units, derived units, dimensional analysis, and scalar vs vector quantities.",
          tier: 1,
          progress: 100,
          isMastered: true,
        },
        {
          nodeId: "N5_4", // #22
          title: "Diffraction and Grating",
          description: "Explain single-slit diffraction patterns and analyze diffraction grating phenomena, including calculations of grating spacing and angles.",
          tier: 5,
          progress: 0,
          isMastered: false,
        },
      ];

      const liveMap = new Map(mockLiveNodes.map((n) => [n.nodeId, n]));

      function searchNodes(query: string, filter = "ALL") {
        const q = query.trim().toLowerCase();
        return SKELETON_NODES.filter((sk) => {
          const live = liveMap.get(sk.id);
          const progress = live?.progress ?? 0;
          const isMastered = live?.isMastered || progress >= 100;
          const isStarted = progress > 0 && !isMastered;
          const isUntouched = progress === 0;

          if (filter === "IN_PROGRESS" && !isStarted) return false;
          if (filter === "MASTERED" && !isMastered) return false;
          if (filter === "UNTOUCHED" && !isUntouched) return false;
          if (filter === "TIER_1_3" && sk.tier > 3) return false;
          if (filter === "TIER_4_6" && (sk.tier < 4 || sk.tier > 6)) return false;
          if (filter === "TIER_7_10" && sk.tier < 7) return false;

          if (!q) return true;

          const displayCode = getNodeDisplayCode(sk.id).toLowerCase();
          const rawId = sk.id.toLowerCase();
          const unitNum = displayCode.replace("#", "");
          const title = (live?.title || sk.label).toLowerCase();
          const description = (live?.description || sk.description).toLowerCase();

          return (
            displayCode.includes(q) ||
            rawId.includes(q) ||
            `unit ${unitNum}`.includes(q) ||
            title.includes(q) ||
            description.includes(q)
          );
        });
      }

      // Search by topic keyword
      const diffractionMatches = searchNodes("Diffraction");
      expect(diffractionMatches.some((n) => n.id === "N5_4")).toBe(true);

      // Search by subtopic concept keyword
      const gratingMatches = searchNodes("grating spacing");
      expect(gratingMatches.some((n) => n.id === "N5_4")).toBe(true);

      // Search by unit number code
      const unit22Matches = searchNodes("#22");
      expect(unit22Matches).toHaveLength(1);
      expect(unit22Matches[0].id).toBe("N5_4");

      // Search with category filter
      const masteredMatches = searchNodes("", "MASTERED");
      expect(masteredMatches.some((n) => n.id === "N1_1")).toBe(true);
      expect(masteredMatches.some((n) => n.id === "N5_4")).toBe(false);

      const tier46Matches = searchNodes("", "TIER_4_6");
      expect(tier46Matches.some((n) => n.id === "N5_4")).toBe(true);
      expect(tier46Matches.some((n) => n.id === "N1_1")).toBe(false);
    });
  });
});

