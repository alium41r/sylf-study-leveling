import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), settleLegacy: vi.fn(), start: vi.fn(), user: vi.fn(), count: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.query,
  studySession: { count: mocks.count }, user: { findUnique: mocks.user } } }));
vi.mock("@/lib/auth-server", () => ({ getSession: async () => ({ userId: 7 }) }));
vi.mock("@/lib/cache-service", () => ({ invalidateRankingsCache: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/planner/v2/server/web", () => ({ durablePlanner: () => ({ sessions: {
  start: mocks.start, settleLegacy: mocks.settleLegacy,
} }) }));
import { POST, PATCH } from "@/app/api/sessions/route";

beforeEach(() => { vi.resetAllMocks(); mocks.count.mockResolvedValue(0); mocks.user.mockResolvedValue({ username: "student" }); });
const request = (method: string, body: unknown) => new NextRequest("http://localhost/api/sessions", {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
it("starts an owned legacy Quest without requiring the V2 marker column", async () => {
  mocks.query.mockResolvedValueOnce([{ plannedMinutes: null }]).mockResolvedValueOnce([{ start_study_session: { id: 42 } }]);
  const response = await POST(request("POST", { questId: 12 }));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ id: 42 });
  const [sql, ...values] = mocks.query.mock.calls[0];
  expect(sql.join("?")).toContain("to_jsonb(q)->>'plannedMinutes'");
  expect(values).toEqual([12, 7]);
  expect(mocks.start).not.toHaveBeenCalled();
});
it("keeps V2 protocol protection on a marked Quest regardless of admission flags", async () => {
  mocks.query.mockResolvedValue([{ plannedMinutes: 30 }]);
  expect((await POST(request("POST", { questId: 12 }))).status).toBe(409);
  expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(mocks.start).not.toHaveBeenCalled();
  mocks.start.mockResolvedValue({ sessionId: 42, acceptedFocusSeconds: 0, startedAt: "2026-10-07T10:00:00.000Z" });
  expect((await POST(request("POST", { questId: 12, executionProtocol: 2 }))).status).toBe(201);
  expect(mocks.start).toHaveBeenCalledWith(7, 12);
});
it("returns the canonical final settlement without adding a second reward path", async () => {
  mocks.settleLegacy.mockResolvedValue({ id: 42, questCompleted: false, weeklyAwarded: true });
  const response = await PATCH(request("PATCH", { id: 42, durationMinutes: 24, durationSeconds: 1479, breakSeconds: 30, final: true }));
  expect(response.status).toBe(200);
  expect(mocks.settleLegacy).toHaveBeenCalledExactlyOnceWith(7, { id: 42, focus: 1479, breaks: 30, questId: undefined, complete: false, final: true });
  expect(await response.json()).toMatchObject({ weeklyAwarded: true, questCompletedNow: false });
  expect(mocks.query).not.toHaveBeenCalled();
});
it("refuses a queued start after the authenticated account changes", async () => {
  const response = await POST(request("POST", { executionProtocol: 2, expectedOwnerId: 8,
    clientSessionKey: "71c48d7a-882d-4a80-a841-9df01457c091", startedAt: "2026-10-14T09:00:00Z" }));
  expect(response.status).toBe(409); expect(mocks.query).not.toHaveBeenCalled();
});
