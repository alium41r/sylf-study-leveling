import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * PATCH /api/conversations/[id]/messages/[messageId]
 * Edit message content (only allowed for message sender).
 * Body: { content: string }
 */
export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string; messageId: string }> }
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

    const { id, messageId } = await props.params;
    const conversationId = parseInt(id);
    const msgId = parseInt(messageId);
    const userId = payload.userId as number;
    const body = await req.json();

    if (!body.content || !body.content.trim()) {
      return NextResponse.json({ error: "Message content cannot be empty" }, { status: 400 });
    }

    // Verify message exists and belongs to conversation
    const message = await prisma.message.findUnique({
      where: { id: msgId },
    });

    if (!message || message.conversationId !== conversationId) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Only sender can edit their message
    if (message.senderId !== userId) {
      return NextResponse.json({ error: "Forbidden: You can only edit your own messages" }, { status: 403 });
    }

    const updatedMessage = await prisma.message.update({
      where: { id: msgId },
      data: {
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
    });

    return NextResponse.json(updatedMessage, { status: 200 });
  } catch (error) {
    console.error("PATCH message error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/conversations/[id]/messages/[messageId]
 * Delete a message (allowed for sender or conversation creator).
 */
export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string; messageId: string }> }
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

    const { id, messageId } = await props.params;
    const conversationId = parseInt(id);
    const msgId = parseInt(messageId);
    const userId = payload.userId as number;

    const message = await prisma.message.findUnique({
      where: { id: msgId },
      include: {
        conversation: true,
      },
    });

    if (!message || message.conversationId !== conversationId) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const isSender = message.senderId === userId;
    const isGroupCreator = message.conversation.isGroup && message.conversation.createdBy === userId;

    if (!isSender && !isGroupCreator) {
      return NextResponse.json({ error: "Forbidden: You cannot delete this message" }, { status: 403 });
    }

    await prisma.message.delete({
      where: { id: msgId },
    });

    return NextResponse.json({ success: true, messageId: msgId }, { status: 200 });
  } catch (error) {
    console.error("DELETE message error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
