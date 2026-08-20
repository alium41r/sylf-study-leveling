import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * POST /api/user/heartbeat
 * Updates the user's lastSeenAt to now. Called every 60s by the frontend.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: payload.userId as number },
      data: { lastSeenAt: new Date() },
    });

    // Lazily evaluate day transition penalty
    try {
      const { HpPenaltyService } = await import("@/lib/hp-penalty-service");
      await HpPenaltyService.reconcileDailyHpPenalty(payload.userId as number);
    } catch {
      // Non-critical background task
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
