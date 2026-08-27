import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

// ────────────────────────────────────────────────────────────────
// Process-level throttle for the lazy daily HP penalty evaluation.
// The heartbeat fires every 60s per connected user; running the full
// reconciliation (user read + possibly session reads + writes) on every
// beat is wasteful. It only ever changes once per local day, so at most
// one evaluation per user per 12h (per server process) is plenty —
// login and calendar views still trigger it independently.
// ────────────────────────────────────────────────────────────────
const lastPenaltyRunAt = new Map<number, number>();
const PENALTY_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

function shouldRunPenalty(userId: number): boolean {
  const now = Date.now();
  const last = lastPenaltyRunAt.get(userId) ?? 0;
  if (now - last < PENALTY_MIN_INTERVAL_MS) return false;
  lastPenaltyRunAt.set(userId, now);
  // Bound the map so long-lived server processes never leak memory.
  if (lastPenaltyRunAt.size > 2000) {
    const cutoff = now - PENALTY_MIN_INTERVAL_MS;
    for (const [key, value] of lastPenaltyRunAt) {
      if (value < cutoff) lastPenaltyRunAt.delete(key);
    }
  }
  return true;
}

/**
 * POST /api/user/heartbeat
 * Updates the user's lastSeenAt to now. Called every 60s by the frontend.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: payload.userId as number },
      data: { lastSeenAt: new Date() },
    });

    // Lazily evaluate day transition penalty (throttled per process)
    if (shouldRunPenalty(payload.userId as number)) {
      try {
        const { HpPenaltyService } = await import("@/lib/hp-penalty-service");
        await HpPenaltyService.reconcileDailyHpPenalty(payload.userId as number);
      } catch {
        // Non-critical background task
      }
    }

    return NextResponse.json({ ok: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
