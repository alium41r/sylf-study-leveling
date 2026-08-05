import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * DELETE /api/friends/[id]
 * Remove a friendship.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { id } = await params;
    const friendshipId = parseInt(id);
    const userId = payload.userId as number;

    // Verify ownership
    const friendship = await prisma.friendship.findFirst({
      where: {
        id: friendshipId,
        OR: [{ userId }, { friendId: userId }],
      },
    });

    if (!friendship) {
      return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
    }

    await prisma.friendship.delete({ where: { id: friendshipId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE friend error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
