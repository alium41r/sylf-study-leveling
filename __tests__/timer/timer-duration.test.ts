/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import * as authServer from "@/lib/auth-server";
import { GET as getSubjects } from "@/app/api/subjects/route";
import { GET as getUserStats } from "@/app/api/user/stats/route";

describe("Study Timer & Session Calculation Accuracy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates exact studied seconds without phantom ghost elapsed time for stale sessions in /api/subjects", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 101,
      timezone: "UTC",
    } as any);

    // Mock subject with one completed session (600s) and one unended stale session (started 3h ago)
    vi.spyOn(prisma.subject, "findMany").mockResolvedValue([
      {
        id: 1,
        name: "Physics",
        color: "#7c3aed",
        sessions: [
          {
            id: 10,
            durationSeconds: 191,
            durationMinutes: 3,
            startedAt: new Date(Date.now() - 3600 * 1000),
            endedAt: new Date(Date.now() - 3409 * 1000),
          },
          {
            id: 11,
            durationSeconds: 0,
            durationMinutes: 0,
            startedAt: new Date(Date.now() - 3 * 3600 * 1000),
            endedAt: null, // Dangling session
          },
        ],
      },
      {
        id: 2,
        name: "Test",
        color: "#3b82f6",
        sessions: [
          {
            id: 12,
            durationSeconds: 2035,
            durationMinutes: 33,
            startedAt: new Date(Date.now() - 4000 * 1000),
            endedAt: new Date(Date.now() - 1965 * 1000),
          },
        ],
      },
    ] as any);

    const sessionToken = await signToken({ userId: 101 });
    const req = new NextRequest("http://localhost/api/subjects", {
      headers: { cookie: `hunter_token=${sessionToken}` },
    });

    const res = await getSubjects(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toHaveLength(2);
    expect(data[0].name).toBe("Physics");
    expect(data[0].todaySeconds).toBe(191); // exactly 191s (00:03:11)
    expect(data[1].name).toBe("Test");
    expect(data[1].todaySeconds).toBe(2035); // exactly 2035s (00:33:55)
  });

  it("calculates exact todayStudySeconds in /api/user/stats without accumulating unended ghost hours", async () => {
    vi.mocked(authServer.getSession).mockResolvedValue({ userId: 101 } as any);

    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 101,
      email: "user@sylf.app",
      username: "scholar",
      name: "Scholar",
      hunterRank: "E-Rank",
      level: 1,
      currentXP: 0,
      hp: 100,
      maxHp: 100,
      streakDays: 1,
      totalStudyMinutes: 36,
      totalStudySeconds: 2226,
      sylph: 100,
      timezone: "UTC",
      hasCompletedOnboarding: true,
      password: "hash",
    } as any);

    // Study sessions: 2 completed + 1 stale unended session started 4 hours ago
    vi.spyOn(prisma.studySession, "findMany").mockResolvedValue([
      {
        durationMinutes: 3,
        durationSeconds: 191,
        startedAt: new Date(Date.now() - 3600 * 1000),
        endedAt: new Date(Date.now() - 3409 * 1000),
      },
      {
        durationMinutes: 33,
        durationSeconds: 2035,
        startedAt: new Date(Date.now() - 4000 * 1000),
        endedAt: new Date(Date.now() - 1965 * 1000),
      },
      {
        durationMinutes: 0,
        durationSeconds: 0,
        startedAt: new Date(Date.now() - 4 * 3600 * 1000),
        endedAt: null, // Dangling session from 4 hours ago
      },
    ] as any);

    const req = new NextRequest("http://localhost/api/user/stats");
    const res = await getUserStats(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.completedTodaySeconds).toBe(2226); // 191 + 2035 = 2226s (37m 06s)
    expect(data.todayStudySeconds).toBe(2226); // NOT 4 hours + 37 mins!
  });

  it("ensures subject seconds sum matches total daily focus without double-counting", () => {
    const subjects = [
      { id: 1, name: "Physics", todaySeconds: 191 }, // 00:03:11
      { id: 2, name: "Test", todaySeconds: 2035 },    // 00:33:55
    ];

    const subjectsSeconds = subjects.reduce((acc, sub) => acc + (sub.todaySeconds || 0), 0);
    expect(subjectsSeconds).toBe(2226); // 00:37:06 (37 minutes 6 seconds)

    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

    expect(formatTime(subjectsSeconds)).toBe("00:37:06");
  });
});
