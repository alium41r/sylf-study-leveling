import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { unblockUser } from "@/lib/block-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/friends/unblock
 * Body: { targetUserId: number }
 * Unblocks the target user.
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

    const success = await unblockUser(userId, targetUserId);
    if (!success) {
      return NextResponse.json(
        { error: "Failed to unblock user" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      isBlocked: false,
      message: "Scholar unblocked successfully",
    });
  } catch (error) {
    console.error("POST /api/friends/unblock error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
