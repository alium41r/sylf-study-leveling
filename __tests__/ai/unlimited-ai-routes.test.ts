/**
 * @vitest-environment node
 *
 * END-TO-END entitlement behaviour at the HTTP boundary.
 *
 * This is where the security claims are actually proven: the entitlement is
 * derived from the AUTHENTICATED SESSION ONLY, so nothing a client can put in a
 * request body — a userId, an `unlimited` flag, an email — changes the outcome.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as plannerPost } from "../../app/api/ai-planner/route";
import { POST as chatPost } from "../../app/api/system-messages/chat/route";
import { GET as aiUsageGet } from "../../app/api/ai-usage/route";
import { getSession } from "../../lib/auth-server";
import { AiStudyOrchestrator } from "../../lib/ai/orchestrator";
import { UNLIMITED_AI_USER_IDS_ENV } from "../../lib/ai/entitlements";
import { prisma } from "../../lib/prisma";

/** The configured owner — the only account that may be unlimited. */
const OWNER = 122;
/** An ordinary account that must keep every existing limit. */
const ORDINARY = 7;

vi.mock("../../lib/auth-server", () => ({ getSession: vi.fn() }));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    plannerPlan: { findFirst: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (run) => run(prisma)),
    user: { findUnique: vi.fn(), update: vi.fn() },
    goal: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    quest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    studySession: { findMany: vi.fn(), groupBy: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    aiMemory: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    aiInsight: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    chatSession: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    systemMessage: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    hpLedger: { findMany: vi.fn() },
    subject: { findMany: vi.fn() },
    subjectNode: { findFirst: vi.fn() },
    userAchievement: { findMany: vi.fn() },
    userQuota: { findUnique: vi.fn(), updateMany: vi.fn() },
    userStats: { findUnique: vi.fn() },
    floatingRestDay: { findMany: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("../../lib/timezone-service", () => ({
  TimezoneService: {
    getUserLocalDate: vi.fn().mockReturnValue("2026-09-30"),
    getUserLocalWeekKey: vi
      .fn()
      .mockReturnValue({ weekKey: "2026-W40", resetsAt: new Date("2026-10-05T00:00:00Z") }),
    getNextMidnightUTC: vi.fn().mockReturnValue(new Date("2026-10-01T00:00:00Z")),
    getUserLocalDateOffset: vi.fn().mockReturnValue("2026-09-30"),
    getUserLocalTime: vi.fn().mockReturnValue("12:00"),
    getUserDayOfWeek: vi.fn().mockReturnValue("Wednesday"),
    getDateRangeInUserTimezone: vi.fn().mockReturnValue([]),
    getStartOfDayUTC: vi.fn().mockReturnValue(new Date("2026-09-30T00:00:00Z")),
    getEndOfDayUTC: vi.fn().mockReturnValue(new Date("2026-09-30T23:59:59.999Z")),
    validateTimezone: vi.fn().mockReturnValue(true),
  },
}));

vi.mock("../../lib/timezone-server", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("UTC"),
  TimezoneServerService: { getUserTimezone: vi.fn().mockResolvedValue("UTC") },
}));

vi.mock("../../lib/ai/cheap-answers", () => ({ resolveCheapAnswer: vi.fn().mockResolvedValue(null) }));

const { mockGenerateResponse } = vi.hoisted(() => ({ mockGenerateResponse: vi.fn() }));
vi.mock("../../lib/ai/providers/factory", () => ({
  LLMFactory: { getAdapter: vi.fn(() => ({ generateResponse: mockGenerateResponse })) },
}));

function configureOwner(value: string | undefined) {
  if (value === undefined) delete process.env[UNLIMITED_AI_USER_IDS_ENV];
  else process.env[UNLIMITED_AI_USER_IDS_ENV] = value;
}

/** An exhausted bucket: `used` is at (or past) every configured limit. */
function exhaustQuota(used = 99) {
  vi.mocked(prisma.userQuota.findUnique).mockResolvedValue({ used } as any);
}

/** A reservation that the guarded upsert refused (row absent ⇒ at the limit). */
function quotaRefusesReservation() {
  vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([] as any);
}

/** A reservation the guarded upsert granted. */
function quotaGrantsReservation(used = 1) {
  vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ used }] as any);
}

function plannerRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost:3000/api/ai-planner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "maths",
      syllabus: "AS Level Maths",
      effortHours: 15,
      ...body,
    }),
  });
}

function chatRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost:3000/api/system-messages/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hello", modelPreference: "gemini", ...body }),
  });
}

function usageRequest() {
  return new NextRequest("http://localhost:3000/api/ai-usage", { method: "GET" });
}

/** Drain an SSE body into the parsed `data:` events. */
async function readSse(response: Response) {
  const reader = (response.body as any).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
  }
  return buffer
    .split("\n\n")
    .filter((part) => part.startsWith("data: "))
    .map((part) => JSON.parse(part.substring(6)));
}

beforeEach(() => {
  vi.clearAllMocks();
  configureOwner(undefined);

  vi.mocked(getSession).mockResolvedValue({ userId: ORDINARY, email: "student@sylf.app" } as any);

  vi.mocked(prisma.userQuota.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.userStats.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ used: 1 }] as any);

  vi.mocked(prisma.chatSession.create).mockResolvedValue({ id: 100, userId: ORDINARY, title: "t" } as any);
  vi.mocked(prisma.chatSession.findFirst).mockResolvedValue({ id: 100, userId: ORDINARY } as any);
  vi.mocked(prisma.chatSession.findUnique).mockResolvedValue({ id: 100, userId: ORDINARY } as any);
  vi.mocked(prisma.systemMessage.create).mockImplementation((async (args: any) => ({
    id: 1,
    type: args.data.type,
    content: args.data.content,
  })) as any);
  vi.mocked(prisma.systemMessage.findMany).mockResolvedValue([]);
  vi.mocked(prisma.systemMessage.count).mockResolvedValue(0);

  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: ORDINARY,
    hp: 100,
    maxHp: 100,
    level: 5,
    currentXP: 100,
    xpToNextLevel: 500,
    sylph: 1000,
    hunterRank: "E",
    streakDays: 5,
    timezone: "UTC",
    restDays: [0],
  } as any);
  vi.mocked(prisma.user.update).mockResolvedValue({} as any);
  vi.mocked(prisma.goal.findMany).mockResolvedValue([]);
  vi.mocked(prisma.goal.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.goal.create).mockResolvedValue({ id: 42, title: "maths" } as any);
  vi.mocked(prisma.quest.findMany).mockResolvedValue([]);
  vi.mocked(prisma.quest.createMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.quest.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.quest.count).mockResolvedValue(0);
  vi.mocked(prisma.quest.aggregate).mockResolvedValue({ _avg: {}, _sum: {}, _count: {} } as any);
  vi.mocked(prisma.studySession.findMany).mockResolvedValue([]);
  vi.mocked(prisma.studySession.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.studySession.count).mockResolvedValue(0);
  vi.mocked(prisma.studySession.aggregate).mockResolvedValue({ _sum: { durationMinutes: 0 } } as any);
  vi.mocked(prisma.aiMemory.findMany).mockResolvedValue([]);
  vi.mocked(prisma.aiInsight.findMany).mockResolvedValue([]);
  vi.mocked(prisma.aiInsight.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.aiInsight.count).mockResolvedValue(0);
  vi.mocked(prisma.hpLedger.findMany).mockResolvedValue([]);
  vi.mocked(prisma.subject.findMany).mockResolvedValue([]);
  vi.mocked(prisma.userAchievement.findMany).mockResolvedValue([]);
  vi.mocked(prisma.floatingRestDay.findMany).mockResolvedValue([]);

  vi.spyOn(AiStudyOrchestrator, "generatePlan").mockResolvedValue({
    goalTitle: "maths",
    goalDescription: "Study plan for AS Level Maths",
    quests: [
      {
        title: "Math Chapter 1: Quadratics",
        description: "Do the exercises",
        requiredMinutes: 60,
        xpReward: 80,
        sylphReward: 40,
      },
    ],
  } as any);

  mockGenerateResponse.mockResolvedValue({
    text: "Here is the answer.",
    usage: { promptTokens: 10, completionTokens: 5 },
  });
});

afterEach(() => {
  configureOwner(undefined);
  vi.restoreAllMocks();
});

describe("Classic Planner (/api/ai-planner) — the owner is never blocked", () => {
  beforeEach(() => {
    configureOwner(String(OWNER));
    vi.mocked(getSession).mockResolvedValue({ userId: OWNER, email: "owner@sylf.app" } as any);
  });

  it("generates even though the weekly planner bucket is exhausted", async () => {
    exhaustQuota(1);
    quotaRefusesReservation(); // the ordinary path WOULD have been rejected here

    const response = await plannerPost(plannerRequest());
    expect(response.status).toBe(200);

    const events = await readSse(response);
    const result = events.find((e) => e.type === "result");
    expect(result).toBeDefined();
    expect(result.goal).toBeDefined();
  });

  it("reports the quota as unlimited so the UI shows ∞ rather than a fake number", async () => {
    exhaustQuota(1);
    const events = await readSse(await plannerPost(plannerRequest()));
    const result = events.find((e) => e.type === "result");

    expect(result.quota.unlimited).toBe(true);
    expect(result.quota.allowed).toBe(true);
    expect(result.quota.limit).toBeNull();
    expect(result.quota.remaining).toBeNull();
    // Observability is preserved: the real recorded usage still travels.
    expect(typeof result.quota.used).toBe("number");
  });

  it("never consumes capacity across repeated generations", async () => {
    exhaustQuota(1);
    for (let i = 0; i < 3; i += 1) {
      expect((await plannerPost(plannerRequest())).status).toBe(200);
    }
    // No reservation was ever written.
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("still requires authentication", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await plannerPost(plannerRequest())).status).toBe(401);
  });

  it("still validates the request body", async () => {
    const response = await plannerPost(plannerRequest({ topic: "", effortHours: 0 }));
    expect(response.status).toBe(400);
  });
});

describe("Classic Planner — an ordinary account is unchanged", () => {
  it("validates before charging quota or dispatching a model", async () => {
    expect((await plannerPost(plannerRequest({ topic: "", effortHours: -2 }))).status).toBe(400);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(AiStudyOrchestrator.generatePlan).not.toHaveBeenCalled();
  });

  it("refunds a failed database commit after the materialization callback returns", async () => {
    vi.mocked(prisma.$transaction).mockImplementationOnce(async run => {
      await (run as (tx: typeof prisma) => Promise<unknown>)(prisma);
      throw new Error("FIXTURE_COMMIT_FAILED");
    });
    const events = await readSse(await plannerPost(plannerRequest()));
    expect(events.some(event => event.type === "result")).toBe(false);
    expect(events.some(event => event.type === "error")).toBe(true);
    expect(vi.mocked(prisma.$queryRawUnsafe).mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE "UserQuota"'))).toHaveLength(1);
  });

  it("does not save an aborted generation even if the model returns a late result", async () => {
    const abort = new AbortController();
    const fixture = { goalTitle: "Fixture", goalDescription: "Fixture", quests: [] };
    vi.mocked(AiStudyOrchestrator.generatePlan).mockImplementationOnce(async () => { abort.abort(); return fixture; });
    const request = new NextRequest("http://localhost/api/ai-planner", { method: "POST", body: JSON.stringify({ topic: "maths", effortHours: 5 }), signal: abort.signal });
    await readSse(await plannerPost(request));
    expect(prisma.goal.create).not.toHaveBeenCalled();
    expect(prisma.quest.createMany).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.$queryRawUnsafe).mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE "UserQuota"'))).toHaveLength(1);
  });

  it("aborts upstream when the response reader is cancelled", async () => {
    let finish!: () => void;
    let upstream: AbortSignal | undefined;
    vi.mocked(AiStudyOrchestrator.generatePlan).mockImplementationOnce(async (...args) => {
      upstream = args[6];
      await new Promise<void>(resolve => { finish = resolve; });
      return { goalTitle: "Fixture", goalDescription: "Fixture", quests: [] };
    });
    const response = await plannerPost(plannerRequest());
    await vi.waitFor(() => expect(upstream).toBeDefined());
    await response.body!.cancel();
    expect(upstream!.aborted).toBe(true);
    finish();
    await vi.waitFor(() => expect(vi.mocked(prisma.$queryRawUnsafe).mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE "UserQuota"'))).toHaveLength(1));
    expect(prisma.goal.create).not.toHaveBeenCalled();
  });
  it("rejects with the same 429 and the same error body when the week is spent", async () => {
    exhaustQuota(1);
    quotaRefusesReservation();

    const response = await plannerPost(plannerRequest());
    expect(response.status).toBe(429);

    const body = await response.json();
    expect(body.error).toBe("quota_exceeded");
    expect(body.feature).toBe("planner");
    expect(body.remaining).toBe(0);
    expect(body.limit).toBe(1);
    expect(typeof body.resetsAt).toBe("string");
  });

  it("still generates normally while capacity remains", async () => {
    quotaGrantsReservation(1);
    const response = await plannerPost(plannerRequest());
    expect(response.status).toBe(200);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
  });

  it("still reports finite numeric capacity to the UI", async () => {
    quotaGrantsReservation(1);
    const events = await readSse(await plannerPost(plannerRequest()));
    const result = events.find((e) => e.type === "result");

    expect(result.quota.unlimited).toBe(false);
    expect(result.quota.limit).toBe(1);
    expect(result.quota.remaining).toBe(0);
  });
});

describe("System AI chat (/api/system-messages/chat)", () => {
  it("answers the owner even though the daily chat bucket is exhausted", async () => {
    configureOwner(String(OWNER));
    vi.mocked(getSession).mockResolvedValue({ userId: OWNER, email: "owner@sylf.app" } as any);
    exhaustQuota(10);
    quotaRefusesReservation();

    const response = await chatPost(chatRequest());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.reply).toBe("Here is the answer.");
  });

  it("never consumes a chat unit for the owner", async () => {
    configureOwner(String(OWNER));
    vi.mocked(getSession).mockResolvedValue({ userId: OWNER, email: "owner@sylf.app" } as any);
    exhaustQuota(10);

    await chatPost(chatRequest());
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("still rejects an ordinary account with DAILY_QUOTA_EXHAUSTED", async () => {
    exhaustQuota(10);
    quotaRefusesReservation();

    const response = await chatPost(chatRequest());
    expect(response.status).toBe(429);

    const body = await response.json();
    expect(body.error).toBe("DAILY_QUOTA_EXHAUSTED");
    expect(body.limit).toBe(10);
    expect(body.used).toBe(10);
    expect(typeof body.resetsAt).toBe("string");
  });

  it("treats the owner's account as ordinary when nothing is configured", async () => {
    configureOwner(undefined);
    vi.mocked(getSession).mockResolvedValue({ userId: OWNER, email: "owner@sylf.app" } as any);
    exhaustQuota(10);
    quotaRefusesReservation();

    const response = await chatPost(chatRequest());
    expect(response.status).toBe(429);
    expect((await response.json()).error).toBe("DAILY_QUOTA_EXHAUSTED");
  });

  it("still requires authentication", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await chatPost(chatRequest())).status).toBe(401);
  });
});

describe("Security: a client cannot grant itself the entitlement", () => {
  beforeEach(() => {
    configureOwner(String(OWNER));
    // Every case below is an ORDINARY authenticated session.
    vi.mocked(getSession).mockResolvedValue({ userId: ORDINARY, email: "student@sylf.app" } as any);
    exhaustQuota(10);
    quotaRefusesReservation();
  });

  it("ignores a client-supplied `unlimited: true` flag in the chat body", async () => {
    const response = await chatPost(chatRequest({ unlimited: true }));
    expect(response.status).toBe(429);
  });

  it("ignores a client-supplied owner userId in the chat body", async () => {
    const response = await chatPost(
      chatRequest({ userId: OWNER, user: { id: OWNER }, unlimited: true })
    );
    expect(response.status).toBe(429);
  });

  it("ignores a spoofed owner userId on the Classic Planner body", async () => {
    const response = await plannerPost(plannerRequest({ userId: OWNER, unlimited: true }));
    expect(response.status).toBe(429);
  });

  it("ignores a spoofed owner userId carried in the query string", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/system-messages/chat?userId=${OWNER}&unlimited=1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello", modelPreference: "gemini" }),
      }
    );
    expect((await chatPost(req)).status).toBe(429);
  });

  it("ignores an email that happens to match the owner's account", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: ORDINARY,
      email: "alium14r@gmail.com",
    } as any);
    expect((await chatPost(chatRequest())).status).toBe(429);
  });

  it("gives a different authenticated account no access to the owner's entitlement", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: OWNER + 1, email: "someone@sylf.app" } as any);
    expect((await chatPost(chatRequest())).status).toBe(429);
    expect((await plannerPost(plannerRequest())).status).toBe(429);
  });
});

describe("AI usage report drives the UI's unlimited state", () => {
  it("reports unlimited for the owner so no badge shows a finite cap", async () => {
    configureOwner(String(OWNER));
    vi.mocked(getSession).mockResolvedValue({ userId: OWNER, email: "owner@sylf.app" } as any);
    exhaustQuota(99);

    const response = await aiUsageGet(usageRequest());
    expect(response.status).toBe(200);

    const report = await response.json();
    for (const feature of ["chat", "planner", "plannerExpansion", "plannerRebalance", "compile", "scope"]) {
      expect(report[feature].unlimited).toBe(true);
      expect(report[feature].allowed).toBe(true);
      // Explicit unlimited semantics — NOT a fabricated large limit.
      expect(report[feature].limit).toBeNull();
      expect(report[feature].remaining).toBeNull();
    }
  });

  it("reports real finite capacity for an ordinary account", async () => {
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue({ used: 3 } as any);

    const report = await (await aiUsageGet(usageRequest())).json();

    expect(report.chat.unlimited).toBe(false);
    expect(report.chat.limit).toBe(10);
    expect(report.chat.remaining).toBe(7);
    expect(report.chat.used).toBe(3);
    expect(report.planner.unlimited).toBe(false);
    expect(report.planner.limit).toBe(1);
  });

  it("does not leak the configured owner id to the client", async () => {
    configureOwner(String(OWNER));
    vi.mocked(getSession).mockResolvedValue({ userId: OWNER, email: "owner@sylf.app" } as any);

    const raw = await (await aiUsageGet(usageRequest())).text();
    expect(raw).not.toContain(UNLIMITED_AI_USER_IDS_ENV);
    expect(raw).not.toContain(String(OWNER));
  });

  it("still requires authentication", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await aiUsageGet(usageRequest())).status).toBe(401);
  });
});
