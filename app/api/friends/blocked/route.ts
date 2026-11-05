import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/friends/blocked
 * The people the caller has blocked, newest first, with only the fields needed to recognise them and undo it.
 * A block placed against the caller by someone else is never listed: that is the other person's to know.
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const rows = await prisma.blockedUser.findMany({
      where: { userId: payload.userId as number },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { blockedId: true, createdAt: true, blocked: { select: { username: true, name: true } } },
    });
    return NextResponse.json({
      blocked: rows.map((row) => ({ id: row.blockedId, username: row.blocked.username, name: row.blocked.name, blockedAt: row.createdAt.toISOString() })),
    });
  } catch (error) {
    console.error("GET /api/friends/blocked error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
