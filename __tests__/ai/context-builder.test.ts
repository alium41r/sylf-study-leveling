import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRelevantContext } from "../../lib/ai/context-engine";
import { prisma } from "../../lib/prisma";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    aiMemory: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    }
  }
}));

describe("Phase 4A: Context Builder (Memory Layer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prioritizes user_stated memories over inferred, and sorts by recency", async () => {
    // Just verifying that findMany is called with the correct orderBy clause
    vi.mocked(prisma.aiMemory.findMany).mockResolvedValue([
      { key: "likes_mornings", value: "yes", source: "user_stated" },
      { key: "likes_math", value: "no", source: "inferred" },
    ] as any);

    await buildRelevantContext(1, "general");

    expect(prisma.aiMemory.findMany).toHaveBeenCalledWith({
      where: { userId: 1 },
      select: { key: true, value: true, source: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
  });

  it("prioritizes relevant memories based on messageText keywords", async () => {
    vi.mocked(prisma.aiMemory.findMany).mockResolvedValue([
      { key: "likes_math", value: "no", source: "inferred", updatedAt: new Date("2026-08-01") },
      { key: "likes_mornings", value: "yes", source: "user_stated", updatedAt: new Date("2026-08-02") },
      { key: "struggles_with_physics", value: "yes", source: "inferred", updatedAt: new Date("2026-08-03") },
    ] as any);

    // The user explicitly mentions "physics"
    const res = await buildRelevantContext(1, "general", [], "I am having trouble with physics today.");
    const memories = res.memories?.memories;

    expect(memories).toBeDefined();
    expect(memories![0].key).toBe("likes_mornings"); // user_stated (+5) > keyword match (+2)
    expect(memories![1].key).toBe("struggles_with_physics"); // keyword "physics" matches (+2)
    expect(memories![2].key).toBe("likes_math"); // no match, inferred (0)
  });

  it("handles empty memory sets gracefully", async () => {
    vi.mocked(prisma.aiMemory.findMany).mockResolvedValue([]);
    const res = await buildRelevantContext(1, "general");
    
    expect(res.memories).toBeDefined();
    expect(res.memories?.memories).toHaveLength(0);
  });
});
