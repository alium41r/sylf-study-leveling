import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { calculateStreak, calculateWeeklyStreak, getWeeklyBounds, calculateWeeklyQuestReward, awardXP, calculateTimerSylph, getStreakMultiplier, getLongSessionMultiplier } from "@/lib/game-engine";

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

    const session = await prisma.studySession.create({
      data: {
        userId: payload.userId as number,
        questId,
        subjectId,
        durationMinutes: 0,
        durationSeconds: 0,
        startedAt: new Date(),
      },
    });

    // If linked to a quest, mark it as IN_PROGRESS
    if (questId) {
      await prisma.quest.update({
        where: { id: questId },
        data: { status: "IN_PROGRESS" },
      });
    }

    return NextResponse.json(session, { status: 201 });
  } catch {
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

    const session = await prisma.studySession.update({
      where: { id },
      data: {
        durationMinutes,
        durationSeconds: actualSeconds,
        endedAt: new Date(),
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: payload.userId as number },
    });

    const bounds = getWeeklyBounds(new Date(), user?.timezone || "UTC");

    // Aggregate weekly focus sessions
    const weekSessions = await prisma.studySession.aggregate({
      _sum: { durationMinutes: true },
      where: {
        userId: user!.id,
        startedAt: {
          gte: bounds.weekStart,
          lte: bounds.weekEnd,
        },
      },
    });

    const weekMinutes = weekSessions._sum.durationMinutes || 0;
    let newStreak = user!.streakDays;
    let newLastActiveDate = user!.lastActiveDate;
    let weeklyBonusXP = 0;
    let weeklyBonusSylph = 0;

    // Check for Streak Freeze inventory item
    const freezeItem = await prisma.inventoryItem.findFirst({
      where: { userId: user!.id, itemKey: "STREAK_FREEZE", quantity: { gt: 0 } },
    });

    // Weekly 3-hour milestone (180 minutes)
    if (weekMinutes >= 180 && user!.lastActiveDate !== bounds.weekKey) {
      const streakResult = calculateWeeklyStreak(
        user!.lastActiveDate,
        bounds.weekKey,
        user!.streakDays,
        !!freezeItem
      );

      newStreak = streakResult.newStreak;
      newLastActiveDate = bounds.weekKey;

      if (streakResult.freezeUsed && freezeItem) {
        await prisma.inventoryItem.update({
          where: { id: freezeItem.id },
          data: { quantity: { decrement: 1 } },
        });
        await prisma.systemMessage.create({
          data: {
            userId: user!.id,
            content: `**Weekly Streak Freeze Consumed**\n\nYour Streak Freeze protected your weekly streak after a missed cycle. Streak continues at **${newStreak} weeks**!`,
            type: "STREAK",
          },
        });
      }

      // Calculate level-scaled reward for the 3-hour weekly quest
      const weeklyReward = calculateWeeklyQuestReward(user!.level);
      weeklyBonusXP = weeklyReward.xpReward;
      weeklyBonusSylph = weeklyReward.sylphReward;

      await prisma.systemMessage.create({
        data: {
          userId: user!.id,
          content: `**Weekly Mission Complete: 3 Hours of Focus!**\n\nYou completed the weekly 3-hour study target. Weekly streak is now **${newStreak} week${newStreak === 1 ? "" : "s"}**!\n\nRewards Claimed: +${weeklyReward.xpReward} XP, +${weeklyReward.sylphReward} Sylph.`,
          type: "STREAK",
        },
      });
    }

    // Meaningful Focus System: Exact second-based rewards, 0 rewards if < 60s
    let xpGained = 0;
    let finalSylph = 0;
    let result = { 
      newLevel: user!.level, 
      newCurrentXP: user!.currentXP, 
      newXPToNextLevel: user!.xpToNextLevel, 
      newRank: user!.hunterRank, 
      previousRank: user!.hunterRank, 
      levelsGained: 0, 
      didRankUp: false 
    };

    if (actualSeconds >= 60 || weeklyBonusXP > 0) {
      const exactMinutes = actualSeconds / 60;
      
      // Base rewards
      const baseXp = exactMinutes * 1.5;
      const baseSylph = calculateTimerSylph(exactMinutes);
      
      // Multipliers
      const sessionMultiplier = getLongSessionMultiplier(exactMinutes);
      const streakMult = getStreakMultiplier(newStreak);
      
      // Final applied rewards (rounded down to integer) + weekly bonus rewards
      xpGained = Math.floor(baseXp * sessionMultiplier) + weeklyBonusXP;
      finalSylph = Math.floor(baseSylph * streakMult * sessionMultiplier) + weeklyBonusSylph;
      
      result = awardXP(user!.level, user!.currentXP, user!.xpToNextLevel, xpGained);
    }
    
    // Level-up stipend
    const levelUpSylph = result.levelsGained > 0 ? result.newLevel * 300 : 0;
    const totalSylphEarned = finalSylph + levelUpSylph;

    await prisma.$transaction(async (tx) => {
      // Update user's total study time, streak, and level
      await tx.user.update({
        where: { id: user!.id },
        data: {
          totalStudyMinutes: { increment: durationMinutes },
          totalStudySeconds: { increment: actualSeconds },
          streakDays: newStreak,
          lastActiveDate: newLastActiveDate,
          level: result.newLevel,
          currentXP: result.newCurrentXP,
          xpToNextLevel: result.newXPToNextLevel,
          hunterRank: result.newRank,
          sylph: { increment: totalSylphEarned },
        },
      });

      // Ledger entry for timer
      if (finalSylph > 0) {
        await tx.sylphLedger.create({
          data: { userId: user!.id, amount: finalSylph, source: "TIMER" },
        });
      }

      // Ledger entry for level up
      if (levelUpSylph > 0) {
        await tx.sylphLedger.create({
          data: { userId: user!.id, amount: levelUpSylph, source: "LEVEL_UP" },
        });
      }

      if (result.levelsGained > 0) {
        const rankUpText = result.didRankUp ? `\n\nRank Up! You are now a ${result.newRank}-Rank Hunter.` : "";
        await tx.systemMessage.create({
          data: {
            userId: user!.id,
            content: `**Level Up**\n\nYou have reached Level ${result.newLevel}.${rankUpText}\n\nStipend: +${levelUpSylph} Sylph\n\nYou have grown stronger.`,
            type: "LEVEL_UP",
          },
        });
      }
      
      // Update Quest Progress
      if (questId) {
        await tx.quest.update({
          where: { id: questId },
          data: { elapsedSeconds: { increment: actualSeconds } }
        });
      }
    });

    return NextResponse.json(session, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
