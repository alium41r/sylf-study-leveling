import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { DIFFICULTY_CONFIG } from "@/lib/difficulty-engine";
import { TimezoneService } from "@/lib/timezone-service";
import { invalidateRankingsCache } from "@/lib/cache-service";
import { StudyScheduleService } from "@/lib/study-schedule-service";
import { manualLinkedQuest, isPlannerConflict } from "@/lib/planner/server/mutation-guards";
import { PlannerError } from "@/lib/planner/errors";
import { durablePlanner } from "@/lib/planner/v2/server/web";
import { DurablePlannerError } from "@/lib/planner/v2/server/database";
import { executionTransaction } from "@/lib/execution-coordination";
import { projectQuestDuration } from "@/lib/planner/v2/quest-read";

const updateQuestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  requiredMinutes: z.number().int().min(1).optional(),
  scheduledFor: z.string().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]).optional(),
  elapsedSeconds: z.number().int().min(0).optional(),
  difficulty: z.enum(["EASY", "NORMAL", "HARD", "EXPERT"]).optional(),
  goalId: z.number().int().positive().nullable().optional(),
  executionProtocol: z.literal(2).optional(),
  expectedExecutionVersion: z.number().int().nonnegative().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quest = await prisma.quest.findFirst({
      where: {
        id: parseInt(id),
        userId: session.userId,
      },
    });

    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    return NextResponse.json(projectQuestDuration(quest), { status: 200 });
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
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validation = updateQuestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { status, title, description, requiredMinutes, scheduledFor, elapsedSeconds, difficulty, goalId } = validation.data;

    if (validation.data.executionProtocol === 2) {
      const owned = await prisma.quest.findFirst({ where: { id: parseInt(id), userId: session.userId } });
      if (!owned) return NextResponse.json({ error: "Quest not found" }, { status: 404 });
      if (owned.plannedMinutes !== null && owned.plannedMinutes !== undefined) {
        if (status !== "COMPLETED" || validation.data.expectedExecutionVersion === undefined ||
          [title, description, requiredMinutes, scheduledFor, elapsedSeconds, difficulty, goalId].some(value => value !== undefined))
          return NextResponse.json({ error: "PLANNER_REVIEW_REQUIRED", message: "Review plan changes in Planner." }, { status: 409 });
        const rewards = await durablePlanner().sessions.complete(session.userId, owned.id, validation.data.expectedExecutionVersion);
        const quest = await prisma.quest.findFirst({ where: { id: owned.id, userId: session.userId } });
        invalidateRankingsCache();
        return NextResponse.json({ quest, rewards });
      }
    }

    const linkedResult = await manualLinkedQuest(session.userId, parseInt(id), validation.data);
    if (linkedResult) return NextResponse.json(linkedResult);

    if (elapsedSeconds !== undefined) return NextResponse.json({ error: "SESSION_PROGRESS_REQUIRED", message: "Study time is accepted through the session protocol." }, { status: 409 });
    return await executionTransaction(session.userId, async tx => {
    // Verify quest ownership
    const quest = await tx.quest.findFirst({
      where: { id: parseInt(id), userId: session.userId },
    });
    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    if (quest.plannedMinutes != null) return NextResponse.json({ error: "PLANNER_EXECUTION_PROTOCOL_REQUIRED", message: "Reload or update this client to change this plan's work." }, { status: 409 });

    // Goal relink: verify the target goal belongs to the user before applying.
    if (goalId !== undefined && goalId !== null) {
      const goal = await tx.goal.findFirst({
        where: { id: goalId, userId: session.userId },
        select: { id: true },
      });
      if (!goal) {
        return NextResponse.json({ error: "Goal not found or unauthorized" }, { status: 404 });
      }
    }

    // ─── STRICT REST-DAY ALLOCATION GUARDRAIL ─────────────────
    // Rescheduling a quest onto a fixed or floating rest day is prohibited.
    if (scheduledFor !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
        return NextResponse.json(
          { error: "Invalid scheduledFor. Expected YYYY-MM-DD." },
          { status: 400 }
        );
      }
      const isRestDay = await StudyScheduleService.isUserRestDay(
        session.userId,
        scheduledFor,
        tx
      );
      if (isRestDay) {
        return NextResponse.json(
          {
            error: "REST_DAY_ALLOCATION_PROHIBITED",
            message: "Quests cannot be scheduled on designated rest days.",
          },
          { status: 400 }
        );
      }
    }

    // Get current user stats
    const user = await tx.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const dataToUpdate: any = {};
    if (title !== undefined) dataToUpdate.title = title;
    if (description !== undefined) dataToUpdate.description = description;
    if (requiredMinutes !== undefined) { dataToUpdate.requiredMinutes = requiredMinutes; dataToUpdate.targetMinutes = requiredMinutes; }
    if (scheduledFor !== undefined) dataToUpdate.scheduledFor = scheduledFor;
    if (elapsedSeconds !== undefined) dataToUpdate.elapsedSeconds = elapsedSeconds;
    if (difficulty !== undefined) dataToUpdate.difficulty = difficulty;
    if (goalId !== undefined) dataToUpdate.goalId = goalId;
    if (status !== undefined) {
      dataToUpdate.status = status;
      dataToUpdate.completedAt = status === "COMPLETED" ? new Date() : null;
    }

    const today = TimezoneService.getUserLocalDate(user.timezone || "UTC");

    const isNewlyCompleted = status === "COMPLETED" && quest.status !== "COMPLETED";
    const isNewlyFailed = status === "FAILED" && quest.status !== "FAILED";

    // ─── Handle COMPLETED ─────────────────────────────────────
    // T3: claim FIRST. claim_quest_reward atomically marks the quest
    // COMPLETED and mints rewards in one transaction — a crash or network
    // drop between the claim and the field update below can therefore
    // never leave a COMPLETED quest with a permanently lost reward.
    if (isNewlyCompleted) {
      const rows = await tx.$queryRaw<
        [{ claim_quest_reward: { success: boolean; questId: number; status: string; xpGained?: number; sylphGained?: number; totalSylphEarned?: number; hpHealed?: number; currentHp?: number; level?: number; currentXP?: number; xpToNextLevel?: number; hunterRank?: string; levelsGained?: number; didRankUp?: boolean; penalty?: { hpLost: number; currentHp: number } } }]
      >`
        SELECT public.claim_quest_reward(
          ${session.userId},
          ${parseInt(id)},
          ${today}
        ) AS claim_quest_reward
      `;

      const claimResult = rows[0]?.claim_quest_reward;

      if (claimResult?.status === "FAILED") {
        // The RPC already set the quest FAILED and applied the HP penalty
        // atomically. Persist any OTHER field edits without clobbering the
        // FAILED status.
        const { status: _s, completedAt: _c, ...restData } = dataToUpdate;
        const updatedQuest = await tx.quest.update({
          where: { id: parseInt(id) },
          data: restData,
        });
        return NextResponse.json({
          quest: { ...updatedQuest, status: "FAILED" },
          penalty: claimResult.penalty,
        }, { status: 200 });
      }

      invalidateRankingsCache();

      // Apply the (idempotent) field update AFTER the atomic claim — purely
      // for response-shape parity; the RPC already persisted status and
      // completedAt inside its own transaction.
      const updatedQuest = await tx.quest.update({
        where: { id: parseInt(id) },
        data: dataToUpdate,
      });

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

    // Update the quest fields (non-completion paths)
    const updatedQuest = await tx.quest.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
    });

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

      {
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
      }

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
    });
  } catch (error) {
    if (error instanceof DurablePlannerError) return NextResponse.json({ error: error.detail.code, detail: error.detail }, { status: 409 });
    if (isPlannerConflict(error)) return NextResponse.json({ error: error instanceof PlannerError ? error.code : "PLANNER_REVIEW_REQUIRED" }, { status: error instanceof PlannerError ? error.status : 409 });
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
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quest = await prisma.quest.findFirst({
      where: { id: parseInt(id), userId: session.userId },
    });
    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    const linkedResult = await manualLinkedQuest(session.userId, parseInt(id), {}, true);
    if (!linkedResult) await executionTransaction(session.userId, tx => tx.quest.delete({ where: { id: parseInt(id), userId: session.userId } }));
    return NextResponse.json({ message: "Quest deleted" }, { status: 200 });
  } catch (error) {
    if (isPlannerConflict(error)) return NextResponse.json({ error: "PLANNER_REVIEW_REQUIRED" }, { status: 409 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
