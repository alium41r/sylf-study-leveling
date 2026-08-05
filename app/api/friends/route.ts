import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/friends
 * Returns all friends of the authenticated user with online status and today's study time.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);

    // Get all friendships where user is either side
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userId }, { friendId: userId }],
      },
      include: {
        user: {
          select: {
            id: true, name: true, username: true, hunterRank: true,
            level: true, totalStudyMinutes: true, lastSeenAt: true,
            sessions: {
              where: { startedAt: { gte: todayStart } },
              select: { durationMinutes: true },
            },
          },
        },
        friend: {
          select: {
            id: true, name: true, username: true, hunterRank: true,
            level: true, totalStudyMinutes: true, lastSeenAt: true,
            sessions: {
              where: { startedAt: { gte: todayStart } },
              select: { durationMinutes: true },
            },
          },
        },
      },
    });

    const friends = friendships.map((f) => {
      const friendData = f.userId === userId ? f.friend : f.user;
      const todayMinutes = friendData.sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
      const isOnline = friendData.lastSeenAt ? friendData.lastSeenAt >= twoMinAgo : false;

      return {
        friendshipId: f.id,
        id: friendData.id,
        name: friendData.name,
        username: friendData.username,
        hunterRank: friendData.hunterRank,
        level: friendData.level,
        totalStudyMinutes: friendData.totalStudyMinutes,
        todayMinutes,
        isOnline,
        lastSeenAt: friendData.lastSeenAt,
      };
    });

    // Sort: online first, then by name
    friends.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

    return NextResponse.json(friends);
  } catch (error) {
    console.error("GET friends error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
