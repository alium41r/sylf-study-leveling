import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { removeFriendship } from "@/lib/block-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/friends/remove
 * Body: { targetUserId: number }
 * Removes friendship and any pending friend requests between users.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.targetUserId || body.friendId || body.userId;

    if (!targetUserId || typeof targetUserId !== "number") {
      return NextResponse.json(
        { error: "Target user ID is required" },
        { status: 400 }
      );
    }

    if (targetUserId === userId) {
      return NextResponse.json(
        { error: "Cannot remove yourself as a friend" },
        { status: 400 }
      );
    }

    const success = await removeFriendship(userId, targetUserId);
    if (!success) {
      return NextResponse.json(
        { error: "Failed to remove friend" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Friend removed successfully",
    });
  } catch (error) {
    console.error("POST /api/friends/remove error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  return POST(req);
}
