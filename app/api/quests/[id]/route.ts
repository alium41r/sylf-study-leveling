import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { awardXP, hpPenalty, getStreakMultiplier } from "@/lib/game-engine";

const updateQuestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  requiredMinutes: z.number().int().min(1).optional(),
  scheduledFor: z.string().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

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

    const { status, title, description, requiredMinutes, scheduledFor } = validation.data;

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
    if (status !== undefined) {
      dataToUpdate.status = status;
      dataToUpdate.completedAt = status === "COMPLETED" ? new Date() : null;
    }

    // Update the quest fields
    const updatedQuest = await prisma.quest.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
    });

    const today = new Date().toISOString().split("T")[0];

    // ─── Handle COMPLETED ─────────────────────────────────────
    if (status === "COMPLETED") {
      let finalXP = quest.xpReward;
      let finalSylph = quest.sylphReward;

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

        // System messages
        await tx.systemMessage.create({
          data: {
            userId: user.id,
            content: `**Quest Complete**\n\n"${quest.title}"\n\nRewards Obtained:\n• +${finalXP} XP\n• +${finalSylph} Sylph${multiplier > 1 ? ` (Streak x${multiplier})` : ""}`,
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
    if (status === "FAILED") {
      let penalty = hpPenalty(quest.requiredMinutes);
      
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
