import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import {
  calculateWeeklyStreak,
  getWeeklyBounds,
  calculateWeeklyQuestReward,
} from "@/lib/game-engine";
import { invalidateRankingsCache } from "@/lib/cache-service";
import { revalidateTag } from "next/cache";
import { clampSessionSeconds } from "@/lib/session-math";

const startSessionSchema = z.object({
  questId: z.number().int().optional(),
  subjectId: z.number().int().optional(),
});

const endSessionSchema = z.object({
  id: z.number().int(),
  durationMinutes: z.number().int().min(0),
  durationSeconds: z.number().int().min(0).optional(),
  questId: z.number().int().optional(),
  completeQuest: z.boolean().optional(),
  final: z.boolean().optional(),
});

interface SessionRewardClaimInput {
  userId: number;
  sessionId: number;
  xp: number;
  sylph: number;
  nodeId: number | null;
  progressDelta: number;
}

interface SessionRewardClaimResult {
  success: boolean;
  xpGained: number;
  sylphGained: number;
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  hunterRank: string;
  levelsGained: number;
  didRankUp: boolean;
  nodeProgress: number | null;
  masteryGranted: boolean;
}

const EMPTY_SESSION_CLAIM: SessionRewardClaimResult = {
  success: false,
  xpGained: 0,
  sylphGained: 0,
  level: 1,
  currentXP: 0,
  xpToNextLevel: 282,
  hunterRank: "E",
  levelsGained: 0,
  didRankUp: false,
  nodeProgress: null,
  masteryGranted: false,
};

/**
 * Delegates XP/Sylph/node-progress mutations to the atomic,
 * row-locked SECURITY DEFINER RPC claim_session_reward_atomic.
 * ALREADY_CLAIMED (S0001) is absorbed into a no-op result so
 * client retries never double-award and never hard-fail.
 */
async function claimSessionRewardAtomic(input: SessionRewardClaimInput): Promise<SessionRewardClaimResult> {
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        claim_session_reward_atomic: {
          success: boolean;
          xpGained: number;
          sylphGained: number;
          level: number;
          currentXP: number;
          xpToNextLevel: number;
          hunterRank: string;
          levelsGained: number;
          didRankUp: boolean;
          nodeProgress: number | null;
          masteryGranted: boolean;
        };
      }>
    >(
      `SELECT public.claim_session_reward_atomic($1::text, $2::text, $3::int, $4::int, $5::text, $6::numeric) AS claim_session_reward_atomic`,
      String(input.userId),
      String(input.sessionId),
      input.xp,
      input.sylph,
      input.nodeId === null ? null : String(input.nodeId),
      String(input.progressDelta)
    );
    const result = rows[0]?.claim_session_reward_atomic;
    if (!result) throw new Error("claim_session_reward_atomic returned no result");
    return result;
  } catch (err: any) {
    if (err?.code === "S0001" || /ALREADY_CLAIMED/.test(err?.message || "")) {
      return { ...EMPTY_SESSION_CLAIM, success: true };
    }
    throw err;
  }
}

/**
 * POST /api/sessions
 * Start a new study session. Optionally link it to a quest.
 */export async function POST(req: NextRequest) {
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

    const { id, durationMinutes, durationSeconds, questId, completeQuest, final } = validation.data;
    const claimedSeconds = durationSeconds ?? durationMinutes * 60;

    // Verify session ownership
    const existing = await prisma.studySession.findFirst({
      where: { id, userId: payload.userId as number },
    });
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // ─── SERVER-SIDE TIMESTAMP CLAMPING ───────────────────────
    // The claimed duration can never exceed wall-clock elapsed time
    // since session start (+ a small grace window). This defeats both
    // unit-mismatch inflation (seconds passed as minutes) and spoofing.
    const startedAtMs = new Date(existing.startedAt).getTime();
    const actualSeconds = Number.isFinite(startedAtMs)
      ? clampSessionSeconds(claimedSeconds, startedAtMs)
      : Math.max(0, Math.floor(claimedSeconds || 0));
    const actualMinutes = Math.floor(actualSeconds / 60);

    // Execute atomic PostgreSQL complete_study_session RPC.
    // The RPC performs exact delta accounting against the previously
    // credited duration and awards canonical rewards only on final.
    const rows = await prisma.$queryRaw<
      [{ complete_study_session: { sessionId: number; userId: number; durationMinutes: number; durationSeconds: number; deltaSeconds: number; awarded: boolean; xpGained: number; sylphGained: number; totalSylphEarned: number; level: number; currentXP: number; xpToNextLevel: number; hunterRank: string; levelsGained: number; didRankUp: boolean } }]
    >`
      SELECT public.complete_study_session(
        ${payload.userId as number},
        ${id},
        ${actualMinutes},
        ${actualSeconds},
        ${questId ?? null},
        null,
        80,
        ${final === true}
      ) AS complete_study_session
    `;

    const rpcResult = rows[0]?.complete_study_session;
    const sessionDeltaSeconds = rpcResult?.deltaSeconds ?? 0;

    // Reconcile Quest & Subject Node Progress.
    // NOTE: the RPC has already added THIS flush's delta to
    // Quest.elapsedSeconds — re-read the fresh value so completion
    // checks and node-progress ratios never double-count.
    if (questId) {
      const quest = await prisma.quest.findFirst({
        where: { id: Number(questId), userId: payload.userId as number },
        include: {
          subjectNode: {
            select: {
              id: true,
              progress: true,
              isMastered: true,
              masteredAt: true,
              spAward: true,
              nodeId: true,
              title: true,
            },
          },
        },
      });

      if (quest && quest.status === "ACTIVE") {
        const targetDuration = (quest.targetMinutes || quest.requiredMinutes || 45) * 60;
        const totalQuestElapsed = quest.elapsedSeconds || 0;
        const shouldComplete = completeQuest === true || totalQuestElapsed >= targetDuration;

        if (shouldComplete) {
          // 1. Atomic quest-reward claim via SECURITY DEFINER RPC:
          //    XP + Sylph + node progress + level/rank recompute + ledgers
          //    all happen inside one row-locked Postgres transaction.
          const deltaProgress = Math.min(
            100.0,
            Math.max(5.0, Math.floor(quest.scopeWeight * 100))
          );

          const claimResult = await claimSessionRewardAtomic({
            userId: payload.userId as number,
            sessionId: id,
            xp: quest.xpReward,
            sylph: quest.sylphReward,
            nodeId: quest.subjectNodeId ?? null,
            progressDelta: deltaProgress,
          });

          // 2. Mark Quest as Completed (status only — elapsedSeconds was
          //    already credited exactly by the RPC's delta accounting).
          await prisma.quest.update({
            where: { id: quest.id },
            data: {
              status: "COMPLETED",
              completedAt: new Date(),
            },
          });

          // 3. Reward & mastery announcements
          await prisma.systemMessage.create({
            data: {
              userId: payload.userId as number,
              type: "REWARD",
              content: `**🏆 QUEST COMPLETED: ${quest.title}**\n\nTarget Duration: ${quest.targetMinutes || quest.requiredMinutes || 45} mins.\n\nRewards Claimed: **+${quest.xpReward} XP** • **+${quest.sylphReward} Sylph**.`,
            },
          });

          if (claimResult.masteryGranted && quest.subjectNode) {
            await prisma.systemMessage.create({
              data: {
                userId: payload.userId as number,
                type: "REWARD",
                content: `**🎯 SYLLABUS NODE MASTERED: ${quest.subjectNode.title}**\n\nYou achieved 100% mastery on node **${quest.subjectNode.nodeId}**!\n\nReward Minted: **+${quest.subjectNode.spAward} Subject SP**.`,
              },
            });
          }

          const username = (
            await prisma.user.findUnique({
              where: { id: payload.userId as number },
              select: { username: true },
            })
          )?.username;
          if (username) {
            try {
              revalidateTag(`user-${username.toLowerCase()}`, "max");
              revalidateTag(`profile-stats-${username.toLowerCase()}`, "max");
            } catch {}
          }
        } else {
          // Quest is NOT completed yet. elapsedSeconds was already credited
          // exactly by the RPC (delta accounting) — advance the syllabus node
          // proportionally to THIS flush's delta only.
          if (quest.subjectNodeId && quest.subjectNode) {
            const node = quest.subjectNode;
            const completionRatio = Math.min(1.0, sessionDeltaSeconds / targetDuration);
            const rawDelta = Math.floor(quest.scopeWeight * 100 * completionRatio);
            const deltaProgress = sessionDeltaSeconds >= 30 ? Math.min(100.0, Math.max(1.0, rawDelta)) : 0;

            const claimResult = await claimSessionRewardAtomic({
              userId: payload.userId as number,
              sessionId: id,
              xp: 0,
              sylph: 0,
              nodeId: node.id,
              progressDelta: deltaProgress,
            });

            if (claimResult.masteryGranted) {
              await prisma.systemMessage.create({
                data: {
                  userId: payload.userId as number,
                  type: "REWARD",
                  content: `**🎯 SYLLABUS NODE MASTERED: ${node.title}**\n\nYou achieved 100% mastery on node **${node.nodeId}**!\n\nReward Minted: **+${node.spAward} Subject SP**.`,
                },
              });
            }
          }
        }
      }
    }

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
