import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeChatTool } from "../../lib/ai/chat-tool-executor";
import { prisma } from "../../lib/prisma";
import { SHOP_ITEMS } from "../../lib/shop-items";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    goal: {
      findMany: vi.fn(),
    },
    aiInsight: {
      create: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    }
  }
}));

describe("Phase 3D: App-State Tools", () => {
  const userId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateInsightTool (Phase 4C Deduplication & Proactive)", () => {
    beforeEach(() => {
      vi.mocked(prisma.aiInsight.count).mockResolvedValue(0);
      vi.mocked(prisma.aiInsight.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.aiInsight.findMany).mockResolvedValue([]);
    });

    it("successfully creates a valid insight when no history exists", async () => {
      const res = await executeChatTool("generateInsight", { 
        category: "coaching", 
        content: "You should study more math." 
      }, userId);
      
      expect(res.success).toBe(true);
      expect(prisma.aiInsight.create).toHaveBeenCalled();
    });

    it("fails if category is invalid", async () => {
      const res = await executeChatTool("generateInsight", { 
        category: "joke", 
        content: "Why did the chicken cross the road?" 
      }, userId);
      expect(res.error).toContain("Invalid category");
      expect(prisma.aiInsight.create).not.toHaveBeenCalled();
    });

    it("fails if content is too long", async () => {
      const res = await executeChatTool("generateInsight", { 
        category: "coaching", 
        content: "a".repeat(250) 
      }, userId);
      expect(res.error).toContain("Content too long");
    });

    it("prevents spamming by enforcing a daily limit (3 max)", async () => {
      vi.mocked(prisma.aiInsight.count).mockResolvedValue(3);
      const res = await executeChatTool("generateInsight", { 
        category: "coaching", 
        content: "Stop procrastinating!" 
      }, userId);
      expect(res.error).toContain("Daily insight limit reached");
    });

    it("prevents multiple generateInsight calls within 60 minutes (cooldown)", async () => {
      // findFirst returns an object for the first call (cooldown check)
      vi.mocked(prisma.aiInsight.findFirst).mockResolvedValueOnce({ id: 1 } as any);
      
      const res = await executeChatTool("generateInsight", { 
        category: "coaching", 
        content: "A fresh insight." 
      }, userId);
      expect(res.error).toContain("Cooldown active");
    });

    it("prevents strict exact duplicate insights", async () => {
      // Cooldown check returns null, exact duplicate returns object
      vi.mocked(prisma.aiInsight.findFirst)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1 } as any);
      
      const res = await executeChatTool("generateInsight", { 
        category: "coaching", 
        content: "Exact same message" 
      }, userId);
      expect(res.error).toContain("An identical insight has already been saved previously");
    });

    it("prevents normalized exact duplicates (case/punctuation changes)", async () => {
      vi.mocked(prisma.aiInsight.findMany).mockResolvedValue([{ content: "you should study more math!" }] as any);
      const res = await executeChatTool("generateInsight", { 
        category: "coaching", 
        content: "You should study more math." // diff case and punctuation
      }, userId);
      expect(res.error).toContain("An identical insight has already been saved previously");
    });

    it("rejects highly similar semantic wording (Jaccard > 0.5)", async () => {
      vi.mocked(prisma.aiInsight.findMany).mockResolvedValue([{ content: "Your math completion rate has dropped significantly." }] as any);
      const res = await executeChatTool("generateInsight", { 
        category: "trend", 
        content: "Your math completion rate is dropping significantly." 
      }, userId);
      expect(res.error).toContain("A semantically similar insight was recently generated");
    });

    it("accepts similar words if they have opposite meaning (e.g. improving vs declining)", async () => {
      vi.mocked(prisma.aiInsight.findMany).mockResolvedValue([{ content: "Your physics completion is improving." }] as any);
      const res = await executeChatTool("generateInsight", { 
        category: "trend", 
        content: "Your physics completion is declining." 
      }, userId);
      expect(res.success).toBe(true); // Because "improving" and "declining" are opposing pairs
    });

    it("handles short strings with high apparent overlap safely", async () => {
      vi.mocked(prisma.aiInsight.findMany).mockResolvedValue([{ content: "Focus up." }] as any);
      const res = await executeChatTool("generateInsight", { 
        category: "coaching", 
        content: "Study up." 
      }, userId);
      expect(res.success).toBe(true); // union size < 4, jaccard <= 0.66, so it bypassed
    });

    it("ignores common stop words when calculating overlap", async () => {
      // Both strings have "the", "a", "is", "should", "you", "your"
      vi.mocked(prisma.aiInsight.findMany).mockResolvedValue([{ content: "You should focus on your math goals, it is the best path." }] as any);
      const res = await executeChatTool("generateInsight", { 
        category: "coaching", 
        content: "You should focus on your physics goals, it is a great path." 
      }, userId);
      // Non-stop words: ["focus", "math", "goals", "best", "path"] vs ["focus", "physics", "goals", "great", "path"]
      // intersection: "focus", "goals", "path" (3)
      // union: "focus", "math", "goals", "best", "path", "physics", "great" (7)
      // 3/7 = 0.42 < 0.5 -> accepted!
      expect(res.success).toBe(true);
    });
  });

  describe("getAppStateTool", () => {
    it("retrieves aggregated user state and goals", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        level: 5,
        hunterRank: "D",
        currentXP: 100,
        xpToNextLevel: 500,
        sylph: 1500,
        hp: 80,
        maxHp: 100,
        streakDays: 3,
      } as any);

      vi.mocked(prisma.goal.findMany).mockResolvedValue([
        { title: "Master Calculus", effortLevel: "HARD" }
      ] as any);

      const res = await executeChatTool("getAppState", {}, userId);
      
      expect(res.level).toBe(5);
      expect(res.sylph).toBe(1500);
      expect(res.activeGoals).toHaveLength(1);
      expect(res.activeGoals[0].title).toBe("Master Calculus");
    });

    it("returns error if user not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      const res = await executeChatTool("getAppState", {}, userId);
      expect(res.error).toContain("not found");
    });
  });

  describe("getShopInventoryTool", () => {
    it("returns shop inventory", async () => {
      const res = await executeChatTool("getShopInventory", {}, userId);
      expect(res.items).toBeDefined();
      expect(Array.isArray(res.items)).toBe(true);
      expect(res.items.length).toBe(SHOP_ITEMS.length);
      if (res.items.length > 0) {
        expect(res.items[0]).toHaveProperty("name");
        expect(res.items[0]).toHaveProperty("cost");
      }
    });
  });
});
