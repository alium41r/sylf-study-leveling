import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, signToken, type AuthTokenPayload } from "@/lib/auth";
import { xpForNextLevel } from "@/lib/game-engine";
import { formatScholarId } from "@/lib/scholar-id";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      res.cookies.set({
        name: "hunter_token",
        value: "",
        maxAge: 0,
        path: "/",
      });
      return res;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        password: true,
        scholarId: true,
        verificationStatus: true,
        avatarUrl: true,
        bannerUrl: true,
        bio: true,
        activeAvatar: true,
        activeFrame: true,
        activeTitle: true,
        activeAura: true,
        activeNameColor: true,
        characterConfig: true,
        socialLinks: true,
        hunterRank: true,
        level: true,
        currentXP: true,
        hp: true,
        maxHp: true,
        streakDays: true,
        totalStudyMinutes: true,
        lastActiveDate: true,
        createdAt: true,
        sylph: true,
        timezone: true,
        hasCompletedOnboarding: true,
      },
    });

    if (!user) {
      const res = NextResponse.json({ error: "User not found" }, { status: 401 });
      res.cookies.set({
        name: "hunter_token",
        value: "",
        maxAge: 0,
        path: "/",
      });
      return res;
    }

    const scholarId = user.scholarId || formatScholarId(user.id);
    const xpToNextLevel = xpForNextLevel(user.level);
    const hasPassword = user.password !== null;

    const tokenPayload: AuthTokenPayload = {
      userId: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      scholarId,
      verificationStatus: user.verificationStatus,
      hunterRank: user.hunterRank,
      level: user.level,
      hasCompletedOnboarding: user.hasCompletedOnboarding,
      hasPassword,
      timezone: user.timezone || "UTC",
    };

    const token = await signToken(tokenPayload);

    const { password: _, ...userStats } = user;

    return NextResponse.json(
      { ...userStats, scholarId, xpToNextLevel, hasPassword, token },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
