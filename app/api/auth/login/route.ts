import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { xpForNextLevel } from "@/lib/game-engine";
import { signToken, AUTH_COOKIE_OPTIONS, type AuthTokenPayload } from "@/lib/auth";
import { formatScholarId } from "@/lib/scholar-id";
import { authenticatePassword } from "@/lib/auth-password";
import { openAuthSession } from "@/lib/auth-session-service";

const loginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required").optional(),
  email: z.string().min(1, "Email is required").optional(),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const { email, identifier, password } = validation.data;
    const loginTarget = (identifier || email || "").trim();

    if (!loginTarget) {
      return NextResponse.json({ error: "Email or username is required" }, { status: 400 });
    }

    const attempt = await authenticatePassword(req, loginTarget, password);
    if (!attempt.ok) {
      return NextResponse.json(
        { error: attempt.error },
        { status: attempt.status, ...(attempt.retryAfterSeconds ? { headers: { "Retry-After": String(attempt.retryAfterSeconds) } } : {}) }
      );
    }
    const { user } = attempt;

    const scholarId = user.scholarId || formatScholarId(user.id);

    // Build JWT with user stats (S3: cookie-only session — the token is never
    // returned to the browser)
    const tokenPayload: AuthTokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      scholarId,
      verificationStatus: user.verificationStatus,
      hunterRank: user.hunterRank,
      level: user.level,
      hasCompletedOnboarding: user.hasCompletedOnboarding,
      tokenVersion: user.tokenVersion,
    };

    const sid = await openAuthSession(user.id, req);
    const token = await signToken({ ...tokenPayload, ...(sid ? { sid } : {}) });

    // Return user profile only — the session token travels exclusively in the
    // httpOnly cookie set below.
    const response = NextResponse.json(
      {
        message: "Login successful!",
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          scholarId,
          verificationStatus: user.verificationStatus,
          hunterRank: user.hunterRank,
          level: user.level,
          currentXP: user.currentXP,
          xpToNextLevel: xpForNextLevel(user.level),
          hp: user.hp,
          maxHp: user.maxHp,
          streakDays: user.streakDays,
          totalStudyMinutes: user.totalStudyMinutes,
          hasCompletedOnboarding: user.hasCompletedOnboarding,
          createdAt: user.createdAt,
          avatarUrl: user.avatarUrl,
        },
      },
      { status: 200 }
    );

    response.cookies.set({
      ...AUTH_COOKIE_OPTIONS,
      value: token,
    });

    return response;
  } catch (error) {
    console.error("Login route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
