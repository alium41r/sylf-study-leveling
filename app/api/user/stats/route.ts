import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { xpForNextLevel } from "@/lib/game-engine";
import { formatScholarId } from "@/lib/scholar-id";
import { TimezoneService } from "@/lib/timezone-service";
import { getCognitiveEffects } from "@/lib/cognitive-stats";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      res.cookies.set({
        name: "hunter_token",
        value: "",
        maxAge: 0,
        path: "/",
      });
      return res;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        password: true,
        scholarId: true,
        verificationStatus: true,
        avatarUrl: true,
        bannerUrl: true,
        bio: true,
        activeAvatar: true,
        activeFrame: true,
        activeTitle: true,
        activeAura: true,
        activeNameColor: true,
        characterConfig: true,
        socialLinks: true,
        hunterRank: true,
        level: true,
        currentXP: true,
        hp: true,
        maxHp: true,
        streakDays: true,
        totalStudyMinutes: true,
        totalStudySeconds: true,
        lastActiveDate: true,
        createdAt: true,
        sylph: true,
        timezone: true,
        hasCompletedOnboarding: true,
        stats: {
          select: { endurance: true },
        },
      },
    });

    if (!user) {
      const res = NextResponse.json({ error: "User not found" }, { status: 401 });
      res.cookies.set({
        name: "hunter_token",
        value: "",
        maxAge: 0,
        path: "/",
      });
      return res;
    }

    const timezone = user.timezone || "UTC";
    const todayStart = TimezoneService.getStartOfDayUTC(timezone);

    // Fetch user's study sessions from today
    const todaySessions = await prisma.studySession.findMany({
      where: {
        userId: user.id,
        startedAt: { gte: todayStart },
      },
      select: {
        durationMinutes: true,
        durationSeconds: true,
        startedAt: true,
        endedAt: true,
      },
    }).catch(() => []);

    let completedTodaySeconds = 0;
    let todayStudySeconds = 0;
    let activeSessionStartedAt: string | null = null;
    const now = new Date();

    for (const s of todaySessions) {
      if (!s.endedAt) {
        // Active (unended) session: count its already-flushed stored seconds.
        // A session is "live" when it is freshly started (pre-first-flush,
        // within 3 minutes) or has real flushed progress and is not a zombie
        // (> 12h since start). Stale 0-second rows are ignored entirely.
        const started = new Date(s.startedAt);
        const elapsed = Math.floor((now.getTime() - started.getTime()) / 1000);
        const stored = (s.durationSeconds || (s.durationMinutes * 60) || 0);
        const isLive =
          (elapsed >= 0 && elapsed <= 180) ||
          (stored > 0 && elapsed > 0 && elapsed <= 12 * 3600);
        if (isLive) {
          todayStudySeconds += stored;
          if (!activeSessionStartedAt) activeSessionStartedAt = s.startedAt.toISOString();
        }
      } else {
        const sec = (s.durationSeconds || (s.durationMinutes * 60) || 0);
        completedTodaySeconds += sec;
        todayStudySeconds += sec;
      }
    }
    const todayStudyMinutes = Math.floor(todayStudySeconds / 60);

    const scholarId = user.scholarId || formatScholarId(user.id);
    const xpToNextLevel = xpForNextLevel(user.level);
    const hasPassword = user.password !== null;

    const { password: _, stats: __stats, ...userStats } = user;

    // Endurance (Aegis): +5 effective max HP per ability tier.
    const effectiveMaxHp =
      (user.maxHp || 100) + getCognitiveEffects({ endurance: __stats?.endurance ?? undefined }).bonusMaxHp;

    return NextResponse.json(
      {
        ...userStats,
        scholarId,
        xpToNextLevel,
        hasPassword,
        effectiveMaxHp,
        completedTodaySeconds,
        todayStudySeconds,
        todayStudyMinutes,
        activeSessionStartedAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/user/stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
