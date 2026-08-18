import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/friends/requests
 * Returns all pending friend requests received by the user.
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

    const requests = await prisma.friendRequest.findMany({
      where: {
        receiverId: payload.userId as number,
        status: "PENDING",
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            username: true,
            hunterRank: true,
            level: true,
            avatarUrl: true,
            activeAvatar: true,
            activeFrame: true,
            activeTitle: true,
            characterConfig: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error("GET friend requests error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/friends/requests
 * Send a friend request by username.
 * Body: { username: string }
 */
export async function POST(req: NextRequest) {
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
    const body = await req.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    // Find the target user
    const targetUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetUser.id === userId) {
      return NextResponse.json({ error: "You cannot add yourself" }, { status: 400 });
    }

    // Check if already friends
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: Math.min(userId, targetUser.id), friendId: Math.max(userId, targetUser.id) },
        ],
      },
    });

    if (existingFriendship) {
      return NextResponse.json({ error: "You are already friends" }, { status: 400 });
    }

    // Check for existing pending request (either direction)
    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: targetUser.id, status: "PENDING" },
          { senderId: targetUser.id, receiverId: userId, status: "PENDING" },
        ],
      },
    });

    if (existingRequest) {
      return NextResponse.json({ error: "A friend request already exists" }, { status: 400 });
    }

    const request = await prisma.friendRequest.create({
      data: {
        senderId: userId,
        receiverId: targetUser.id,
      },
    });

    return NextResponse.json(request, { status: 201 });
  } catch (error) {
    console.error("POST friend request error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
