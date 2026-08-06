import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACHIEVEMENTS_CATALOG, AchievementDef } from "@/lib/achievements-catalog";
import { verifyToken } from "@/lib/auth";

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
      select: { totalStudyMinutes: true, streakDays: true, hunterRank: true }
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const questCount = await prisma.quest.count({
      where: { userId, status: "COMPLETED" }
    });

    const friendCount = await prisma.friendship.count({
      where: { userId }
    });

    const cosmeticsCount = await prisma.userCosmetic.count({
      where: { userId }
    });

    const ledger = await prisma.sylphLedger.aggregate({
      where: { userId, amount: { lt: 0 } },
      _sum: { amount: true }
    });
    const totalSylphSpent = Math.abs(ledger._sum.amount || 0);

    // 2. Fetch claimed achievements
    const claimedRecords = await prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true, claimedAt: true }
    });
    const claimedSet = new Set(claimedRecords.map((r: any) => r.achievementId));

    // 3. Map progress
    const ranks: Record<string, number> = { "E": 1, "D": 2, "C": 3, "B": 4, "A": 5, "S": 6 };
    const userRankVal = ranks[user.hunterRank] || 1;

    const enriched = ACHIEVEMENTS_CATALOG.map(ach => {
      let progress = 0;
      switch (ach.category) {
        case "Study":
          progress = user.totalStudyMinutes;
          break;
        case "Streaks":
          progress = user.streakDays;
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
          if (ach.id === "exploration_theme") progress = cosmeticsCount;
          else if (ach.id.includes("spend")) progress = totalSylphSpent;
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

    // Validate progress (we must re-calculate the specific achievement's progress)
    // To keep it simple, we re-run the same dynamic queries for just what is needed
    let progress = 0;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    switch (ach.category) {
      case "Study": progress = user.totalStudyMinutes; break;
      case "Streaks": progress = user.streakDays; break;
      case "Rank":
        const ranks: Record<string, number> = { "E": 1, "D": 2, "C": 3, "B": 4, "A": 5, "S": 6 };
        progress = ranks[user.hunterRank] || 1;
        break;
      case "Social":
        progress = await prisma.friendship.count({ where: { userId } });
        break;
      case "Quests":
        progress = await prisma.quest.count({ where: { userId, status: "COMPLETED" } });
        break;
      case "Exploration":
        if (ach.id === "exploration_theme") {
          progress = await prisma.userCosmetic.count({ where: { userId } });
        } else if (ach.id.includes("spend")) {
          const l = await prisma.sylphLedger.aggregate({ where: { userId, amount: { lt: 0 } }, _sum: { amount: true }});
          progress = Math.abs(l._sum.amount || 0);
        }
        break;
    }

    if (progress < ach.target) {
      return NextResponse.json({ error: "Requirements not met" }, { status: 400 });
    }

    // Process Reward in a Transaction
    await prisma.$transaction(async (tx: any) => {
      // 1. Mark as claimed
      await tx.userAchievement.create({
        data: { userId, achievementId }
      });

      // 2. Grant Reward
      if (ach.reward.type === "SYLPH") {
        await tx.user.update({
          where: { id: userId },
          data: { sylph: { increment: ach.reward.amount } }
        });
        await tx.sylphLedger.create({
          data: { userId, amount: ach.reward.amount, source: "ACHIEVEMENT" }
        });
      } else if (ach.reward.type === "XP") {
        // Simple XP increment (level up logic is usually complex, but we'll increment currentXP)
        await tx.user.update({
          where: { id: userId },
          data: { currentXP: { increment: ach.reward.amount } }
        });
      } else if (ach.reward.type === "ITEM" && ach.reward.itemKey) {
        // Add to inventory
        const existingItem = await tx.inventoryItem.findFirst({
          where: { userId, itemKey: ach.reward.itemKey }
        });
        if (existingItem) {
          await tx.inventoryItem.update({
            where: { id: existingItem.id },
            data: { quantity: { increment: ach.reward.amount } }
          });
        } else {
          await tx.inventoryItem.create({
            data: { userId, itemKey: ach.reward.itemKey, quantity: ach.reward.amount }
          });
        }
      }
    });

    const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
    return NextResponse.json({ success: true, message: "Reward claimed!", user: updatedUser });

  } catch (error: any) {
    console.error("Achievement Claim Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
