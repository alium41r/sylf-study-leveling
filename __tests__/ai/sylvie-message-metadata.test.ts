/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { shortSylfIntroduction } from "@/lib/ai/sylvie/quick-replies";
import { attachPlannerHandoff, parsePlannerHandoff } from "@/lib/ai/sylvie/planner-message";
import { stripSylvieAction } from "@/lib/ai/sylvie/action";
import { isPlanningRequest, preparePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";
import { selectSylvieTools } from "@/lib/ai/sylvie/turn-context";

describe("Sylvie's narrow quick reply", () => {
  it("answers the short-introduction regression without unrelated data", () => {
    const reply = shortSylfIntroduction("Give me a very short introduction to Sylf");
    expect(reply?.split(/\s+/).length).toBeLessThanOrEqual(20);
    expect(reply).not.toMatch(/scholar|hunter|solo leveling|xp|hp|rank|streak/i);
  });
  it.each([
    "Give me a very short introduction to Sylf in Spanish",
    "Give me a very short introduction to Sylf as a poem",
    "Give me a short introduction to Sylf and show my stats",
    "Give me a detailed introduction to Sylf",
  ])("keeps extra user instructions on the model path: %s", (query) => {
    expect(shortSylfIntroduction(query)).toBeNull();
  });
});

describe("Planner review across chat reload", () => {
  it("carries a short request after the user stated their exam and availability", () => {
    const history = [{ role: "user", content: "I have a maths exam in two weeks" }, { role: "user", content: "Only mornings work for me" }];
    expect(isPlanningRequest("Make me a plan", history)).toBe(true);
    const handoff = preparePlannerHandoff({ message: "Make me a plan", history });
    expect(handoff.mode).toBe("EXAM");
    expect(handoff.recent.map((turn) => turn.text)).toContain("Only mornings work for me");
    expect(isPlanningRequest("Make me a plan", [...history, { role: "user", content: "Tell me a joke" }])).toBe(false);
  });
  it("preserves bounded user context and keeps hidden metadata out of text/history", () => {
    const handoff = preparePlannerHandoff({ message: "Create a study plan for my exam", history: [{ role: "user", content: "I have 4 hours a week" }] });
    const content = attachPlannerHandoff("Review your request in Planner.", handoff);
    expect(parsePlannerHandoff(content)).toEqual(handoff);
    expect(stripSylvieAction(content)).toBe("Review your request in Planner.");
    expect(parsePlannerHandoff("<!-- sylvie-planner:aW52YWxpZA== -->")).toBeUndefined();
  });
});

describe("Requested tools remain semantically scoped", () => {
  const names = (query: string) => selectSylvieTools("general", query).map((tool) => tool.name);
  it("distinguishes a personal workload question from documentation about work", () => {
    expect(names("How much work do I have scheduled today?")).toContain("getQuests");
    expect(names("How much work did I do last week?")).toContain("getWeeklySummary");
    expect(names("Show how Sylf XP works")).toEqual([]);
  });
  it("offers web search only when requested and does not substitute shop stock for owned items", () => {
    expect(names("Search the web for official exam resources")).toEqual(["googleSearch"]);
    expect(names("Explain photosynthesis")).toEqual([]);
    expect(names("What items are in my inventory?")).not.toContain("getShopInventory");
    expect(names("What items are available in the shop?")).toContain("getShopInventory");
    expect(names("I’m reading a book this week")).toEqual([]);
    expect(names("What does a shop do?")).toEqual([]);
  });
});
