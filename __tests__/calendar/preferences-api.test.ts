import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/calendar/preferences/route";
import { POST as reminders } from "@/app/api/calendar/reminders/route";
import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { deliverCalendarReminders } from "@/lib/calendar/reminder-service";
import { defaultCalendarPreferences } from "@/lib/calendar/preferences";
vi.mock("@/lib/auth-server", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/calendar/reminder-service", () => ({
  deliverCalendarReminders: vi.fn(),
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    calendarPreference: {
      findUnique: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    prisma: { ...tx, $transaction: (fn: (db: typeof tx) => unknown) => fn(tx) },
  };
});
const req = (
  method: string,
  body?: unknown,
  headers?: Record<string, string>
) =>
  new NextRequest("http://localhost/api/calendar/preferences", {
    method,
    headers,
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: 7 });
});
describe("account calendar preferences and reminder authorization", () => {
  it("requires a checked session for every endpoint and refuses cross-site mutations", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    expect((await GET(req("GET"))).status).toBe(401);
    vi.mocked(getSession).mockResolvedValueOnce(null);
    expect((await reminders(req("POST"))).status).toBe(401);
    expect(
      (await PATCH(req("PATCH", {}, { "sec-fetch-site": "cross-site" }))).status
    ).toBe(403);
    expect(
      (await reminders(req("POST", {}, { "sec-fetch-site": "cross-site" })))
        .status
    ).toBe(403);
    expect(deliverCalendarReminders).not.toHaveBeenCalled();
  });
  it("returns simple defaults without creating a row and persists an explicit independently enabled feature", async () => {
    vi.mocked(prisma.calendarPreference.findUnique).mockResolvedValue(null);
    const response = await GET(req("GET"));
    expect(await response.json()).toEqual({
      settings: defaultCalendarPreferences,
      revision: 0,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(prisma.calendarPreference.createMany).not.toHaveBeenCalled();
    vi.mocked(prisma.calendarPreference.createMany).mockResolvedValue({
      count: 1,
    });
    const saved = await PATCH(
      req("PATCH", { revision: 0, patch: { timePlanning: true } })
    );
    expect((await saved.json()).settings).toMatchObject({
      timePlanning: true,
      workload: false,
    });
    expect(prisma.calendarPreference.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 7,
          settings: { ...defaultCalendarPreferences, timePlanning: true },
        },
      ],
      skipDuplicates: true,
    });
  });
  it("rejects injected ownership, invalid JSON, oversize payloads, and stale revisions", async () => {
    expect(
      (await PATCH(req("PATCH", { revision: 0, userId: 8, patch: {} }))).status
    ).toBe(400);
    expect((await PATCH(req("PATCH", "{"))).status).toBe(400);
    expect((await PATCH(req("PATCH", "x".repeat(6000)))).status).toBe(413);
    vi.mocked(prisma.calendarPreference.findUnique).mockResolvedValue({
      userId: 7,
      settings: defaultCalendarPreferences,
      revision: 2,
    });
    vi.mocked(prisma.calendarPreference.updateMany).mockResolvedValue({
      count: 0,
    });
    expect(
      (
        await PATCH(
          req("PATCH", { revision: 1, patch: { timePlanning: true } })
        )
      ).status
    ).toBe(409);
    expect(prisma.calendarPreference.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, revision: 1 },
      data: {
        settings: { ...defaultCalendarPreferences, timePlanning: true },
        revision: { increment: 1 },
      },
    });
  });
  it("uses the session owner for delivery and returns a retryable failure", async () => {
    vi.mocked(deliverCalendarReminders).mockResolvedValueOnce({
      reminders: [],
    });
    expect((await reminders(req("POST"))).status).toBe(200);
    expect(deliverCalendarReminders).toHaveBeenCalledWith(7);
    vi.mocked(deliverCalendarReminders).mockRejectedValueOnce(
      new Error("Database offline")
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await reminders(req("POST"))).status).toBe(503);
    log.mockRestore();
  });
});
