import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { xpForNextLevel } from "@/lib/game-engine";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

const secretKey = new TextEncoder().encode(
  process.env.JWT_SECRET || "hunter-system-secret-key-change-in-production"
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const { email, password } = validation.data;

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
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

    // Build JWT with RPG stats so the frontend can render them immediately
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      hunterRank: user.hunterRank,
      level: user.level,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30d")
      .sign(secretKey);

    // Return token + full user stats (excluding password)
    const response = NextResponse.json(
      {
        message: "Login successful!",
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          hunterRank: user.hunterRank,
          level: user.level,
          currentXP: user.currentXP,
          xpToNextLevel: xpForNextLevel(user.level),
          hp: user.hp,
          maxHp: user.maxHp,
          streakDays: user.streakDays,
          totalStudyMinutes: user.totalStudyMinutes,
          hasCompletedOnboarding: user.hasCompletedOnboarding,
        },
      },
      { status: 200 }
    );

    response.cookies.set({
      name: 'system_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
