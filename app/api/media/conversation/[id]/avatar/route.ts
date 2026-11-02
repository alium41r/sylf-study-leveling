import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { parseSafeImageDataUrl } from "@/lib/user-media";

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

    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId: session.userId,
      },
      select: { id: true },
    });

    if (!participant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { avatarUrl: true },
    });

    if (!conversation?.avatarUrl) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const parsed = parseSafeImageDataUrl(conversation.avatarUrl);
    if (!parsed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ifNoneMatch = req.headers.get("if-none-match");
    const hasVersionParam = new URL(req.url).searchParams.has("v");
    const cacheControl = hasVersionParam
      ? "private, max-age=31536000, immutable"
      : "private, max-age=300, stale-while-revalidate=86400";

    if (ifNoneMatch && ifNoneMatch === parsed.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: parsed.etag,
          "Cache-Control": cacheControl,
        },
      });
    }

    return new NextResponse(new Uint8Array(parsed.buffer), {
      status: 200,
      headers: {
        "Content-Type": parsed.contentType,
        "Content-Length": String(parsed.buffer.byteLength),
        ETag: parsed.etag,
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Error serving conversation avatar:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
