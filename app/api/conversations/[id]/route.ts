import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/conversations/[id]
 * Returns conversation details + messages (latest 50 by default).
 * Query: ?before=<messageId> for pagination
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

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    // Parse pagination
    const beforeParam = req.nextUrl.searchParams.get("before");
    const limit = 50;

    const whereClause: any = { conversationId };
    if (beforeParam) {
      whereClause.id = { lt: parseInt(beforeParam) };
    }

    const [conversation, messages] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              user: {
                select: { id: true, name: true, username: true, hunterRank: true, lastSeenAt: true },
              },
            },
          },
        },
      }),
      prisma.message.findMany({
        where: whereClause,
        include: {
          sender: { select: { id: true, name: true, username: true, hunterRank: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    ]);

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Mark as read
    await prisma.conversationParticipant.update({
      where: { userId_conversationId: { userId, conversationId } },
      data: { lastReadAt: new Date() },
    });

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        name: conversation.name,
        isGroup: conversation.isGroup,
        createdBy: conversation.createdBy,
        participants: conversation.participants.map((p: any) => ({
          id: p.user.id,
          name: p.user.name,
          username: p.user.username,
          hunterRank: p.user.hunterRank,
          isOnline: p.user.lastSeenAt
            ? p.user.lastSeenAt >= new Date(Date.now() - 2 * 60 * 1000)
            : false,
        })),
      },
      messages: messages.reverse(), // Return in chronological order
      hasMore: messages.length === limit,
    });
  } catch (error) {
    console.error("GET conversation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/conversations/[id]
 * Update conversation (name for groups, add/remove members).
 * Body: { name?: string, addMemberIds?: number[], removeMemberIds?: number[] }
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
    const conversationId = parseInt(id);
    const userId = payload.userId as number;
    const body = await req.json();

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation || !conversation.isGroup) {
      return NextResponse.json({ error: "Can only modify group conversations" }, { status: 400 });
    }

    // Update name
    if (body.name) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { name: body.name },
      });
    }

    // Add members
    if (body.addMemberIds && Array.isArray(body.addMemberIds)) {
      for (const memberId of body.addMemberIds) {
        await prisma.conversationParticipant.upsert({
          where: { userId_conversationId: { userId: memberId, conversationId } },
          create: { userId: memberId, conversationId },
          update: {},
        });
      }
    }

    // Remove members
    if (body.removeMemberIds && Array.isArray(body.removeMemberIds)) {
      await prisma.conversationParticipant.deleteMany({
        where: {
          conversationId,
          userId: { in: body.removeMemberIds },
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH conversation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
