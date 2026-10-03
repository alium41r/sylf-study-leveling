import { executionTransaction } from "@/lib/execution-coordination";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACHIEVEMENTS_CATALOG } from "@/lib/achievements-catalog";
import { getSession } from "@/lib/auth-server";
import { readAchievementFacts } from "@/lib/achievement-facts";
import { achievementProgress } from "@/lib/achievement-progress";
import { invalidateRankingsCache } from "@/lib/cache-service";

export const dynamic = "force-dynamic";

// Helper to authenticate
async function getUserId(request: Request): Promise<number | null> {
  const session = await getSession(request);
  return session ? (session.userId as number) : null;
}

// Fetch all achievements with dynamic progress and claim status
export async function GET(request: Request) {
  const userId = await getUserId(request);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const facts = await readAchievementFacts(userId);
    if (!facts)
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    const claimedRecords = await prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true, claimedAt: true },
    });
    const claimedSet = new Set(
      claimedRecords.map((record) => record.achievementId)
    );
    const enriched = ACHIEVEMENTS_CATALOG.map((achievement) => ({
      ...achievement,
      currentProgress: achievementProgress(achievement, facts),
      isClaimed: claimedSet.has(achievement.id),
    }));
    const activeIds = new Set(
      ACHIEVEMENTS_CATALOG.map((achievement) => achievement.id)
    );
    const retiredClaimedCount = claimedRecords.filter(
      (record) => !activeIds.has(record.achievementId)
    ).length;

    return NextResponse.json({ achievements: enriched, retiredClaimedCount });
  } catch (error: unknown) {
    console.error("Achievements GET Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// Claim an achievement
export async function POST(request: Request) {
  const userId = await getUserId(request);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { achievementId } = await request.json().catch(() => ({}));
    const ach = ACHIEVEMENTS_CATALOG.find((a) => a.id === achievementId);
    if (!ach)
      return NextResponse.json(
        { error: "Achievement not found" },
        { status: 404 }
      );

    return await executionTransaction(userId, async tx => {
    // Verify not already claimed
    const existing = await tx.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
    });
    if (existing)
      return NextResponse.json({ error: "Already claimed" }, { status: 400 });

    const facts = await readAchievementFacts(userId, tx);
    if (!facts)
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    const progress = achievementProgress(ach, facts);

    if (progress < ach.target) {
      return NextResponse.json(
        { error: "Requirements not met" },
        { status: 400 }
      );
    }

    // Process Reward
    if (ach.reward.type === "XP" || ach.reward.type === "SYLPH") {
      // Atomic redemption via SECURITY DEFINER RPC: claim record +
      // XP/Sylph credit + canonical level/rank recompute + ledgers
      // inside one row-locked Postgres transaction.
      const rows = await tx.$queryRawUnsafe<
        Array<{
          claim_achievement_reward_atomic: {
            success: boolean;
            achievementId: string;
            xpGained: number;
            sylphGained: number;
            level: number;
            currentXP: number;
            xpToNextLevel: number;
            hunterRank: string;
            levelsGained: number;
            didRankUp: boolean;
          };
        }>
      >(
        `SELECT public.claim_achievement_reward_atomic($1::text, $2::text, $3::int, $4::int, $5::text) AS claim_achievement_reward_atomic`,
        String(userId),
        achievementId,
        ach.reward.type === "XP" ? ach.reward.amount : 0,
        ach.reward.type === "SYLPH" ? ach.reward.amount : 0,
        ach.title
      );

      const rpcResult = rows[0]?.claim_achievement_reward_atomic;
      if (!rpcResult || !rpcResult.success) {
        throw new Error("claim_achievement_reward_atomic returned no result");
      }

      // System Notification
      await tx.systemMessage
        .create({
          data: {
            userId,
            type: "REWARD",
            content: `[ACHIEVEMENT] Unlocked: **${ach.title}**! Claimed +${ach.reward.amount} ${ach.reward.type}.`,
          },
        })
        .catch(() => null);
    }

    invalidateRankingsCache();
    const updatedUser = await tx.user.findUnique({ where: { id: userId } });
    return NextResponse.json({
      success: true,
      message: "Reward claimed!",
      user: updatedUser,
    });
    });
  } catch (error: unknown) {
    console.error("Achievement Claim Error:", error);
    // Map atomic-RPC idempotency errors (including the unique-constraint
    // race backstop) to a precise client response.
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    const message =
      typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "";
    if (
      code === "S0001" ||
      code === "23505" ||
      /ALREADY_CLAIMED/.test(message)
    ) {
      return NextResponse.json({ error: "Already claimed" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
