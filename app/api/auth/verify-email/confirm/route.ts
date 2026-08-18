import { NextRequest, NextResponse } from "next/server";
import { confirmEmailVerificationToken } from "@/lib/auth-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Verification token is required." },
        { status: 400 }
      );
    }

    const result = await confirmEmailVerificationToken(token);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Email verified successfully.",
        email: result.email,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Confirm verification POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${origin}/settings/account?verify_error=Missing%20token`);
  }

  const result = await confirmEmailVerificationToken(token);
  if (!result.success) {
    return NextResponse.redirect(
      `${origin}/settings/account?verify_error=${encodeURIComponent(
        result.error || "Verification failed"
      )}`
    );
  }

  return NextResponse.redirect(`${origin}/settings/account?verified=true`);
}
