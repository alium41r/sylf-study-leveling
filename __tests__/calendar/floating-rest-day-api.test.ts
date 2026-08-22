import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../lib/prisma";
import * as auth from "../../lib/auth";
import { StudyScheduleService } from "../../lib/study-schedule-service";
import { POST as toggleFloatingRest, GET as getFloatingRestStatus } from "../../app/api/user/study-schedule/floating-rest-day/route";
import { POST as createQuest } from "../../app/api/quests/route";
import { PATCH as updateQuest } from "../../app/api/quests/[id]/route";

vi.mock("../../lib/auth", () => ({
  getSession: vi.fn(),
  verifyToken: vi.fn(),
}));

vi.mock("../../lib/timezone-server", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("UTC"),
}));

const authedJson = (url: string, method: string, body: unknown) =>
  new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
    body: JSON.stringify(body),
  });

describe("Floating Rest Day Toggle API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.getSession).mockResolvedValue({ userId: 1 } as any);
    vi.mocked(auth.verifyToken).mockResolvedValue({ userId: 1 } as any);
  });

  it("GET returns live status for a date", async () => {
    vi.spyOn(StudyScheduleService, "getFloatingRestDayStatus").mockResolvedValue({
      dateKey: "2026-08-25",
      isFloatingRest: false,
      isFixedRest: false,
      weekKey: "2026-W35",
      weekUsage: 0,
      weekQuota: 1,
      canAdd: true,
    });

    const res = await getFloatingRestStatus(
      new NextRequest("http://localhost/api/user/study-schedule/floating-rest-day?dateKey=2026-08-25")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.canAdd).toBe(true);
    expect(data.weekQuota).toBe(1);
  });

  it("rejects malformed dateKeys", async () => {
    const res = await getFloatingRestStatus(
      new NextRequest("http://localhost/api/user/study-schedule/floating-rest-day?dateKey=25/08/2026")
    );
    expect(res.status).toBe(400);
  });

  it("designates a floating rest day and reports shifted quests", async () => {
    vi.spyOn(StudyScheduleService, "getFloatingRestDayStatus").mockResolvedValue({
      dateKey: "2026-08-25",
      isFloatingRest: false,
      isFixedRest: false,
      weekKey: "2026-W35",
      weekUsage: 0,
      weekQuota: 1,
      canAdd: true,
    });
    vi.spyOn(StudyScheduleService, "cascadeQuestShifts").mockResolvedValue([
      { questId: 11, title: "Past Paper", oldDate: "2026-08-25", newDate: "2026-08-27" },
    ]);

    const tx = { floatingRestDay: { create: vi.fn().mockResolvedValue({ id: 1 }) } };
    vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => cb(tx));

    const res = await toggleFloatingRest(
      authedJson("http://localhost/api/user/study-schedule/floating-rest-day", "POST", {
        dateKey: "2026-08-25",
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe("added");
    expect(data.weekUsage).toBe(1);
    expect(data.shiftedQuests).toHaveLength(1);
    expect(tx.floatingRestDay.create).toHaveBeenCalledWith({
      data: { userId: 1, dateKey: "2026-08-25", weekKey: "2026-W35" },
    });
  });

  it("toggles OFF an existing floating rest day", async () => {
    vi.spyOn(StudyScheduleService, "getFloatingRestDayStatus").mockResolvedValue({
      dateKey: "2026-08-25",
      isFloatingRest: true,
      isFixedRest: false,
      weekKey: "2026-W35",
      weekUsage: 1,
      weekQuota: 1,
      canAdd: false,
    });
    const deleteSpy = vi.spyOn(prisma.floatingRestDay, "delete").mockResolvedValue({ id: 1 } as any);

    const res = await toggleFloatingRest(
      authedJson("http://localhost/api/user/study-schedule/floating-rest-day", "POST", {
        dateKey: "2026-08-25",
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe("removed");
    expect(deleteSpy).toHaveBeenCalledWith({
      where: { userId_dateKey: { userId: 1, dateKey: "2026-08-25" } },
    });
  });

  it("rejects designations exceeding the weekly quota", async () => {
    vi.spyOn(StudyScheduleService, "getFloatingRestDayStatus").mockResolvedValue({
      dateKey: "2026-08-25",
      isFloatingRest: false,
      isFixedRest: false,
      weekKey: "2026-W35",
      weekUsage: 1,
      weekQuota: 1,
      canAdd: false,
    });

    const res = await toggleFloatingRest(
      authedJson("http://localhost/api/user/study-schedule/floating-rest-day", "POST", {
        dateKey: "2026-08-25",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("WEEKLY_REST_DAY_LIMIT_REACHED");
  });

  it("rejects redundant fixed rest day designations", async () => {
    vi.spyOn(StudyScheduleService, "getFloatingRestDayStatus").mockResolvedValue({
      dateKey: "2026-08-23",
      isFloatingRest: false,
      isFixedRest: true, // Sunday is already a fixed rest day
      weekKey: "2026-W34",
      weekUsage: 0,
      weekQuota: 1,
      canAdd: false,
    });

    const res = await toggleFloatingRest(
      authedJson("http://localhost/api/user/study-schedule/floating-rest-day", "POST", {
        dateKey: "2026-08-23",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("FIXED_REST_DAY");
  });
});

describe("Manual Quest Allocation Guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.verifyToken).mockResolvedValue({ userId: 1 } as any);
  });

  it("POST /api/quests rejects scheduling on a floating rest day", async () => {
    vi.spyOn(StudyScheduleService, "isUserRestDay").mockResolvedValue(true);

    const res = await createQuest(
      authedJson("http://localhost/api/quests", "POST", {
        title: "Physics Set B",
        targetMinutes: 60,
        scheduledFor: "2026-08-25",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("REST_DAY_ALLOCATION_PROHIBITED");
  });

  it("POST /api/quests rejects scheduling on a fixed rest day", async () => {
    vi.spyOn(StudyScheduleService, "isUserRestDay").mockResolvedValue(true);

    const res = await createQuest(
      authedJson("http://localhost/api/quests", "POST", {
        title: "Physics Set B",
        targetMinutes: 60,
        scheduledFor: "2026-08-23",
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("REST_DAY_ALLOCATION_PROHIBITED");
  });

  it("PATCH /api/quests/[id] rejects rescheduling onto a rest day", async () => {
    vi.spyOn(prisma.quest, "findFirst").mockResolvedValue({
      id: 5,
      userId: 1,
      status: "PENDING",
    } as any);
    vi.spyOn(StudyScheduleService, "isUserRestDay").mockResolvedValue(true);

    const res = await updateQuest(
      authedJson("http://localhost/api/quests/5", "PATCH", { scheduledFor: "2026-08-25" }),
      { params: Promise.resolve({ id: "5" }) }
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("REST_DAY_ALLOCATION_PROHIBITED");
  });
});
