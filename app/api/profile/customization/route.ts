import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { revalidateTag } from "next/cache";
import { lockCompanionOwner, validateCompanionSelection, PixelCreationError } from "@/lib/pixel-creation-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CustomizationSchema = z.object({
  bannerUrl: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  bio: z.string().max(500, "Bio cannot exceed 500 characters").nullable().optional(),
  activeAura: z.string().optional(),
  activeFrame: z.string().optional(),
  activeTitle: z.string().optional(),
  activeAvatar: z.string().optional(),
  activeNameColor: z.string().optional(),
  characterConfig: z.record(z.string(), z.any()).nullable().optional(),
  socialLinks: z
    .object({
      github: z.string().max(100).optional().nullable(),
      linkedin: z.string().max(100).optional().nullable(),
      discord: z.string().max(100).optional().nullable(),
      twitter: z.string().max(100).optional().nullable(),
      website: z.string().max(200).optional().nullable(),
    })
    .optional()
    .nullable(),
});

async function handleCustomizationUpdate(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const body = await req.json();

    const parseResult = CustomizationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    const updateData: Record<string, any> = {};
    if (data.bannerUrl !== undefined) {
      updateData.bannerUrl = typeof data.bannerUrl === "string" ? (data.bannerUrl.trim() || null) : data.bannerUrl;
    }
    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = typeof data.avatarUrl === "string" ? (data.avatarUrl.trim() || null) : data.avatarUrl;
    }
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.activeAura !== undefined) updateData.activeAura = data.activeAura;
    if (data.activeFrame !== undefined) updateData.activeFrame = data.activeFrame;
    if (data.activeTitle !== undefined) updateData.activeTitle = data.activeTitle;
    if (data.activeAvatar !== undefined) updateData.activeAvatar = data.activeAvatar;
    if (data.activeNameColor !== undefined) updateData.activeNameColor = data.activeNameColor;
    if (data.characterConfig !== undefined) updateData.characterConfig = data.characterConfig;
    if (data.socialLinks !== undefined) updateData.socialLinks = data.socialLinks;

    const updatedUser = await prisma.$transaction(async tx => {
      await lockCompanionOwner(tx, userId);
      await validateCompanionSelection(tx, userId, data.characterConfig);
      return tx.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        avatarUrl: true,
        bannerUrl: true,
        bio: true,
        activeAvatar: true,
        activeFrame: true,
        activeTitle: true,
        activeAura: true,
        activeNameColor: true,
        socialLinks: true,
        characterConfig: true,
        level: true,
        hunterRank: true,
        currentXP: true,
      },
    });

    });

    try {
      if (updatedUser.username) {
        revalidateTag(`user-${updatedUser.username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${updatedUser.username.toLowerCase()}`, "max");
      }
    } catch {
      // Graceful fallback when not running in Static Generation Context
    }

    return NextResponse.json({
      success: true,
      message: "Profile identity updated successfully.",
      characterConfig: updatedUser.characterConfig,
      user: updatedUser,
    });
  } catch (error: any) {
    if (error instanceof PixelCreationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Customization Route Error:", error);
    return NextResponse.json({ error: "Failed to update profile customization." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  return handleCustomizationUpdate(req);
}

export async function POST(req: NextRequest) {
  return handleCustomizationUpdate(req);
}
