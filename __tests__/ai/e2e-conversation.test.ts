/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/system-messages/chat/route";
import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { LLMFactory } from "@/lib/ai/providers/factory";
import { releaseQuota } from "@/lib/ai/usage-limiter";
import type { LLMAdapter, LLMResponse, NormalizedMessage, NormalizedTool } from "@/lib/ai/providers/types";

vi.mock("@/lib/auth-server", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    goal: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    quest: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    studySession: { findMany: vi.fn() },
    aiMemory: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    aiInsight: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    chatSession: { create: vi.fn(), findUnique: vi.fn() },
    systemMessage: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/ai/usage-limiter", () => ({
  reserveQuota: vi.fn().mockResolvedValue({ charged: true, unlimited: false, used: 1, limit: 10, remaining: 9 }),
  releaseQuota: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/ai/usage-logger", () => ({ logAiUsage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/ai/cheap-answers", () => ({ resolveCheapAnswer: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/timezone-server", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("UTC"),
  TimezoneServerService: { getUserTimezone: vi.fn().mockResolvedValue("UTC") },
}));

const { generate } = vi.hoisted(() => ({ generate: vi.fn<LLMAdapter["generateResponse"]>() }));
vi.mock("@/lib/ai/providers/factory", () => ({ LLMFactory: { getAdapter: vi.fn(() => ({ generateResponse: generate })) } }));

const USER_ID = 1;
const SESSION_ID = 100;

function request(message: string, modelPreference = "gemini") {
  const form = new FormData();
  form.append("message", message);
  form.append("modelPreference", modelPreference);
  form.append("sessionId", String(SESSION_ID));
  return new NextRequest("http://localhost:3000/api/system-messages/chat", { method: "POST", body: form });
}

function callsTool(name: string, args: Record<string, unknown> = {}): LLMResponse {
  return { toolCalls: [{ id: "call_" + name, name, args }] };
}

function toolNames(index = 0): string[] {
  return (generate.mock.calls[index][2] as NormalizedTool[]).map((tool) => tool.name);
}

function toolResults(index = 1) {
  return (generate.mock.calls[index][0] as NormalizedMessage[]).flatMap((message) => message.toolResults ?? []);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TOOL_CONFIRMATION_SECRET", "e2e-test-confirmation-secret-with-entropy");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  generate.mockReset().mockResolvedValue({ text: "Here is the answer." });
  vi.mocked(getSession).mockResolvedValue({ userId: USER_ID, email: "student@sylf.app" });
  vi.mocked(prisma.chatSession.findUnique).mockResolvedValue({ id: SESSION_ID, userId: USER_ID } as never);
  vi.mocked(prisma.chatSession.create).mockResolvedValue({ id: SESSION_ID, userId: USER_ID } as never);
  let nextMessageId = 1;
  vi.mocked(prisma.systemMessage.create).mockImplementation(((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: nextMessageId++, ...args.data, createdAt: new Date() })) as never);
  vi.mocked(prisma.systemMessage.findMany).mockResolvedValue([]);
  vi.mocked(prisma.systemMessage.update).mockResolvedValue({} as never);
  vi.mocked(prisma.systemMessage.count).mockResolvedValue(0);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: USER_ID, name: "Test Student", hp: 100, maxHp: 100, level: 5,
    currentXP: 100, xpToNextLevel: 500, hunterRank: "E", streakDays: 5,
    totalStudyMinutes: 150, createdAt: new Date("2026-01-01T00:00:00.000Z"),
  } as never);
  vi.mocked(prisma.goal.findMany).mockResolvedValue([]);
  vi.mocked(prisma.quest.findMany).mockResolvedValue([]);
  vi.mocked(prisma.studySession.findMany).mockResolvedValue([]);
  vi.mocked(prisma.aiMemory.findMany).mockResolvedValue([]);
  vi.mocked(prisma.aiInsight.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.aiInsight.findMany).mockResolvedValue([]);
  vi.mocked(prisma.aiInsight.count).mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Sylvie conversation integration with the real tool executor", () => {
  it("requires the authenticated cookie session before provider or account access", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(request("Show my stats"))).status).toBe(401);
    expect(generate).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses another user's conversation before reading its history", async () => {
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue({ id: SESSION_ID, userId: 2 } as never);
    expect((await POST(request("Show my stats"))).status).toBe(403);
    expect(prisma.systemMessage.findMany).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("propagates an authorized real stats result back to the provider", async () => {
    generate.mockResolvedValueOnce(callsTool("getUserStats"))
      .mockResolvedValueOnce({ text: "Your HP is 100/100." });
    const response = await POST(request("What is my status?"));
    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(toolResults()).toEqual([expect.objectContaining({ name: "getUserStats", result: expect.objectContaining({ hp: "100/100", level: 5, totalStudyHours: 2.5 }) })]);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: USER_ID } }));
    expect((await response.json()).aiMessage.content).toBe("Your HP is 100/100.");
  });

  it("keeps coaching conversational and offers schedule mutations only for an explicit request", async () => {
    await POST(request("I am feeling overwhelmed with Physics."));
    expect(toolNames()).not.toContain("moveQuest");
    expect(toolNames()).not.toContain("generateInsight");
    expect(prisma.aiInsight.create).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();

    generate.mockClear();
    generate.mockResolvedValueOnce(callsTool("moveQuest", { questId: 10, newDate: "2026-10-16" }));
    const response = await POST(request("Move my Physics quest to Friday"));
    expect(toolNames()).toContain("moveQuest");
    expect(prisma.quest.update).not.toHaveBeenCalled();
    expect((await response.json()).pendingAction.summary).toContain("Move task");
  });

  it("propagates a failed real lookup without fabricating data or saving an insight", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    generate.mockResolvedValueOnce(callsTool("getUserStats"))
      .mockResolvedValueOnce({ text: "Your profile data is unavailable right now." });
    const response = await POST(request("Show my stats"));
    expect(toolResults()[0].result).toEqual({ error: "User not found" });
    expect(prisma.aiInsight.create).not.toHaveBeenCalled();
    expect((await response.json()).reply).toContain("unavailable");
  });

  it("keeps grounding and permission boundaries in every model prompt", async () => {
    await POST(request("How am I doing?"));
    const prompt = generate.mock.calls[0][1];
    expect(prompt).toMatch(/never invent app features, capabilities or numbers/i);
    expect(prompt).toContain("Use personal trends only when requested and supported by retrieved data");
    expect(prompt).toMatch(/do not proactively modify data/i);
    expect(prompt).toContain("user confirms the exact change");
    expect(prompt).not.toContain("Proactive behavior is ONLY permitted");
  });

  it("uses a date-filtered quest read without advertising unrelated calendar writes", async () => {
    generate.mockResolvedValueOnce(callsTool("getQuests", { date: "2026-10-20" }))
      .mockResolvedValueOnce({ text: "You have no tasks scheduled for that date." });
    const response = await POST(request("What is my schedule for next Tuesday?"));
    expect(response.status).toBe(200);
    expect(toolNames()).toContain("getQuests");
    expect(toolNames()).not.toContain("clearDay");
    expect(toolNames()).not.toContain("getUserStats");
    expect(prisma.quest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER_ID, scheduledFor: "2026-10-20" } }));
    expect(generate.mock.calls[0][1]).not.toContain("CALENDAR (next 7 days)");
  });

  it("uses current database state without automatically loading inferred memories", async () => {
    vi.mocked(prisma.aiMemory.findMany).mockResolvedValue([{ key: "status", value: "User is burnt out", source: "inferred" }] as never);
    generate.mockResolvedValueOnce(callsTool("getUserStats"))
      .mockResolvedValueOnce({ text: "Your current HP is 100/100." });
    await POST(request("What is my state?"));
    expect(prisma.aiMemory.findMany).not.toHaveBeenCalled();
    expect(generate.mock.calls[0][1]).not.toContain("User is burnt out");
    expect(generate.mock.calls[0][1]).toContain("current database results take precedence");
    expect(toolResults()[0].result.hp).toBe("100/100");
  });

  it("bounds history and strips internal markers before another provider sees it", async () => {
    vi.mocked(prisma.systemMessage.findMany).mockResolvedValue(Array.from({ length: 50 }, (_, index) => ({
      id: index + 100, userId: USER_ID, sessionId: SESSION_ID, type: "INFO",
      content: "History " + index + " " + "x".repeat(5000) + " <!-- model: LEGACY --> <!-- sylvie-action:dGVzdA== -->",
    })) as never);
    await POST(request("Hello"));
    expect(prisma.systemMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionId: SESSION_ID, userId: USER_ID }, take: 20 }));
    const history = generate.mock.calls[0][0];
    expect(history.length).toBeLessThanOrEqual(20);
    expect(history.reduce((total, turn) => total + (turn.content?.length ?? 0), 0)).toBeLessThanOrEqual(18000);
    expect(history.at(-1)?.content).toBe("Hello");
    expect(JSON.stringify(history)).not.toMatch(/LEGACY|sylvie-action/);
    expect(generate.mock.calls[0][1].length).toBeLessThan(20000);
  });

  it("rejects unsolicited insight writes even when the provider requests one", async () => {
    generate.mockResolvedValueOnce(callsTool("generateInsight", { category: "trend", content: "Math dropped 20%" }))
      .mockResolvedValueOnce({ text: "We can review your study approach together." });
    const response = await POST(request("How is math?"));
    expect(toolNames()).not.toContain("generateInsight");
    expect(toolResults()[0].result.error).toContain("not available");
    expect(prisma.aiInsight.create).not.toHaveBeenCalled();
    expect((await response.json()).pendingAction).toBeUndefined();
  });

  it("makes an explicitly requested saved insight a reviewable proposal", async () => {
    generate.mockResolvedValueOnce(callsTool("generateInsight", { category: "recommendation", content: "Review algebra in short daily sessions." }));
    const response = await POST(request("Save this insight: review algebra in short daily sessions"));
    const body = await response.json();
    expect(toolNames()).toContain("generateInsight");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(prisma.aiInsight.create).not.toHaveBeenCalled();
    expect(body.pendingAction.summary).toContain("Review algebra");
    expect(body.reply).toContain("Nothing has been changed");
  });

  it("cannot escalate an agent handoff into new permissions", async () => {
    generate.mockResolvedValueOnce(callsTool("handoff", { target_agent: "planner" }))
      .mockResolvedValueOnce(callsTool("createQuest", { title: "Unrequested task", requiredMinutes: 60 }))
      .mockResolvedValueOnce({ text: "Let's take this one step at a time." });
    await POST(request("I'm feeling overwhelmed and burned out."));
    expect(toolNames()).not.toContain("handoff");
    expect(toolNames()).not.toContain("createQuest");
    const results = toolResults(2);
    expect(results.map((result) => result.name)).toEqual(["handoff", "createQuest"]);
    expect(results.every((result) => typeof result.result.error === "string")).toBe(true);
    expect(prisma.quest.create).not.toHaveBeenCalled();
    expect(generate.mock.calls[1][1]).toBe(generate.mock.calls[0][1]);
  });

  it("hands an explicit planning request to the working Planner without chat-side generation", async () => {
    const response = await POST(request("Plan my study week for the upcoming exam"));
    const body = await response.json();
    expect(body.plannerHandoff).toEqual(expect.objectContaining({ kind: "NEW_PLAN", mode: "EXAM", request: "Plan my study week for the upcoming exam" }));
    expect(generate).not.toHaveBeenCalled();
    expect(prisma.quest.create).not.toHaveBeenCalled();
    expect(prisma.goal.create).not.toHaveBeenCalled();
    expect(body.reply).toContain("nothing has been applied");
  });

  it("falls back to the configured Groq model after the automatic primary fails", async () => {
    generate.mockRejectedValueOnce(new Error("Primary unavailable"))
      .mockResolvedValueOnce({ text: "Hello from the fallback." });
    const response = await POST(request("Hello system", "auto"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reply).toBe("Hello from the fallback.");
    expect(body.modelUsed).toBe("GROQ");
    expect(LLMFactory.getAdapter).toHaveBeenNthCalledWith(1, "deepseek", expect.any(String));
    expect(LLMFactory.getAdapter).toHaveBeenNthCalledWith(2, "groq", expect.any(String));
    expect(releaseQuota).not.toHaveBeenCalled();
  });

  it("restarts a fallback from clean conversation history after a tool roundtrip fails", async () => {
    generate.mockResolvedValueOnce(callsTool("getUserStats"))
      .mockRejectedValueOnce(new Error("Primary failed after read"))
      .mockResolvedValueOnce({ text: "Your requested data is available." });
    const response = await POST(request("What is my status?", "auto"));
    expect(response.status).toBe(200);
    const fallbackHistory = generate.mock.calls[2][0];
    expect(fallbackHistory.some((turn) => turn.role === "tool")).toBe(false);
    expect(fallbackHistory.at(-1)?.content).toBe("What is my status?");
  });

  it("returns an honest provider failure and refunds the reservation when the cascade fails", async () => {
    generate.mockRejectedValue(new Error("All providers unavailable"));
    const response = await POST(request("Hello system", "auto"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reply).toContain("temporarily unavailable");
    expect(body.reply).not.toContain("success");
    expect(generate).toHaveBeenCalledTimes(3);
    expect(releaseQuota).toHaveBeenCalledTimes(1);
    expect(releaseQuota).toHaveBeenCalledWith(USER_ID, "chat");
  });
});
