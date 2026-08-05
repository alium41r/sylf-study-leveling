import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/system-messages
 * Fetch system messages for the authenticated user.
 * Query params:
 *   - unreadOnly: "true" to filter only unread messages
 *   - limit: number of messages to return (default: 50)
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const limit = parseInt(searchParams.get("limit") || "50");
    const sessionId = searchParams.get("sessionId");

    const where: Record<string, unknown> = {
      userId: payload.userId as number,
    };
    if (unreadOnly) {
      where.read = false;
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
      where: { userId: payload.userId as number, read: false },
    });

    return NextResponse.json({ messages, unreadCount }, { status: 200 });
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
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();

    if (body.markAllRead) {
      await prisma.systemMessage.updateMany({
        where: { userId: payload.userId as number, read: false },
        data: { read: true },
      });
    } else if (body.messageIds && Array.isArray(body.messageIds)) {
      await prisma.systemMessage.updateMany({
        where: {
          id: { in: body.messageIds },
          userId: payload.userId as number,
        },
        data: { read: true },
      });
    }

    return NextResponse.json({ message: "Messages updated" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
