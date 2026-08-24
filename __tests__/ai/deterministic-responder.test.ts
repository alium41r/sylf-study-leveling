// ============================================================
// Deterministic Responder — Unit Tests
// ============================================================
// The LLM-free fast path: stat checks answered straight from the
// database, with zero quota and zero tokens. Conservative matching
// means non-matching messages fall through to the AI pipeline.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { matchDeterministic } from "../../lib/ai/deterministic-responder";

const { mockPrisma } = vi.hoisted(() => {
  const state: Record<string, any> = {};
  return {
    mockPrisma: {
      state,
      user: { findUnique: vi.fn() },
      quest: { findMany: vi.fn() },
      goal: { findMany: vi.fn() },
      subject: { findMany: vi.fn() },
      studySession: { aggregate: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    },
  };
});

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/timezone-server", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("UTC"),
}));

const BASE_USER = {
  hunterRank: "B",
  level: 12,
  currentXP: 1240,
  xpToNextLevel: 2000,
  hp: 82,
  maxHp: 100,
  sylph: 345,
  streakDays: 4,
  activeTitle: "Night Scholar",
  name: "Ali",
  username: "ali",
  timezone: "UTC",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
};

describe("Deterministic Responder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockPrisma.user.findUnique).mockResolvedValue(BASE_USER);
    vi.mocked(mockPrisma.quest.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.goal.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.subject.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.studySession.aggregate).mockResolvedValue({
      _sum: { durationMinutes: 145 },
      _count: 3,
    });
    vi.mocked(mockPrisma.studySession.findFirst).mockResolvedValue(null);
    vi.mocked(mockPrisma.studySession.findMany).mockResolvedValue([]);
  });

  it("summarizes study sessions from the DB (no LLM)", async () => {
    vi.mocked(mockPrisma.studySession.aggregate).mockResolvedValue({
      _sum: { durationMinutes: 145 },
      _count: 3,
    });
    vi.mocked(mockPrisma.studySession.findMany).mockResolvedValue([
      { durationMinutes: 45, startedAt: new Date("2026-08-23T10:00:00Z"), subject: { name: "Physics" } },
    ] as any);
    const reply = await matchDeterministic(1, "can you tell me about my study sessions");
    expect(reply!.reason).toBe("get_session_summary");
    expect(reply!.content).toContain("3 sessions");
    expect(reply!.content).toContain("Physics");
  });

  it("answers 'what's my rank' from the DB with no LLM", async () => {
    const reply = await matchDeterministic(1, "what's my rank?");
    expect(reply).not.toBeNull();
    expect(reply!.content).toContain("B-Rank");
    expect(reply!.reason).toBe("get_user_rank");
  });

  it("strips greeting/politeness lead-ins so they still hit the fast path", async () => {
    expect((await matchDeterministic(1, "hi whats my rank"))!.reason).toBe("get_user_rank");
    expect((await matchDeterministic(1, "hey so how much xp do i have"))!.reason).toBe("get_user_xp");
    expect((await matchDeterministic(1, "can you tell me my hp"))!.reason).toBe("get_user_hp");
    // Greeting only — no stat query -> no match.
    expect(await matchDeterministic(1, "hi")).toBeNull();
    // A leading "what/whats" must NOT be stripped away as a preamble.
    expect(await matchDeterministic(1, "what is my level")).not.toBeNull();
  });

  it("answers arithmetic trivia like 'whats 2+2' with zero LLM", async () => {
    // Arithmetic now lives in the cheap-answers engine (see
    // cheap-answers.test.ts) — matchDeterministic handles app-data only.
    expect(await matchDeterministic(1, "whats 2+2")).toBeNull();
  });

  it("answers identity questions like 'whats my name' with no LLM", async () => {
    const reply = await matchDeterministic(1, "hi whats my name");
    expect(reply).not.toBeNull();
    expect(reply!.reason).toBe("get_user_name");
    expect(reply!.content).toContain("Ali");
    expect(reply!.content).toContain("@ali");
  });

  it("answers study-time, subject, timezone and account questions from the DB", async () => {
    expect((await matchDeterministic(1, "how much did i study today"))!.content).toContain("145 min");

    vi.mocked(mockPrisma.subject.findMany).mockResolvedValue([
      { name: "Physics", examBoard: "CAIE", level: "A-Level" },
    ] as any);
    expect((await matchDeterministic(1, "my subjects"))!.content).toContain("Physics");

    expect((await matchDeterministic(1, "my timezone"))!.content).toContain("UTC");
    expect((await matchDeterministic(1, "when did i sign up"))!.content).toContain("since");
  });

  it("answers last-session questions from the DB", async () => {
    vi.mocked(mockPrisma.studySession.findFirst).mockResolvedValue({
      startedAt: new Date("2026-08-23T10:00:00.000Z"),
      durationMinutes: 45,
      subject: { name: "Physics" },
    } as any);
    const reply = await matchDeterministic(1, "when did i last study");
    expect(reply!.content).toContain("45 min");
  });

  it("answers XP checks with the distance to next level", async () => {
    const reply = await matchDeterministic(1, "How much XP do I have?");
    expect(reply!.content).toContain("1240/2000");
    expect(reply!.content).toContain("760");
  });

  it("keeps the low-HP warning for health checks", async () => {
    vi.mocked(mockPrisma.user.findUnique).mockResolvedValue({
      ...BASE_USER,
      hp: 25,
      maxHp: 100,
    });
    const reply = await matchDeterministic(1, "my hp");
    expect(reply!.content).toContain("25/100");
    expect(reply!.content).toContain("break");
  });

  it("answers weekly target progress with days remaining", async () => {
    const reply = await matchDeterministic(1, "weekly quest progress");
    expect(reply!.content).toContain("145/180");
    expect(reply!.content).toContain("35 min to go");
  });

  it("lists today's quests with completion status", async () => {
    vi.mocked(mockPrisma.quest.findMany).mockResolvedValue([
      { title: "Ch 1: Kinematics", requiredMinutes: 45, status: "COMPLETED" },
      { title: "Ch 2: Dynamics", requiredMinutes: 60, status: "PENDING" },
    ]);
    const reply = await matchDeterministic(1, "What do I have today?");
    expect(reply!.content).toContain("2 quests today");
    expect(reply!.content).toContain("Kinematics");
    expect(reply!.content).toContain("✓");
  });

  it("handles natural quest lookups like 'can you tell me what quests do i have right now'", async () => {
    const reply = await matchDeterministic(1, "can you tell me what quests do i have right now");
    expect(reply).not.toBeNull();
    expect(reply!.reason).toBe("get_quests");

    expect((await matchDeterministic(1, "what quests do i have"))!.reason).toBe("get_quests");
    expect((await matchDeterministic(1, "show my quests"))!.reason).toBe("get_quests");
  });

  it("answers scoped queries deterministically, but weekdays still escalate", async () => {
    // "this week" is now a supported deterministic scope.
    expect((await matchDeterministic(1, "what quests do i have this week"))!.reason).toBe("get_quests");
    // A weekday anchor needs calendar reasoning → LLM.
    expect(await matchDeterministic(1, "what is on my schedule next tuesday")).toBeNull();
  });

  it("reports an empty schedule without fabricating data", async () => {
    const reply = await matchDeterministic(1, "today's quests");
    expect(reply!.content).toBe("Nothing scheduled today.");
  });

  it("summarizes active goals with progress", async () => {
    vi.mocked(mockPrisma.goal.findMany).mockResolvedValue([
      {
        title: "Physics A2",
        quests: [
          { status: "COMPLETED" },
          { status: "COMPLETED" },
          { status: "PENDING" },
          { status: "PENDING" },
        ],
      },
    ]);
    const reply = await matchDeterministic(1, "My goals");
    expect(reply!.content).toContain("Physics A2");
    expect(reply!.content).toContain("50%");
  });

  it("falls through (null) for reasoning questions that look similar", async () => {
    expect(await matchDeterministic(1, "How do I keep my streak alive?")).toBeNull();
    expect(await matchDeterministic(1, "Why did my rank change?")).toBeNull();
    expect(await matchDeterministic(1, "Explain what sylph is used for")).toBeNull();
  });

  it("falls through for long messages and empty input", async () => {
    expect(await matchDeterministic(1, "")).toBeNull();
    expect(
      await matchDeterministic(
        1,
        "Can you analyze my entire study history from the last three months and tell me my rank and XP " +
          "and also explain every detail of my progression arc with recommendations?"
      )
    ).toBeNull();
  });
});
