/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/system-messages/chat/route";
import type { LLMResponse, NormalizedMessage, NormalizedTool } from "@/lib/ai/providers/types";

interface StoredMessage {
  id: number;
  userId: number;
  sessionId: number;
  type: string;
  content: string;
  read: boolean;
  createdAt: Date;
  [key: string]: unknown;
}

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  generate: vi.fn(),
  execute: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
  usage: vi.fn(),
  cheap: vi.fn(),
  calendarPrepare: vi.fn(), calendarValidate: vi.fn(), calendarBatch: vi.fn(),
  messages: [] as StoredMessage[],
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    goal: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    quest: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    studySession: { findMany: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
    aiMemory: { findMany: vi.fn() },
    hpLedger: { findMany: vi.fn() },
    subject: { findMany: vi.fn() },
    friendship: { count: vi.fn() },
    userAchievement: { findMany: vi.fn(), count: vi.fn() },
    chatSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    systemMessage: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    floatingRestDay: { findMany: vi.fn() },
    userStats: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth-server", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/ai/providers/factory", () => ({ LLMFactory: { getAdapter: () => ({ generateResponse: mocks.generate }) } }));
vi.mock("@/lib/ai/chat-tool-executor", () => ({ executeChatTool: mocks.execute }));
vi.mock("@/lib/ai/sylvie/calendar-tools", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/ai/sylvie/calendar-tools")>(), prepareCalendarOperation: mocks.calendarPrepare, validateCalendarProposal: mocks.calendarValidate, reviewCalendarBatch: mocks.calendarBatch }));
vi.mock("@/lib/ai/cheap-answers", () => ({ resolveCheapAnswer: mocks.cheap }));
vi.mock("@/lib/ai/usage-limiter", () => ({ reserveQuota: mocks.reserve, releaseQuota: mocks.release }));
vi.mock("@/lib/ai/usage-logger", () => ({ logAiUsage: mocks.usage }));
vi.mock("@/lib/timezone-server", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("UTC"),
  TimezoneServerService: { getUserTimezone: vi.fn().mockResolvedValue("UTC") },
}));

function request(message: string, extra: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost:3000/api/system-messages/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, sessionId: 100, modelPreference: "gemini", ...extra }),
  });
}

function firstPrompt(): string {
  return mocks.generate.mock.calls[0]?.[1] as string;
}

function advertisedNames(callIndex = 0): string[] {
  return ((mocks.generate.mock.calls[callIndex]?.[2] ?? []) as NormalizedTool[]).map((tool) => tool.name);
}

function toolCall(name: string, args: Record<string, unknown> = {}): LLMResponse {
  return { toolCalls: [{ id: "tool-1", name, args }] };
}

function matchesWhere(message: StoredMessage, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (value && typeof value === "object" && "startsWith" in value) return String(message[key]).startsWith(String(value.startsWith));
    if (value && typeof value === "object" && "contains" in value) return String(message[key]).includes(String(value.contains));
    if (value && typeof value === "object" && "in" in value) return (value.in as unknown[]).includes(message[key]);
    if (value && typeof value === "object" && "gt" in value) return Number(message[key]) > Number(value.gt);
    return message[key] === value;
  });
}

beforeEach(() => {
  vi.stubEnv("TOOL_CONFIRMATION_SECRET", "sylvie-runtime-test-secret-with-sufficient-entropy");
  vi.clearAllMocks();
  mocks.messages.length = 0;
  mocks.session.mockResolvedValue({ userId: 7, email: "student@sylf.app" });
  mocks.generate.mockReset().mockResolvedValue({ text: "Here is the answer.", usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
  mocks.execute.mockReset().mockResolvedValue({ success: true, result: "authorized user data" });
  mocks.cheap.mockResolvedValue(null);
  mocks.calendarPrepare.mockReset().mockResolvedValue({ summary: "Update Physics · one event · 7 PM Asia/Karachi", command: { id: "owned-event", revision: 3 } });
  mocks.calendarValidate.mockReset().mockResolvedValue(undefined); mocks.calendarBatch.mockReset().mockResolvedValue(undefined);
  mocks.reserve.mockResolvedValue({ charged: true, allowed: true, unlimited: false, used: 1, limit: 10, remaining: 9, resetsAt: "2026-10-16T00:00:00.000Z" });
  mocks.release.mockResolvedValue(undefined);
  mocks.usage.mockResolvedValue(undefined);
  mocks.prisma.chatSession.findUnique.mockResolvedValue({ id: 100, userId: 7 });
  mocks.prisma.chatSession.create.mockResolvedValue({ id: 100, userId: 7 });
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: 7, name: "FENCED_PERSONAL_PROFILE", username: "fenced", timezone: "UTC",
    level: 73, currentXP: 12345, xpToNextLevel: 23456, hp: 45, maxHp: 100,
    sylph: 98765, hunterRank: "S", streakDays: 19, hasCompletedOnboarding: true,
  });
  mocks.prisma.userStats.findUnique.mockResolvedValue(null);
  for (const delegate of [mocks.prisma.goal, mocks.prisma.quest, mocks.prisma.studySession, mocks.prisma.aiMemory, mocks.prisma.hpLedger, mocks.prisma.subject, mocks.prisma.userAchievement, mocks.prisma.floatingRestDay]) {
    delegate.findMany.mockResolvedValue([]);
  }
  mocks.prisma.goal.count.mockResolvedValue(0);
  mocks.prisma.quest.count.mockResolvedValue(0);
  mocks.prisma.studySession.count.mockResolvedValue(0);
  mocks.prisma.friendship.count.mockResolvedValue(0);
  mocks.prisma.userAchievement.count.mockResolvedValue(0);
  mocks.prisma.quest.aggregate.mockResolvedValue({ _sum: { requiredMinutes: 0 } });
  mocks.prisma.studySession.aggregate.mockResolvedValue({ _sum: { durationMinutes: 0 } });
  mocks.prisma.systemMessage.create.mockImplementation(async ({ data }: { data: Omit<StoredMessage, "id" | "createdAt"> }) => {
    const message = { ...data, id: mocks.messages.length + 1, createdAt: new Date() } as StoredMessage;
    mocks.messages.push(message);
    return { ...message };
  });
  mocks.prisma.systemMessage.findMany.mockImplementation(async ({ where, take }: { where?: Record<string, unknown>; take?: number }) => [...mocks.messages].filter((message) => matchesWhere(message, where)).reverse().slice(0, take ?? 20).map((message) => ({ ...message })));
  mocks.prisma.systemMessage.findFirst.mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => mocks.messages.findLast((message) => matchesWhere(message, where)) ?? null);
  mocks.prisma.systemMessage.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => mocks.messages.find((message) => matchesWhere(message, where)) ?? null);
  mocks.prisma.systemMessage.updateMany.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const found = mocks.messages.filter((message) => matchesWhere(message, where));
    found.forEach((message) => Object.assign(message, data));
    return { count: found.length };
  });
  mocks.prisma.systemMessage.update.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const found = mocks.messages.find((message) => matchesWhere(message, where));
    if (!found) throw new Error("Missing message");
    Object.assign(found, data);
    return { ...found };
  });
  mocks.prisma.systemMessage.count.mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Sylvie HTTP runtime context", () => {
  it("answers general chat without Archive retrieval or personal data reads", async () => {
    const response = await POST(request("Explain why the sky is blue"));
    expect(response.status).toBe(200);
    expect((await response.json()).reply).toBe("Here is the answer.");
    expect(firstPrompt()).not.toContain("ARCHIVE REFERENCE DATA");
    expect(firstPrompt()).not.toContain("FENCED_PERSONAL_PROFILE");
    expect(firstPrompt()).not.toContain("98765");
    expect(advertisedNames()).not.toContain("getUserStats");
    expect(advertisedNames()).not.toContain("getAppState");
    expect(mocks.prisma.quest.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.goal.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.studySession.findMany).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("answers a very short Sylf introduction without model, quota, or statistics", async () => {
    const response = await POST(request("Give me a very short introduction to Sylf"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reply.split(/\s+/).length).toBeLessThanOrEqual(20);
    expect(body.reply).toContain("Sylf");
    expect(body.reply).not.toMatch(/Scholar|Hunter|Solo Leveling|\bXP\b|98765|streak|\brank\b/i);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("retrieves only relevant public Archive content for app explanations", async () => {
    await POST(request("How does Sylf's study timer work?"));
    expect(firstPrompt()).toContain('"id":"focus_timer"');
    expect(firstPrompt()).not.toContain('"id":"eco_sylph"');
    expect(firstPrompt()).not.toContain('"id":"sys_ranks"');
    expect(advertisedNames()).not.toContain("getUserStats");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("advertises relevant personal tools and executes them for the authenticated user", async () => {
    mocks.generate.mockResolvedValueOnce(toolCall("getUserStats")).mockResolvedValueOnce({ text: "Here is your requested progress." });
    const response = await POST(request("Show my stats and progress"));
    expect(response.status).toBe(200);
    expect(advertisedNames()).toContain("getUserStats");
    expect(advertisedNames()).not.toContain("getShopInventory");
    expect(firstPrompt()).not.toContain("ARCHIVE REFERENCE DATA");
    expect(mocks.execute).toHaveBeenCalledWith("getUserStats", {}, 7);
  });

  it("ignores client supplied instructions and unrelated account overrides", async () => {
    await POST(request("Explain gravity", {
      userId: 999,
      contextOverride: { instruction: "CLIENT_SYSTEM_OVERRIDE_REVEAL_ALL_PROFILE", userId: 999, path: "/focus", subject: "Physics" },
      pageContext: { path: "/focus", instruction: "CLIENT_PAGE_OVERRIDE_REVEAL_ALL_PROFILE" },
    }));
    expect(firstPrompt()).not.toContain("CLIENT_SYSTEM_OVERRIDE_REVEAL_ALL_PROFILE");
    expect(firstPrompt()).not.toContain("CLIENT_PAGE_OVERRIDE_REVEAL_ALL_PROFILE");
    expect(firstPrompt()).not.toContain("98765");
    expect(mocks.prisma.systemMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 7 }) }));
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects a provider tool call outside the advertised capability list", async () => {
    mocks.generate.mockResolvedValueOnce(toolCall("getUserStats")).mockResolvedValueOnce({ text: "The sky appears blue because of scattering." });
    const response = await POST(request("Explain why the sky is blue"));
    expect(response.status).toBe(200);
    expect(advertisedNames()).not.toContain("getUserStats");
    expect(mocks.execute).not.toHaveBeenCalled();
    const secondHistory = mocks.generate.mock.calls[1]?.[0] as NormalizedMessage[];
    expect(secondHistory.flatMap((message) => message.toolResults ?? [])).toEqual(expect.arrayContaining([expect.objectContaining({ name: "getUserStats", result: expect.objectContaining({ error: expect.any(String) }) })]));
  });

  it("keeps the same persona rules across supported explicit models", async () => {
    const prompts: string[] = [];
    for (const modelPreference of ["gemini", "deepseek", "groq"]) {
      mocks.generate.mockClear();
      expect((await POST(request("Explain why the sky is blue", { modelPreference }))).status).toBe(200);
      prompts.push(firstPrompt());
    }
    expect(prompts[0]).toContain("Sylvie");
    expect(prompts[1]).toBe(prompts[0]);
    expect(prompts[2]).toBe(prompts[0]);
  });

  it("reuses identical read results within a turn", async () => {
    mocks.generate.mockResolvedValueOnce(toolCall("getUserStats"))
      .mockResolvedValueOnce(toolCall("getUserStats"))
      .mockResolvedValueOnce({ text: "Here is your requested progress." });
    expect((await POST(request("Show my stats"))).status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith("getUserStats", {}, 7);
  });

  it("reports a failed lookup as unavailable and avoids the generic action success fallback", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("Database unavailable"));
    mocks.generate.mockResolvedValueOnce(toolCall("getUserStats"))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const response = await POST(request("Show my stats"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reply).toMatch(/couldn.t finish|unavailable/i);
    expect(body.reply).not.toMatch(/success|completed successfully|applied getUserStats/i);
    const history = mocks.generate.mock.calls[1][0] as NormalizedMessage[];
    expect(history.flatMap((message) => message.toolResults ?? []).some((result) => String(result.result.error).includes("unavailable"))).toBe(true);
  });

  it("bounds stored history and preserves the newest question", async () => {
    for (let index = 0; index < 30; index++) {
      mocks.messages.push({ id: index + 1, userId: 7, sessionId: 100, type: index % 2 ? "INFO" : "USER", content: `OLD_${index} ${"x".repeat(5000)}`, read: true, createdAt: new Date() });
    }
    await POST(request("Explain why the sky is blue"));
    const history = mocks.generate.mock.calls[0][0] as NormalizedMessage[];
    expect(history.length).toBeLessThanOrEqual(20);
    expect(history.reduce((total, turn) => total + (turn.content?.length ?? 0), 0)).toBeLessThanOrEqual(18000);
    expect(history.at(-1)?.content).toBe("Explain why the sky is blue");
    expect(history.some((turn) => turn.content?.startsWith("OLD_0 "))).toBe(false);
  });

  it("keeps Archive followups relevant and drops retrieval for a new general topic", async () => {
    await POST(request("How does Sylf's study timer work?"));
    await POST(request("Tell me more about that"));
    expect(mocks.generate.mock.calls[1][1]).toContain('"id":"focus_timer"');
    expect(mocks.generate.mock.calls[1][1]).not.toContain('"id":"sys_ranks"');
    await POST(request("Explain photosynthesis"));
    expect(mocks.generate.mock.calls[2][1]).not.toContain("ARCHIVE REFERENCE DATA");
  });

  it("hands planning to the existing Planner even when chat quota is exhausted", async () => {
    mocks.reserve.mockResolvedValue({ charged: false, allowed: false, unlimited: false, used: 10, limit: 10, remaining: 0 });
    const response = await POST(request("Help me make a study plan for my chemistry exam next month"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.plannerHandoff).toEqual(expect.objectContaining({ request: "Help me make a study plan for my chemistry exam next month", kind: "NEW_PLAN", mode: "EXAM" }));
    expect(body.reply).not.toMatch(/plan (?:was |has been )?(?:created|saved|applied)/i);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.prisma.goal.create).not.toHaveBeenCalled();
    expect(mocks.prisma.quest.create).not.toHaveBeenCalled();
  });
});

describe("Sylvie HTTP mutation confirmation", () => {
  async function proposeTask() {
    mocks.generate.mockResolvedValueOnce(toolCall("createQuest", { title: "Revise algebra", requiredMinutes: 30, scheduledFor: "2026-10-16" }))
      .mockResolvedValueOnce({ text: "Review this task before I add it." });
    const response = await POST(request("Add a task called Revise algebra for 30 minutes tomorrow"));
    expect(response.status).toBe(200);
    const body = await response.json();
    const pending = body.pendingAction ?? body.aiMessage?.pendingAction;
    expect(pending).toEqual(expect.objectContaining({ token: expect.any(String), summary: expect.stringContaining("Revise algebra") }));
    return pending as { token: string; summary: string };
  }

  it("stages an advertised mutation without executing any user data change", async () => {
    await proposeTask();
    expect(advertisedNames()).toContain("createQuest");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.prisma.quest.create).not.toHaveBeenCalled();
    expect(mocks.prisma.quest.update).not.toHaveBeenCalled();
    expect(mocks.messages.some((message) => message.content.includes("<!-- sylvie-action:"))).toBe(true);
  });

  it("executes the exact approved operation once without asking the model to recreate it", async () => {
    const pending = await proposeTask();
    const providerCalls = mocks.generate.mock.calls.length;
    const response = await POST(request("Confirm change", { confirmationToken: pending.token }));
    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith("createQuest", { title: "Revise algebra", requiredMinutes: 30, scheduledFor: "2026-10-16" }, 7);
    expect(mocks.generate).toHaveBeenCalledTimes(providerCalls);
    expect(mocks.messages.every((message) => !message.content.includes("<!-- sylvie-action:"))).toBe(true);

    const replay = await POST(request("Confirm change", { confirmationToken: pending.token }));
    expect(replay.status).toBe(409);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("rejects a confirmation signed for another authenticated account", async () => {
    const pending = await proposeTask();
    mocks.session.mockResolvedValue({ userId: 8, email: "other@sylf.app" });
    mocks.prisma.chatSession.findUnique.mockResolvedValue({ id: 100, userId: 8 });
    const response = await POST(request("Confirm change", { confirmationToken: pending.token }));
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects moving a confirmation to another chat", async () => {
    const pending = await proposeTask();
    mocks.prisma.chatSession.findUnique.mockResolvedValue({ id: 101, userId: 7 });
    const response = await POST(request("Confirm change", { sessionId: 101, confirmationToken: pending.token }));
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects a tampered token before executing anything", async () => {
    const pending = await proposeTask();
    const [payload, signature] = pending.token.split(".");
    const forgedToken = `${payload}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    const response = await POST(request("Confirm change", { confirmationToken: forgedToken }));
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects an expired proposal", async () => {
    const pending = await proposeTask();
    const afterExpiry = Date.now() + 11 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(afterExpiry);
    const response = await POST(request("Confirm change", { confirmationToken: pending.token }));
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("reports a failed confirmed operation without claiming success or replaying it", async () => {
    const pending = await proposeTask();
    mocks.execute.mockRejectedValueOnce(new Error("Mutation unavailable"));
    const response = await POST(request("Confirm change", { confirmationToken: pending.token }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reply).toMatch(/couldn.t apply|could not be completed/i);
    expect(body.reply).not.toMatch(/success|applied createQuest/i);
    expect((await POST(request("Confirm change", { confirmationToken: pending.token }))).status).toBe(409);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("claims a proposal atomically when two confirmations arrive together", async () => {
    const pending = await proposeTask();
    const responses = await Promise.all([
      POST(request("Confirm change", { confirmationToken: pending.token })),
      POST(request("Confirm change", { confirmationToken: pending.token })),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
});

describe("Sylvie calendar HTTP integration", () => {
  const pageContext = { path: "/calendar", calendar: { selectedDate: "2026-10-19", start: "2026-10-18", end: "2026-10-25", view: "week" } };
  it("passes only validated navigation, exposes real tools, and skips old quest-only cheap summaries", async () => {
    await POST(request("What do I have planned tomorrow?", { pageContext, modelPreference: "auto" }));
    expect(mocks.cheap).not.toHaveBeenCalled();
    expect(firstPrompt()).toContain('"selectedDate":"2026-10-19"');
    expect(advertisedNames()).toContain("readCalendar");
    expect(advertisedNames()).not.toContain("createQuest");
  });
  it("stages an exact calendar proposal and confirms it without model/quota work", async () => {
    mocks.generate.mockResolvedValueOnce(toolCall("updateCalendarEvent", { id: "owned-event", revision: 3, scope: "event", changes: { startTime: "19:00" } }));
    const body = await (await POST(request("Move my appointment to tomorrow at 7 PM", { pageContext }))).json();
    expect(body.pendingAction.summary).toContain("7 PM");
    expect(mocks.execute).not.toHaveBeenCalled();
    mocks.execute.mockResolvedValueOnce({ calendarChanged: true, message: "Updated the personal calendar event." });
    const modelCalls = mocks.generate.mock.calls.length, quotaCalls = mocks.reserve.mock.calls.length;
    const confirmed = await (await POST(request("Confirm change", { confirmationToken: body.pendingAction.token }))).json();
    expect(confirmed).toMatchObject({ calendarChanged: true, reply: "Updated the personal calendar event." });
    expect(mocks.calendarValidate).toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledWith("updateCalendarEvent", expect.objectContaining({ summary: expect.stringContaining("7 PM") }), 7);
    expect(mocks.generate).toHaveBeenCalledTimes(modelCalls);
    expect(mocks.reserve).toHaveBeenCalledTimes(quotaCalls);
    expect((await POST(request("Confirm change", { confirmationToken: body.pendingAction.token }))).status).toBe(409);
  });
  it("preserves proposal details for a clock-only refinement and rejects the superseded preview", async () => {
    mocks.generate.mockResolvedValueOnce(toolCall("updateCalendarEvent", { changes: { startTime: "18:00" } }));
    const first = await (await POST(request("Move my appointment to tomorrow evening", { pageContext }))).json();
    mocks.generate.mockResolvedValueOnce({ text: "I can propose 7 PM." });
    await POST(request("Make it 7 PM", { pageContext }));
    const lastCall = mocks.generate.mock.calls.at(-1)!;
    expect(JSON.stringify(lastCall[0])).toContain("Earlier proposed change, not executed");
    expect((lastCall[2] as NormalizedTool[]).map(t => t.name)).toContain("updateCalendarEvent");
    expect((await POST(request("Confirm change", { confirmationToken: first.pendingAction.token }))).status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("fails closed when the schedule changed or the service cannot validate a preview", async () => {
    mocks.generate.mockResolvedValueOnce(toolCall("deleteCalendarEvent", { id: "owned-event", revision: 3, scope: "series" }));
    const first = await (await POST(request("Delete my recurring appointment", { pageContext }))).json();
    mocks.calendarValidate.mockRejectedValueOnce(new Error("Changed"));
    const response = await POST(request("Confirm change", { confirmationToken: first.pendingAction.token }));
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("keeps calendar exam recommendations in chat with the existing Planner review action", async () => {
    const response = await POST(request("I have a physics exam next Friday. Help me prepare.", { pageContext }));
    const body = await response.json();
    expect(mocks.generate).toHaveBeenCalled();
    expect(body.plannerHandoff).toMatchObject({ mode: "EXAM" });
    expect(advertisedNames()).toContain("findCalendarAvailability");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("rejects cross-site confirmations before executing tools", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/system-messages/chat", { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" }, body: JSON.stringify({ message: "Delete my appointment" }) }));
    expect(response.status).toBe(403); expect(mocks.execute).not.toHaveBeenCalled();
  });
});
