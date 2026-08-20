import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";

export interface CachedLeaderboardEntry {
  id: number;
  username: string;
  name: string | null;
  hunterRank: string;
  level: number;
  currentXP: number;
  totalStudyMinutes: number;
  studyHours: number;
  streakDays: number;
  questsCompleted: number;
}

/**
 * In-memory cached global leaderboard data.
 * Revalidates every 5 minutes (300s) or on-demand via tag 'global-rankings'.
 */
export const getCachedGlobalRankings = unstable_cache(
  async (): Promise<CachedLeaderboardEntry[]> => {
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

    return allUsers.map((u) => ({
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
    }));
  },
  ["global-rankings-cache-key"],
  {
    revalidate: 300,
    tags: ["global-rankings", "leaderboard"],
  }
);

export interface CachedAcousticTrack {
  id: number;
  title: string;
  category: string;
  frequency: string | null;
  audioUrl: string;
  duration: number;
  defaultVolume: number;
  description: string | null;
  tags: string[];
  isPreset: boolean;
  orderIndex: number;
}

/**
 * In-memory cached acoustic soundscape catalog.
 * Revalidates every 1 hour (3600s) or on-demand via tag 'acoustic-tracks'.
 */
export const getCachedAcousticTracks = unstable_cache(
  async (): Promise<CachedAcousticTrack[]> => {
    const tracks = await prisma.acousticTrack.findMany({
      orderBy: { orderIndex: "asc" },
      select: {
        id: true,
        title: true,
        category: true,
        frequency: true,
        audioUrl: true,
        duration: true,
        defaultVolume: true,
        description: true,
        tags: true,
        isPreset: true,
        orderIndex: true,
      },
    });

    return tracks;
  },
  ["acoustic-tracks-cache-key"],
  {
    revalidate: 3600,
    tags: ["acoustic-tracks", "acoustics"],
  }
);

/**
 * Invalidate cached leaderboard rankings upon quest or session completion.
 */
export function invalidateRankingsCache() {
  try {
    revalidateTag("global-rankings", "max");
  } catch (err) {
    console.error("Failed to revalidate rankings cache tag:", err);
  }
}
