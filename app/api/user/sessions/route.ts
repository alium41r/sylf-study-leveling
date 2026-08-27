import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseUserAgent, formatLastActive, hashToken } from "@/lib/session-service";

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

    // Extract raw token from cookie or header to generate tokenHash
    const rawToken =
      req.cookies.get(AUTH_COOKIE_NAME)?.value ||
      req.headers.get("authorization")?.replace("Bearer ", "")?.trim() ||
      "";

    const currentTokenHash = rawToken ? hashToken(rawToken) : hashToken(`user_${userId}_default`);
    const { device, platform, icon } = parseUserAgent(userAgent);

    // Retrieve user's timezone to construct location
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });

    const location = user?.timezone ? user.timezone.replace("_", " ") : "Current Location";

    // Ensure the current device session exists or is updated in AuthSession
    let currentAuthSession = null;
    try {
      currentAuthSession = await prisma.authSession.upsert({
        where: { tokenHash: currentTokenHash },
        update: {
          lastActiveAt: new Date(),
          ipAddress: ip,
          userAgent,
          device,
          platform,
          location,
        },
        create: {
          userId,
          tokenHash: currentTokenHash,
          device,
          platform,
          location,
          ipAddress: ip,
          userAgent,
          lastActiveAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });
    } catch (upsertErr) {
      console.warn("[Sessions] Upsert fallback:", upsertErr);
      currentAuthSession = await prisma.authSession.findFirst({
        where: { userId },
      });
    }

    // Fetch all active sessions for this user, sorted by lastActiveAt descending
    const sessions = await prisma.authSession.findMany({
      where: { userId },
      orderBy: { lastActiveAt: "desc" },
    });

    let mapped = sessions.map((s) => {
      const isCurrent = currentAuthSession ? s.id === currentAuthSession.id : false;
      const parsed = parseUserAgent(s.userAgent || "");

      return {
        id: s.id,
        device: s.device || parsed.device,
        platform: s.platform || parsed.platform,
        location: s.location || location,
        lastActive: isCurrent ? "Active Now" : formatLastActive(s.lastActiveAt),
        isCurrent,
        icon: parsed.icon || icon,
        createdAt: s.createdAt,
      };
    });

    // Ensure at least one session is marked as current if matching
    if (!mapped.some((s) => s.isCurrent) && mapped.length > 0) {
      mapped[0].isCurrent = true;
      mapped[0].lastActive = "Active Now";
    }

    // If empty, provide immediate fallback
    if (mapped.length === 0) {
      mapped = [
        {
          id: "current",
          device,
          platform,
          location,
          lastActive: "Active Now",
          isCurrent: true,
          icon,
          createdAt: new Date(),
        },
      ];
    }

    return NextResponse.json({ sessions: mapped });
  } catch (error: any) {
    console.error("Fetch sessions error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch sessions" },
      { status: 500 }
    );
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

    // Delete session record
    await prisma.authSession.delete({
      where: { id: sessionId },
    });

    const rawToken =
      req.cookies.get(AUTH_COOKIE_NAME)?.value ||
      req.headers.get("authorization")?.replace("Bearer ", "")?.trim() ||
      "";
    const currentTokenHash = rawToken ? hashToken(rawToken) : null;
    const isCurrent = targetSession.tokenHash && targetSession.tokenHash === currentTokenHash;

    const res = NextResponse.json({
      success: true,
      message: "Session revoked successfully",
      isCurrent,
    });

    // If revoking the current session, clear cookie
    if (isCurrent) {
      res.cookies.set(AUTH_COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });
    }

    return res;
  } catch (error: any) {
    console.error("Revoke session error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to revoke session" },
      { status: 500 }
    );
  }
}
