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
        totalStudySeconds: true,
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

    // ── Independent reads in parallel: sessions + quest stats + goal stats ──
    const [sessions, allQuests, goals] = await Promise.all([
      prisma.studySession.findMany({
        where: {
          userId,
          startedAt: { gte: thirtyFiveDaysAgo },
        },
        select: {
          id: true,
          durationMinutes: true,
          durationSeconds: true,
          breakSeconds: true,
          focusRate: true,
          startedAt: true,
          endedAt: true,
          subject: { select: { id: true, name: true, color: true } },
          quest: { select: { id: true, title: true } },
        },
        orderBy: { startedAt: "asc" },
      }),
      prisma.quest.findMany({
        where: { userId },
        select: { status: true, xpReward: true, requiredMinutes: true },
      }),
      prisma.goal.findMany({
        where: { userId },
        select: { status: true },
      }),
    ]);

    // Aggregate daily study time for the last 30 local calendar days.
    // EXACT-SECOND accounting: sub-minute sessions (15s, 40s) are real study
    // time and must show up — the old floor(durationSeconds/60) made them
    // invisible (a day of 4×15s showed as "0 min", skewing the chart AND the
    // active-days count). Minutes are kept at 1-decimal precision so small
    // days still render a visible sliver.
    const last30Days = TimezoneService.getDateRangeInUserTimezone(timezone, -29, 0);
    const dailyMap: Record<string, number> = {}; // seconds
    for (const dateStr of last30Days) {
      dailyMap[dateStr] = 0;
    }

    for (const s of sessions) {
      const localDay = TimezoneService.getUserLocalDate(timezone, s.startedAt);
      if (dailyMap[localDay] !== undefined) {
        dailyMap[localDay] += s.durationSeconds || s.durationMinutes * 60 || 0;
      }
    }
    const dailyStudy = Object.entries(dailyMap).map(([date, seconds]) => ({
      date,
      minutes: seconds > 0 ? Math.max(0.1, Math.round((seconds / 60) * 10) / 10) : 0,
    }));

    // The user's LOCAL "today" date (not UTC) so the chart marks the right bar.
    const todayDate = TimezoneService.getUserLocalDate(timezone, new Date());

    // Subject breakdown — exact seconds, 1-decimal minutes, per-subject
    // session counts. (Same precision fix as the daily chart.)
    const subjectMap: Record<number, { name: string; color: string; seconds: number; sessions: number }> = {};
    for (const s of sessions) {
      if (s.subject) {
        if (!subjectMap[s.subject.id]) {
          subjectMap[s.subject.id] = {
            name: s.subject.name,
            color: s.subject.color || "#7c3aed",
            seconds: 0,
            sessions: 0,
          };
        }
        subjectMap[s.subject.id].seconds += s.durationSeconds || s.durationMinutes * 60 || 0;
        subjectMap[s.subject.id].sessions += 1;
      }
    }
    const subjectBreakdown = Object.values(subjectMap)
      .map((sub) => ({
        name: sub.name,
        color: sub.color,
        seconds: sub.seconds,
        minutes: sub.seconds > 0 ? Math.max(0.1, Math.round((sub.seconds / 60) * 10) / 10) : 0,
        sessions: sub.sessions,
      }))
      .sort((a, b) => b.seconds - a.seconds);

    // Individual session log (most recent first) — one entry per completed
    // focus block so users can review "30 min in the morning, 50 min at night".
    const sessionLog = sessions
      .map((s) => ({
        id: s.id,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMinutes: s.durationMinutes,
        durationSeconds: s.durationSeconds > 0 ? s.durationSeconds : s.durationMinutes * 60,
        breakSeconds: s.breakSeconds || 0,
        focusRate: s.focusRate,
        subjectName: s.subject?.name ?? null,
        subjectColor: s.subject?.color ?? null,
        questTitle: s.quest?.title ?? null,
      }))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    // Quest stats
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
    const goalStats = {
      total: goals.length,
      active: goals.filter((g) => g.status === "ACTIVE").length,
      completed: goals.filter((g) => g.status === "COMPLETED").length,
    };

    // Compute derived stats — EXACT-second accuracy everywhere:
    // totals are summed in seconds, then converted for display.
    const totalSessions = sessions.length;
    const totalSessionSeconds = sessions.reduce(
      (sum, s) => sum + (s.durationSeconds || s.durationMinutes * 60 || 0),
      0
    );
    const avgSessionSeconds = totalSessions > 0
      ? Math.round(totalSessionSeconds / totalSessions)
      : 0;
    const activeDays = Object.values(dailyMap).filter((sec) => sec > 0).length;
    const longestSessionSeconds = sessions.reduce(
      (max, s) => Math.max(max, s.durationSeconds || s.durationMinutes * 60 || 0),
      0
    );

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
      todayDate,
      summary: {
        totalSessions,
        avgSessionMinutes: avgSessionSeconds > 0 ? Math.round(avgSessionSeconds / 60) : 0,
        avgSessionSeconds,
        activeDaysLast30: activeDays,
        longestSession: longestSessionSeconds > 0 ? Math.round(longestSessionSeconds / 60) : 0,
        longestSessionSeconds,
        accountAgeDays,
        completionRate:
          questStats.total > 0
            ? Math.round((questStats.completed / questStats.total) * 100)
            : 0,
      },
    }, {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("GET detailed-stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
