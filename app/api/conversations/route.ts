import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/conversations
 * Returns all conversations the user participates in, with last message preview and unread count.
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
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);

    const participantRecords = await prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true, name: true, username: true, hunterRank: true, lastSeenAt: true },
                },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                sender: { select: { id: true, name: true, username: true } },
              },
            },
          },
        },
      },
    });

    const conversations = participantRecords.map((pr: any) => {
      const conv = pr.conversation;
      const lastMessage = conv.messages[0] || null;

      // Count unread messages (messages after user's lastReadAt)
      // We'll do a simple approach: if lastMessage exists and is after lastReadAt
      const hasUnread = lastMessage
        ? lastMessage.createdAt > pr.lastReadAt && lastMessage.senderId !== userId
        : false;

      // For DMs, use the other person's name
      let displayName = conv.name;
      if (!conv.isGroup) {
        const otherParticipant = conv.participants.find((p: any) => p.userId !== userId);
        displayName = otherParticipant?.user.name || otherParticipant?.user.username || "Unknown";
      }

      return {
        id: conv.id,
        name: displayName,
        isGroup: conv.isGroup,
        participants: conv.participants.map((p: any) => ({
          id: p.user.id,
          name: p.user.name,
          username: p.user.username,
          hunterRank: p.user.hunterRank,
          isOnline: p.user.lastSeenAt ? p.user.lastSeenAt >= twoMinAgo : false,
        })),
        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              senderName: lastMessage.sender.name || lastMessage.sender.username,
              senderId: lastMessage.senderId,
              createdAt: lastMessage.createdAt,
            }
          : null,
        hasUnread,
        updatedAt: conv.updatedAt,
      };
    });

    // Sort by most recent activity
    conversations.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.updatedAt;
      const bTime = b.lastMessage?.createdAt || b.updatedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    return NextResponse.json(conversations);
  } catch (error) {
    console.error("GET conversations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/conversations
 * Create a new conversation.
 * Body: { participantIds: number[], name?: string, isGroup?: boolean }
 * For DMs, if one already exists between the two users, return it.
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
    const { participantIds, name, isGroup } = body;

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json({ error: "At least one participant is required" }, { status: 400 });
    }

    // Always include the creator
    const allParticipants = [...new Set([userId, ...participantIds])];

    // For DMs (2 people, not group), check if conversation already exists
    if (!isGroup && allParticipants.length === 2) {
      const otherId = allParticipants.find((id) => id !== userId)!;

      const existingDM = await prisma.conversation.findFirst({
        where: {
          isGroup: false,
          participants: {
            every: {
              userId: { in: [userId, otherId] },
            },
          },
        },
        include: {
          participants: true,
        },
      });

      // Verify it's exactly 2 participants
      if (existingDM && existingDM.participants.length === 2) {
        return NextResponse.json({ id: existingDM.id, existing: true });
      }
    }

    // Create the conversation
    const conversation = await prisma.conversation.create({
      data: {
        name: isGroup ? name || "Group Chat" : null,
        isGroup: !!isGroup,
        createdBy: userId,
        participants: {
          create: allParticipants.map((id) => ({ userId: id })),
        },
      },
    });

    return NextResponse.json({ id: conversation.id }, { status: 201 });
  } catch (error) {
    console.error("POST conversation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
