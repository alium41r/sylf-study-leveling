/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeChatTool } from "@/lib/ai/chat-tool-executor";
import { prisma } from "@/lib/prisma";
import { StudyScheduleService } from "@/lib/study-schedule-service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    quest: {
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    goal: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/timezone-server", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("UTC"),
}));

describe("S4: AI tool reward-inflation clamps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(StudyScheduleService, "isUserRestDay").mockResolvedValue(false);
    vi.mocked(prisma.quest.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.quest.count).mockResolvedValue(0);
    vi.mocked(prisma.goal.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ level: 1 } as any);
  });

  it("clamps a huge requiredMinutes (1,000,000) to the 240 ceiling", async () => {
    vi.mocked(prisma.quest.create).mockResolvedValue({} as any);
    await executeChatTool("createQuest", { title: "Inflated Quest", requiredMinutes: 1_000_000 }, 1);
    const created = vi.mocked(prisma.quest.create).mock.calls[0][0] as any;
    expect(created.data.requiredMinutes).toBe(240);
    // Reward must match the CLAMPED minutes, not the LLM's number.
    expect(created.data.xpReward).toBeLessThanOrEqual(5 * 240 * 2.5 + 1000);
  });

  it("clamps tiny/zero requiredMinutes to the 15 floor", async () => {
    vi.mocked(prisma.quest.create).mockResolvedValue({} as any);
    await executeChatTool("createQuest", { title: "Micro Quest", requiredMinutes: 0.5 }, 1);
    const created = vi.mocked(prisma.quest.create).mock.calls[0][0] as any;
    expect(created.data.requiredMinutes).toBe(15);
  });

  it("treats malformed minutes as the 30 default (never NaN/Infinity)", async () => {
    vi.mocked(prisma.quest.create).mockResolvedValue({} as any);
    await executeChatTool("createQuest", { title: "Garbage Minutes", requiredMinutes: "not-a-number" }, 1);
    const created = vi.mocked(prisma.quest.create).mock.calls[0][0] as any;
    expect(created.data.requiredMinutes).toBe(30);
  });
});
