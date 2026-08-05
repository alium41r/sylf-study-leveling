import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

    const sessions = await prisma.chatSession.findMany({
      where: { userId: payload.userId as number },
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
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
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
        userId: payload.userId as number,
        title,
      },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
