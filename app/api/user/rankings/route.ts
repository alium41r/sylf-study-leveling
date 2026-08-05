import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/user/rankings
 * Returns leaderboard data: global rankings + friend rankings.
 * Sortable by: level, totalStudyMinutes, streakDays, questsCompleted.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const { searchParams } = new URL(req.url);
    const sortBy = searchParams.get("sortBy") || "level";

    // Get all users with relevant stats
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        hunterRank: true,
        level: true,
        currentXP: true,
        totalStudyMinutes: true,
        streakDays: true,
        quests: {
          where: { status: "COMPLETED" },
          select: { id: true },
        },
      },
    });

    // Map users to leaderboard entries
    const leaderboard = allUsers.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      hunterRank: u.hunterRank,
      level: u.level,
      currentXP: u.currentXP,
      totalStudyMinutes: u.totalStudyMinutes,
      studyHours: Math.floor(u.totalStudyMinutes / 60),
      streakDays: u.streakDays,
      questsCompleted: u.quests.length,
      isCurrentUser: u.id === userId,
    }));

    // Sort
    const sortFn = (a: (typeof leaderboard)[0], b: (typeof leaderboard)[0]) => {
      switch (sortBy) {
        case "studyHours":
          return b.totalStudyMinutes - a.totalStudyMinutes;
        case "streak":
          return b.streakDays - a.streakDays;
        case "quests":
          return b.questsCompleted - a.questsCompleted;
        case "level":
        default:
          return b.level === a.level ? b.currentXP - a.currentXP : b.level - a.level;
      }
    };

    leaderboard.sort(sortFn);

    // Assign ranks
    const globalRankings = leaderboard.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }));

    // Get current user's friends
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userId }, { friendId: userId }] },
      select: { userId: true, friendId: true },
    });

    const friendIds = new Set<number>();
    friendIds.add(userId); // Include self in friend rankings
    for (const f of friendships) {
      friendIds.add(f.userId === userId ? f.friendId : f.userId);
    }

    const friendRankings = globalRankings
      .filter((e) => friendIds.has(e.id))
      .map((entry, idx) => ({ ...entry, friendRank: idx + 1 }));

    // Find current user's position
    const currentUserGlobalRank = globalRankings.find((e) => e.isCurrentUser)?.rank || 0;

    return NextResponse.json({
      global: globalRankings.slice(0, 50), // Top 50
      friends: friendRankings,
      currentUserRank: currentUserGlobalRank,
      totalPlayers: globalRankings.length,
    });
  } catch (error) {
    console.error("GET rankings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
