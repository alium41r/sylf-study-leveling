import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { TimezoneService } from "@/lib/timezone-service";
import { isVisible } from "@/lib/privacy";
import { Relationship } from "@/lib/privacy-types";
import { selectedCompanionsForUsers } from "@/lib/pixel-companion-service";

/** Friends still load if study time cannot, and a failure must reach the log: silently it reads as everyone being idle. */
function studyAggregateFailed(error: unknown): never[] {
  console.error("[friends] study aggregate failed:", error);
  return [];
}

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
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
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
      privacy: { select: { showOnlineStatus: true, showCurrentSession: true, showStudyHours: true, showRank: true } },
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
    const todayMap = new Map<number, number>();
    const activeSessionMap = new Map<number, Date>();

    if (friendIds.length > 0) {
      const [completedRows, activeRows] = await Promise.all([
        prisma.$queryRaw<Array<{ userId: number; seconds: number; todaySeconds: number }>>`
          SELECT "userId", COALESCE(SUM(CASE WHEN "endedAt" IS NOT NULL THEN "durationSeconds" ELSE 0 END), 0)::int AS seconds,
            COALESCE(SUM("durationSeconds"), 0)::int AS "todaySeconds"
          FROM "StudySession" AS s
          WHERE "userId" = ANY(${friendIds}::int[])
            AND CASE WHEN to_jsonb(s)->'executionContext'->>'actualCivilDate' IS NOT NULL
              THEN to_jsonb(s)->'executionContext'->>'actualCivilDate' = ${TimezoneService.getUserLocalDate(timezone)}
              ELSE "startedAt" >= ${todayStart} END
          GROUP BY "userId"
        `.catch(studyAggregateFailed),
        prisma.$queryRaw<Array<{ userId: number; startedAt: Date }>>`
          SELECT "userId", MAX("startedAt") AS "startedAt"
          FROM "StudySession" AS s
          WHERE "userId" = ANY(${friendIds}::int[])
            AND "endedAt" IS NULL
            AND (to_jsonb(s)->>'executionState' = 'RUNNING' OR to_jsonb(s)->>'executionState' IS NULL
              AND ("startedAt" >= ${new Date(now.getTime() - 180_000)} OR "durationSeconds" > 0 AND "startedAt" >= ${twelveHoursAgo}))
          GROUP BY "userId"
        `.catch(studyAggregateFailed),
      ]);

      for (const row of completedRows) {
        completedMap.set(Number(row.userId), Number(row.seconds) || 0);
        todayMap.set(Number(row.userId), Number(row.todaySeconds ?? row.seconds) || 0);
      }
      for (const row of activeRows) {
        const started = new Date(row.startedAt);
        if (!Number.isNaN(started.getTime())) {
          activeSessionMap.set(Number(row.userId), started);
        }
      }
    }

    const companions = await selectedCompanionsForUsers(friendIds, userId, "friends");

    const result = friends.map((f) => {
      const friendData = f.userId === userId ? f.friend : f.user;
      const friendId = friendData.id;

      // A friend's own settings still apply to friends: PRIVATE means nobody. A missing row reads as public, as it does elsewhere.
      const may = (setting: string | undefined) => isVisible(setting ?? "PUBLIC", Relationship.FRIEND);
      const showHours = may(friendData.privacy?.showStudyHours);
      const showSession = may(friendData.privacy?.showCurrentSession);
      const showOnline = may(friendData.privacy?.showOnlineStatus);
      const showRank = may(friendData.privacy?.showRank);

      const completedTodaySeconds = showHours ? completedMap.get(friendId) ?? 0 : 0;
      const hasActiveSession = showSession && activeSessionMap.has(friendId);
      const activeSessionStarted = showSession ? activeSessionMap.get(friendId) : undefined;

      // A session is only considered "currently studying" if it started
      // within the last 12 hours (guards against zombie rows).
      const activeSession = activeSessionStarted ?? null;
      const todaySeconds = showHours ? todayMap.get(friendId) ?? completedTodaySeconds : 0;
      const todayMinutes = Math.floor(todaySeconds / 60);
      const isOnline = showOnline && friendData.lastSeenAt
        ? new Date(friendData.lastSeenAt) >= twoMinAgo
        : false;
      const isStudying = Boolean(activeSession) || (isOnline && hasActiveSession);

      return {
        companion: companions.get(friendData.id),
        friendshipId: f.id,
        id: friendData.id,
        name: friendData.name,
        username: friendData.username,
        // Hidden values read as 0 or false below, so a client needs this to tell "hidden" from "none".
        visible: { hours: showHours, session: showSession, online: showOnline, rank: showRank },
        hunterRank: showRank ? friendData.hunterRank : null,
        level: showRank ? friendData.level : null,
        totalStudyMinutes: showHours ? friendData.totalStudyMinutes : 0,
        totalStudySeconds: showHours ? friendData.totalStudySeconds || (friendData.totalStudyMinutes * 60) : 0,
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
        lastSeenAt: showOnline ? friendData.lastSeenAt : null,
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
