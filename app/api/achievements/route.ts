import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACHIEVEMENTS_CATALOG } from "@/lib/achievements-catalog";
import { verifyToken } from "@/lib/auth";
import { invalidateRankingsCache } from "@/lib/cache-service";

export const dynamic = "force-dynamic";

// Helper to authenticate
async function getUserId(request: Request): Promise<number | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  try {
    const payload = await verifyToken(token);
    return payload ? (payload.userId as number) : null;
  } catch {
    return null;
  }
}

// Fetch all achievements with dynamic progress and claim status
export async function GET(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // 1. Gather all required stats dynamically
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalStudyMinutes: true, totalStudySeconds: true, streakDays: true, hunterRank: true }
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [questCount, friendCount, cosmeticsCount, sessionCount, ledger] = await Promise.all([
      prisma.quest.count({
        where: { userId, status: "COMPLETED" }
      }).catch(() => 0),
      prisma.friendship.count({
        where: { OR: [{ userId }, { friendId: userId }] }
      }).catch(() => 0),
      prisma.userCosmetic.count({
        where: { userId }
      }).catch(() => 0),
      prisma.studySession.count({
        where: { userId }
      }).catch(() => 0),
      prisma.sylphLedger.aggregate({
        where: { userId, amount: { lt: 0 } },
        _sum: { amount: true }
      }).catch(() => ({ _sum: { amount: 0 } }))
    ]);

    const totalSylphSpent = Math.abs(ledger._sum.amount || 0);
    const studyMinutes = Math.max(user.totalStudyMinutes || 0, Math.floor((user.totalStudySeconds || 0) / 60));

    // 2. Fetch claimed achievements
    const claimedRecords = await prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true, claimedAt: true }
    }).catch(() => []);
    const claimedSet = new Set(claimedRecords.map((r: any) => r.achievementId));

    // 3. Map progress
    const ranks: Record<string, number> = { "E": 1, "D": 2, "C": 3, "B": 4, "A": 5, "S": 6 };
    const userRankVal = ranks[user.hunterRank] || 1;

    const enriched = ACHIEVEMENTS_CATALOG.map(ach => {
      let progress = 0;
      switch (ach.category) {
        case "Study":
          if (ach.id === "study_first_session") {
            progress = Math.max(sessionCount, studyMinutes >= 1 ? 1 : 0);
          } else {
            progress = studyMinutes;
          }
          break;
        case "Streaks":
          progress = user.streakDays || 0;
          break;
        case "Rank":
          progress = userRankVal;
          break;
        case "Social":
          progress = friendCount;
          break;
        case "Quests":
          progress = questCount;
          break;
        case "Exploration":
          if (ach.id === "exploration_theme") {
            progress = cosmeticsCount;
          } else if (ach.id.includes("spend")) {
            progress = totalSylphSpent;
          }
          break;
      }

      return {
        ...ach,
        currentProgress: Math.min(progress, ach.target),
        isClaimed: claimedSet.has(ach.id)
      };
    });

    return NextResponse.json({ achievements: enriched });
  } catch (error: any) {
    console.error("Achievements GET Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Claim an achievement
export async function POST(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { achievementId } = await request.json();
    const ach = ACHIEVEMENTS_CATALOG.find(a => a.id === achievementId);
    if (!ach) return NextResponse.json({ error: "Achievement not found" }, { status: 404 });

    // Verify not already claimed
    const existing = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } }
    });
    if (existing) return NextResponse.json({ error: "Already claimed" }, { status: 400 });

    // Validate progress
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let progress = 0;
    const studyMinutes = Math.max(user.totalStudyMinutes || 0, Math.floor((user.totalStudySeconds || 0) / 60));

    switch (ach.category) {
      case "Study":
        if (ach.id === "study_first_session") {
          const sessionCount = await prisma.studySession.count({ where: { userId } }).catch(() => 0);
          progress = Math.max(sessionCount, studyMinutes >= 1 ? 1 : 0);
        } else {
          progress = studyMinutes;
        }
        break;
      case "Streaks":
        progress = user.streakDays || 0;
        break;
      case "Rank":
        const ranks: Record<string, number> = { "E": 1, "D": 2, "C": 3, "B": 4, "A": 5, "S": 6 };
        progress = ranks[user.hunterRank] || 1;
        break;
      case "Social":
        progress = await prisma.friendship.count({
          where: { OR: [{ userId }, { friendId: userId }] }
        }).catch(() => 0);
        break;
      case "Quests":
        progress = await prisma.quest.count({
          where: { userId, status: "COMPLETED" }
        }).catch(() => 0);
        break;
      case "Exploration":
        if (ach.id === "exploration_theme") {
          progress = await prisma.userCosmetic.count({ where: { userId } }).catch(() => 0);
        } else if (ach.id.includes("spend")) {
          const l = await prisma.sylphLedger.aggregate({
            where: { userId, amount: { lt: 0 } },
            _sum: { amount: true }
          }).catch(() => ({ _sum: { amount: 0 } }));
          progress = Math.abs(l._sum.amount || 0);
        }
        break;
    }

    if (progress < ach.target) {
      return NextResponse.json({ error: "Requirements not met" }, { status: 400 });
    }

    // Process Reward
    if (ach.reward.type === "XP" || ach.reward.type === "SYLPH") {
      // Atomic redemption via SECURITY DEFINER RPC: claim record +
      // XP/Sylph credit + canonical level/rank recompute + ledgers
      // inside one row-locked Postgres transaction.
      const rows = await prisma.$queryRawUnsafe<
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
      await prisma.systemMessage
        .create({
          data: {
            userId,
            type: "REWARD",
            content: `[ACHIEVEMENT] Unlocked: **${ach.title}**! Claimed +${ach.reward.amount} ${ach.reward.type}.`,
          },
        })
        .catch(() => null);
    } else if (ach.reward.type === "ITEM" && ach.reward.itemKey) {
      // Item rewards stay in Prisma-land (inventory is not part of the
      // progression ledgers); the claim record + inventory update are
      // transactional.
      await prisma.$transaction(async (tx: any) => {
        await tx.userAchievement.create({
          data: { userId, achievementId },
        });

        const existingItem = await tx.inventoryItem.findFirst({
          where: { userId, itemKey: ach.reward.itemKey },
        });
        if (existingItem) {
          await tx.inventoryItem.update({
            where: { id: existingItem.id },
            data: { quantity: { increment: ach.reward.amount } },
          });
        } else {
          await tx.inventoryItem.create({
            data: { userId, itemKey: ach.reward.itemKey, quantity: ach.reward.amount },
          });
        }

        if (tx?.systemMessage?.create) {
          await tx.systemMessage
            .create({
              data: {
                userId,
                type: "REWARD",
                content: `[ACHIEVEMENT] Unlocked: **${ach.title}**! Claimed +${ach.reward.amount} ${ach.reward.type}${ach.reward.itemKey ? ` (${ach.reward.itemKey.replace(/_/g, " ")})` : ""}.`,
              },
            })
            .catch(() => null);
        }
      });
    }

    invalidateRankingsCache();
    const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
    return NextResponse.json({ success: true, message: "Reward claimed!", user: updatedUser });

  } catch (error: any) {
    console.error("Achievement Claim Error:", error);
    // Map atomic-RPC idempotency errors (including the unique-constraint
    // race backstop) to a precise client response.
    if (
      error?.code === "S0001" ||
      error?.code === "23505" ||
      /ALREADY_CLAIMED/.test(error?.message || "")
    ) {
      return NextResponse.json({ error: "Already claimed" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
