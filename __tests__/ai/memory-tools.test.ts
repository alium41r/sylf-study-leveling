import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeChatTool } from "../../lib/ai/chat-tool-executor";
import { prisma } from "../../lib/prisma";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    aiMemory: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  }
}));

describe("Phase 3C: Memory Tools", () => {
  const userId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saveMemoryTool", () => {
    it("successfully saves a new memory", async () => {
      const res = await executeChatTool("saveMemory", { 
        key: "study_time", 
        value: "Prefers morning", 
        source: "user_stated",
        confidence: 1.0 
      }, userId);
      
      expect(res.success).toBe(true);
      expect(res.message).toContain("I'll remember this");
      expect(prisma.aiMemory.upsert).toHaveBeenCalledWith({
        where: { userId_key: { userId, key: "study_time" } },
        update: { value: "Prefers morning", source: "user_stated", confidence: 1.0 },
        create: { userId, key: "study_time", value: "Prefers morning", source: "user_stated", confidence: 1.0 }
      });
    });

    it("defaults to inferred if source is missing or invalid", async () => {
      await executeChatTool("saveMemory", { 
        key: "struggles_math", 
        value: "Failed 2 quests", 
        source: "hallucination",
        confidence: 0.5 
      }, userId);
      
      const call = vi.mocked(prisma.aiMemory.upsert).mock.calls[0][0];
      expect(call.update.source).toBe("inferred");
    });

    it("prevents overwriting user_stated memory with inferred memory", async () => {
      vi.mocked(prisma.aiMemory.findUnique).mockResolvedValue({ source: "user_stated" } as any);
      const res = await executeChatTool("saveMemory", { 
        key: "study_time", 
        value: "Prefers night", 
        source: "inferred",
        confidence: 0.8 
      }, userId);
      
      expect(res.error).toContain("Cannot overwrite a user_stated memory with an inferred assumption");
      expect(prisma.aiMemory.upsert).not.toHaveBeenCalled();
    });

    it("allows overwriting user_stated memory with a newer user_stated memory", async () => {
      vi.mocked(prisma.aiMemory.findUnique).mockResolvedValue({ source: "user_stated" } as any);
      const res = await executeChatTool("saveMemory", { 
        key: "study_time", 
        value: "Prefers morning now", 
        source: "user_stated",
        confidence: 1.0 
      }, userId);
      
      expect(res.success).toBe(true);
      expect(res.message).toContain("I'll remember this");
      expect(prisma.aiMemory.upsert).toHaveBeenCalledWith({
        where: { userId_key: { userId, key: "study_time" } },
        update: { value: "Prefers morning now", source: "user_stated", confidence: 1 },
        create: { userId, key: "study_time", value: "Prefers morning now", source: "user_stated", confidence: 1 }
      });
    });

    it("clamps confidence to between 0 and 1", async () => {
      vi.mocked(prisma.aiMemory.findUnique).mockResolvedValue(null);
      await executeChatTool("saveMemory", { key: "test", value: "test", source: "inferred", confidence: 5.5 }, userId);
      const callHigh = vi.mocked(prisma.aiMemory.upsert).mock.calls[0][0];
      expect(callHigh.update.confidence).toBe(1);

      await executeChatTool("saveMemory", { key: "test2", value: "test2", source: "inferred", confidence: -2.0 }, userId);
      const callLow = vi.mocked(prisma.aiMemory.upsert).mock.calls[1][0];
      expect(callLow.update.confidence).toBe(0);
    });

    it("blocks excessively long keys", async () => {
      const longKey = "a".repeat(150);
      const res = await executeChatTool("saveMemory", { key: longKey, value: "test", source: "inferred", confidence: 1 }, userId);
      expect(res.error).toContain("Memory key too long");
    });

    it("blocks excessively long values", async () => {
      const longValue = "a".repeat(600);
      const res = await executeChatTool("saveMemory", { key: "test", value: longValue, source: "inferred", confidence: 1 }, userId);
      expect(res.error).toContain("Memory value too long");
    });
  });

  describe("getMemoryTool", () => {
    it("returns memory if found for the authenticated user", async () => {
      vi.mocked(prisma.aiMemory.findUnique).mockResolvedValue({
        id: 1, userId: 1, key: "test", value: "test_val", source: "inferred", confidence: 0.8, createdAt: new Date(), updatedAt: new Date()
      });
      
      const res = await executeChatTool("getMemory", { key: "test" }, userId);
      expect(res.value).toBe("test_val");
      expect(prisma.aiMemory.findUnique).toHaveBeenCalledWith({
        where: { userId_key: { userId, key: "test" } }
      });
    });

    it("returns error if memory not found", async () => {
      vi.mocked(prisma.aiMemory.findUnique).mockResolvedValue(null);
      
      const res = await executeChatTool("getMemory", { key: "test" }, userId);
      expect(res.error).toContain("not found");
    });
  });

  describe("forgetMemoryTool", () => {
    it("successfully deletes a memory", async () => {
      vi.mocked(prisma.aiMemory.findUnique).mockResolvedValue({ id: 1 } as any);
      
      const res = await executeChatTool("forgetMemory", { key: "bad_fact" }, userId);
      expect(res.success).toBe(true);
      expect(res.message).toContain("forgotten");
      expect(prisma.aiMemory.delete).toHaveBeenCalledWith({
        where: { userId_key: { userId, key: "bad_fact" } }
      });
    });

    it("prevents deleting a memory that does not exist or belongs to someone else", async () => {
      vi.mocked(prisma.aiMemory.findUnique).mockResolvedValue(null);
      
      const res = await executeChatTool("forgetMemory", { key: "other_users_secret" }, userId);
      expect(res.error).toContain("not found");
      expect(prisma.aiMemory.delete).not.toHaveBeenCalled();
    });
  });
});
