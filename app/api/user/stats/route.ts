import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

import { xpForNextLevel } from "@/lib/game-engine";

/**
 * GET /api/user/stats
 * Returns the authenticated user's full RPG stats.
 * Used by the Dashboard to hydrate the profile card.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId as number },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
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
        hasCompletedOnboarding: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Always calculate the exact XP to next level based on the engine
    // to instantly sync any formula changes without requiring a DB migration.
    const xpToNextLevel = xpForNextLevel(user.level);

    return NextResponse.json({ ...user, xpToNextLevel }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
