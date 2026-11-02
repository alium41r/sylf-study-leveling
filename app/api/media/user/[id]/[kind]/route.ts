import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { areUsersBlocked } from "@/lib/block-service";
import { prisma } from "@/lib/prisma";
import { getRelationship, isVisible } from "@/lib/privacy";
import { Relationship } from "@/lib/privacy-types";
import { computeMediaVersionHash, parseSafeImageDataUrl } from "@/lib/user-media";

const MEDIA_CACHE_CONTROL = "private, no-cache, must-revalidate";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; kind: string }> }
) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, kind } = await context.params;
    const targetUserId = Number.parseInt(id, 10);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }
    if (kind !== "avatar" && kind !== "banner") {
      return NextResponse.json({ error: "Invalid media kind" }, { status: 400 });
    }

    const isSelf = session.userId === targetUserId;

    const [user, blocked, relationship, sharedConversation] = await Promise.all([
      prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          ...(kind === "avatar"
            ? { avatarUrl: true, bannerUrl: false }
            : { avatarUrl: false, bannerUrl: true }),
          privacy: { select: { profileVisibility: true } },
        },
      }),
      isSelf ? Promise.resolve(false) : areUsersBlocked(session.userId, targetUserId),
      !isSelf && kind === "banner"
        ? getRelationship(session.userId, targetUserId)
        : Promise.resolve(Relationship.SELF),
      !isSelf && kind === "banner" && prisma.conversationParticipant?.findFirst
        ? prisma.conversationParticipant
            .findFirst({
              where: {
                userId: session.userId,
                conversation: {
                  participants: { some: { userId: targetUserId } },
                },
              },
              select: { id: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    if (blocked) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!isSelf && kind === "banner") {
      const visibility =
        (user as { privacy?: { profileVisibility?: string } | null } | null)?.privacy
          ?.profileVisibility ?? "PUBLIC";
      if (!isVisible(visibility, relationship) && !sharedConversation) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    const rawUrl =
      kind === "avatar"
        ? (user as { avatarUrl?: string | null } | null)?.avatarUrl
        : (user as { bannerUrl?: string | null } | null)?.bannerUrl;

    if (!rawUrl || !rawUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const etag = `"${computeMediaVersionHash(rawUrl)}"`;
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

    const parsed = parseSafeImageDataUrl(rawUrl);
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
    console.error("Error serving user media:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
