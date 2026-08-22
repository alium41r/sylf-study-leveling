import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { TimezoneService } from "@/lib/timezone-service";

/**
 * GET /api/user/detailed-stats
 * Returns comprehensive stats for the Settings → Stats page.
 * Includes: user profile, session history (last 30 days), quest stats,
 * subject breakdown, rank progression info, and study streaks.
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

    // Get user with basic stats
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        hunterRank: true,
        level: true,
        currentXP: true,
        xpToNextLevel: true,
        hp: true,
        maxHp: true,
        streakDays: true,
        totalStudyMinutes: true,
        createdAt: true,
        timezone: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const timezone = user.timezone || "UTC";

    // Get sessions from the last 35 days UTC to cover timezone offsets safely
    const thirtyFiveDaysAgo = new Date();
    thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

    const sessions = await prisma.studySession.findMany({
      where: {
        userId,
        startedAt: { gte: thirtyFiveDaysAgo },
      },
      select: {
        id: true,
        durationMinutes: true,
        durationSeconds: true,
        focusRate: true,
        startedAt: true,
        endedAt: true,
        subject: { select: { id: true, name: true, color: true } },
        quest: { select: { id: true, title: true } },
      },
      orderBy: { startedAt: "asc" },
    });

    // Aggregate daily study minutes for the last 30 local calendar days
    const last30Days = TimezoneService.getDateRangeInUserTimezone(timezone, -29, 0);
    const dailyMap: Record<string, number> = {};
    for (const dateStr of last30Days) {
      dailyMap[dateStr] = 0;
    }

    for (const s of sessions) {
      const localDay = TimezoneService.getUserLocalDate(timezone, s.startedAt);
      if (dailyMap[localDay] !== undefined) {
        dailyMap[localDay] += s.durationMinutes;
      }
    }
    const dailyStudy = Object.entries(dailyMap).map(([date, minutes]) => ({
      date,
      minutes,
    }));

    // Subject breakdown
    const subjectMap: Record<number, { name: string; color: string; minutes: number; sessions: number }> = {};
    for (const s of sessions) {
      if (s.subject) {
        if (!subjectMap[s.subject.id]) {
          subjectMap[s.subject.id] = {
            name: s.subject.name,
            color: s.subject.color || "#7c3aed",
            minutes: 0,
            sessions: 0,
          };
        }
        subjectMap[s.subject.id].minutes += s.durationMinutes;
        subjectMap[s.subject.id].sessions += 1;
      }
    }
    const subjectBreakdown = Object.values(subjectMap).sort((a, b) => b.minutes - a.minutes);

    // Individual session log (most recent first) — one entry per completed
    // focus block so users can review "30 min in the morning, 50 min at night".
    const sessionLog = sessions
      .map((s) => ({
        id: s.id,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMinutes: s.durationMinutes,
        durationSeconds: s.durationSeconds > 0 ? s.durationSeconds : s.durationMinutes * 60,
        focusRate: s.focusRate,
        subjectName: s.subject?.name ?? null,
        subjectColor: s.subject?.color ?? null,
        questTitle: s.quest?.title ?? null,
      }))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    // Quest stats
    const allQuests = await prisma.quest.findMany({
      where: { userId },
      select: { status: true, xpReward: true, requiredMinutes: true },
    });

    const questStats = {
      total: allQuests.length,
      completed: allQuests.filter((q) => q.status === "COMPLETED").length,
      failed: allQuests.filter((q) => q.status === "FAILED").length,
      pending: allQuests.filter((q) => q.status === "PENDING").length,
      inProgress: allQuests.filter((q) => q.status === "IN_PROGRESS").length,
      totalXPEarned: allQuests
        .filter((q) => q.status === "COMPLETED")
        .reduce((sum, q) => sum + q.xpReward, 0),
    };

    // Goals stats
    const goals = await prisma.goal.findMany({
      where: { userId },
      select: { status: true },
    });

    const goalStats = {
      total: goals.length,
      active: goals.filter((g) => g.status === "ACTIVE").length,
      completed: goals.filter((g) => g.status === "COMPLETED").length,
    };

    // Compute derived stats
    const totalSessions = sessions.length;
    const avgSessionMinutes = totalSessions > 0
      ? Math.round(sessions.reduce((sum, s) => sum + s.durationMinutes, 0) / totalSessions)
      : 0;
    const activeDays = Object.values(dailyMap).filter((m) => m > 0).length;
    const longestSession = sessions.reduce((max, s) => Math.max(max, s.durationMinutes), 0);

    // Account age in days
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    return NextResponse.json({
      user,
      dailyStudy,
      subjectBreakdown,
      sessionLog,
      questStats,
      goalStats,
      summary: {
        totalSessions,
        avgSessionMinutes,
        activeDaysLast30: activeDays,
        longestSession,
        accountAgeDays,
        completionRate:
          questStats.total > 0
            ? Math.round((questStats.completed / questStats.total) * 100)
            : 0,
      },
    });
  } catch (error) {
    console.error("GET detailed-stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
