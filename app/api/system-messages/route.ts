import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { parseSylvieAction } from "@/lib/ai/sylvie/action-server";
import { stripSylvieAction } from "@/lib/ai/sylvie/action";
import { parsePlannerHandoff } from "@/lib/ai/sylvie/planner-message";
import { exposeChatImages } from "@/lib/ai/sylvie/image-storage";
import { z } from "zod";
import { hasOutputLimit } from "@/lib/ai/sylvie/completion";

const directMessage = z.object({
  sessionId: z.number().int().positive().safe().optional(),
  content: z.string().trim().min(1).max(20_000),
  type: z.enum(["USER", "INFO", "SYSTEM"]).default("SYSTEM"),
});

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
    const requestedLimit = Number(searchParams.get("limit") ?? 50);
    const limit = Number.isSafeInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
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
      const id = Number(sessionId);
      if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
      where.sessionId = id;
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
      ...exposeChatImages(message),
      content: stripSylvieAction(message.content),
      truncated: message.type === "INFO" && hasOutputLimit(message.content),
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

    const parsed = directMessage.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    const body = parsed.data;
    let sessionId = body.sessionId;
    if (sessionId && !await prisma.chatSession.findFirst({ where: { id: sessionId, userId: authSession.userId }, select: { id: true } })) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
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
