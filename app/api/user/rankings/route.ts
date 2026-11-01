import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { getCachedGlobalRankings } from "@/lib/cache-service";
import { isVisible } from "@/lib/privacy";
import { Relationship } from "@/lib/privacy-types";

/**
 * GET /api/user/rankings
 * Returns leaderboard data: global rankings + friend rankings.
 * Sortable by: level, totalStudyMinutes, streakDays, questsCompleted.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const { searchParams } = new URL(req.url);
    const sortBy = searchParams.get("sortBy") || "level";

    // Retrieve cached global leaderboard data
    const cachedUsers = await getCachedGlobalRankings();

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

    // The board shows rank and hours together, so a person is on it only if this viewer
    // may see both. Everyone keeps their own place; the settings travel with the cached entry.
    const leaderboard = cachedUsers
      .filter(({ id, privacy }) => {
        if (id === userId) return true;
        const relationship = friendIds.has(id) ? Relationship.FRIEND : Relationship.PUBLIC;
        return [privacy.profileVisibility, privacy.showRank, privacy.showStudyHours].every((setting) => isVisible(setting, relationship));
      })
      .map(({ id, username, name, hunterRank, level, currentXP, totalStudyMinutes, studyHours, streakDays, questsCompleted }) => ({
        id, username, name, hunterRank, level, currentXP, totalStudyMinutes, studyHours, streakDays, questsCompleted,
        isCurrentUser: id === userId,
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
