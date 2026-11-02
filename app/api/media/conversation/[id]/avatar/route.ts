import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { computeMediaVersionHash, parseSafeImageDataUrl } from "@/lib/user-media";

const MEDIA_CACHE_CONTROL = "private, no-cache, must-revalidate";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const conversationId = Number.parseInt(id, 10);
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 });
    }

    const [participant, conversation] = await Promise.all([
      prisma.conversationParticipant.findFirst({
        where: {
          conversationId,
          userId: session.userId,
        },
        select: { id: true },
      }),
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { avatarUrl: true },
      }),
    ]);

    if (!participant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!conversation?.avatarUrl || !conversation.avatarUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const etag = `"${computeMediaVersionHash(conversation.avatarUrl)}"`;
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": MEDIA_CACHE_CONTROL,
          Vary: "Cookie",
        },
      });
    }

    const parsed = parseSafeImageDataUrl(conversation.avatarUrl);
    if (!parsed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(parsed.buffer), {
      status: 200,
      headers: {
        "Content-Type": parsed.contentType,
        "Content-Length": String(parsed.buffer.byteLength),
        ETag: parsed.etag,
        "Cache-Control": MEDIA_CACHE_CONTROL,
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Error serving conversation avatar:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
