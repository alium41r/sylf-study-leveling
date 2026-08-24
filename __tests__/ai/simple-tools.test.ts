// ============================================================
// Simple-Tier Tool Whitelist — Unit Tests
// ============================================================
// The lightweight tier sends only the tools a short imperative
// request can need, cutting ~2-3k input tokens per call. Verify
// the whitelist keeps read tools + calendar actions + handoff and
// drops memory/shop/analytics/planner tools.
// ============================================================

import { describe, it, expect } from "vitest";
import { getSimpleToolsForAgent, getToolsForAgent } from "@/lib/ai/chat-tools";

describe("Simple-Tier Tool Whitelist", () => {
  it("general: keeps core reads + handoff, drops memory/shop/analytics tools", () => {
    const tools = getSimpleToolsForAgent("general");
    const names = tools.map((t) => t.name);

    expect(names).toContain("getUserStats");
    expect(names).toContain("getQuests");
    expect(names).toContain("getAppState");
    expect(names).toContain("handoff");
    expect(names).not.toContain("saveMemory");
    expect(names).not.toContain("getMemory");
    expect(names).not.toContain("getShopInventory");
    expect(names).not.toContain("generateInsight");
  });

  it("calendar: keeps the schedule actions and reads", () => {
    const tools = getSimpleToolsForAgent("calendar");
    const names = tools.map((t) => t.name);

    expect(names).toContain("moveQuest");
    expect(names).toContain("swapQuests");
    expect(names).toContain("clearDay");
    expect(names).toContain("completeQuest");
    expect(names).toContain("handoff");
  });

  it("never returns an empty toolset", () => {
    for (const agent of ["general", "planner", "calendar", "coach", "analyst"] as const) {
      expect(getSimpleToolsForAgent(agent).length).toBeGreaterThan(0);
    }
  });

  it("is strictly smaller than the full agent toolset", () => {
    expect(getSimpleToolsForAgent("general").length).toBeLessThan(
      getToolsForAgent("general").length
    );
    expect(getSimpleToolsForAgent("analyst").length).toBeLessThan(
      getToolsForAgent("analyst").length
    );
  });
});
