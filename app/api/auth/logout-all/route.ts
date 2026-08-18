import { NextRequest, NextResponse } from "next/server";
import { getSession, AUTH_COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { password } = body;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, password: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If user has a password set, require password verification
    if (user.password) {
      if (!password || typeof password !== "string") {
        return NextResponse.json(
          { error: "Account password is required to revoke all sessions." },
          { status: 400 }
        );
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return NextResponse.json(
          { error: "Incorrect password. Session revocation cancelled." },
          { status: 400 }
        );
      }
    }

    // Invalidate all sessions by creating a revocation marker in VerificationToken
    await prisma.verificationToken.deleteMany({
      where: {
        userId: user.id,
        token: { startsWith: "REVOKED_SESSIONS:" },
      },
    });

    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token: `REVOKED_SESSIONS:${Date.now()}`,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      },
    });

    const response = NextResponse.json(
      { success: true, message: "All sessions have been revoked across all devices." },
      { status: 200 }
    );

    // Clear session cookie on this device
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Logout all devices error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
