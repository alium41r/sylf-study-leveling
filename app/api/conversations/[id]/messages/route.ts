import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * POST /api/conversations/[id]/messages
 * Send a message in a conversation.
 * Body: { content: string }
 */
export async function POST(
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
    const conversationId = parseInt(id);
    const userId = payload.userId as number;
    const body = await req.json();

    if (!body.content || !body.content.trim()) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: body.content.trim(),
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
              activeTitle: true,
            },
          },
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
      // Auto-mark as read for the sender
      prisma.conversationParticipant.update({
        where: { userId_conversationId: { userId, conversationId } },
        data: { lastReadAt: new Date() },
      }),
    ]);

    // Notify other participants
    const otherParticipants = await prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: userId } },
      include: { conversation: true },
    }).catch(() => []);

    for (const p of otherParticipants) {
      const isGroup = p.conversation.isGroup;
      const tag = isGroup ? "[GROUP_CHAT]" : "[DIRECT_MESSAGE]";
      const senderLabel = message.sender.name ? `${message.sender.name} (@${message.sender.username})` : `@${message.sender.username}`;
      const preview = body.content.trim().slice(0, 70);
      await prisma.systemMessage.create({
        data: {
          userId: p.userId,
          type: "INFO",
          content: `${tag} **${senderLabel}**: ${preview}`,
        },
      }).catch(() => null);
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("POST message error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
