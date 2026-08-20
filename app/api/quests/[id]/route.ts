import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { awardXP, getStreakMultiplier } from "@/lib/game-engine";
import { DIFFICULTY_CONFIG } from "@/lib/difficulty-engine";
import { TimezoneService } from "@/lib/timezone-service";
import { getUserTimezone } from "@/lib/timezone-server";
import { invalidateRankingsCache } from "@/lib/cache-service";

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
      const rows = await prisma.$queryRaw<
        [{ claim_quest_reward: { success: boolean; questId: number; status: string; xpGained?: number; sylphGained?: number; totalSylphEarned?: number; hpHealed?: number; currentHp?: number; level?: number; currentXP?: number; xpToNextLevel?: number; hunterRank?: string; levelsGained?: number; didRankUp?: boolean; penalty?: { hpLost: number; currentHp: number } } }]
      >`
        SELECT public.claim_quest_reward(
          ${payload.userId as number},
          ${parseInt(id)},
          ${today}
        ) AS claim_quest_reward
      `;

      const claimResult = rows[0]?.claim_quest_reward;

      if (claimResult?.status === "FAILED") {
        return NextResponse.json({
          quest: { ...updatedQuest, status: "FAILED" },
          penalty: claimResult.penalty,
        }, { status: 200 });
      }

      invalidateRankingsCache();

      return NextResponse.json(
        {
          quest: { ...updatedQuest, status: "COMPLETED", completedAt: new Date() },
          rewards: {
            xpGained: claimResult?.xpGained ?? quest.xpReward,
            sylphGained: claimResult?.totalSylphEarned ?? quest.sylphReward,
            newLevel: claimResult?.level ?? user.level,
            newCurrentXP: claimResult?.currentXP ?? user.currentXP,
            newXPToNextLevel: claimResult?.xpToNextLevel ?? user.xpToNextLevel,
            newRank: claimResult?.hunterRank ?? user.hunterRank,
            previousRank: user.hunterRank,
            levelsGained: claimResult?.levelsGained ?? 0,
            didRankUp: claimResult?.didRankUp ?? false,
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
