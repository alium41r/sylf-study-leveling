import { expect, test, describe, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { DailyBriefingService } from "@/lib/ai/daily-briefing-service";
import { LLMFactory } from "@/lib/ai/providers/factory";
import { getSituationalFlags } from "@/lib/ai/planning-engine";
import { buildCoreContext, formatCoreContext } from "@/lib/ai/context-engine";

// Mock planning engine
vi.mock("@/lib/ai/planning-engine", () => ({
  getSituationalFlags: vi.fn().mockResolvedValue({
    isBurnoutRisk: false,
    isStruggling: false,
    isOverloaded: false,
  }),
}));

// Mock context engine
vi.mock("@/lib/ai/context-engine", () => ({
  buildCoreContext: vi.fn().mockResolvedValue({}),
  formatCoreContext: vi.fn().mockReturnValue("Core context formatted string"),
}));

// Mock the LLMFactory
vi.mock("@/lib/ai/providers/factory", () => {
  return {
    LLMFactory: {
      getAdapter: vi.fn().mockReturnValue({
        generateResponse: vi.fn().mockResolvedValue({
          text: "Here is your concise daily briefing! Keep up the good work.",
          toolCalls: [],
        }),
      }),
    },
  };
});

// Mock Prisma Client
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      create: vi.fn().mockResolvedValue({ id: 1, timezone: "America/New_York" }),
      delete: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({ id: 1 }),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    systemMessage: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue({
        id: 1,
        content: "concise daily briefing",
        sessionId: null,
      }),
    },
    quest: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe("Phase 5C - Daily Briefing Tests", () => {
  let user: any = { id: 1, timezone: "America/New_York" };

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  test("generates briefing and enforces tools: []", async () => {
    const dateKey = "2026-08-08";
    const result = await DailyBriefingService.generateDailyBriefing(user.id, dateKey, user.timezone);

    expect(result.success).toBe(true);

    // Verify SystemMessage was created
    const message = await prisma.systemMessage.findFirst({
      where: { userId: user.id, type: "DAILY_BRIEFING" },
    });

    expect(message).toBeDefined();
    expect(message?.content).toContain("concise daily briefing");
    expect(message?.sessionId).toBeNull(); // Must not pollute chat history

    // Ensure LLM Adapter was called with an empty tools array
    const adapter = LLMFactory.getAdapter("gemini");
    expect(adapter.generateResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [], // STRICT ENFORCEMENT
      expect.objectContaining({ maxTokens: 512, thinking: "disabled", singleAttempt: true })
    );
    expect(buildCoreContext).not.toHaveBeenCalled();
    expect(formatCoreContext).not.toHaveBeenCalled();
    const prompt = vi.mocked(adapter.generateResponse).mock.calls.at(-1)?.[1] as string;
    expect(prompt).toContain("calm, friendly");
    expect(prompt).not.toContain("for the Hunter");
    expect(prompt).not.toContain("Core State");
  });

  test("enforces hard backend output limits", async () => {
    const adapter = LLMFactory.getAdapter("gemini");
    // Mock a response that exceeds 800 characters
    const longText = "A".repeat(850);
    vi.mocked(adapter.generateResponse).mockResolvedValueOnce({
      text: longText,
      toolCalls: [],
    } as any);

    const dateKey = "2026-08-09";
    const result = await DailyBriefingService.generateDailyBriefing(user.id, dateKey, user.timezone);

    expect(result.success).toBe(false);
    expect(result.message).toContain("exceeded maximum allowed length");
  });
});
