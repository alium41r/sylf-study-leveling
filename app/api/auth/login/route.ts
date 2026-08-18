import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { xpForNextLevel } from "@/lib/game-engine";
import { signToken, AUTH_COOKIE_OPTIONS, type AuthTokenPayload } from "@/lib/auth";
import { formatScholarId } from "@/lib/scholar-id";

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

    // Find user by email OR username (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: loginTarget, mode: "insensitive" } },
          { username: { equals: loginTarget, mode: "insensitive" } },
        ],
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Handle OAuth-only accounts without passwords
    if (!user.password) {
      return NextResponse.json(
        { error: "This account was registered with Google or GitHub. Please sign in with OAuth." },
        { status: 401 }
      );
    }

    // Verify password
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const scholarId = user.scholarId || formatScholarId(user.id);

    // Build JWT with user stats
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
    };

    const token = await signToken(tokenPayload);

    // Return token + full user stats
    const response = NextResponse.json(
      {
        message: "Login successful!",
        token,
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
