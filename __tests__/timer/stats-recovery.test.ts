/** @vitest-environment node */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/user/stats/route";
import { prisma } from "@/lib/prisma";
vi.mock("@/lib/auth-server", () => ({ getSession: async () => ({ userId: 7 }) }));
const request = () => new NextRequest("http://localhost/api/user/stats");
beforeEach(() => {
  vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ id: 7, password: "hash", level: 1, timezone: "UTC", hp: 100, maxHp: 100 } as NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>);
});
afterEach(() => vi.restoreAllMocks());
it("keeps accepted time from stale legacy rows and paused timers without marking them as studying", async () => {
  vi.spyOn(prisma.studySession, "findMany").mockResolvedValue([
    { id: 1, durationSeconds: 600, durationMinutes: 10, startedAt: new Date(Date.now() - 13 * 3600_000), endedAt: null, executionState: null },
    { id: 2, durationSeconds: 300, durationMinutes: 5, startedAt: new Date(Date.now() - 1000), endedAt: null, executionState: "PAUSED", subjectId: 4, questId: null },
  ] as Awaited<ReturnType<typeof prisma.studySession.findMany>>);
  const response = await GET(request()); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ todayStudySeconds: 900, completedTodaySeconds: 0, activeSessionStartedAt: null,
    activeSessionId: 2, activeSessionSubjectId: 4, activeSessionStudySeconds: 300 });
});
it("reports a failed timer read as retryable instead of returning falsely empty statistics", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(prisma.studySession, "findMany").mockRejectedValue(new Error("connection interrupted"));
  expect((await GET(request())).status).toBe(500);
});
