import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../app/api/system-messages/chat/route";
import { NextRequest } from "next/server";
import { prisma } from "../../lib/prisma";
import * as auth from "../../lib/auth";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    goal: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    quest: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn(), groupBy: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    studySession: { findMany: vi.fn(), groupBy: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    aiMemory: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    aiInsight: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    chatSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    systemMessage: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    hpLedger: { findMany: vi.fn() },
    subject: { findMany: vi.fn() },
    userAchievement: { findMany: vi.fn() },
    userQuota: { findUnique: vi.fn() },
    $queryRawUnsafe: vi.fn()
  }
}));

vi.mock("../../lib/auth", () => ({
  verifyToken: vi.fn(),
}));

vi.mock("../../lib/timezone-service", () => ({
  TimezoneService: {
    getUserLocalDate: vi.fn().mockReturnValue("2026-08-01"),
    getUserLocalTime: vi.fn().mockReturnValue("12:00"),
    getUserDayOfWeek: vi.fn().mockReturnValue("Saturday"),
    getDateRangeInUserTimezone: vi.fn().mockReturnValue(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]),
    getDateOffset: vi.fn().mockReturnValue("2026-08-02"),
    getDateString: vi.fn().mockReturnValue("2026-08-01"),
    getStartOfDayUTC: vi.fn().mockReturnValue(new Date("2026-08-01T00:00:00Z")),
    getEndOfDayUTC: vi.fn().mockReturnValue(new Date("2026-08-01T23:59:59.999Z")),
    getNextMidnightUTC: vi.fn().mockReturnValue(new Date("2026-08-02T00:00:00Z")),
    validateTimezone: vi.fn().mockReturnValue(true),
    getUserLocalDateOffset: vi.fn().mockReturnValue("2026-08-01"),
  }
}));

vi.mock("../../lib/timezone-server", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("UTC"),
  TimezoneServerService: {
    getUserTimezone: vi.fn().mockResolvedValue("UTC"),
  },
}));

const { mockGenerateResponse } = vi.hoisted(() => {
  const mockGenerateResponse = vi.fn();
  return { mockGenerateResponse };
});

vi.mock("../../lib/ai/providers/factory", () => {
  return {
    LLMFactory: {
      getAdapter: vi.fn(() => ({
        generateResponse: mockGenerateResponse
      }))
    }
  };
});

describe("Phase 4D: E2E Conversational Intelligence", () => {
  const userId = 1;
  const sessionId = 100;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation((msg, err) => {
      if (String(msg).includes("Failed to parse recovered arguments")) return;
      throw new Error(`Console Error: ${msg} ${err?.message || err || ''}`);
    });
    vi.mocked(auth.verifyToken).mockResolvedValue({ userId });
    
    vi.mocked(prisma.chatSession.create).mockResolvedValue({ id: sessionId } as any);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue({ id: sessionId, userId } as any);
    vi.mocked(prisma.systemMessage.create).mockImplementation((async (args: any) => ({
      id: Math.floor(Math.random() * 1000),
      type: args.data.type,
      content: args.data.content,
    } as any)) as any);
    vi.mocked(prisma.systemMessage.findMany).mockResolvedValue([]);
    vi.mocked(prisma.systemMessage.count).mockResolvedValue(0); // quota check returns 0 usage
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue(null); // 0 quota used today
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ used: 1 }] as any); // atomic reserveQuota
    
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: userId, hp: 100, maxHp: 100, level: 5, currentXP: 100, xpToNextLevel: 500, sylph: 1000, hunterRank: "E", streakDays: 5
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);
    vi.mocked(prisma.goal.findMany).mockResolvedValue([]);
    vi.mocked(prisma.goal.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.quest.findMany).mockResolvedValue([]);
    vi.mocked(prisma.quest.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.quest.count).mockResolvedValue(0);
    vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _avg: {}, _sum: {}, _count: {} } as any);
    vi.mocked(prisma.studySession.findMany).mockResolvedValue([]);
    vi.mocked(prisma.studySession.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.studySession.count).mockResolvedValue(0);
    vi.mocked(prisma.studySession.aggregate).mockResolvedValue({ _sum: { durationMinutes: 0 } } as any);
    vi.mocked(prisma.aiMemory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.aiInsight.count).mockResolvedValue(0);
    vi.mocked(prisma.aiInsight.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.aiInsight.findMany).mockResolvedValue([]);
    vi.mocked(prisma.hpLedger.findMany).mockResolvedValue([]);
    vi.mocked(prisma.subject.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userAchievement.findMany).mockResolvedValue([]);
  });

  const createRequest = (message: string) => {
    const formData = new FormData();
    formData.append("message", message);
    formData.append("modelPreference", "gemini");
    formData.append("sessionId", sessionId.toString());
    
    return new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { authorization: "Bearer fake" },
      body: formData,
    });
  };

  it("1. Complete Flow & Tool Result Propagation", async () => {
    // 1st LLM call: LLM decides to call getAppState
    mockGenerateResponse.mockResolvedValueOnce({
      text: "",
      toolCalls: [{ id: "call_1", name: "getAppState", args: {} }]
    });
    // 2nd LLM call: LLM receives tool output and responds to user
    mockGenerateResponse.mockResolvedValueOnce({
      text: "Your HP is full and you are doing great!",
      toolCalls: undefined
    });

    const res = await POST(createRequest("What is my status?"));
    expect(res.status).toBe(200);

    // Verify chat was created and tool result was sent back to LLM
    expect(mockGenerateResponse).toHaveBeenCalledTimes(2);

    const messages = mockGenerateResponse.mock.calls[1][0];
    const toolResponseMsg = messages[messages.length - 1];
    expect(toolResponseMsg.toolResults[0].name).toBe("getAppState");
    // Check that we got the final natural language response
    const json = await res.json();
    // Content is prefixed with a hidden `<!-- model: X -->` marker.
    expect(json.aiMessage.content).toContain("Your HP is full and you are doing great!");
  });

  it("2 & 3. Explicit vs Conversational Routing & Tool Isolation", async () => {
    // "I am feeling overwhelmed" -> should route to Coach, no calendar tools
    mockGenerateResponse.mockResolvedValueOnce({ text: "Let's review your strategy." });
    let req = createRequest("I am feeling overwhelmed with Physics.");
    await POST(req);
    
    expect(mockGenerateResponse).toHaveBeenCalledTimes(1);
    const systemInstruction = mockGenerateResponse.mock.calls[0][1];
    let tools = mockGenerateResponse.mock.calls[0][2];
    let toolNames = tools.map((t: any) => t.name);
    
    expect(systemInstruction).toContain("Progress Coach");
    expect(toolNames).not.toContain("moveQuest");
    expect(toolNames).toContain("generateInsight");
    
    // "Move my Physics quest to Friday" -> should route to Calendar/Planner, gets moveQuest
    mockGenerateResponse.mockClear();
    mockGenerateResponse.mockResolvedValueOnce({ text: "Moved it to Friday." });
    
    req = createRequest("Move my Physics quest to Friday");
    await POST(req);
    
    const newSystemInstruction = mockGenerateResponse.mock.calls[0][1];
    const newTools = mockGenerateResponse.mock.calls[0][2];
    toolNames = newTools.map((t: any) => t.name);
    
    expect(newSystemInstruction).toMatch(/Planner|Calendar/);
    expect(mockGenerateResponse).toHaveBeenCalledTimes(1);
  });

  it("4. Failed tool calls are handled and final response reflects failure", async () => {
    // Simulate cooldown by making the backend findFirst return a duplicate
    vi.mocked(prisma.aiInsight.findFirst).mockResolvedValueOnce({ id: 99 } as any);
    
    mockGenerateResponse.mockResolvedValueOnce({
      text: "",
      toolCalls: [{ id: "call_1", name: "generateInsight", args: { category: "trend", content: "test" } }]
    });
    mockGenerateResponse.mockResolvedValueOnce({
      text: "I couldn't save the insight because you recently saved one.",
      toolCalls: undefined
    });

    const res = await POST(createRequest("Give me an insight."));
    const json = await res.json();

    const messages = mockGenerateResponse.mock.calls[1][0];
    const toolResponseMsg = messages[messages.length - 1];
    const toolResponse = toolResponseMsg.toolResults[0].result;
    
    // Executor should return an error
    expect(toolResponse.error).toMatch(/identical|Cooldown active/);
    // No DB mutation should have occurred
    expect(prisma.aiInsight.create).not.toHaveBeenCalled();
    // Final text should correctly reflect the backend's rejection
    expect(json.aiMessage.content).toContain("I couldn't save the insight because you recently saved one.");
  });

  it("6. Prompt boundary explicitly prevents invented trends and mutations", async () => {
    mockGenerateResponse.mockResolvedValueOnce({ text: "Done." });
    await POST(createRequest("How am I doing?"));
    
    const prompt = mockGenerateResponse.mock.calls[0][1];
    
    // Assert architectural firewalls are in the prompt
    expect(prompt).toContain("NEVER invent trends");
    expect(prompt).toContain("ONLY generate an insight if it is genuinely new, actionable");
    expect(prompt).toContain("Proactive behavior is ONLY permitted for 'generateInsight'");
    expect(prompt).toContain("NEVER proactively create/move/delete quests");
  });

  it("7 & 11. Context Isolation and Routing Verification", async () => {
    mockGenerateResponse.mockResolvedValueOnce({ text: "Testing." });
    
    // Send a heavily calendar-focused query
    await POST(createRequest("What is my schedule for next Tuesday?"));
    const prompt = mockGenerateResponse.mock.calls[0][1];
    
    expect(prompt).toContain("Calendar Assistant");
    expect(prompt).toContain("CALENDAR"); // Should inject calendar context
    // It should omit unrelated large dumps (if context engine omits them)
    
    const tools = mockGenerateResponse.mock.calls[0][2];
    const toolNames = tools.map((t: any) => t.name);
    expect(toolNames).toContain("clearDay");
  });

  it("8. Memory Authority: DB overrides inferred memory", async () => {
    mockGenerateResponse.mockResolvedValueOnce({ text: "Memory processed." });
    
    // Simulate DB showing HP = 100, but memory says user is burnt out
    vi.mocked(prisma.aiMemory.findMany).mockResolvedValue([{ key: "status", value: "User is burnt out", source: "inferred" }] as any);
    
    await POST(createRequest("What is my state?"));
    const prompt = mockGenerateResponse.mock.calls[0][1];
    
    // Assert that the memory block is present
    expect(prompt).toContain("User is burnt out");
    // Assert that DB state (HP=100) is also present
    expect(prompt).toContain("HP: 100/100");
    // Assert memory authority instruction is present
    expect(prompt).toContain("Database state (Stats/Quests/Calendar) is the absolute truth");
  });

  it("9. Token/Context bounds", async () => {
    mockGenerateResponse.mockResolvedValueOnce({ text: "Testing." });
    
    // Mock massive history
    const bigHistory = Array.from({ length: 50 }).map((_, i) => ({
      id: i, type: "USER", content: "History message " + i
    }));
    vi.mocked(prisma.systemMessage.findMany).mockResolvedValue(bigHistory as any);
    
    await POST(createRequest("Hello"));
    
    // History sent to chat should be bounded (take: 20 is in route.ts)
    // We check that prisma is called with the bound limit
    expect(prisma.systemMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 20
    }));
    
    // System instruction should remain reasonable (e.g. under 20k chars for typical context)
    const prompt = mockGenerateResponse.mock.calls[0][1];
    expect(prompt.length).toBeLessThan(20000); 
  });

  it("10. Proactive Insight Full Flow", async () => {
    // 1st LLM call: LLM sees context and calls generateInsight
    mockGenerateResponse.mockResolvedValueOnce({
      text: "",
      toolCalls: [{ id: "call_1", name: "generateInsight", args: { category: "trend", content: "Math dropped 20%" } }]
    });
    mockGenerateResponse.mockResolvedValueOnce({ text: "I've saved an insight." });

    await POST(createRequest("How is math?"));
    
    if (!vi.mocked(prisma.aiInsight.create).mock.calls.length) {
       console.log("TOOL CALLS RECEIVED BY LLM MOCK:", mockGenerateResponse.mock.calls);
    }
    
    expect(prisma.aiInsight.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: "Math dropped 20%" })
    }));
  });

  it("12. Valid Handoff: Coach -> Planner with tool execution and context swap", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 1 } as any);
    mockGenerateResponse.mockReset();
    // 1st LLM call: Coach decides it needs the Planner
    mockGenerateResponse.mockResolvedValueOnce({
      text: "",
      toolCalls: [{ id: "call_handoff", name: "handoff", args: { target_agent: "planner", reason: "User wants to make a schedule" } }]
    });
    // 2nd LLM call: Now Planner, calls getQuests
    mockGenerateResponse.mockResolvedValueOnce({
      text: "",
      toolCalls: [{ id: "call_quest", name: "getQuests", args: { date: "2099-01-01" } }]
    });
    // 3rd LLM call: Final response
    mockGenerateResponse.mockResolvedValueOnce({ text: "I have created your schedule." });

    const req = createRequest("I'm feeling overwhelmed and burned out.");
    await POST(req);

    // Initial routing should be to Coach (based on "overwhelmed" and "burned out")
    const firstCallArgs = mockGenerateResponse.mock.calls[0];
    const initialInstruction = firstCallArgs[1];
    expect(initialInstruction).toContain("Progress Coach");
    const initialTools = firstCallArgs[2].map((t: any) => t.name);
    expect(initialTools).toContain("generateInsight");
    expect(initialTools).not.toContain("createQuest"); // Coach doesn't have createQuest

    // After handoff, the adapter should have been called again with Planner context
    const secondCallArgs = mockGenerateResponse.mock.calls[1];
    const newInstruction = secondCallArgs[1];
    expect(newInstruction).toContain("Study Planner"); // Planner instruction
    const newTools = secondCallArgs[2].map((t: any) => t.name);
    expect(newTools).toContain("getQuests"); // Target agent received authorized tools
    expect(newTools).not.toContain("generateInsight"); // Original agent's tools not retained

    // The toolResult given to the LLM should indicate success
    const finalHistory = mockGenerateResponse.mock.calls[mockGenerateResponse.mock.calls.length - 1][0];
    const handoffResultMsg = finalHistory.find((m: any) => m.role === "tool" && m.toolResults[0].name === "handoff");
    expect(handoffResultMsg.toolResults[0].result.success).toBe(true);
    expect(handoffResultMsg.toolResults[0].result.message).toContain("You are now the planner agent");
  });

  it("13. Handoff security: Unauthorized targets, invalid targets, and max handoffs enforced", async () => {
    mockGenerateResponse.mockReset();
    // 1st LLM call: Planner tries to hand off to Analyst (Unauthorized: Planner can only hand off to Calendar/Coach)
    mockGenerateResponse.mockResolvedValueOnce({
      text: "",
      toolCalls: [{ id: "call_h1", name: "handoff", args: { target_agent: "analyst", reason: "Need stats" } }]
    });
    // 2nd LLM call: Planner tries to hand off to Coach (Authorized).
    mockGenerateResponse.mockResolvedValueOnce({
      text: "",
      toolCalls: [{ id: "call_h2", name: "handoff", args: { target_agent: "coach", reason: "Needs motivation" } }]
    });
    // 3rd LLM call: Now Coach, tries to hand off to Planner (Authorized transition, but MAX_HANDOFFS reached!)
    mockGenerateResponse.mockResolvedValueOnce({
      text: "",
      toolCalls: [{ id: "call_h3", name: "handoff", args: { target_agent: "planner", reason: "Back to planner" } }]
    });
    // 4th LLM call: Final response
    mockGenerateResponse.mockResolvedValueOnce({ text: "Done." });

    const req = createRequest("Plan my week.");
    await POST(req);

    const finalHistory = mockGenerateResponse.mock.calls[mockGenerateResponse.mock.calls.length - 1][0];
    const toolResults = finalHistory.filter((m: any) => m.role === "tool");

    // Call 1: Unauthorized
    const firstResultMsg = toolResults[0];
    expect(firstResultMsg.toolResults[0].result.error).toContain("Unauthorized handoff");

    // Call 2: Authorized Coach transition
    const secondResultMsg = toolResults[1];
    expect(secondResultMsg.toolResults[0].result.success).toBe(true);

    // Call 3: MAX_HANDOFFS enforced
    const thirdResultMsg = toolResults[2];
    expect(thirdResultMsg.toolResults[0].result.error).toContain("Maximum number of handoffs reached");
  });

  it("14. Auto Mode: Falls back to Groq when Gemini throws an error", async () => {
    mockGenerateResponse.mockReset();
    // 1st call (Gemini) fails with rate limit or error
    mockGenerateResponse.mockRejectedValueOnce(new Error("Gemini 429 Quota Exceeded"));
    // 2nd call (Groq fallback) succeeds
    mockGenerateResponse.mockResolvedValueOnce({
      text: "Hello from Groq fallback!"
    });

    const formData = new FormData();
    formData.append("message", "Hello system");
    formData.append("modelPreference", "auto");

    const req = new NextRequest("http://localhost:3000/api/system-messages/chat", {
      method: "POST",
      headers: { authorization: "Bearer mock_token" },
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.aiMessage.content).toContain("Hello from Groq fallback!");
    expect(data.modelUsed).toBe("GROQ");
  });
});
