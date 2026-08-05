import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * PATCH /api/invites/[id]
 * Accept or decline a session invite.
 * Body: { action: "ACCEPTED" | "DECLINED" }
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
    const inviteId = parseInt(id);
    const userId = payload.userId as number;
    const body = await req.json();
    const { action } = body;

    if (!["ACCEPTED", "DECLINED"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const invite = await prisma.sessionInvite.findUnique({
      where: { id: inviteId }
    });

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (invite.receiverId !== userId) {
      return NextResponse.json({ error: "Not your invite" }, { status: 403 });
    }

    await prisma.sessionInvite.update({
      where: { id: inviteId },
      data: { status: action }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH invite error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
