import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { calculateStreak, awardXP, calculateTimerSylph, getStreakMultiplier, getLongSessionMultiplier } from "@/lib/game-engine";

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

    const session = await prisma.studySession.create({
      data: {
        userId: payload.userId as number,
        questId: validation.data.questId || null,
        subjectId: validation.data.subjectId || null,
        durationMinutes: 0,
        durationSeconds: 0,
        startedAt: new Date(),
      },
    });

    // If linked to a quest, mark it as IN_PROGRESS
    if (validation.data.questId) {
      await prisma.quest.update({
        where: { id: validation.data.questId },
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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaySessions = await prisma.studySession.aggregate({
      _sum: { durationMinutes: true },
      where: {
        userId: user!.id,
        startedAt: { gte: todayStart },
      },
    });

    // Add the current session's duration since we just updated it, wait, `todaySessions` includes this session since its duration was updated? No, `todaySessions` aggregates durationMinutes.
    // The session was just updated with `durationMinutes`, so `aggregate` WILL include it!
    const todayMinutes = todaySessions._sum.durationMinutes || 0;
    const todayStr = new Date().toISOString().split("T")[0];

    let newStreak = user!.streakDays;
    let newLastActiveDate = user!.lastActiveDate;

    if (todayMinutes >= 30) {
      newStreak = calculateStreak(user!.lastActiveDate, todayStr, user!.streakDays);
      newLastActiveDate = todayStr;
      
      if (newStreak > user!.streakDays && newStreak > 1) {
         await prisma.systemMessage.create({
            data: {
               userId: user!.id,
               content: `**Streak Extended**\n\nYou studied for over 30 minutes today. Your streak is now ${newStreak} days. Keep it up!`,
               type: "STREAK"
            }
         });
      }
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

    if (actualSeconds >= 60) {
      const exactMinutes = actualSeconds / 60;
      
      // Base rewards
      const baseXp = exactMinutes * 1.5;
      const baseSylph = calculateTimerSylph(exactMinutes);
      
      // Multipliers
      const sessionMultiplier = getLongSessionMultiplier(exactMinutes);
      const streakMult = getStreakMultiplier(newStreak);
      
      // Final applied rewards (rounded down to integer)
      xpGained = Math.floor(baseXp * sessionMultiplier);
      finalSylph = Math.floor(baseSylph * streakMult * sessionMultiplier);
      
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
      
      // Handle Quest Completion
      if (questId) {
        const quest = await tx.quest.findFirst({ where: { id: questId, userId: user!.id } });
        if (quest && quest.status !== "COMPLETED" && actualSeconds >= quest.requiredMinutes * 60) {
          const qXp = quest.xpReward;
          const qSylph = quest.sylphReward;
          
          const qResult = awardXP(result.newLevel, result.newCurrentXP, result.newXPToNextLevel, qXp);
          
          await tx.quest.update({
            where: { id: quest.id },
            data: { status: "COMPLETED", completedAt: new Date() }
          });

          await tx.user.update({
            where: { id: user!.id },
            data: {
              level: qResult.newLevel,
              currentXP: qResult.newCurrentXP,
              xpToNextLevel: qResult.newXPToNextLevel,
              hunterRank: qResult.newRank,
              sylph: { increment: qSylph }
            }
          });

          if (qSylph > 0) {
            await tx.sylphLedger.create({
              data: { userId: user!.id, amount: qSylph, source: "QUEST" }
            });
          }

          await tx.systemMessage.create({
            data: {
              userId: user!.id,
              content: `**Quest Complete**\n\n"${quest.title}"\n\nRewards:\n• +${qXp} XP\n• +${qSylph} Sylph`,
              type: "REWARD"
            }
          });

          if (qResult.levelsGained > 0) {
            const qLevelUpSylph = qResult.newLevel * 300;
            await tx.user.update({
              where: { id: user!.id },
              data: { sylph: { increment: qLevelUpSylph } }
            });
            await tx.sylphLedger.create({
              data: { userId: user!.id, amount: qLevelUpSylph, source: "LEVEL_UP" }
            });
            const qRankUpText = qResult.didRankUp ? `\n\nRank Up! You are now a ${qResult.newRank}-Rank Hunter.` : "";
            await tx.systemMessage.create({
              data: {
                userId: user!.id,
                content: `**Level Up**\n\nYou have reached Level ${qResult.newLevel}.${qRankUpText}\n\nStipend: +${qLevelUpSylph} Sylph\n\nYou have grown stronger.`,
                type: "LEVEL_UP",
              },
            });
          }
        }
      }
    });

    return NextResponse.json(session, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
