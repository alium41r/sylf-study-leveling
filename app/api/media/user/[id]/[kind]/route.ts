import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { areUsersBlocked } from "@/lib/block-service";
import { prisma } from "@/lib/prisma";
import { parseSafeImageDataUrl } from "@/lib/user-media";

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

    if (session.userId !== targetUserId) {
      const blocked = await areUsersBlocked(session.userId, targetUserId);
      if (blocked) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select:
        kind === "avatar"
          ? { avatarUrl: true, bannerUrl: false }
          : { avatarUrl: false, bannerUrl: true },
    });

    const rawUrl =
      kind === "avatar"
        ? (user as { avatarUrl?: string | null } | null)?.avatarUrl
        : (user as { bannerUrl?: string | null } | null)?.bannerUrl;

    if (!rawUrl) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const parsed = parseSafeImageDataUrl(rawUrl);
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
    console.error("Error serving user media:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
