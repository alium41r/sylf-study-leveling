import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { TimezoneService } from "@/lib/timezone-service";

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
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone || "UTC";
    const todayStart = TimezoneService.getStartOfDayUTC(timezone);

    // Get all friendships where user is either side
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userId }, { friendId: userId }],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            hunterRank: true,
            level: true,
            totalStudyMinutes: true,
            totalStudySeconds: true,
            lastSeenAt: true,
            avatarUrl: true,
            activeAvatar: true,
            activeFrame: true,
            activeTitle: true,
            activeAura: true,
            characterConfig: true,
            sessions: {
              where: { startedAt: { gte: todayStart } },
              select: {
                durationMinutes: true,
                durationSeconds: true,
                startedAt: true,
                endedAt: true,
              },
            },
          },
        },
        friend: {
          select: {
            id: true,
            name: true,
            username: true,
            hunterRank: true,
            level: true,
            totalStudyMinutes: true,
            totalStudySeconds: true,
            lastSeenAt: true,
            avatarUrl: true,
            activeAvatar: true,
            activeFrame: true,
            activeTitle: true,
            activeAura: true,
            characterConfig: true,
            sessions: {
              where: { startedAt: { gte: todayStart } },
              select: {
                durationMinutes: true,
                durationSeconds: true,
                startedAt: true,
                endedAt: true,
              },
            },
          },
        },
      },
    });

    const now = new Date();
    const activeThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 min for active heartbeat

    // Fetch blocked users to exclude
    const blockedRows = await prisma.$queryRaw<Array<{ blockedId: number; userId: number }>>`
      SELECT "blockedId", "userId" FROM "BlockedUser"
      WHERE "userId" = ${userId} OR "blockedId" = ${userId}
    `.catch(() => []);
    const blockedUserIds = new Set(
      blockedRows.flatMap((r) => [r.blockedId, r.userId]).filter((id) => id !== userId)
    );

    const friends = friendships
      .filter((f: any) => {
        const otherId = f.userId === userId ? f.friendId : f.userId;
        return !blockedUserIds.has(otherId);
      })
      .map((f: any) => {
      const friendData = f.userId === userId ? f.friend : f.user;
      
      // Calculate today's completed study seconds & find active session
      let todaySeconds = 0;
      let completedTodaySeconds = 0;
      let activeSession: any = null;

      for (const s of friendData.sessions) {
        if (!s.endedAt) {
          // Check if session started within reasonable time (e.g. 12 hours)
          const started = new Date(s.startedAt);
          const elapsed = Math.floor((now.getTime() - started.getTime()) / 1000);
          if (elapsed >= 0 && elapsed < 12 * 3600) {
            activeSession = s;
            todaySeconds += elapsed;
          }
        } else {
          const sec = (s.durationSeconds || (s.durationMinutes * 60) || 0);
          completedTodaySeconds += sec;
          todaySeconds += sec;
        }
      }

      const todayMinutes = Math.floor(todaySeconds / 60);
      const isOnline = friendData.lastSeenAt ? friendData.lastSeenAt >= twoMinAgo : false;
      const isStudying = Boolean(activeSession) || (isOnline && (friendData.sessions.some((s: any) => !s.endedAt)));

      return {
        friendshipId: f.id,
        id: friendData.id,
        name: friendData.name,
        username: friendData.username,
        hunterRank: friendData.hunterRank,
        level: friendData.level,
        totalStudyMinutes: friendData.totalStudyMinutes,
        totalStudySeconds: friendData.totalStudySeconds || (friendData.totalStudyMinutes * 60),
        todayMinutes,
        todaySeconds,
        completedTodaySeconds,
        isOnline,
        isStudying,
        activeSessionStartedAt: activeSession ? activeSession.startedAt.toISOString() : null,
        avatarUrl: friendData.avatarUrl,
        activeAvatar: friendData.activeAvatar || "class_scholar",
        activeFrame: friendData.activeFrame || "none",
        activeTitle: friendData.activeTitle || "title_novice",
        activeAura: friendData.activeAura || "none",
        characterConfig: friendData.characterConfig || null,
        lastSeenAt: friendData.lastSeenAt,
      };
    });

    // Sort: Currently studying first, then online, then highest study duration today, then name
    friends.sort((a, b) => {
      if (a.isStudying && !b.isStudying) return -1;
      if (!a.isStudying && b.isStudying) return 1;
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      if (b.todaySeconds !== a.todaySeconds) return b.todaySeconds - a.todaySeconds;
      return (a.name || a.username).localeCompare(b.name || b.username);
    });

    return NextResponse.json(friends);
  } catch (error) {
    console.error("GET friends error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
