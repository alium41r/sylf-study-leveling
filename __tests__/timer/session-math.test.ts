import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import * as auth from "@/lib/auth";
import { PATCH as patchSession, POST as startSession } from "@/app/api/sessions/route";
import {
  clampSessionSeconds,
  clampSessionBreakSeconds,
  sessionDeltaSeconds,
  sessionMultiplierForSeconds,
  streakMultiplierForWeeks,
  canonicalSessionRewards,
  SESSION_GRACE_SECONDS,
} from "@/lib/session-math";

// Route tests exercise transport only. Durable settlement and weekly atomicity
// run against real PostgreSQL in the required Phase 1 suite.
vi.mock("@/lib/planner/v2/server/web", () => ({
  durablePlanner: () => ({ sessions: {
    settleLegacy: async (ownerId: number, request: { id: number; focus: number; breaks: number; questId?: number; complete: boolean; final: boolean }) => {
      const result = await prisma.$queryRaw<Array<{ settle_study_session_atomic: Record<string, unknown> }>>`
        SELECT public.settle_study_session_atomic(${ownerId},${request.id},${request.focus},${request.breaks},${request.questId ?? null},${null},${request.complete},${request.final},${new Date().toISOString().slice(0, 10)}) AS settle_study_session_atomic
      `;
      return { ...result[0].settle_study_session_atomic, weeklyAwarded: false };
    },
  } }),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  verifyToken: vi.fn(),
  signToken: vi.fn().mockResolvedValue("mock-jwt-token"),
}));

/* ═══════════════════════════════════════════════════════════
   Core Invariant 1 — Exact Time Parity (seconds in == seconds out)
   ═══════════════════════════════════════════════════════════ */
describe("Session Duration Math — exact time parity", () => {
  it("clamps claimed duration against wall-clock elapsed + grace window", () => {
    const now = 1_000_000_000_000; // fixed server now

    // Claimed 2 hours, but the session started 10 minutes ago → 660s max
    const started10m = now - 10 * 60_000;
    expect(clampSessionSeconds(7200, started10m, now)).toBe(600 + SESSION_GRACE_SECONDS);

    // Claimed 1 hour, started 20 minutes ago → 1200 + 60 = 1260s
    const started20m = now - 20 * 60_000;
    expect(clampSessionSeconds(3600, started20m, now)).toBe(1260);

    // Honest claim stays untouched
    expect(clampSessionSeconds(120, now - 300_000, now)).toBe(120);

    // Negative / garbage claims floor at 0
    expect(clampSessionSeconds(-500, now - 60_000, now)).toBe(0);
  });

  it("credits repeated cumulative flushes as exact deltas (no inflation)", () => {
    // A 3-hour session flushed every 180s (like the live client) sends
    // cumulative durations: 180, 360, 540, ... 10800.
    let previous = 0;
    let credited = 0;
    for (let cum = 180; cum <= 10800; cum += 180) {
      const delta = sessionDeltaSeconds(previous, cum);
      credited += delta;
      previous = cum;
    }
    expect(credited).toBe(10800); // 3 hours exactly — NOT 91 hours
    expect(previous).toBe(10800);
  });

  it("a 120-second session records exactly 120 seconds and 2 minutes", () => {
    expect(sessionDeltaSeconds(0, 120)).toBe(120);
    expect(Math.floor(clampSessionSeconds(120, Date.now() - 130_000) / 60)).toBe(2);
  });

  it("clamps break time so focus + break never exceed the wall-clock window", () => {
    const now = 1_000_000_000_000; // fixed server now
    const started5hAgo = now - 5 * 3_600_000; // 12pm → 5pm window

    // Honest 3h focus + 2h break inside a 5h window → break passes untouched.
    expect(clampSessionBreakSeconds(7200, started5hAgo, 10800, now)).toBe(7200);

    // Spoofed 20h break on a 5h session with 3h focus →
    // budget = 5h + grace − 3h focus = 7260s.
    expect(clampSessionBreakSeconds(72000, started5hAgo, 10800, now)).toBe(7200 + SESSION_GRACE_SECONDS);

    // Garbage / negative claims floor at 0.
    expect(clampSessionBreakSeconds(-5, started5hAgo, 10800, now)).toBe(0);

    // Break beyond the wall-clock window with no grace room → capped at 0.
    const started10m = now - 10 * 60_000;
    expect(clampSessionBreakSeconds(600, started10m, 600 + SESSION_GRACE_SECONDS, now)).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════
   Core Invariant 2 — Canonical Reward Parity
   XP = floor(5 × minutes × xpMultiplier)
   Sylph = max(5, floor(0.5 × minutes × sylphMultiplier))
   ═══════════════════════════════════════════════════════════ */
describe("Canonical Session Rewards", () => {
  it("120s (2 min) session → exactly 2-minute XP and minimum Sylph", () => {
    const r = canonicalSessionRewards(120, 0);
    expect(r.minutes).toBe(2);
    expect(r.xp).toBe(Math.floor(5 * 2 * 1.0)); // 10 XP
    expect(r.sylph).toBe(Math.max(5, Math.floor(0.5 * 2 * 1.0))); // 5 Sylph
  });

  it("3-hour session → canonical single-shot payout from FULL duration", () => {
    const r = canonicalSessionRewards(10800, 0); // 180 minutes
    expect(r.sessionMultiplier).toBe(1.3);
    expect(r.xp).toBe(Math.floor(5 * 180 * 1.3)); // 1170 XP — not per-flush repeats
    expect(r.sylph).toBe(Math.floor(0.5 * 180 * 1.0)); // 90 Sylph
  });

  it("30-minute session applies the 1.1x multiplier", () => {
    const r = canonicalSessionRewards(1800, 0);
    expect(r.sessionMultiplier).toBe(1.1);
    expect(r.xp).toBe(Math.floor(5 * 30 * 1.1)); // 165 XP
    expect(r.sylph).toBe(15); // 0.5 × 30
  });

  it("applies the weekly-streak sylphMultiplier ladder", () => {
    expect(streakMultiplierForWeeks(0)).toBe(1.0);
    expect(streakMultiplierForWeeks(1)).toBe(1.05);
    expect(streakMultiplierForWeeks(2)).toBe(1.15);
    expect(streakMultiplierForWeeks(4)).toBe(1.3);
    expect(streakMultiplierForWeeks(8)).toBe(1.5);
    // 180 min at 8-week streak: floor(0.5 × 180 × 1.5) = 135
    expect(canonicalSessionRewards(10800, 8).sylph).toBe(135);
  });

  it("sessions under 60 seconds award nothing", () => {
    const r = canonicalSessionRewards(59, 8);
    expect(r.xp).toBe(0);
    expect(r.sylph).toBe(0);
  });

  it("multiplier ladder boundaries are exact", () => {
    expect(sessionMultiplierForSeconds(1799)).toBe(1.0);
    expect(sessionMultiplierForSeconds(1800)).toBe(1.1); // 30m
    expect(sessionMultiplierForSeconds(3599)).toBe(1.1);
    expect(sessionMultiplierForSeconds(3600)).toBe(1.2); // 60m
    expect(sessionMultiplierForSeconds(7199)).toBe(1.2);
    expect(sessionMultiplierForSeconds(7200)).toBe(1.3); // 120m
  });
});

/* ═══════════════════════════════════════════════════════════
   Route-level — unified atomic settlement + final-flag plumbed to RPC
   (wall-clock clamping now lives inside settle_study_session_atomic)
   ═══════════════════════════════════════════════════════════ */
describe("PATCH /api/sessions — unified settle pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.verifyToken).mockResolvedValue({ userId: 1 } as any);
  });

  function authedPatch(body: unknown) {
    return new NextRequest("http://localhost/api/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify(body),
    });
  }

  function settleMock(final: boolean, durationSeconds: number) {
    return [
      {
        settle_study_session_atomic: {
          success: true,
          sessionId: 5,
          isFinal: final,
          alreadyClaimed: false,
          durationSeconds,
          breakSeconds: 0,
          deltaSeconds: durationSeconds,
          awarded: final && durationSeconds >= 60,
          xpGained: 0,
          sylphGained: 0,
          totalSylphEarned: 0,
          questCompleted: false,
          questXp: 0,
          questSylph: 0,
          hpHealed: 0,
          level: 1,
          currentXP: 0,
          xpToNextLevel: 282,
          hunterRank: "E",
          levelsGained: 0,
          didRankUp: false,
          nodeProgress: null,
          masteryGranted: false,
        },
      },
    ];
  }

  it("passes the claimed duration and final=true to the unified settle RPC", async () => {
    const rpcSpy = vi
      .spyOn(prisma, "$queryRaw")
      .mockResolvedValue(settleMock(true, 7200) as any);

    // Weekly-milestone dependencies (aggregate < 180 min → no streak write)
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 1,
      timezone: "UTC",
      lastActiveDate: "2026-W01",
      streakDays: 0,
      level: 1,
    } as any);
    vi.spyOn(prisma.studySession, "aggregate").mockResolvedValue({
      _sum: { durationMinutes: 10 },
    } as any);

    // Client claims 2 hours (7200s) — the route no longer pre-clamps; the
    // wall-clock clamp runs inside the RPC against the locked session row.
    const res = await patchSession(
      authedPatch({ id: 5, durationMinutes: 120, durationSeconds: 7200, final: true })
    );

    expect(res.status).toBe(200);

    // Template-literal call: (strings, userId, id, seconds, breakSeconds,
    // questId, subjectId, completeQuest, final, userLocalDate)
    const args = rpcSpy.mock.calls[0] as unknown[];
    expect(args[1]).toBe(1); // userId
    expect(args[2]).toBe(5); // sessionId
    expect(args[3]).toBe(7200); // claimed seconds (RPC clamps internally)
    expect(args[4]).toBe(0); // breakSeconds (no breaks on this flush)
    expect(args[5]).toBe(null); // questId
    expect(args[6]).toBe(null); // subjectId (session row already owns it)
    expect(args[7]).toBe(false); // completeQuest
    expect(args[8]).toBe(true); // final flag → single canonical award point
    expect(args[9]).toEqual(expect.any(String)); // user-local date

    const data = await res.json();
    expect(data.questCompletedNow).toBe(false);
  });

  it("marks non-final checkpoint flushes with final=false", async () => {
    const rpcSpy = vi
      .spyOn(prisma, "$queryRaw")
      .mockResolvedValue(settleMock(false, 180) as any);

    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 1,
      timezone: "UTC",
      lastActiveDate: "2026-W01",
      streakDays: 0,
      level: 1,
    } as any);
    vi.spyOn(prisma.studySession, "aggregate").mockResolvedValue({
      _sum: { durationMinutes: 3 },
    } as any);

    const res = await patchSession(
      authedPatch({ id: 5, durationMinutes: 3, durationSeconds: 180 })
    );

    expect(res.status).toBe(200);
    const args = rpcSpy.mock.calls[0] as unknown[];
    expect(args[3]).toBe(180);
    expect(args[8]).toBe(false); // auto-save flush: no reward award, no endedAt
  });
});

/* ═══════════════════════════════════════════════════════════
   POST /api/sessions — validation & start-RPC plumbing (T3)
   ═══════════════════════════════════════════════════════════ */
describe("POST /api/sessions — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.verifyToken).mockResolvedValue({ userId: 1 } as any);
  });

  function authedPost(body: unknown) {
    return new NextRequest("http://localhost/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify(body),
    });
  }

  it("returns 400 for invalid initialSeconds", async () => {
    const res = await startSession(authedPost({ initialSeconds: -5 }));
    expect(res.status).toBe(400);
  });

  it("returns 401 without a token", async () => {
    const res = await startSession(
      new NextRequest("http://localhost/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(401);
  });

  it("passes subjectId and initialSeconds through to the start RPC", async () => {
    const rpcSpy = vi.spyOn(prisma, "$queryRaw").mockResolvedValue([
      {
        start_study_session: {
          id: 77,
          userId: 1,
          questId: null,
          subjectId: 3,
          durationMinutes: 0,
          durationSeconds: 0,
          focusRate: 80,
          startedAt: "2026-08-26T00:00:00.000Z",
        },
      },
    ] as any);

    const res = await startSession(authedPost({ subjectId: 3, initialSeconds: 900 }));
    expect(res.status).toBe(201);
    const args = rpcSpy.mock.calls[0] as unknown[];
    expect(args[1]).toBe(1); // userId
    expect(args[2]).toBe(null); // questId
    expect(args[3]).toBe(3); // subjectId
    expect(args[4]).toBe(900); // initialSeconds (bounded server-side by the RPC)
  });
});
