import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { selectedCompanionsForUsers } from "@/lib/pixel-companion-service";
import { areUsersBlocked } from "@/lib/block-service";

/**
 * GET /api/friends/requests
 * Returns all pending friend requests received by the user.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requests = await prisma.friendRequest.findMany({
      where: {
        receiverId: session.userId,
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

    const companions = await selectedCompanionsForUsers(requests.map(request => request.sender.id), session.userId, "public");
    return NextResponse.json(requests.map(request => ({ ...request, sender: { ...request.sender, companion: companions.get(request.sender.id) } })));
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
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
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

    // Check if either user has blocked the other
    const isBlocked = await areUsersBlocked(userId, targetUser.id);
    if (isBlocked) {
      return NextResponse.json({ error: "Unable to send friend request" }, { status: 403 });
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

    // S3: enforce the target's allowFriendRequests privacy setting.
    const targetPrivacy = await prisma.userPrivacy.findUnique({
      where: { userId: targetUser.id },
      select: { allowFriendRequests: true },
    });
    const requestPolicy = targetPrivacy?.allowFriendRequests ?? "PUBLIC";
    if (requestPolicy === "PRIVATE") {
      return NextResponse.json(
        { error: "This user is not accepting friend requests." },
        { status: 403 }
      );
    }
    // FRIENDS policy is already satisfied here: an existing friendship would
    // have returned 400 above, so a FRIENDS-only user rejects non-friends.
    if (requestPolicy === "FRIENDS") {
      return NextResponse.json(
        { error: "This user only accepts friend requests from friends." },
        { status: 403 }
      );
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

    // Create system notification for the receiver
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, username: true },
    }).catch(() => null);
    const senderLabel = sender?.name ? `${sender.name} (@${sender.username})` : `@${sender?.username || "A scholar"}`;

    await prisma.systemMessage.create({
      data: {
        userId: targetUser.id,
        type: "INFO",
        content: `[FRIEND_REQUEST] **${senderLabel}** sent you a friend request.`,
      },
    }).catch(() => null);

    return NextResponse.json(request, { status: 201 });
  } catch (error) {
    console.error("POST friend request error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
