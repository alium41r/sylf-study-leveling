import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { TimezoneService } from "@/lib/timezone-service";
import { getUserTimezone } from "@/lib/timezone-server";

/**
 * GET /api/user/earned-this-week
 * What the ledgers credited since Monday in the student's own timezone. A read of the ledgers and nothing else: both sums use their
 * (userId, createdAt) index, so this costs the same at any history size. Spending is not subtracted, because this says what was earned.
 */
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const timezone = await getUserTimezone(session.userId);
    const today = TimezoneService.getUserLocalDate(timezone);
    const sinceMonday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
    const weekStart = TimezoneService.getStartOfLocalDateUTC(timezone, TimezoneService.getUserLocalDateOffset(timezone, -sinceMonday));
    const where = { userId: session.userId, createdAt: { gte: weekStart }, amount: { gt: 0 } };
    const [xp, sylph] = await Promise.all([prisma.xpLedger.aggregate({ where, _sum: { amount: true } }), prisma.sylphLedger.aggregate({ where, _sum: { amount: true } })]);
    return NextResponse.json({ xp: xp._sum.amount ?? 0, sylph: sylph._sum.amount ?? 0, weekStart: weekStart.toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/user/earned-this-week error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
