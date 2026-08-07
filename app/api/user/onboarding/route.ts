import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { xpForNextLevel } from "@/lib/game-engine";

export async function POST(req: NextRequest) {
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

    // Parse the payload
    const body = await req.json();
    const { themeId, backgroundId, avatarId } = body;

    if (!themeId || !backgroundId || !avatarId) {
      return NextResponse.json(
        { error: "Missing required onboarding selections (theme, background, avatar)." },
        { status: 400 }
      );
    }

    // 1. Check idempotency: Ensure the user hasn't already completed onboarding
    const currentUser = await prisma.user.findUnique({
      where: { id: payload.userId as number },
      select: { hasCompletedOnboarding: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (currentUser.hasCompletedOnboarding) {
      return NextResponse.json(
        { error: "Onboarding already completed. State is locked." },
        { status: 403 }
      );
    }

    // 2. Perform the update in a transaction
    const updatedUser = await prisma.$transaction(async (tx) => {
      // Unlock the selected cosmetics permanently
      const cosmeticsToUnlock = [
        { category: "THEME" as const, itemKey: themeId },
        { category: "BACKGROUND" as const, itemKey: backgroundId },
        { category: "AVATAR" as const, itemKey: avatarId },
      ];

      for (const cosmetic of cosmeticsToUnlock) {
        await tx.userCosmetic.upsert({
          where: {
            userId_category_itemKey: {
              userId: payload.userId as number,
              category: cosmetic.category,
              itemKey: cosmetic.itemKey,
            },
          },
          update: {}, // Do nothing if it exists
          create: {
            userId: payload.userId as number,
            category: cosmetic.category,
            itemKey: cosmetic.itemKey,
          },
        });
      }

      // Update the user record to equip the selections and mark onboarding as complete
      return tx.user.update({
        where: { id: payload.userId as number },
        data: {
          activeTheme: themeId,
          activeBackground: backgroundId,
          activeAvatar: avatarId,
          hasCompletedOnboarding: true,
        },
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
        }
      });
    });

    const xpToNextLevel = xpForNextLevel(updatedUser.level);

    return NextResponse.json({ success: true, user: { ...updatedUser, xpToNextLevel } }, { status: 200 });
  } catch (error) {
    console.error("POST /api/user/onboarding error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
