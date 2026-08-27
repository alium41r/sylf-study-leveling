import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import {
  calculateWeeklyStreak,
  getWeeklyBounds,
  calculateWeeklyQuestReward,
} from "@/lib/game-engine";
import { invalidateRankingsCache } from "@/lib/cache-service";
import { revalidateTag } from "next/cache";
import { TimezoneService } from "@/lib/timezone-service";
import { getCognitiveEffects } from "@/lib/cognitive-stats";

const startSessionSchema = z.object({
  questId: z.number().int().optional(),
  subjectId: z.number().int().optional(),
  initialSeconds: z.number().int().min(0).optional(),
});

const endSessionSchema = z.object({
  id: z.number().int(),
  durationMinutes: z.number().int().min(0),
  durationSeconds: z.number().int().min(0).optional(),
  breakSeconds: z.number().int().min(0).optional(),
  questId: z.number().int().optional(),
  completeQuest: z.boolean().optional(),
  final: z.boolean().optional(),
});

interface SettleResult {
  success: boolean;
  sessionId: number;
  isFinal: boolean;
  alreadyClaimed: boolean;
  durationSeconds: number;
  breakSeconds: number;
  deltaSeconds: number;
  awarded: boolean;
  xpGained: number;
  sylphGained: number;
  totalSylphEarned: number;
  questCompleted: boolean;
  questXp: number;
  questSylph: number;
  hpHealed: number;
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  hunterRank: string;
  levelsGained: number;
  didRankUp: boolean;
  nodeProgress: number | null;
  masteryGranted: boolean;
}

/**
 * POST /api/sessions
 * Start a new study session (optionally linked to a quest). When the client
 * has already accumulated focus seconds before the row existed (lazy start),
 * initialSeconds backdates the session's startedAt so the server-side
 * wall-clock clamp never truncates legitimate carried-over time.
 */
export async function POST(req: NextRequest) {
  try {
    const authSession = await getSession(req);
    if (!authSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authSession.userId;

    const body = await req.json();
    const validation = startSessionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { questId, subjectId, initialSeconds } = validation.data;

    // Execute atomic PostgreSQL start_study_session RPC
    const rows = await prisma.$queryRaw<
      [{ start_study_session: { id: number; userId: number; questId: number | null; subjectId: number | null; durationMinutes: number; durationSeconds: number; focusRate: number; startedAt: string } }]
    >`
      SELECT public.start_study_session(
        ${userId},
        ${questId ?? null},
        ${subjectId ?? null},
        ${initialSeconds ?? 0}
      ) AS start_study_session
    `;

    const session = rows[0]?.start_study_session;
    return NextResponse.json(session, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/sessions error:", error);
    // S5: map RPC ownership rejections to clean 4xx (cross-user quest/subject).
    const msg = String(error?.message || "");
    if (/unauthorized|not found/i.test(msg)) {
      return NextResponse.json(
        { error: "Quest or subject not found or unauthorized" },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/sessions
 * Heartbeat / final settlement. ALL session + quest + node + progression
 * mutations happen inside a single atomic PostgreSQL RPC
 * (settle_study_session_atomic): session duration (exact delta accounting),
 * quest completion (with early/GateKey/streak modifiers and HP heal),
 * syllabus node progress, XP/Sylph progression, ledgers, and system messages.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validation = endSessionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { id, durationMinutes, durationSeconds, breakSeconds, questId, completeQuest, final } = validation.data;
    const claimedSeconds = durationSeconds ?? durationMinutes * 60;

    // ─── S4: SETTLE-CYCLE FLOOD GUARD ──────────────────────────
    // The settle RPC grants a small wall-clock grace (+60s), so a rapid
    // start→settle→start→settle loop could farm XP. Cap final settlements to
    // 6 per rolling 60 seconds per user (real studying never trips this).
    if (final === true) {
      const recentSettles = await prisma.studySession.count({
        where: {
          userId: session.userId,
          endedAt: { gte: new Date(Date.now() - 60_000) },
          NOT: { id },
        },
      }).catch(() => 0);
      if (recentSettles >= 6) {
        return NextResponse.json(
          { error: "Too many session settlements. Please wait a moment." },
          { status: 429, headers: { "Retry-After": "30" } }
        );
      }
    }

    const userRow = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        timezone: true,
        lastActiveDate: true,
        streakDays: true,
        level: true,
        stats: { select: { tenacity: true } },
      },
    }).catch(() => null);

    const userLocalDate = userRow
      ? TimezoneService.getUserLocalDate(userRow.timezone || "UTC")
      : null;

    // ─── SINGLE ATOMIC SETTLEMENT ──────────────────────────────
    // Session upsert, wall-clock clamp, exact delta accounting, quest
    // completion, node progress, progression, ledgers, and messages all
    // commit or roll back together inside this one RPC call.
    let rpcResult: SettleResult;
    try {
      const rows = await prisma.$queryRaw<[{ settle_study_session_atomic: SettleResult }]>`
        SELECT public.settle_study_session_atomic(
          ${session.userId},
          ${id},
          ${claimedSeconds},
          ${breakSeconds ?? 0},
          ${questId ?? null},
          ${null},
          ${completeQuest === true},
          ${final === true},
          ${userLocalDate}
        ) AS settle_study_session_atomic
      `;
      rpcResult = rows[0]?.settle_study_session_atomic;
    } catch (err: any) {
      const msg = err?.message || "";
      if (/Session not found/.test(msg)) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      throw err;
    }

    if (!rpcResult) {
      return NextResponse.json({ error: "Settlement failed" }, { status: 500 });
    }

    // ─── WEEKLY STREAK (idempotent conditional update) ─────────
    let weeklyAwarded = false;
    if (userRow) {
      const bounds = getWeeklyBounds(new Date(), userRow.timezone || "UTC");
      if (userRow.lastActiveDate !== bounds.weekKey) {
        const weekSessions = await prisma.studySession.aggregate({
          _sum: { durationMinutes: true },
          where: {
            userId: userRow.id,
            startedAt: {
              gte: bounds.weekStart,
              lte: bounds.weekEnd,
            },
          },
        });

        const weekMinutes = weekSessions._sum.durationMinutes || 0;
        // Tenacity (Iron Will): each ability tier drops the 3-hour weekly
        // milestone requirement by 5% (max −30% → 126 minutes).
        const weeklyTargetMinutes = getCognitiveEffects({
          tenacity: userRow.stats?.tenacity ?? undefined,
        }).weeklyTargetMinutes;
        if (weekMinutes >= weeklyTargetMinutes) {
          const freezeItem = await prisma.inventoryItem.findFirst({
            where: { userId: userRow.id, itemKey: "STREAK_FREEZE", quantity: { gt: 0 } },
          });

          const streakResult = calculateWeeklyStreak(
            userRow.lastActiveDate,
            bounds.weekKey,
            userRow.streakDays,
            !!freezeItem
          );

          const weeklyReward = calculateWeeklyQuestReward(userRow.level);

          // Conditional update: exactly ONE concurrent request wins the
          // streak write for this week (rowCount === 1). Losers skip cleanly
          // instead of double-awarding sylph/messages.
          const updated = await prisma.user.updateMany({
            where: { id: userRow.id, lastActiveDate: { not: bounds.weekKey } },
            data: {
              streakDays: streakResult.newStreak,
              lastActiveDate: bounds.weekKey,
              sylph: { increment: weeklyReward.sylphReward },
            },
          });

          if (updated.count > 0) {
            weeklyAwarded = true;

            if (streakResult.freezeUsed && freezeItem) {
              await prisma.inventoryItem.updateMany({
                where: { id: freezeItem.id, quantity: { gt: 0 } },
                data: { quantity: { decrement: 1 } },
              });
              await prisma.systemMessage.create({
                data: {
                  userId: userRow.id,
                  content: `**Weekly Streak Freeze Consumed**\n\nYour Streak Freeze protected your weekly streak after a missed cycle. Streak continues at **${streakResult.newStreak} weeks**!`,
                  type: "STREAK",
                },
              });
            }

            await prisma.systemMessage.create({
              data: {
                userId: userRow.id,
                content: `**Weekly Mission Complete: ${Math.round(weeklyTargetMinutes / 60 * 10) / 10} Hours of Focus!**\n\nYou completed the weekly ${weeklyTargetMinutes}-minute study target (Tenacity reduces it below the standard 3h). Weekly streak is now **${streakResult.newStreak} week${streakResult.newStreak === 1 ? "" : "s"}**!\n\nRewards Claimed: +${weeklyReward.xpReward} XP, +${weeklyReward.sylphReward} Sylph.`,
                type: "STREAK",
              },
            });
          }
        }
      }
    }

    invalidateRankingsCache();

    const username = userRow?.username;
    if (username) {
      try {
        revalidateTag(`user-${username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${username.toLowerCase()}`, "max");
      } catch {}
    }

    // Respond immediately with the RPC result — no trailing re-read.
    return NextResponse.json(
      {
        ...rpcResult,
        questCompletedNow: rpcResult.questCompleted,
        weeklyAwarded,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("PATCH /api/sessions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
