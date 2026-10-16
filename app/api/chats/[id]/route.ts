import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { removeChatImages, storedImages } from "@/lib/ai/sylvie/image-storage";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const authSession = await getSession(req);
    if (!authSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await req.json();
    if (!body.title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== authSession.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.chatSession.update({
      where: { id: sessionId },
      data: { title: body.title },
    });

    return NextResponse.json({ session: updated }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/chats/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const authSession = await getSession(req);
    if (!authSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== authSession.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const attachments = await prisma.systemMessage.findMany({ where: { sessionId, userId: authSession.userId }, select: { attachmentUrl: true } });
    await prisma.chatSession.delete({
      where: { id: sessionId },
    });
    const images = attachments.flatMap(message => storedImages(message.attachmentUrl)).filter(image => image.path.startsWith(`${authSession.userId}/${sessionId}/`));
    await removeChatImages([...new Map(images.map(image => [image.path, image])).values()]).catch(() => { console.warn("[chat] private image cleanup unavailable"); });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/chats/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
