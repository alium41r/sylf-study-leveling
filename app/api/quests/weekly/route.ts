import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { getWeeklyBounds, calculateWeeklyQuestReward } from "@/lib/game-engine";
import { TimezoneService } from "@/lib/timezone-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/quests/weekly
 * Returns current weekly 3-hour focus quest progress, level-scaled rewards,
 * weekly streak info, and time remaining until the Sunday reset.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        level: true,
        streakDays: true,
        lastActiveDate: true,
        timezone: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const bounds = getWeeklyBounds(new Date(), user.timezone || "UTC");
    const TARGET_MINUTES = 180; // 3 hours

    // Aggregate all focus sessions in the current week
    const weekSessions = await prisma.studySession.aggregate({
      _sum: {
        durationMinutes: true,
        durationSeconds: true,
      },
      where: {
        userId,
        startedAt: {
          gte: bounds.weekStart,
          lte: bounds.weekEnd,
        },
      },
    });

    const progressMinutes = weekSessions._sum.durationMinutes || 0;
    const progressSeconds = weekSessions._sum.durationSeconds || (progressMinutes * 60);
    const isCompleted = progressMinutes >= TARGET_MINUTES;
    const percentComplete = Math.min(100, Math.round((progressMinutes / TARGET_MINUTES) * 100));

    // Calculate level-scaled rewards
    const rewards = calculateWeeklyQuestReward(user.level);

    // Check for Streak Freeze inventory item
    const freezeItem = await prisma.inventoryItem.findFirst({
      where: {
        userId,
        itemKey: "STREAK_FREEZE",
      },
    });

    return NextResponse.json({
      targetMinutes: TARGET_MINUTES,
      targetSeconds: TARGET_MINUTES * 60,
      progressMinutes,
      progressSeconds,
      percentComplete,
      isCompleted,
      weekKey: bounds.weekKey,
      weekStart: bounds.weekStart.toISOString(),
      weekEnd: bounds.weekEnd.toISOString(),
      timeRemainingMs: bounds.timeRemainingMs,
      daysRemaining: bounds.daysRemaining,
      xpReward: rewards.xpReward,
      sylphReward: rewards.sylphReward,
      streakWeeks: user.streakDays,
      hasStreakFreeze: (freezeItem?.quantity || 0) > 0,
      freezeCount: freezeItem?.quantity || 0,
    }, { status: 200 });
  } catch (error) {
    console.error("GET /api/quests/weekly error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
