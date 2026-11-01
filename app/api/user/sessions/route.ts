import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getCookieToken, isNativeSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseUserAgent, formatLastActive, hashToken } from "@/lib/session-service";
import { endAuthSession, expireSessionCookie, pruneAuthSessions } from "@/lib/auth-session-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const userAgent = req.headers.get("user-agent") || "";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const { device, platform, icon } = parseUserAgent(userAgent);

    // Retrieve user's timezone to construct location
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });

    const location = user?.timezone ? user.timezone.replace("_", " ") : "Current Location";
    // A native row keeps the name it signed in with: its user agent is an HTTP library's, and says nothing a person would recognize.
    const seen = isNativeSession(session) ? { lastActiveAt: new Date(), ipAddress: ip, location } : { lastActiveAt: new Date(), ipAddress: ip, userAgent, device, platform, location };

    // This device. A token from before Phase 11 has no session id, so it is added
    // here by its hash, which is how the older token can still be ended.
    let currentId: string | null = session.sid ?? null;
    if (session.sid) {
      await prisma.authSession.updateMany({ where: { id: session.sid, userId }, data: seen }).catch(() => undefined);
    } else {
      const tokenHash = hashToken(getCookieToken(req) ?? `user_${userId}_default`);
      const legacy = { lastActiveAt: new Date(), ipAddress: ip, userAgent, device, platform, location };
      const row = await prisma.authSession.upsert({
        where: { tokenHash },
        update: legacy,
        create: { ...legacy, userId, tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      }).catch(error => { console.warn("[Sessions] Upsert fallback:", error); return null; });
      currentId = row?.id ?? null;
    }

    await pruneAuthSessions(userId);

    // An ended session stays as a row until its token could no longer be presented, and is not listed.
    const sessions = await prisma.authSession.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { lastActiveAt: "desc" },
    });

    const mapped = sessions.map((s) => {
      const isCurrent = s.id === currentId;
      const parsed = parseUserAgent(s.userAgent || "");

      return {
        id: s.id,
        device: s.clientName || s.device || parsed.device,
        platform: s.platform || parsed.platform,
        location: s.location || location,
        lastActive: isCurrent ? "Active Now" : formatLastActive(s.lastActiveAt),
        isCurrent,
        icon: parsed.icon || icon,
        createdAt: s.createdAt,
      };
    });

    return NextResponse.json({ sessions: mapped });
  } catch (error: unknown) {
    console.error("Fetch sessions error:", error);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    // Verify session belongs to current user
    const targetSession = await prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId: session.userId,
      },
    });

    if (!targetSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Ends it for real: getSession refuses this device from its next request on.
    await endAuthSession(session.userId, sessionId);

    const isCurrent = session.sid
      ? targetSession.id === session.sid
      : Boolean(targetSession.tokenHash) && targetSession.tokenHash === hashToken(getCookieToken(req) ?? "");

    const res = NextResponse.json({
      success: true,
      message: "Session revoked successfully",
      isCurrent,
    });

    // If revoking the current session, clear cookie
    if (isCurrent) {
      expireSessionCookie(res, req, session);
    }

    return res;
  } catch (error: unknown) {
    console.error("Revoke session error:", error);
    return NextResponse.json({ error: "Failed to revoke session" }, { status: 500 });
  }
}
