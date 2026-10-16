/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST, maxDuration } from "@/app/api/system-messages/chat/route";
import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { LLMFactory } from "@/lib/ai/providers/factory";
import { releaseQuota } from "@/lib/ai/usage-limiter";
import type { LLMAdapter, LLMResponse, NormalizedMessage, NormalizedTool } from "@/lib/ai/providers/types";
import { readEventStream } from "@/lib/ai/sylvie/event-stream";
import { saveChatImages, readChatImage, signedChatImage, encodeStoredImages } from "@/lib/ai/sylvie/image-storage";
import { DEEPSEEK_MODELS } from "@/lib/ai/config";
import { resolveCheapAnswer } from "@/lib/ai/cheap-answers";
import sharp from "sharp";
import { hasOutputLimit } from "@/lib/ai/sylvie/completion";
import { SYLVIE_CLIENT_TIMEOUT_MS, SYLVIE_SERVER_TIMEOUT_MS, SYLVIE_REASONING_TIMEOUT_MS } from "@/lib/ai/client-budget";

vi.mock("@/lib/ai/sylvie/image-storage", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/ai/sylvie/image-storage")>(),
  saveChatImages: vi.fn(async (userId: number, sessionId: number, images: { name: string; mimeType: string }[]) => images.map((image, index) => ({ path: `${userId}/${sessionId}/00000000-0000-4000-8000-${String(index).padStart(12, "0")}.png`, name: image.name, mimeType: image.mimeType }))),
  readChatImage: vi.fn(async () => ({ buffer: Buffer.from("already-validated-private-image"), mimeType: "image/png", name: "Previous image" })),
  signedChatImage: vi.fn(async () => "https://synthetic.invalid/short-lived-image"),
  removeChatImages: vi.fn(async () => {}),
}));

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
  it("keeps longer reasoning within the shared deadline and Vercel execution allowance", () => {
    expect(SYLVIE_REASONING_TIMEOUT_MS).toBeGreaterThan(45_000);
    expect(SYLVIE_REASONING_TIMEOUT_MS).toBeLessThan(SYLVIE_SERVER_TIMEOUT_MS);
    expect(SYLVIE_CLIENT_TIMEOUT_MS).toBeGreaterThan(SYLVIE_SERVER_TIMEOUT_MS);
    expect(SYLVIE_CLIENT_TIMEOUT_MS).toBeLessThan(maxDuration * 1000);
  });
  it("gives image solutions room for reasoning and persists an honest truncation flag", async () => {
    const form = new FormData(); form.append("message", "can you solve this further maths mechanics question for me"); form.append("sessionId", String(SESSION_ID));
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).png().toBuffer();
    form.append("images", new File([new Uint8Array(png)], "question.png", { type: "image/png" }));
    generate.mockResolvedValueOnce({ text: "Hence $$ (u cos", finishReason: "MAX_TOKENS", usage: { promptTokens: 1140, completionTokens: 1024, reasoningTokens: 881, totalTokens: 2164 } });
    const response = await POST(new NextRequest("http://localhost/api/system-messages/chat", { method: "POST", body: form }));
    const reply = await response.json();
    expect(generate.mock.calls[0][3]).toMatchObject({ maxTokens: 32768 });
    expect(reply.aiMessage).toMatchObject({ content: "Hence $$ (u cos", truncated: true });
    expect(reply.reply).not.toContain("sylvie-incomplete");
    const saved = vi.mocked(prisma.systemMessage.create).mock.calls.at(-1)?.[0].data.content as string;
    expect(hasOutputLimit(saved)).toBe(true);
    expect(generate).toHaveBeenCalledOnce(); // No paid continuation/retry without the user asking.
  });

  it("does not execute a tool response cut off by its token budget", async () => {
    generate.mockResolvedValueOnce({ ...callsTool("createGoal", { title: "Partial proposal" }), finishReason: "MAX_TOKENS" });
    const reply = await (await POST(request("Create a goal called Partial proposal"))).json();
    expect(reply.aiMessage.truncated).toBe(true);
    expect(reply.pendingAction).toBeUndefined();
    expect(prisma.goal.create).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledOnce();
  });
  it("retains cheap-answer continuity only in the adopted conversation", async () => {
    vi.mocked(resolveCheapAnswer).mockResolvedValueOnce({ content: "Fixture summary", reason: "fixture", intentId: "fixture", params: { timeScope: null }, confidence: 1 });
    const fresh = () => new NextRequest("http://localhost/api/system-messages/chat", { method: "POST", body: JSON.stringify({ message: "Fixture question", modelPreference: "auto" }) });
    await POST(fresh());
    await POST(request("And yesterday?", "auto"));
    expect(vi.mocked(resolveCheapAnswer).mock.calls[1][2]).toMatchObject({ intentId: "fixture" });
    await POST(fresh());
    expect(vi.mocked(resolveCheapAnswer).mock.calls[2][2]).toBeNull();
  });
  it("does not mistake image feature documentation for a private image follow-up", async () => {
    expect((await POST(request("How does the image feature work?"))).status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(readChatImage).not.toHaveBeenCalled();
    expect(signedChatImage).not.toHaveBeenCalled();
  });
  it("routes multiple native images to Flash, streams visible text and returns private history references", async () => {
    const form = new FormData(); form.append("message", "Solve the equations in these screenshots"); form.append("sessionId", String(SESSION_ID));
    for (const background of ["white", "black"]) {
      const png = await sharp({ create: { width: 1000, height: 600, channels: 3, background } }).png().toBuffer();
      form.append("images", new File([new Uint8Array(png)], `${background}.png`, { type: "image/png" }));
    }
    generate.mockImplementation(async (_messages, _system, _tools, options) => { options?.onTextDelta?.("The solutions are "); return { text: "The solutions are 2 and 4.", usage: { promptTokens: 2100, completionTokens: 10, totalTokens: 2110 } }; });
    const req = new NextRequest("http://localhost/api/system-messages/chat", { method: "POST", body: form, headers: { accept: "text/event-stream" } });
    const events: { event: string; data: Record<string, unknown> }[] = [];
    await readEventStream(await POST(req), (event, raw) => events.push({ event, data: JSON.parse(raw) }));
    expect(LLMFactory.getAdapter).toHaveBeenCalledWith("deepseek", DEEPSEEK_MODELS.vision);
    expect(generate).toHaveBeenCalledOnce(); expect(generate.mock.calls[0][0].at(-1)?.parts).toHaveLength(2);
    expect(events.some(event => event.event === "status" && event.data.phase === "uploading")).toBe(true);
    expect(events.some(event => event.event === "delta")).toBe(true);
    const user = events.at(-1)?.data.userMessage as { attachments: { url: string }[] };
    expect(user.attachments).toHaveLength(2); expect(user.attachments[0].url).toMatch(/^\/api\/system-messages\/\d+\/images\/0$/);
    expect(JSON.stringify(user)).not.toContain("short-lived");
  });
  it("reuses only an explicitly referenced private image and never uploads its bytes again", async () => {
    const stored = encodeStoredImages([{ path: "1/100/00000000-0000-4000-8000-000000000000.png", name: "Equation", mimeType: "image/png" }]);
    vi.mocked(prisma.systemMessage.findMany).mockResolvedValue([{ id: 31, type: "USER", content: "An equation", attachmentUrl: stored, createdAt: new Date() }] as never);
    const form = new FormData(); form.append("message", "Explain the second step"); form.append("sessionId", String(SESSION_ID)); form.append("imageReferences", JSON.stringify([{ messageId: 31, index: 0 }]));
    expect((await POST(new NextRequest("http://localhost/api/system-messages/chat", { method: "POST", body: form }))).status).toBe(200);
    expect(readChatImage).not.toHaveBeenCalled(); expect(saveChatImages).toHaveBeenCalledWith(USER_ID, SESSION_ID, [], expect.any(AbortSignal));
    expect(generate.mock.calls[0][0].at(-1)?.parts).toEqual([{ imageUrl: "https://synthetic.invalid/short-lived-image" }]); expect(prisma.systemMessage.findMany).toHaveBeenCalledOnce();
  });
  it("does not retrieve past image bytes for an unrelated conversation turn", async () => {
    vi.mocked(prisma.systemMessage.findMany).mockResolvedValue([{ id: 31, type: "USER", content: "An equation", attachmentUrl: encodeStoredImages([{ path: "1/100/00000000-0000-4000-8000-000000000000.png", name: "Equation", mimeType: "image/png" }]), createdAt: new Date() }] as never);
    expect((await POST(request("What is a good way to understand gravity?", "auto"))).status).toBe(200);
    expect(readChatImage).not.toHaveBeenCalled(); expect(signedChatImage).not.toHaveBeenCalled();
    expect(generate.mock.calls[0][0].every(message => !message.parts?.length)).toBe(true);
  });
  it("tries an explicit Gemini image selection first and discloses its existing Flash fallback", async () => {
    const stored = encodeStoredImages([{ path: "1/100/00000000-0000-4000-8000-000000000000.png", name: "Equation", mimeType: "image/png" }]);
    vi.mocked(prisma.systemMessage.findMany).mockResolvedValue([{ id: 31, type: "USER", content: "An equation", attachmentUrl: stored, createdAt: new Date() }] as never);
    generate.mockRejectedValueOnce(new Error("synthetic unavailable"));
    const form = new FormData(); form.append("message", "Explain the image"); form.append("sessionId", String(SESSION_ID)); form.append("modelPreference", "gemini"); form.append("imageReferences", JSON.stringify([{ messageId: 31, index: 0 }]));
    const response = await POST(new NextRequest("http://localhost/api/system-messages/chat", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    expect(LLMFactory.getAdapter).toHaveBeenNthCalledWith(1, "gemini", expect.any(String));
    expect(LLMFactory.getAdapter).toHaveBeenNthCalledWith(2, "deepseek", DEEPSEEK_MODELS.vision);
    expect((await response.json()).aiMessage.modelUsed).toContain("Gemini unavailable");
  });
  it("rejects foreign image references and unsupported explicit models before provider execution", async () => {
    const form = new FormData(); form.append("message", "Read this"); form.append("sessionId", String(SESSION_ID)); form.append("imageReferences", JSON.stringify([{ messageId: 999, index: 0 }]));
    expect((await POST(new NextRequest("http://localhost/api/system-messages/chat", { method: "POST", body: form }))).status).toBe(404);
    expect(generate).not.toHaveBeenCalled(); expect(readChatImage).not.toHaveBeenCalled();
    expect(prisma.systemMessage.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: { in: [999] }, userId: USER_ID, sessionId: SESSION_ID, type: "USER" } }));
    form.set("modelPreference", "groq");
    const unsupported = await POST(new NextRequest("http://localhost/api/system-messages/chat", { method: "POST", body: form }));
    expect(unsupported.status).toBe(400); expect((await unsupported.json()).error).toContain("Choose Auto, DeepSeek or Gemini"); expect(generate).not.toHaveBeenCalled();
  });
  it("streams a tool-free reply before completion and persists the authoritative final answer", async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    generate.mockImplementation(async (_history, _system, tools, options) => {
      expect(tools).toHaveLength(0);
      options?.onTextDelta?.("Energy transfers ");
      await gate;
      options?.onTextDelta?.("between systems.");
      return { text: "Energy transfers between systems.", usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    });
    const req = request("Explain energy transfer briefly"); req.headers.set("accept", "text/event-stream");
    const response = await POST(req), events: { event: string; data: Record<string, unknown> }[] = [];
    const reading = readEventStream(response, (event, data) => events.push({ event, data: JSON.parse(data) }));
    await vi.waitFor(() => expect(events.some(item => item.event === "delta")).toBe(true));
    expect(events.some(item => item.event === "result")).toBe(false);
    expect(prisma.systemMessage.create).toHaveBeenCalledTimes(1);
    finish(); await reading;
    expect(events.at(-1)?.data.reply).toBe("Energy transfers between systems.");
    expect(prisma.systemMessage.create).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps tool execution and confirmation metadata out of provisional deltas", async () => {
    generate.mockResolvedValueOnce(callsTool("createQuest", { title: "Review energy", requiredMinutes: 30 }));
    const req = request("Create a task to review energy for 30 minutes"); req.headers.set("accept", "text/event-stream");
    const events: { event: string; data: Record<string, unknown> }[] = [];
    await readEventStream(await POST(req), (event, data) => events.push({ event, data: JSON.parse(data) }));
    expect(generate.mock.calls[0][3]?.onTextDelta).toBeUndefined();
    expect(events.some(item => item.event === "delta")).toBe(false);
    expect(events.at(-1)?.data.pendingAction).toBeDefined();
    expect(prisma.quest.create).not.toHaveBeenCalled();
  });
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
