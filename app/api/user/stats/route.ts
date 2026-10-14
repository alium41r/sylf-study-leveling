import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { xpForNextLevel } from "@/lib/game-engine";
import { formatScholarId } from "@/lib/scholar-id";
import { TimezoneService } from "@/lib/timezone-service";
import { getCognitiveEffects } from "@/lib/cognitive-stats";
import { storedStudySeconds, studySessionIsRunning } from "@/lib/session-math";
import { isEmailInAdminBootstrap } from "@/lib/auth-admin";

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
        activeTheme: true,
        activeBackground: true,
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
        isAdmin: true,
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
    
    // Controlled admin bootstrap fallback
    if (!user.isAdmin && isEmailInAdminBootstrap(user.email)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isAdmin: true },
      });
      user.isAdmin = true;
    }

    const timezone = user.timezone || "UTC";
    const todayStart = TimezoneService.getStartOfDayUTC(timezone);

    // Fetch user's study sessions from today
    const todaySessions = await prisma.studySession.findMany({
      where: {
        userId: user.id,
        OR: [{ executionState: null, startedAt: { gte: todayStart } },
          { executionState: { not: null }, executionContext: { path: ["actualCivilDate"], equals: TimezoneService.getUserLocalDate(timezone) } }],
      },
      select: {
        id: true,
        subjectId: true,
        questId: true,
        durationMinutes: true,
        durationSeconds: true,
        startedAt: true,
        endedAt: true,
        executionState: true,
      },
    });

    let completedTodaySeconds = 0;
    let todayStudySeconds = 0;
    let activeSessionStartedAt: string | null = null;
    const activeTime = todaySessions.find(s => s.executionState === "PAUSED" || studySessionIsRunning(s));

    for (const s of todaySessions) {
      const seconds = storedStudySeconds(s);
      todayStudySeconds += seconds;
      if (s.endedAt || s.executionState === "ENDED") completedTodaySeconds += seconds;
      if (studySessionIsRunning(s) && !activeSessionStartedAt) activeSessionStartedAt = s.startedAt.toISOString();
    }
    const todayStudyMinutes = Math.floor(todayStudySeconds / 60);

    const scholarId = user.scholarId || formatScholarId(user.id);
    const xpToNextLevel = xpForNextLevel(user.level);
    const { password, stats: __stats, ...userStats } = user;
    const hasPassword = password !== null;

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
        activeSessionId: activeTime?.id ?? null,
        activeSessionSubjectId: activeTime?.subjectId ?? null,
        activeSessionQuestId: activeTime?.questId ?? null,
        activeSessionStudySeconds: activeTime?.durationSeconds ?? 0,
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
