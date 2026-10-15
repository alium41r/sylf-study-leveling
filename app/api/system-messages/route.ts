import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { parseSylvieAction } from "@/lib/ai/sylvie/action-server";
import { stripSylvieAction } from "@/lib/ai/sylvie/action";
import { parsePlannerHandoff } from "@/lib/ai/sylvie/planner-message";

/**
 * GET /api/system-messages
 * Fetch system messages for the authenticated user.
 * Query params:
 *   - unreadOnly: "true" to filter only unread messages
 *   - limit: number of messages to return (default: 50)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const limit = parseInt(searchParams.get("limit") || "50");
    const sessionId = searchParams.get("sessionId");
    const type = searchParams.get("type");

    const where: Record<string, unknown> = {
      userId: session.userId,
    };
    if (unreadOnly) {
      where.read = false;
    }
    if (type) {
      where.type = type;
    }
    if (sessionId) {
      where.sessionId = parseInt(sessionId);
    } else if (searchParams.has("global")) {
      where.sessionId = null;
    }

    const messages = await prisma.systemMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Also return the unread count for notification badges
    const unreadCount = await prisma.systemMessage.count({
      where: { userId: session.userId, read: false },
    });

    return NextResponse.json({ messages: messages.map((message) => ({
      ...message,
      content: stripSylvieAction(message.content),
      pendingAction: message.type === "INFO"
        ? parseSylvieAction(message.content, session.userId, message.sessionId, message.id) : undefined,
      plannerHandoff: message.type === "INFO" ? parsePlannerHandoff(message.content) : undefined,
    })), unreadCount }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/system-messages
 * Mark messages as read. Accepts { messageIds: number[] } to mark specific
 * messages, or { markAllRead: true } to mark all as read.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (body.markAllRead) {
      await prisma.systemMessage.updateMany({
        where: { userId: session.userId, read: false },
        data: { read: true },
      });
    } else if (body.messageIds && Array.isArray(body.messageIds)) {
      await prisma.systemMessage.updateMany({
        where: {
          id: { in: body.messageIds },
          userId: session.userId,
        },
        data: { read: true },
      });
    }

    return NextResponse.json({ message: "Messages updated" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/system-messages
 * Create a new message in a chat session directly (useful for system alerts).
 */
export async function POST(req: NextRequest) {
  try {
    const authSession = await getSession(req);
    if (!authSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    
    let sessionId = body.sessionId;
    if (!sessionId) {
      const chatSession = await prisma.chatSession.create({
        data: { 
          userId: authSession.userId, 
          title: "Study Planner Updates" 
        }
      });
      sessionId = chatSession.id;
    }

    const message = await prisma.systemMessage.create({
      data: {
        userId: authSession.userId,
        sessionId: sessionId,
        content: body.content,
        type: body.type || "SYSTEM",
        read: false,
      }
    });

    return NextResponse.json({ message, sessionId }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
