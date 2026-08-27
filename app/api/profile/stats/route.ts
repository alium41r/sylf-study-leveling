import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { xpForNextLevel } from "@/lib/game-engine";

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        totalStudyMinutes: true, 
        streakDays: true, 
        createdAt: true, 
        level: true, 
        currentXP: true 
      }
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const questsCompleted = await prisma.quest.count({
      where: { userId, status: "COMPLETED" }
    });

    // @ts-ignore - Prisma types are cached in IDE
    const achievementsEarned = await prisma.userAchievement.count({
      where: { userId }
    });

    const nextLevelXP = xpForNextLevel(user.level);

    return NextResponse.json({
      stats: {
        totalStudyHours: Math.floor(user.totalStudyMinutes / 60),
        questsCompleted,
        achievementsEarned,
        joinedDate: user.createdAt,
        streakDays: user.streakDays
      },
      nextUnlock: {
        currentXP: user.currentXP,
        requiredXP: nextLevelXP,
        nextLevel: user.level + 1
      }
    });
  } catch (error: any) {
    console.error("Profile Stats Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
