import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * PATCH /api/friends/requests/[id]
 * Accept or reject a friend request.
 * Body: { action: "ACCEPT" | "REJECT" }
 */
export async function PATCH(
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
    const requestId = parseInt(id);
    const userId = payload.userId as number;
    const body = await req.json();
    const { action } = body;

    if (!["ACCEPT", "REJECT"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Verify the request exists and is for this user
    const friendRequest = await prisma.friendRequest.findFirst({
      where: { id: requestId, receiverId: userId, status: "PENDING" },
    });

    if (!friendRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (action === "ACCEPT") {
      // Create friendship (lower ID first for uniqueness)
      const lowId = Math.min(friendRequest.senderId, friendRequest.receiverId);
      const highId = Math.max(friendRequest.senderId, friendRequest.receiverId);

      await prisma.$transaction([
        prisma.friendRequest.update({
          where: { id: requestId },
          data: { status: "ACCEPTED" },
        }),
        prisma.friendship.create({
          data: { userId: lowId, friendId: highId },
        }),
      ]);
    } else {
      await prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: "REJECTED" },
      });
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("PATCH friend request error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
