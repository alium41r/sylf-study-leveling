import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { nextPage, pageLimit } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authSession = await getSession(req);
    if (!authSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Sylf Native pages through this list. Unbounded when `limit` is absent, as the web expects.
    const limit = pageLimit(req.nextUrl.searchParams, 50);
    const cursor = req.nextUrl.searchParams.get("cursor");
    if (limit === "invalid" || (cursor !== null && !/^\d{1,10}$/.test(cursor))) {
      return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    }
    if (limit !== null) {
      const rows = await prisma.chatSession.findMany({
        where: { userId: authSession.userId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: Number(cursor) }, skip: 1 } : {}),
      });
      const { page, nextCursor } = nextPage(rows, limit);
      return NextResponse.json({ sessions: page, nextCursor }, { status: 200 });
    }

    const sessions = await prisma.chatSession.findMany({
      where: { userId: authSession.userId },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ sessions }, { status: 200 });
  } catch (error) {
    console.error("GET /api/chats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await getSession(req);
    if (!authSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let title = "New Chat";
    try {
      const body = await req.json();
      if (body.title) title = body.title;
    } catch (e) {
      // Body is optional
    }

    const session = await prisma.chatSession.create({
      data: {
        userId: authSession.userId,
        title,
      },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
