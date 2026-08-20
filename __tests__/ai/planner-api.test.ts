/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../app/api/ai-planner/route";
import { prisma } from "../../lib/prisma";
import { signToken } from "../../lib/auth";
import { AiStudyOrchestrator } from "../../lib/ai/orchestrator";
import { NextRequest } from "next/server";

// Mock Prisma
vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    goal: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    quest: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    studySession: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    chatSession: {
      create: vi.fn().mockResolvedValue({ id: 12, userId: 1, title: "Study Plan: maths" }),
      findFirst: vi.fn(),
    },
    systemMessage: {
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Mock Timezone Service
vi.mock("../../lib/timezone-service", () => ({
  TimezoneService: {
    getUserLocalDate: vi.fn().mockReturnValue("2026-08-15"),
    getStartOfDayUTC: vi.fn().mockReturnValue(new Date("2026-08-15T00:00:00Z")),
    getEndOfDayUTC: vi.fn().mockReturnValue(new Date("2026-08-15T23:59:59.999Z")),
    getNextMidnightUTC: vi.fn().mockReturnValue(new Date("2026-08-16T00:00:00Z")),
    getUserLocalDateOffset: vi.fn().mockReturnValue("2026-08-15"),
    validateTimezone: vi.fn().mockReturnValue(true),
  },
}));

vi.mock("../../lib/timezone-server", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("UTC"),
  TimezoneServerService: {
    getUserTimezone: vi.fn().mockResolvedValue("UTC"),
  },
}));

describe("Planner API Integration Test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully generate a goal and quests", async () => {
    const userId = 1;
    const goalId = 42;

    // Generate valid auth token
    const token = await signToken({ userId, email: "test@example.com" });

    // Mock Prisma responses
    vi.mocked(prisma.systemMessage.count).mockResolvedValue(0); // 0 quota used today
    vi.mocked(prisma.studySession.findMany).mockResolvedValue([]);
    vi.mocked(prisma.goal.create).mockResolvedValue({
      id: goalId,
      userId,
      title: "maths",
      description: "Study plan for AS Level Maths",
      targetWeeks: 1,
      effortLevel: "INTENSE",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    vi.mocked(prisma.quest.createMany).mockResolvedValue({ count: 2 });
    vi.mocked(prisma.systemMessage.create).mockResolvedValue({
      id: 101,
      userId,
      content: "Plan generated",
      type: "INFO",
    } as any);

    // Mock AiStudyOrchestrator to provide deterministic plan result
    vi.spyOn(AiStudyOrchestrator, "generatePlan").mockImplementation(
      async (topic, syllabus, effortHours, targetDate, pastSessions, onProgress) => {
        onProgress?.("[Researcher] Researching curriculum for " + topic);
        onProgress?.("[Architect] Structuring quests...");
        return {
          goalTitle: topic,
          goalDescription: "Study plan for AS Level Maths",
          quests: [
            {
              title: "Math Chapter 1: Quadratics",
              description: "Completing the square and quadratic inequalities",
              requiredMinutes: 60,
              xpReward: 100,
              sylphReward: 50,
            },
            {
              title: "Math Chapter 2: Functions",
              description: "Domain, range, and composite functions",
              requiredMinutes: 45,
              xpReward: 80,
              sylphReward: 40,
            },
          ],
        };
      }
    );

    // Prepare Request
    const req = new NextRequest("http://localhost:3000/api/ai-planner", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        topic: "maths",
        targetDate: "2026-08-15",
        syllabus: "AS Level Maths cambridge 9709 first 5 chapters",
        effortHours: 15
      })
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const body = response.body as any;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let events = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      events.push(text);
    }

    const resultEvent = events.find(e => e.includes('"type":"result"'));
    expect(resultEvent).toBeDefined();

    const dataMatch = resultEvent!.match(/data: (.*)/);
    const resultData = JSON.parse(dataMatch![1]);
    expect(resultData.goal).toBeDefined();
    expect(resultData.goal.id).toBe(goalId);

    // Verify DB calls were made correctly
    expect(prisma.goal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          title: "maths",
        }),
      })
    );

    expect(prisma.quest.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            goalId,
            title: "Math Chapter 1: Quadratics",
          }),
        ]),
      })
    );
  }, 10000);
});
