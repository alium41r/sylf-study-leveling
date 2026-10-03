import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../lib/prisma";
import * as auth from "../../lib/auth";
import { POST } from "../../app/api/goals/route";
import { PATCH } from "../../app/api/goals/[id]/route";

vi.mock("../../lib/auth", () => ({
  verifyToken: vi.fn(),
  getSession: vi.fn(),
}));

const authedJsonRequest = (url: string, method: string, body: unknown) =>
  new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  });

describe("Goals API — Objective Theming & Exact Deadlines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Unit transport assertions use the same mocked models inside the new
    // transaction boundary. PostgreSQL suites qualify actual locks/rollback.
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);
    vi.spyOn(prisma, "$transaction").mockImplementation(async (run: any) => run(prisma));
    vi.mocked(auth.verifyToken).mockResolvedValue({ userId: 1 } as any);
  });

  it("POST /api/goals persists the color token and UTC target date", async () => {
    const createSpy = vi.spyOn(prisma.goal, "create").mockResolvedValue({ id: 1 } as any);
    vi.spyOn(prisma.systemMessage, "create").mockResolvedValue({} as any);

    const res = await POST(
      authedJsonRequest("http://localhost/api/goals", "POST", {
        title: "Master Physics",
        description: "Paper 4",
        targetWeeks: 4,
        effortLevel: "INTENSE",
        color: "ROSE",
        targetDate: "2026-08-31",
      })
    );

    expect(res.status).toBe(201);
    const createData = createSpy.mock.calls[0][0].data;
    expect(createData).toMatchObject({
      userId: 1,
      title: "Master Physics",
      description: "Paper 4",
      effortLevel: "INTENSE",
      color: "ROSE",
      targetDate: new Date("2026-08-31T00:00:00.000Z"),
    });
    // Legacy field stays in sync with the exact deadline (derived, never 0)
    expect(createData.targetWeeks).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/goals defaults the accent to EMERALD when omitted", async () => {
    const createSpy = vi.spyOn(prisma.goal, "create").mockResolvedValue({ id: 2 } as any);
    vi.spyOn(prisma.systemMessage, "create").mockResolvedValue({} as any);

    const res = await POST(
      authedJsonRequest("http://localhost/api/goals", "POST", {
        title: "Legacy Goal",
        targetWeeks: 2,
      })
    );

    expect(res.status).toBe(201);
    expect(createSpy.mock.calls[0][0].data.color).toBe("EMERALD");
  });

  it("PATCH /api/goals/[id] stores targetDate as UTC midnight and derives weeks", async () => {
    // The Planner's guards read the same table the route does, asking a different
    // question: "is this goal linked to a planner plan or a planner Quest?" These
    // fixtures are not, so that read answers null while the route's own existence
    // check still finds the goal. With Planner Modes now permanently available, the
    // guard always runs, so a double that ignored it would be modelling a world where
    // plan-linked goals can be edited behind the planner's back.
    vi
      .spyOn(prisma.goal, "findFirst")
      .mockImplementation((async (args: { where?: { OR?: unknown } }) =>
        args?.where?.OR ? null : { id: 5, userId: 1, title: "Physics" }) as never);
    const updateSpy = vi.spyOn(prisma.goal, "update").mockResolvedValue({ id: 5 } as any);

    const res = await PATCH(
      authedJsonRequest("http://localhost/api/goals/5", "PATCH", {
        targetDate: "2026-08-31",
        color: "AMBER",
      }),
      { params: Promise.resolve({ id: "5" }) }
    );

    expect(res.status).toBe(200);
    const data = updateSpy.mock.calls[0][0].data;
    expect(data.targetDate).toEqual(new Date("2026-08-31T00:00:00.000Z"));
    expect(data.color).toBe("AMBER");
    expect(data.targetWeeks).toBeGreaterThanOrEqual(1);
  });

  it("PATCH /api/goals/[id] clears the deadline on null targetDate", async () => {
    vi
      .spyOn(prisma.goal, "findFirst")
      .mockImplementation((async (args: { where?: { OR?: unknown } }) =>
        args?.where?.OR ? null : { id: 5, userId: 1, title: "Physics" }) as never);

    const updateSpy = vi.spyOn(prisma.goal, "update").mockResolvedValue({ id: 5 } as any);

    const res = await PATCH(
      authedJsonRequest("http://localhost/api/goals/5", "PATCH", { targetDate: null }),
      { params: Promise.resolve({ id: "5" }) }
    );

    expect(res.status).toBe(200);
    expect(updateSpy.mock.calls[0][0].data.targetDate).toBeNull();
  });

  it("PATCH /api/goals/[id] rejects malformed target dates", async () => {
    vi
      .spyOn(prisma.goal, "findFirst")
      .mockImplementation((async (args: { where?: { OR?: unknown } }) =>
        args?.where?.OR ? null : { id: 5, userId: 1, title: "Physics" }) as never);


    const res = await PATCH(
      authedJsonRequest("http://localhost/api/goals/5", "PATCH", { targetDate: "31/08/2026" }),
      { params: Promise.resolve({ id: "5" }) }
    );

    expect(res.status).toBe(400);
  });

  it("PATCH /api/goals/[id] rejects unknown color tokens", async () => {
    vi
      .spyOn(prisma.goal, "findFirst")
      .mockImplementation((async (args: { where?: { OR?: unknown } }) =>
        args?.where?.OR ? null : { id: 5, userId: 1, title: "Physics" }) as never);


    const res = await PATCH(
      authedJsonRequest("http://localhost/api/goals/5", "PATCH", { color: "NEON_PINK" }),
      { params: Promise.resolve({ id: "5" }) }
    );

    expect(res.status).toBe(400);
  });
});
