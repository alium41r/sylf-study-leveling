import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

/**
 * GET /api/users/search?q=searchterm
 * Search users by username. Excludes current user, already-friended users,
 * blocked users (both directions), and PRIVATE profiles (S3).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const q = req.nextUrl.searchParams.get("q");

    if (!q || q.length < 2) {
      return NextResponse.json([]);
    }

    // Get IDs of existing friends
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userId }, { friendId: userId }] },
      select: { userId: true, friendId: true },
    });

    const friendIds = new Set<number>();
    friendships.forEach((f) => {
      friendIds.add(f.userId);
      friendIds.add(f.friendId);
    });
    friendIds.delete(userId); // remove self

    // S3: exclude blocked users (either direction) from search results.
    const blockedRows = await prisma.$queryRaw<Array<{ blockedId: number; userId: number }>>`
      SELECT "blockedId", "userId" FROM "BlockedUser"
      WHERE "userId" = ${userId} OR "blockedId" = ${userId}
    `.catch(() => []);
    const blockedIds = new Set<number>(
      blockedRows.flatMap((r) => [r.blockedId, r.userId]).filter((id) => id !== userId)
    );

    // Search users by username (contains match); PRIVATE profiles are hidden.
    const users = await prisma.user.findMany({
      where: {
        id: {
          not: userId,
          ...(blockedIds.size > 0 ? { notIn: [...blockedIds] } : {}),
        },
        username: { contains: q.toLowerCase() },
        privacy: { is: { profileVisibility: { not: "PRIVATE" } } },
      },
      select: {
        id: true,
        name: true,
        username: true,
        hunterRank: true,
        level: true,
      },
      take: 10,
    });

    // Mark which ones are already friends
    const enriched = users.map((u) => ({
      ...u,
      isFriend: friendIds.has(u.id),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("User search error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
