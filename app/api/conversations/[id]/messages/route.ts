import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

const SENDER_SELECT = {
  id: true,
  name: true,
  username: true,
  hunterRank: true,
  level: true,
  avatarUrl: true,
  activeAvatar: true,
  activeTitle: true,
} as const;

/**
 * GET /api/conversations/[id]/messages?after=<messageId>
 * Lightweight incremental fetch — returns only messages newer than
 * `after`. Used by live polling so receiving is near-instant and cheap.
 */
export async function GET(
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

    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const afterParam = req.nextUrl.searchParams.get("after");
    if (!afterParam || !/^\d+$/.test(afterParam)) {
      return NextResponse.json({ error: "Invalid 'after' parameter" }, { status: 400 });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId, id: { gt: parseInt(afterParam) } },
      include: { sender: { select: SENDER_SELECT } },
      orderBy: { id: "asc" },
    });

    return NextResponse.json({ messages }, { status: 200 });
  } catch (error) {
    console.error("GET messages error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
            select: SENDER_SELECT,
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

    // Chat messages deliberately do NOT create notification entries —
    // the notifications inbox is reserved for important events only
    // (level-ups, quest completions, friend requests, group adds, ...).

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("POST message error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
