// ============================================================
// Cheap-Answer Engine — Unit Tests
// ============================================================
// The zero-token layer: pure-function handlers for every safe genre
// + strict escalation (null → LLM) for everything ambiguous or
// unsupported. Never a wrong answer.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveCheapAnswer } from "../../lib/ai/cheap-answers";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    quest: { findMany: vi.fn() },
    goal: { findMany: vi.fn() },
    subject: { findMany: vi.fn() },
    studySession: {
      aggregate: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

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

describe("Cheap-Answer Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockPrisma.user.findUnique).mockResolvedValue(BASE_USER);
    vi.mocked(mockPrisma.quest.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.goal.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.subject.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.studySession.aggregate).mockResolvedValue({
      _sum: { durationMinutes: 0 },
      _count: 0,
    });
    vi.mocked(mockPrisma.studySession.findFirst).mockResolvedValue(null);
    vi.mocked(mockPrisma.studySession.findMany).mockResolvedValue([]);
  });

  describe("math", () => {
    it("evaluates arithmetic safely", async () => {
      expect((await resolveCheapAnswer(1, "whats 2+2"))!.content).toBe("**4**");
      expect((await resolveCheapAnswer(1, "what is 5 * 3"))!.content).toBe("**15**");
      expect((await resolveCheapAnswer(1, "calculate 12 / 4"))!.content).toBe("**3**");
      expect((await resolveCheapAnswer(1, "whats 2^10"))!.content).toBe("**1024**");
      expect((await resolveCheapAnswer(1, "5 * (3+2)"))!.content).toBe("**25**");
    });

    it("understands natural math wording (plus/times/added to/…) with zero LLM", async () => {
      expect((await resolveCheapAnswer(1, "What's 12 × 8?"))!.content).toBe("**96**");
      expect((await resolveCheapAnswer(1, "Calculate 12 times 8."))!.content).toBe("**96**");
      expect((await resolveCheapAnswer(1, "What is 12 multiplied by 8?"))!.content).toBe("**96**");
      expect((await resolveCheapAnswer(1, "Can you work out 12 times 8?"))!.content).toBe("**96**");
      expect((await resolveCheapAnswer(1, "How much is 25 plus 37?"))!.content).toBe("**62**");
      expect((await resolveCheapAnswer(1, "What is 25 added to 37?"))!.content).toBe("**62**");
      expect((await resolveCheapAnswer(1, "what is 5 subtracted from 12"))!.content).toBe("**7**");
      expect((await resolveCheapAnswer(1, "12 divided by 4"))!.content).toBe("**3**");
      // Regressions: longer lead-in phrases must not be swallowed by prefixes.
      expect((await resolveCheapAnswer(1, "whats the value of 29.9 times 263"))!.content).toBe("**7863.7**");
      expect((await resolveCheapAnswer(1, "what is the value of 29.9 times 263"))!.content).toBe("**7863.7**");
      expect((await resolveCheapAnswer(1, "what is the answer to 6 * 7"))!.content).toBe("**42**");
    });

    it("rejects division by zero and malformed expressions", async () => {
      expect(await resolveCheapAnswer(1, "whats 1/0")).toBeNull();
      expect(await resolveCheapAnswer(1, "whats 2+")).toBeNull();
    });
  });

  describe("percentages & comparisons", () => {
    it("computes percentages", async () => {
      expect((await resolveCheapAnswer(1, "what is 15% of 240"))!.content).toContain("36");
      expect((await resolveCheapAnswer(1, "20 percent of 50"))!.content).toContain("10");
    });

    it("compares numbers", async () => {
      expect((await resolveCheapAnswer(1, "which is bigger, 5 or 3"))!.content).toBe("**5**");
      expect((await resolveCheapAnswer(1, "is 100 greater than 50"))!.content).toContain("Yes");
      expect((await resolveCheapAnswer(1, "is 3 bigger than 5"))!.content).toContain("No");
    });
  });

  describe("unit conversion", () => {
    it("converts length, mass, time and temperature", async () => {
      expect((await resolveCheapAnswer(1, "convert 5 km to miles"))!.content).toContain("3.1069");
      expect((await resolveCheapAnswer(1, "how many cm in 2 m"))!.content).toBe("**200** cm");
      expect((await resolveCheapAnswer(1, "100 c to f"))!.content).toBe("**212** °F");
      expect((await resolveCheapAnswer(1, "32 f to c"))!.content).toBe("**0** °C");
      expect((await resolveCheapAnswer(1, "how many minutes in 2 hours"))!.content).toBe("**120** min");
    });

    it("escalates cross-category and unsupported conversions", async () => {
      expect(await resolveCheapAnswer(1, "5 kg to cm")).toBeNull();
      expect(await resolveCheapAnswer(1, "convert 10 dollars to euros")).toBeNull();
    });
  });

  describe("facts bank", () => {
    it("answers curated constants exactly", async () => {
      expect((await resolveCheapAnswer(1, "what is pi"))!.content).toContain("3.14159");
      expect((await resolveCheapAnswer(1, "how many days in a week"))!.content).toContain("**7**");
      expect((await resolveCheapAnswer(1, "speed of light"))!.content).toContain("299,792,458");
    });

    it("escalates definitions and non-curated facts", async () => {
      expect(await resolveCheapAnswer(1, "what does mitochondria mean")).toBeNull();
      expect(await resolveCheapAnswer(1, "who was albert einstein")).toBeNull();
      expect(await resolveCheapAnswer(1, "how old is the earth")).toBeNull();
    });
  });

  describe("text counting", () => {
    it("counts words and characters", async () => {
      expect((await resolveCheapAnswer(1, "how many words in hello world"))!.content).toContain("2");
      expect((await resolveCheapAnswer(1, "how many characters in abc"))!.content).toContain("3");
    });
  });

  describe("date & time", () => {
    it("answers today and explicit days-between", async () => {
      expect((await resolveCheapAnswer(1, "whats todays date"))!.content).toContain("Today is");
      expect((await resolveCheapAnswer(1, "how many days until 2099-12-25"))!.content).toContain("days until");
      expect((await resolveCheapAnswer(1, "how many days since 2000-01-01"))!.content).toContain("days since");
    });

    it("escalates relative dates", async () => {
      expect(await resolveCheapAnswer(1, "how many days until next friday")).toBeNull();
      expect(await resolveCheapAnswer(1, "how many days until my birthday")).toBeNull();
    });
  });

  describe("app-data fallthrough & escalation", () => {
    it("still routes app-data questions to the DB responder", async () => {
      const r = await resolveCheapAnswer(1, "hi whats my rank");
      expect(r!.reason).toBe("get_user_rank");
      expect(r!.content).toContain("B-Rank");
    });

    it("escalates genuinely complex questions to the LLM", async () => {
      expect(await resolveCheapAnswer(1, "explain quantum entanglement simply")).toBeNull();
      expect(
        await resolveCheapAnswer(
          1,
          "plan my entire week around my physics exam taking my streak into account"
        )
      ).toBeNull();
    });
  });
});
