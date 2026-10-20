/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/calendar/connections/route";
import { POST as notify } from "@/app/api/calendar/connections/notifications/[provider]/route";
import { GET as cron } from "@/app/api/cron/calendar-sync/route";
import { getSession } from "@/lib/auth-server";
const mocks = vi.hoisted(() => ({
  connections: vi.fn(),
  operations: vi.fn(),
  update: vi.fn(),
  notify: vi.fn(),
  run: vi.fn(),
  after: vi.fn(),
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/auth-server", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarConnection: { findMany: mocks.connections },
    externalCalendarMutation: { findMany: mocks.operations },
    connectedCalendar: { updateMany: mocks.update },
  },
}));
vi.mock("@/lib/calendar/external/notifications", () => ({
  receiveCalendarNotification: mocks.notify,
}));
vi.mock("@/lib/calendar/external/worker", () => ({
  runCalendarSyncBatch: mocks.run,
}));
const req = (data: unknown, headers?: Record<string, string>) =>
  new NextRequest("https://calendar.example/api/calendar/connections", {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: 7 });
  mocks.connections.mockResolvedValue([]);
  mocks.operations.mockResolvedValue([]);
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.notify.mockResolvedValue([]);
});
describe("calendar connection route boundaries", () => {
  it("authenticates all account reads and writes and rejects cross-site mutations", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect(
      (
        await GET(
          new NextRequest("https://calendar.example/api/calendar/connections")
        )
      ).status
    ).toBe(401);
    expect((await POST(req({ action: "sync" }))).status).toBe(401);
    vi.mocked(getSession).mockResolvedValue({ userId: 7 });
    expect(
      (await POST(req({ action: "sync" }, { "sec-fetch-site": "cross-site" })))
        .status
    ).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("selects only safe account metadata with owner scope and disables caching", async () => {
    const response = await GET(
      new NextRequest("https://calendar.example/api/calendar/connections")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const query = mocks.connections.mock.calls[0][0];
    expect(query.where).toEqual({ userId: 7 });
    expect(query.select).not.toHaveProperty("credentials");
    expect(JSON.stringify(await response.json())).not.toContain("refreshToken");
  });
  it("rejects injected ownership and applies independent visibility/planning patches only to owned calendars", async () => {
    const id = "548335cf-214b-41d5-a234-58b629929423";
    expect(
      (await POST(req({ action: "calendar", id, userId: 8, visible: false })))
        .status
    ).toBe(400);
    expect(
      (await POST(req({ action: "calendar", id, visible: false }))).status
    ).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id, connection: { userId: 7 } },
      data: { visible: false },
    });
  });
  it("validates Microsoft notification challenges without provider or database calls and ignores forged notices", async () => {
    const response = await notify(
      new NextRequest(
        "https://calendar.example/api/calendar/connections/notifications/microsoft?validationToken=proof",
        { method: "POST" }
      ),
      { params: Promise.resolve({ provider: "microsoft" }) }
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("proof");
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(mocks.notify).not.toHaveBeenCalled();
    await notify(
      new NextRequest(
        "https://calendar.example/api/calendar/connections/notifications/google",
        { method: "POST" }
      ),
      { params: Promise.resolve({ provider: "google" }) }
    );
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("requires the scheduler bearer secret even when a browser session exists", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    expect(
      (
        await cron(
          new NextRequest("https://calendar.example/api/cron/calendar-sync")
        )
      ).status
    ).toBe(401);
    mocks.run.mockResolvedValue({ processed: 2 });
    const response = await cron(
      new NextRequest("https://calendar.example/api/cron/calendar-sync", {
        headers: { Authorization: "Bearer test-cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });
});
