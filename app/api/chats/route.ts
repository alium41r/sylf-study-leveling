import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authSession = await getSession(req);
    if (!authSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
