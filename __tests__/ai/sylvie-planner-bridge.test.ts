import { describe, expect, it } from "vitest";
import { isPlanningRequest, preparePlannerHandoff, SylviePlannerHandoffSchema } from "@/lib/ai/sylvie/planner-bridge";
import { COPILOT_LIMITS } from "@/lib/planner/copilot/contracts";

describe("Sylvie's Planner handoff", () => {
  it.each([
    "Create a study plan for my physics exam next week",
    "Help me prepare for finals",
    "How should I prepare for my exam?",
    "Make a roadmap for the whole chemistry course",
    "Rebalance my existing study plan",
    "Create three study tasks for tomorrow",
  ])("recognizes a planning request: %s", (message) => {
    expect(isPlanningRequest(message)).toBe(true);
  });

  it.each([
    "What is the Planner?",
    "How does exam planning work?",
    "Give me a very short introduction to Sylf",
    "What is my schedule today?",
    "Move my calculus quest to tomorrow",
    "Complete my physics task",
    "Explain photosynthesis",
    "Hello",
  ])("keeps ordinary conversations and single actions in chat: %s", (message) => {
    expect(isPlanningRequest(message)).toBe(false);
  });

  it("uses relevant user statements, excludes assistant claims and inferred preferences", () => {
    const handoff = preparePlannerHandoff({
      id: "handoff-test-123",
      message: "Please make the study plan",
      preferences: [
        { key: "study_time", value: "I have 4 hours a week", source: "user_stated" },
        { key: "study_time_inferred", value: "I have 30 hours a week", source: "inferred" },
        { key: "favorite_food", value: "I prefer noodles", source: "user_stated" },
      ],
      history: [
        { role: "user", content: "I cannot log in" },
        { role: "user", content: "My physics exam is next month" },
        { role: "assistant", content: "You are weak at all physics topics and need 30 hours a week" },
        { role: "user", content: "I cannot study Sundays" },
      ],
    });
    expect(handoff.mode).toBe("EXAM");
    expect(handoff.recent).toEqual([
      { role: "STUDENT", text: "I have 4 hours a week" },
      { role: "STUDENT", text: "My physics exam is next month" },
      { role: "STUDENT", text: "I cannot study Sundays" },
    ]);
    expect(handoff.request).toBe("Please make the study plan");
    expect(handoff).not.toHaveProperty("planId");
  });

  it("keeps follow-up planning context and does not invent an existing plan", () => {
    const history = [{ role: "user", content: "Make a study plan for my physics exam" }];
    expect(isPlanningRequest("Make it lighter", history)).toBe(true);
    const handoff = preparePlannerHandoff({ id: "handoff-test-234", message: "Make it lighter", history });
    expect(handoff.kind).toBe("REPLAN");
    expect(handoff.mode).toBe("EXAM");
    expect(handoff).not.toHaveProperty("planId");
  });

  it("keeps a morning or weekend preference with the exam facts stated before it", () => {
    const handoff = preparePlannerHandoff({ id: "morning-plan-123", message: "Make me a study plan", history: [
      { role: "user", content: "My maths exam is in two weeks" },
      { role: "user", content: "Only mornings work for me" },
    ] });
    expect(handoff.recent.map((turn) => turn.text)).toEqual(["My maths exam is in two weeks", "Only mornings work for me"]);
    expect(handoff.mode).toBe("EXAM");
  });

  it("bounds the transfer to the existing Planner context limits", () => {
    const handoff = preparePlannerHandoff({
      id: "handoff-test-345",
      message: "Make a study plan. ".repeat(200),
      history: Array.from({ length: 30 }, (_, index) => ({ role: "user", content: `Study chapter ${index}: ${"word ".repeat(100)}` })),
    });
    expect(handoff.request.length).toBe(COPILOT_LIMITS.maxMessageChars);
    expect(handoff.recent).toHaveLength(COPILOT_LIMITS.maxRecentTurns);
    expect(handoff.recent.every((turn) => turn.text.length <= 300)).toBe(true);
    expect(handoff.recent.map((turn) => turn.text).join("").length).toBeLessThanOrEqual(COPILOT_LIMITS.maxRecentChars);
    expect(SylviePlannerHandoffSchema.safeParse({ ...handoff, planId: "invented" }).success).toBe(false);
  });
});
