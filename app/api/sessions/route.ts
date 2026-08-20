import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { calculateStreak, calculateWeeklyStreak, getWeeklyBounds, calculateWeeklyQuestReward, awardXP, calculateTimerSylph, getStreakMultiplier, getLongSessionMultiplier } from "@/lib/game-engine";
import { invalidateRankingsCache } from "@/lib/cache-service";

const startSessionSchema = z.object({
  questId: z.number().int().optional(),
  subjectId: z.number().int().optional(),
});

const endSessionSchema = z.object({
  id: z.number().int(),
  durationMinutes: z.number().int().min(0),
  durationSeconds: z.number().int().min(0).optional(),
  questId: z.number().int().optional(),
});

/**
 * POST /api/sessions
 * Start a new study session. Optionally link it to a quest.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const validation = startSessionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { questId, subjectId } = validation.data;

    // Execute atomic PostgreSQL start_study_session RPC
    const rows = await prisma.$queryRaw<
      [{ start_study_session: { id: number; userId: number; questId: number | null; subjectId: number | null; durationMinutes: number; durationSeconds: number; focusRate: number; startedAt: string } }]
    >`
      SELECT public.start_study_session(
        ${payload.userId as number},
        ${questId ?? null},
        ${subjectId ?? null}
      ) AS start_study_session
    `;

    const session = rows[0]?.start_study_session;
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("POST /api/sessions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/sessions
 * End a study session. Updates duration and the user's total study minutes.
 */
export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const validation = endSessionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { id, durationMinutes, durationSeconds, questId } = validation.data;
    const actualSeconds = durationSeconds ?? (durationMinutes * 60);

    // Verify session ownership
    const existing = await prisma.studySession.findFirst({
      where: { id, userId: payload.userId as number },
    });
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Execute atomic PostgreSQL complete_study_session RPC
    const rows = await prisma.$queryRaw<
      [{ complete_study_session: { sessionId: number; userId: number; durationMinutes: number; durationSeconds: number; xpGained: number; sylphGained: number; totalSylphEarned: number; level: number; currentXP: number; xpToNextLevel: number; hunterRank: string; levelsGained: number; didRankUp: boolean } }]
    >`
      SELECT public.complete_study_session(
        ${payload.userId as number},
        ${id},
        ${durationMinutes},
        ${actualSeconds},
        ${questId ?? null},
        null,
        80
      ) AS complete_study_session
    `;

    // Handle weekly milestone check
    const user = await prisma.user.findUnique({
      where: { id: payload.userId as number },
      select: { id: true, timezone: true, lastActiveDate: true, streakDays: true, level: true },
    });

    if (user) {
      const bounds = getWeeklyBounds(new Date(), user.timezone || "UTC");
      const weekSessions = await prisma.studySession.aggregate({
        _sum: { durationMinutes: true },
        where: {
          userId: user.id,
          startedAt: {
            gte: bounds.weekStart,
            lte: bounds.weekEnd,
          },
        },
      });

      const weekMinutes = weekSessions._sum.durationMinutes || 0;
      if (weekMinutes >= 180 && user.lastActiveDate !== bounds.weekKey) {
        const freezeItem = await prisma.inventoryItem.findFirst({
          where: { userId: user.id, itemKey: "STREAK_FREEZE", quantity: { gt: 0 } },
        });

        const streakResult = calculateWeeklyStreak(
          user.lastActiveDate,
          bounds.weekKey,
          user.streakDays,
          !!freezeItem
        );

        if (streakResult.freezeUsed && freezeItem) {
          await prisma.inventoryItem.update({
            where: { id: freezeItem.id },
            data: { quantity: { decrement: 1 } },
          });
          await prisma.systemMessage.create({
            data: {
              userId: user.id,
              content: `**Weekly Streak Freeze Consumed**\n\nYour Streak Freeze protected your weekly streak after a missed cycle. Streak continues at **${streakResult.newStreak} weeks**!`,
              type: "STREAK",
            },
          });
        }

        const weeklyReward = calculateWeeklyQuestReward(user.level);
        await prisma.user.update({
          where: { id: user.id },
          data: {
            streakDays: streakResult.newStreak,
            lastActiveDate: bounds.weekKey,
            sylph: { increment: weeklyReward.sylphReward },
          },
        });

        await prisma.systemMessage.create({
          data: {
            userId: user.id,
            content: `**Weekly Mission Complete: 3 Hours of Focus!**\n\nYou completed the weekly 3-hour study target. Weekly streak is now **${streakResult.newStreak} week${streakResult.newStreak === 1 ? "" : "s"}**!\n\nRewards Claimed: +${weeklyReward.xpReward} XP, +${weeklyReward.sylphReward} Sylph.`,
            type: "STREAK",
          },
        });
      }
    }

    invalidateRankingsCache();

    const session = await prisma.studySession.findUnique({
      where: { id },
    });

    return NextResponse.json(session, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/sessions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
