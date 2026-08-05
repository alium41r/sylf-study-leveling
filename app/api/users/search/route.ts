import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/users/search?q=searchterm
 * Search users by username. Excludes current user and already-friended users.
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

    // Search users by username (contains match)
    const users = await prisma.user.findMany({
      where: {
        id: { not: userId },
        username: { contains: q.toLowerCase() },
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
