import { executionTransaction } from "@/lib/execution-coordination";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, password: true, verificationStatus: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { code, password } = body;
    let verifiedTokenId: number | null = null;

    // Unverified accounts can authenticate directly via password
    if (user.verificationStatus === "UNVERIFIED" && password) {
      if (!user.password) {
        return NextResponse.json({ error: "No password configured for this account." }, { status: 400 });
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return NextResponse.json({ error: "Incorrect password. Account deletion cancelled." }, { status: 400 });
      }
    } else {
      // Verified accounts (or OTP path) require valid 6-digit OTP
      if (!code || typeof code !== "string" || code.trim().length !== 6) {
        return NextResponse.json(
          { error: "A valid 6-digit security code or password is required." },
          { status: 400 }
        );
      }

      const tokenKey = `DELETE_ACCOUNT:${code.trim()}`;
      const validToken = await prisma.verificationToken.findFirst({
        where: {
          userId: session.userId,
          token: tokenKey,
          expiresAt: { gt: new Date() },
        },
      });

      if (!validToken) {
        return NextResponse.json(
          { error: "Invalid or expired security code. Please request a new one." },
          { status: 400 }
        );
      }

      verifiedTokenId = validToken.id;
    }

    // Delete user (cascades to all child relations)
    await executionTransaction(session.userId, async tx => {
      if (verifiedTokenId !== null) {
        const consumed = await tx.verificationToken.deleteMany({ where: { id: verifiedTokenId, userId: session.userId,
          token: `DELETE_ACCOUNT:${code.trim()}`, expiresAt: { gt: new Date() } } });
        if (consumed.count !== 1) throw new Error("SECURITY_CODE_EXPIRED_OR_USED");
      }
      return tx.user.delete({ where: { id: session.userId } });
    });

    const response = NextResponse.json(
      {
        success: true,
        message: "Your account and all associated records have been permanently deleted.",
      },
      { status: 200 }
    );

    // Clear session cookie
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "SECURITY_CODE_EXPIRED_OR_USED") return NextResponse.json({ error: "Invalid or expired security code. Please request a new one." }, { status: 400 });
    console.error("Delete account error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
