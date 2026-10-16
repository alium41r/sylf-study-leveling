// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/ai/providers/factory", () => ({ LLMFactory: { getAdapter: () => ({ generateResponse: generate }) } }));
vi.mock("@/lib/ai/chat-tool-executor", () => ({ executeGoogleSearch: async () => ({ source: "Google Search Grounding", summary: "Official mechanics scope: energy, power, motion." }) }));
import { AiStudyOrchestrator } from "@/lib/ai/orchestrator";
import { withAiRequest } from "@/lib/ai/telemetry";
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it("reuses only the same owner's unchanged habit evidence while preserving the generated plan", async () => {
  vi.stubEnv("DEEPSEEK_API_KEY", "synthetic"); vi.useFakeTimers();
  const plan = { goalTitle: "Physics", goalDescription: "Practice mechanics", quests: [{ title: "Energy", description: "Solve mechanics problems", requiredMinutes: 45, xpReward: 1, sylphReward: 1 }] };
  generate.mockImplementation(async (_messages, system: string) => ({ text: system.includes("habits analyst") ? "Use 45-minute sessions." : JSON.stringify(plan), usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } }));
  const history = [{ durationMinutes: 45, focusRate: 90, startedAt: new Date("2026-10-14T00:00:00Z"), subject: "Physics" }];
  const run = (owner: number, sessions = history) => withAiRequest({ userId: owner, feature: "planner", workload: "classic_planner" }, () => AiStudyOrchestrator.generatePlan("Mechanics", "Energy and power", 5, null, sessions));
  const first = await run(801); expect(generate).toHaveBeenCalledTimes(3);
  const second = await run(801); expect(generate).toHaveBeenCalledTimes(5);
  expect({ ...second, usage: undefined }).toEqual({ ...first, usage: undefined });
  await run(802); expect(generate).toHaveBeenCalledTimes(8);
  await run(801, [{ ...history[0], durationMinutes: 60 }]); expect(generate).toHaveBeenCalledTimes(11);
  vi.advanceTimersByTime(10 * 60 * 1000 + 1);
  await run(801); expect(generate).toHaveBeenCalledTimes(14);
});
