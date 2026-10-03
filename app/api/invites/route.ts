import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

/**
 * GET /api/invites
 * Returns all pending invites received by the user.
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;
    // Auto-expire invites older than 15 minutes
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Auto-update expired invites (optional cleanup)
    await prisma.sessionInvite.updateMany({
      where: {
        status: "PENDING",
        createdAt: { lt: fifteenMinsAgo }
      },
      data: { status: "EXPIRED" }
    });

    const invites = await prisma.sessionInvite.findMany({
      where: {
        receiverId: userId,
        status: "PENDING"
      },
      include: {
        sender: { select: { id: true, name: true, username: true, hunterRank: true } },
        subject: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(invites);
  } catch (error) {
    console.error("GET invites error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/invites
 * Send a session invite to a friend.
 * Body: { receiverId: number, subjectId?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const { receiverId, subjectId } = await req.json();

    if (!receiverId) {
      return NextResponse.json({ error: "receiverId is required" }, { status: 400 });
    }

    // Optional: check if they are friends
    const isFriend = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: receiverId },
          { userId: receiverId, friendId: userId }
        ]
      }
    });

    if (!isFriend) {
      return NextResponse.json({ error: "Can only invite friends" }, { status: 403 });
    }

    // Check for an existing pending invite from this user to receiver
    const existing = await prisma.sessionInvite.findFirst({
      where: {
        senderId: userId,
        receiverId: receiverId,
        status: "PENDING",
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) }
      }
    });

    if (existing) {
      return NextResponse.json({ error: "Invite already sent recently" }, { status: 400 });
    }

    if (subjectId) {
      const activeSub = await prisma.subject.findFirst({
        where: { id: Number(subjectId), userId, archivedAt: null },
        select: { id: true },
      });
      if (!activeSub) {
        return NextResponse.json({ error: "Subject not found or archived" }, { status: 400 });
      }
    }

    const invite = await prisma.sessionInvite.create({
      data: {
        senderId: userId,
        receiverId: receiverId,
        subjectId: subjectId || null
      }
    });

    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    console.error("POST invite error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
