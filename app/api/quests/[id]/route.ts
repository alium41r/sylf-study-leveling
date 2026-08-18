import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { awardXP, getStreakMultiplier } from "@/lib/game-engine";
import { DIFFICULTY_CONFIG } from "@/lib/difficulty-engine";
import { TimezoneService } from "@/lib/timezone-service";
import { getUserTimezone } from "@/lib/timezone-server";

const updateQuestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  requiredMinutes: z.number().int().min(1).optional(),
  scheduledFor: z.string().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]).optional(),
  elapsedSeconds: z.number().int().min(0).optional(),
  difficulty: z.enum(["EASY", "NORMAL", "HARD", "EXPERT"]).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const quest = await prisma.quest.findFirst({
      where: {
        id: parseInt(id),
        userId: payload.userId as number,
      },
    });

    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    return NextResponse.json(quest, { status: 200 });
  } catch (error) {
    console.error("GET quest error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/quests/[id]
 * Update a quest's status. Handles reward/penalty logic:
 * - COMPLETED: Award XP + Gold, check for level-up, update streak
 * - FAILED: Deduct HP, send a warning SystemMessage
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const validation = updateQuestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { status, title, description, requiredMinutes, scheduledFor, elapsedSeconds, difficulty } = validation.data;

    // Verify quest ownership
    const quest = await prisma.quest.findFirst({
      where: { id: parseInt(id), userId: payload.userId as number },
    });
    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    // Get current user stats
    const user = await prisma.user.findUnique({
      where: { id: payload.userId as number },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const dataToUpdate: any = {};
    if (title !== undefined) dataToUpdate.title = title;
    if (description !== undefined) dataToUpdate.description = description;
    if (requiredMinutes !== undefined) dataToUpdate.requiredMinutes = requiredMinutes;
    if (scheduledFor !== undefined) dataToUpdate.scheduledFor = scheduledFor;
    if (elapsedSeconds !== undefined) dataToUpdate.elapsedSeconds = elapsedSeconds;
    if (difficulty !== undefined) dataToUpdate.difficulty = difficulty;
    if (status !== undefined) {
      dataToUpdate.status = status;
      dataToUpdate.completedAt = status === "COMPLETED" ? new Date() : null;
    }

    // Update the quest fields
    const updatedQuest = await prisma.quest.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
    });

    const tz = await getUserTimezone(payload.userId as number);
    const today = TimezoneService.getUserLocalDate(tz);

    const isNewlyCompleted = status === "COMPLETED" && quest.status !== "COMPLETED";
    const isNewlyFailed = status === "FAILED" && quest.status !== "FAILED";

    // ─── Handle COMPLETED ─────────────────────────────────────
    if (isNewlyCompleted) {
      let finalXP = quest.xpReward;
      let finalSylph = quest.sylphReward;
      
      // Determine if early, late, or on time
      let isLate = false;
      let isEarly = false;
      if (quest.scheduledFor) {
        if (today > quest.scheduledFor) {
          isLate = true;
        } else if (today < quest.scheduledFor) {
          isEarly = true;
        }
      }

      // If late, redirect to FAILED logic
      if (isLate) {
        let penalty: number = DIFFICULTY_CONFIG[quest.difficulty as keyof typeof DIFFICULTY_CONFIG].hpPenalty;
        if (quest.isGateKeyApplied) penalty *= 3;
        if (quest.isKamishWardActive) penalty = 0;
        
        const newHp = Math.max(0, user.hp - penalty);
        await prisma.$transaction(async (tx) => {
          await tx.quest.update({ where: { id: parseInt(id) }, data: { status: "FAILED" } });
          await tx.user.update({ where: { id: user.id }, data: { hp: newHp } });
          
          if (penalty > 0) {
            await tx.hpLedger.create({
              data: { userId: user.id, amount: -penalty, source: "QUEST_FAILED_LATE" },
            });
          }

          await tx.systemMessage.create({
            data: {
              userId: user.id,
              content: `**Quest Failed (Late)**\n\n"${quest.title}" was completed past its deadline of ${quest.scheduledFor}.\n\nPenalty: -${penalty} HP`,
              type: "WARNING",
            },
          });
        });
        
        return NextResponse.json({
          quest: { ...updatedQuest, status: "FAILED" },
          penalty: { hpLost: penalty, currentHp: newHp },
        }, { status: 200 });
      }

      // If Early, apply 20% bonus
      if (isEarly) {
        finalXP = Math.floor(finalXP * 1.2);
        finalSylph = Math.floor(finalSylph * 1.2);
      }

      // Gate Key modifier
      if (quest.isGateKeyApplied) {
        finalXP *= 2;
        finalSylph *= 2;
      }

      // Apply streak multiplier to Sylph
      const multiplier = getStreakMultiplier(user.streakDays);
      finalSylph = Math.floor(finalSylph * multiplier);

      const result = awardXP(
        user.level,
        user.currentXP,
        user.xpToNextLevel,
        finalXP
      );

      // Level-up stipend
      let levelUpSylph = 0;
      if (result.levelsGained > 0) {
        levelUpSylph = result.newLevel * 300;
      }

      const totalSylphEarned = finalSylph + levelUpSylph;

      await prisma.$transaction(async (tx) => {
        // Update user
        await tx.user.update({
          where: { id: user.id },
          data: {
            level: result.newLevel,
            currentXP: result.newCurrentXP,
            xpToNextLevel: result.newXPToNextLevel,
            hunterRank: result.newRank,
            sylph: user.sylph + totalSylphEarned,
          },
        });

        // Ledger entries
        await tx.sylphLedger.create({
          data: { userId: user.id, amount: finalSylph, source: "QUEST" },
        });

        if (levelUpSylph > 0) {
          await tx.sylphLedger.create({
            data: { userId: user.id, amount: levelUpSylph, source: "LEVEL_UP" },
          });
        }

        const earlyBonusText = isEarly ? `\n(Includes 20% Early Completion Bonus!)` : "";

        // System messages
        await tx.systemMessage.create({
          data: {
            userId: user.id,
            content: `**Quest Complete**\n\n"${quest.title}"\n\nRewards Obtained:\n• +${finalXP} XP\n• +${finalSylph} Sylph${multiplier > 1 ? ` (Streak x${multiplier})` : ""}${earlyBonusText}`,
            type: "REWARD",
          },
        });

        if (result.levelsGained > 0) {
          const rankUpText = result.didRankUp
            ? `\n\nRANK UP: ${result.previousRank}-Rank → ${result.newRank}-Rank`
            : "";
          await tx.systemMessage.create({
            data: {
              userId: user.id,
              content: `**Level Up**\n\nYou have reached Level ${result.newLevel}.${rankUpText}\n\nStipend: +${levelUpSylph} Sylph\n\nYou have grown stronger.`,
              type: "LEVEL_UP",
            },
          });
        }
      });

      return NextResponse.json(
        {
          quest: updatedQuest,
          rewards: {
            xpGained: finalXP,
            sylphGained: totalSylphEarned,
            ...result,
          },
        },
        { status: 200 }
      );
    }

    // ─── Handle FAILED ────────────────────────────────────────
    if (isNewlyFailed) {
      let penalty: number = DIFFICULTY_CONFIG[quest.difficulty as keyof typeof DIFFICULTY_CONFIG].hpPenalty;
      
      // Item overrides
      if (quest.isGateKeyApplied) {
        penalty *= 3; // Risk of Gate Key
      }
      
      if (quest.isKamishWardActive) {
        penalty = 0; // Shield intercepts damage
      }

      const newHp = Math.max(0, user.hp - penalty);

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { hp: newHp },
        });

        if (penalty > 0) {
          await tx.hpLedger.create({
            data: { userId: user.id, amount: -penalty, source: "QUEST_FAILED" },
          });
        }

        const shieldText = quest.isKamishWardActive 
          ? `\n\nKamish's Ward intercepted all damage.` 
          : `\n\nPenalty: -${penalty} HP\nCurrent HP: ${newHp}/${user.maxHp}`;
          
        await tx.systemMessage.create({
          data: {
            userId: user.id,
            content: `**Quest Failed**\n\n"${quest.title}"${shieldText}`,
            type: "WARNING",
          },
        });
      });

      return NextResponse.json(
        {
          quest: updatedQuest,
          penalty: { hpLost: penalty, currentHp: newHp },
        },
        { status: 200 }
      );
    }

    // ─── Handle other status changes (IN_PROGRESS, PENDING) ──
    return NextResponse.json({ quest: updatedQuest }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/quests/[id]
 * Delete a quest completely.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const quest = await prisma.quest.findFirst({
      where: { id: parseInt(id), userId: payload.userId as number },
    });
    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    await prisma.quest.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ message: "Quest deleted" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
