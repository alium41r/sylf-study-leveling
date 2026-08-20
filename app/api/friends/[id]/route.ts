import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { removeFriendship } from "@/lib/block-service";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/friends/[id]
 * Remove a friendship by friendshipId OR by targetUserId.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const parsedId = parseInt(id);
    const userId = payload.userId as number;

    if (isNaN(parsedId)) {
      return NextResponse.json({ error: "Invalid ID parameter" }, { status: 400 });
    }

    // Try finding by friendship ID first
    const friendshipById = await prisma.friendship.findFirst({
      where: {
        id: parsedId,
        OR: [{ userId }, { friendId: userId }],
      },
    });

    if (friendshipById) {
      const otherUserId = friendshipById.userId === userId ? friendshipById.friendId : friendshipById.userId;
      await removeFriendship(userId, otherUserId);
      return NextResponse.json({ success: true, message: "Friend removed successfully" });
    }

    // Otherwise try finding by other user's ID
    const friendshipByUserId = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: parsedId },
          { userId: parsedId, friendId: userId },
        ],
      },
    });

    if (friendshipByUserId) {
      await removeFriendship(userId, parsedId);
      return NextResponse.json({ success: true, message: "Friend removed successfully" });
    }

    return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
  } catch (error) {
    console.error("DELETE friend error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
