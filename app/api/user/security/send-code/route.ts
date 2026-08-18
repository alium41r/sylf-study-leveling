import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSecurityOtpEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action !== "RESET_PROGRESS" && action !== "DELETE_ACCOUNT") {
      return NextResponse.json(
        { error: "Invalid action. Supported: RESET_PROGRESS, DELETE_ACCOUNT" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete existing OTPs for this user and action using action prefix
    await prisma.verificationToken.deleteMany({
      where: {
        userId: user.id,
        token: {
          startsWith: `${action}:`,
        },
      },
    });

    // Generate 6-digit numeric OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const tokenKey = `${action}:${code}`;

    // Store in DB with 10-minute expiry
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token: tokenKey,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    // Dispatch email
    const result = await sendSecurityOtpEmail({
      to: user.email,
      name: user.name,
      code,
      action,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Security code sent to ${user.email}.`,
        provider: result.provider,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Send security code error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
