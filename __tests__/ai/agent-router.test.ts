// ============================================================
// Agent Router — Unit Tests
// ============================================================
// Tests the deterministic intent classifier. Validates pattern
// matching, context-aware boosting, ambiguity handling, edge cases,
// and critically: that routing requires NO LLM call.
// ============================================================

import { describe, it, expect } from "vitest";
import { routeMessage, type AgentType, type RouterContext } from "@/lib/ai/agent-router";
import { getToolsForAgent } from "@/lib/ai/chat-tools";

// ─── Test Helpers ────────────────────────────────────────────

function createMockRouterContext(overrides: Partial<RouterContext> = {}): RouterContext {
  return {
    user: { hp: 80, maxHp: 100 },
    today: { overdueCount: 0 },
    subjectNames: [],
    memoryKeys: [],
    ...overrides,
  };
}

// ─── Planner Routing Tests ───────────────────────────────────

describe("Agent Router — Planner", () => {
  const ctx = createMockRouterContext();

  it("routes 'create a study plan for Physics' to planner", () => {
    const result = routeMessage("Create a study plan for Physics", ctx);
    expect(result.agent).toBe("planner");
  });

  it("routes 'plan my week for revision' to planner", () => {
    const result = routeMessage("Plan my week for revision", ctx);
    expect(result.agent).toBe("planner");
  });

  it("routes 'I have an exam in two weeks' to planner", () => {
    const result = routeMessage("I have an exam in two weeks", ctx);
    expect(result.agent).toBe("planner");
  });

  it("routes 'how should I study for maths' to planner", () => {
    const result = routeMessage("How should I study for maths", ctx);
    expect(result.agent).toBe("planner");
  });

  it("routes 'make next week easier' to planner", () => {
    const result = routeMessage("Make next week easier", ctx);
    expect(result.agent).toBe("planner");
  });

  it("routes 'lighten my workload' to planner", () => {
    const result = routeMessage("Lighten my workload", ctx);
    expect(result.agent).toBe("planner");
  });

  it("routes 'prepare for finals' to planner", () => {
    const result = routeMessage("Help me prepare for my finals", ctx);
    expect(result.agent).toBe("planner");
  });

  it("routes 'start studying calculus' to planner", () => {
    const result = routeMessage("I want to start studying calculus", ctx);
    expect(result.agent).toBe("planner");
  });

  it("routes 'delete my goal' to planner", () => {
    const result = routeMessage("Delete my goal", ctx);
    expect(result.agent).toBe("planner");
  });
});

// ─── Calendar Routing Tests ──────────────────────────────────

describe("Agent Router — Calendar", () => {
  const ctx = createMockRouterContext();

  it("routes 'move my Physics quest to Friday' to calendar", () => {
    const result = routeMessage("Move my Physics quest to Friday", ctx);
    expect(result.agent).toBe("calendar");
  });

  it("routes 'reschedule everything to next week' to calendar", () => {
    const result = routeMessage("Reschedule everything to next week", ctx);
    expect(result.agent).toBe("calendar");
  });

  it("routes 'swap today's quests with tomorrow' to calendar", () => {
    const result = routeMessage("Swap today's quests with tomorrow", ctx);
    expect(result.agent).toBe("calendar");
  });

  it("routes 'clear Wednesday' to calendar", () => {
    const result = routeMessage("Clear Wednesday for me", ctx);
    expect(result.agent).toBe("calendar");
  });

  it("routes 'leave Sunday free' to calendar", () => {
    const result = routeMessage("Leave Sunday free", ctx);
    expect(result.agent).toBe("calendar");
  });

  it("routes 'I have football on Wednesday' to calendar", () => {
    const result = routeMessage("I have football on Wednesday", ctx);
    expect(result.agent).toBe("calendar");
  });

  it("routes 'move everything' to calendar", () => {
    const result = routeMessage("Move everything to next week", ctx);
    expect(result.agent).toBe("calendar");
  });

  it("routes 'I am sick' to calendar", () => {
    const result = routeMessage("I'm sick, postpone all my quests", ctx);
    expect(result.agent).toBe("calendar");
  });
});

// ─── Coach Routing Tests ─────────────────────────────────────

describe("Agent Router — Coach", () => {
  const ctx = createMockRouterContext();

  it("routes 'how am I doing' to coach", () => {
    const result = routeMessage("How am I doing?", ctx);
    expect(result.agent).toBe("coach");
  });

  it("routes 'show me my progress' to coach", () => {
    const result = routeMessage("Show me my progress", ctx);
    expect(result.agent).toBe("coach");
  });

  it("routes 'am I improving' to coach", () => {
    const result = routeMessage("Am I improving over time?", ctx);
    expect(result.agent).toBe("coach");
  });

  it("routes 'give me feedback' to coach", () => {
    const result = routeMessage("Give me feedback on my performance", ctx);
    expect(result.agent).toBe("coach");
  });

  it("routes 'I feel overwhelmed' to coach", () => {
    const result = routeMessage("I feel overwhelmed and stressed", ctx);
    expect(result.agent).toBe("coach");
  });

  it("routes 'weekly review' to coach", () => {
    const result = routeMessage("Give me a weekly review", ctx);
    expect(result.agent).toBe("coach");
  });

  it("routes 'what should I focus on' to coach", () => {
    const result = routeMessage("What should I focus on improving?", ctx);
    expect(result.agent).toBe("coach");
  });

  it("boosts coach score when HP is critically low", () => {
    const lowHpCtx = createMockRouterContext({
      user: { hp: 15, maxHp: 100 },
    });
    const result = routeMessage("I'm tired and struggling", lowHpCtx);
    expect(result.agent).toBe("coach");
  });
});

// ─── Analyst Routing Tests ───────────────────────────────────

describe("Agent Router — Analyst", () => {
  const ctx = createMockRouterContext();

  it("routes 'which subject am I best at' to analyst", () => {
    const result = routeMessage("Which subject am I best at?", ctx);
    expect(result.agent).toBe("analyst");
  });

  it("routes 'show me my study analytics' to analyst", () => {
    const result = routeMessage("Show me my study analytics", ctx);
    expect(result.agent).toBe("analyst");
  });

  it("routes 'what is my completion rate' to analyst", () => {
    const result = routeMessage("What is my completion rate?", ctx);
    expect(result.agent).toBe("analyst");
  });

  it("routes 'when do I study best' to analyst", () => {
    const result = routeMessage("When do I study best?", ctx);
    expect(result.agent).toBe("analyst");
  });

  it("routes 'compare my subjects' to analyst", () => {
    const result = routeMessage("Compare my subject performance", ctx);
    expect(result.agent).toBe("analyst");
  });

  it("routes 'average focus rate' to analyst", () => {
    const result = routeMessage("What's my average focus rate?", ctx);
    expect(result.agent).toBe("analyst");
  });

  it("boosts analyst when subject name is mentioned", () => {
    const ctxWithSubjects = createMockRouterContext({
      subjectNames: ["Physics", "Mathematics"],
    });
    const result = routeMessage("How is my physics going?", ctxWithSubjects);
    expect(["analyst", "coach"]).toContain(result.agent);
  });
});

// ─── General / Fallback Tests ────────────────────────────────

describe("Agent Router — General / Fallback", () => {
  const ctx = createMockRouterContext();

  it("routes 'hello' to general", () => {
    const result = routeMessage("Hello!", ctx);
    expect(result.agent).toBe("general");
  });

  it("routes 'what can you do' to general", () => {
    const result = routeMessage("What can you do?", ctx);
    expect(result.agent).toBe("general");
  });

  it("routes empty message to general", () => {
    const result = routeMessage("", ctx);
    expect(result.agent).toBe("general");
  });

  it("routes random nonsense to general", () => {
    const result = routeMessage("asdfghjkl qwerty", ctx);
    expect(result.agent).toBe("general");
  });

  it("routes 'add a quest' to general (simple CRUD, not planning)", () => {
    const result = routeMessage("Add a quest called study chapter 3", ctx);
    expect(result.agent).toBe("general");
  });

  it("routes general knowledge questions to general", () => {
    const result = routeMessage("Explain the Solo Leveling rank system", ctx);
    expect(result.agent).toBe("general");
  });

  it("always returns a valid AgentType", () => {
    const validAgents: AgentType[] = ["general", "planner", "calendar", "coach", "analyst"];
    const messages = [
      "Hello", "Plan my week", "Move to Friday", "How am I doing", "Analytics please",
      "", "🎮", "123", "a", "the quick brown fox jumps over the lazy dog",
    ];
    for (const msg of messages) {
      const result = routeMessage(msg, ctx);
      expect(validAgents).toContain(result.agent);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.reason).toBeTruthy();
    }
  });

  describe("getToolsForAgent (Sub-Phase 3E)", () => {
    it("assigns memory and general tools to general agent", () => {
      const tools = getToolsForAgent("general").map((t: any) => t.name);
      expect(tools).toContain("getUserStats");
      expect(tools).toContain("saveMemory");
      expect(tools).not.toContain("createQuest"); // Planner
      expect(tools).not.toContain("generateInsight"); // Coach/Analyst
      expect(tools).not.toContain("moveQuest"); // Calendar
    });

    it("assigns planner, calendar, and general tools to planner agent", () => {
      const tools = getToolsForAgent("planner").map((t: any) => t.name);
      expect(tools).toContain("createQuest");
      expect(tools).toContain("moveQuest");
      expect(tools).toContain("saveMemory");
      expect(tools).not.toContain("getSubjectAnalytics"); // Analyst
    });

    it("assigns analytics tools to analyst agent", () => {
      const tools = getToolsForAgent("analyst").map((t: any) => t.name);
      expect(tools).toContain("getSubjectAnalytics");
      expect(tools).toContain("getPerformanceTrends");
      expect(tools).not.toContain("createQuest"); // Planner
      expect(tools).not.toContain("saveMemory"); // Analyst does not have memory writing usually, as per current design
    });

    it("assigns coach tools to coach agent", () => {
      const tools = getToolsForAgent("coach").map((t: any) => t.name);
      expect(tools).toContain("generateInsight");
      expect(tools).toContain("getPerformanceTrends");
      expect(tools).toContain("saveMemory");
      expect(tools).not.toContain("createQuest"); 
    });
  });
});

// ─── Context-Aware Boosting Tests ────────────────────────────

describe("Agent Router — Context Boosting", () => {
  it("boosts calendar when user has overdue quests and mentions 'overdue'", () => {
    const ctx = createMockRouterContext({
      today: { overdueCount: 3 },
    });
    const result = routeMessage("I have overdue stuff, help me sort it out", ctx);
    expect(["calendar", "coach"]).toContain(result.agent);
  });

  it("boosts planner when user has exam memory and mentions exam", () => {
    const ctx = createMockRouterContext({
      memoryKeys: ["exam_physics"],
    });
    const result = routeMessage("Help me prepare for my exam", ctx);
    expect(result.agent).toBe("planner");
  });

  it("does NOT boost calendar when no overdue quests exist", () => {
    const ctx = createMockRouterContext({ today: { overdueCount: 0 } });
    // "overdue" alone shouldn't trigger calendar without actual overdue quests
    const result = routeMessage("Tell me about overdue tasks", ctx);
    expect(result.agent).toBe("general");
  });
});

// ─── No LLM Call Verification ────────────────────────────────

describe("Agent Router — No LLM Required", () => {
  it("routeMessage is synchronous (no async/promise)", () => {
    const ctx = createMockRouterContext();
    const result = routeMessage("Plan my week", ctx);
    // If this was async, result would be a Promise. Verify it's a plain object.
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.agent).toBeDefined();
    expect(result.confidence).toBeDefined();
    expect(result.reason).toBeDefined();
  });

  it("routing completes in under 5ms (no network calls)", () => {
    const ctx = createMockRouterContext();
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      routeMessage("Create a study plan for my physics exam next week", ctx);
    }
    const elapsed = performance.now() - start;
    // 100 routing calls should complete in well under 50ms total
    expect(elapsed).toBeLessThan(50);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────

describe("Agent Router — Edge Cases", () => {
  const ctx = createMockRouterContext();

  it("handles very long messages without crashing", () => {
    const longMessage = "please ".repeat(1000) + "create a study plan";
    const result = routeMessage(longMessage, ctx);
    expect(result.agent).toBeDefined();
  });

  it("handles unicode and emoji gracefully", () => {
    const result = routeMessage("📚 Help me plan my study 🎯", ctx);
    expect(result.agent).toBeDefined();
  });

  it("handles special characters", () => {
    const result = routeMessage("What's my progress? (this week) [stats]", ctx);
    expect(result.agent).toBeDefined();
  });

  it("is case-insensitive", () => {
    const lower = routeMessage("create a study plan", ctx);
    const upper = routeMessage("CREATE A STUDY PLAN", ctx);
    const mixed = routeMessage("Create A Study Plan", ctx);
    expect(lower.agent).toBe(upper.agent);
    expect(lower.agent).toBe(mixed.agent);
  });
});

// ─── Tiered Context Selection Tests ──────────────────────────

describe("Agent Router — Context Selection Correctness", () => {
  it("does not require subjects data for routing", () => {
    // RouterContext has optional subjectNames — should work without it
    const ctx: RouterContext = {
      user: { hp: 80, maxHp: 100 },
      today: { overdueCount: 0 },
      // No subjectNames, no memoryKeys
    };
    const result = routeMessage("Plan my study week", ctx);
    expect(result.agent).toBe("planner");
  });

  it("does not require memory data for routing", () => {
    const ctx: RouterContext = {
      user: { hp: 80, maxHp: 100 },
      today: { overdueCount: 0 },
    };
    const result = routeMessage("How am I doing?", ctx);
    expect(result.agent).toBe("coach");
  });

  it("only uses hp/maxHp from user context (not full user profile)", () => {
    // This verifies the router doesn't accidentally depend on full user data
    const ctx: RouterContext = {
      user: { hp: 10, maxHp: 100 },
      today: { overdueCount: 0 },
    };
    // Should boost coach due to low HP
    const result = routeMessage("I'm tired and struggling", ctx);
    expect(result.agent).toBe("coach");
  });
});
