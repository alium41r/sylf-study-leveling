import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateEmailVerificationToken } from "@/lib/auth-service";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, verificationStatus: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.verificationStatus === "VERIFIED") {
      return NextResponse.json(
        { message: "Account is already verified." },
        { status: 200 }
      );
    }

    const token = await generateEmailVerificationToken(user.id);
    const origin = req.nextUrl.origin;
    const verificationUrl = `${origin}/api/auth/verify-email/confirm?token=${token}`;

    // Dispatch verification email
    const dispatchResult = await sendVerificationEmail({
      to: user.email,
      name: user.name,
      verificationUrl,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Verification link sent to ${user.email}.`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Send verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
