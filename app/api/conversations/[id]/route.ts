import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

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
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const conversationId = parseInt(id);
    const userId = session.userId;

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
                  bio: true,
                  bannerUrl: true,
                  createdAt: true,
                  lastSeenAt: true,
                },
              },
            },
          },
        },
      }),
      prisma.message.findMany({
        where: whereClause,
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
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    ]);

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Mark as read — only for user-initiated loads. Background refreshes
    // (the 30s presence poll) pass ?refresh=1 and skip this write entirely,
    // which removes a pointless DB write per poll per viewer.
    if (req.nextUrl.searchParams.get("refresh") !== "1") {
      await prisma.conversationParticipant.update({
        where: { userId_conversationId: { userId, conversationId } },
        data: { lastReadAt: new Date() },
      });
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        name: conversation.name,
        avatarUrl: conversation.avatarUrl,
        isGroup: conversation.isGroup,
        createdBy: conversation.createdBy,
        createdAt: conversation.createdAt,
        participants: conversation.participants.map((p: any) => ({
          id: p.user.id,
          name: p.user.name,
          username: p.user.username,
          hunterRank: p.user.hunterRank,
          level: p.user.level || 1,
          avatarUrl: p.user.avatarUrl,
          activeAvatar: p.user.activeAvatar || "class_scholar",
          activeFrame: p.user.activeFrame || "frame_default",
          activeTitle: p.user.activeTitle,
          characterConfig: p.user.characterConfig,
          bio: p.user.bio,
          bannerUrl: p.user.bannerUrl,
          createdAt: p.user.createdAt,
          isOnline: p.user.lastSeenAt
            ? p.user.lastSeenAt >= new Date(Date.now() - 2 * 60 * 1000)
            : false,
          lastSeenAt: p.user.lastSeenAt,
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
 * Update conversation (name/avatar for groups, add/remove members).
 * Body: { name?: string, avatarUrl?: string | null, addMemberIds?: number[], removeMemberIds?: number[] }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const conversationId = parseInt(id);
    const userId = session.userId;
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

    // S3: group administration is creator-only. A normal participant must not
    // rename the group, change its avatar, or add/remove members (including
    // promoting themselves). UI hiding is not a control — this is.
    const isGroupMutation =
      body.name !== undefined ||
      body.avatarUrl !== undefined ||
      (Array.isArray(body.addMemberIds) && body.addMemberIds.length > 0) ||
      (Array.isArray(body.removeMemberIds) && body.removeMemberIds.length > 0);
    if (isGroupMutation && conversation.createdBy !== userId) {
      return NextResponse.json(
        { error: "Only the group creator can manage this group." },
        { status: 403 }
      );
    }

    // Atomically update conversation fields
    const updateData: { name?: string | null; avatarUrl?: string | null } = {};
    if (body.name !== undefined) {
      updateData.name = body.name ? body.name.trim() : null;
    }
    if (body.avatarUrl !== undefined) {
      updateData.avatarUrl = body.avatarUrl ? (typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : body.avatarUrl) : null;
    }

    let updatedConversation = conversation;
    if (Object.keys(updateData).length > 0) {
      updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: updateData,
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

        // ─── Important-event notification: "added to a group" ───
        // Only when the acting user is someone else (not adding yourself),
        // and scoped to event notifications (sessionId NULL).
        if (memberId !== userId) {
          try {
            const adder = await prisma.user.findUnique({
              where: { id: userId },
              select: { name: true, username: true },
            });
            const adderLabel = adder?.name
              ? `${adder.name} (@${adder.username})`
              : `@${adder?.username || "Someone"}`;
            await prisma.systemMessage.create({
              data: {
                userId: memberId,
                type: "INFO",
                content: `[GROUP_ADDED] **${adderLabel}** added you to the group **"${conversation.name || "Study Group"}"**.`,
              },
            });
          } catch {}
        }
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

    return NextResponse.json({
      success: true,
      conversation: {
        id: updatedConversation.id,
        name: updatedConversation.name,
        avatarUrl: updatedConversation.avatarUrl,
        isGroup: updatedConversation.isGroup,
      },
    });
  } catch (error: any) {
    console.error("PATCH conversation error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
