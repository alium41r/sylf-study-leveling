import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { TimezoneService } from "@/lib/timezone-service";
import { Prisma } from "@prisma/client";

/**
 * GET /api/friends
 * Returns all friends of the authenticated user with online status and today's study time.
 *
 * Optimized: today's study seconds + active session are computed with two
 * grouped aggregate queries across ALL friends at once, instead of loading
 * every session row per friend through a nested include. Independent reads
 * (user timezone, friendships, blocked rows) run in parallel.
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
    const now = new Date();
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
    const twelveHoursAgo = new Date(Date.now() - 12 * 3600 * 1000);

    const FRIEND_FIELDS = {
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
    } as const;

    // ── Independent reads in parallel ─────────────────────────
    const [user, friendships, blockedRows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      }),
      prisma.friendship.findMany({
        where: {
          OR: [{ userId }, { friendId: userId }],
        },
        include: {
          user: { select: FRIEND_FIELDS },
          friend: { select: FRIEND_FIELDS },
        },
      }),
      prisma.$queryRaw<Array<{ blockedId: number; userId: number }>>`
        SELECT "blockedId", "userId" FROM "BlockedUser"
        WHERE "userId" = ${userId} OR "blockedId" = ${userId}
      `.catch(() => []),
    ]);

    const timezone = user?.timezone || "UTC";
    const todayStart = TimezoneService.getStartOfDayUTC(timezone);

    const blockedUserIds = new Set(
      blockedRows.flatMap((r) => [r.blockedId, r.userId]).filter((id) => id !== userId)
    );

    const friends = friendships.filter((f) => {
      const otherId = f.userId === userId ? f.friendId : f.userId;
      return !blockedUserIds.has(otherId);
    });

    const friendIds = friends.map((f) => (f.userId === userId ? f.friendId : f.userId));

    // ── Aggregate today's study seconds & active sessions for ALL friends in 2 queries ──
    const completedMap = new Map<number, number>();
    const activeSessionMap = new Map<number, Date>();

    if (friendIds.length > 0) {
      const [completedRows, activeRows] = await Promise.all([
        prisma.$queryRaw<Array<{ userId: number; seconds: number }>>`
          SELECT "userId", COALESCE(SUM("durationSeconds"), 0)::int AS seconds
          FROM "StudySession"
          WHERE "userId" IN (${Prisma.join(friendIds)})
            AND "startedAt" >= ${todayStart}
            AND "endedAt" IS NOT NULL
          GROUP BY "userId"
        `.catch(() => []),
        prisma.$queryRaw<Array<{ userId: number; startedAt: Date }>>`
          SELECT "userId", MAX("startedAt") AS "startedAt"
          FROM "StudySession"
          WHERE "userId" IN (${Prisma.join(friendIds)})
            AND "endedAt" IS NULL
          GROUP BY "userId"
        `.catch(() => []),
      ]);

      for (const row of completedRows) {
        completedMap.set(Number(row.userId), Number(row.seconds) || 0);
      }
      for (const row of activeRows) {
        const started = new Date(row.startedAt);
        if (!Number.isNaN(started.getTime())) {
          activeSessionMap.set(Number(row.userId), started);
        }
      }
    }

    const result = friends.map((f) => {
      const friendData = f.userId === userId ? f.friend : f.user;
      const friendId = friendData.id;

      const completedTodaySeconds = completedMap.get(friendId) ?? 0;
      const hasActiveSession = activeSessionMap.has(friendId);
      const activeSessionStarted = activeSessionMap.get(friendId);

      // A session is only considered "currently studying" if it started
      // within the last 12 hours (guards against zombie rows).
      const activeSession =
        hasActiveSession && activeSessionStarted && activeSessionStarted >= twelveHoursAgo
          ? activeSessionStarted
          : null;

      const activeElapsed = activeSession
        ? Math.max(0, Math.floor((now.getTime() - activeSession.getTime()) / 1000))
        : 0;

      const todaySeconds = completedTodaySeconds + activeElapsed;
      const todayMinutes = Math.floor(todaySeconds / 60);
      const isOnline = friendData.lastSeenAt
        ? new Date(friendData.lastSeenAt) >= twoMinAgo
        : false;
      const isStudying = Boolean(activeSession) || (isOnline && hasActiveSession);

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
        activeSessionStartedAt: activeSession ? activeSession.toISOString() : null,
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
    result.sort((a, b) => {
      if (a.isStudying && !b.isStudying) return -1;
      if (!a.isStudying && b.isStudying) return 1;
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      if (b.todaySeconds !== a.todaySeconds) return b.todaySeconds - a.todaySeconds;
      return (a.name || a.username).localeCompare(b.name || b.username);
    });

    // Short-lived private cache: the social page polls every 15s, so letting
    // multiple tabs/windows share a fresh-enough response cuts redundant DB work.
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=8, stale-while-revalidate=10" },
    });
  } catch (error) {
    console.error("GET friends error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
