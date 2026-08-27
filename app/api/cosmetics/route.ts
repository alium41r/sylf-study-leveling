import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // @ts-ignore - Prisma types are cached in IDE
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      // @ts-ignore
      include: { cosmetics: true },
    }) as any;

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      cosmetics: user.cosmetics || [],
      active: {
        activeTheme: user.activeTheme || "cyberpunk",
        activeBackground: user.activeBackground || "default",
        activeAvatar: user.activeAvatar || "class_scholar",
        activeFrame: user.activeFrame || "none",
        activeTitle: user.activeTitle || "title_novice",
        activeAura: user.activeAura || "aura_monarch",
        activeNameColor: user.activeNameColor || "default",
      },
    }, { status: 200 });
  } catch (error) {
    console.error("GET /api/cosmetics error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { category, itemKey } = body;
    
    if (!category || !itemKey) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Determine the field to update based on category
    let updateData: any = {};
    if (category === "THEME") updateData.activeTheme = itemKey;
    else if (category === "BACKGROUND") updateData.activeBackground = itemKey;
    else if (category === "CLASS" || category === "AVATAR") updateData.activeAvatar = itemKey;
    else if (category === "FRAME") updateData.activeFrame = itemKey;
    else if (category === "TITLE") updateData.activeTitle = itemKey;
    else if (category === "AURA") updateData.activeAura = itemKey;
    else if (category === "NAME_COLOR") updateData.activeNameColor = itemKey;
    else {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: updateData,
    });

    return NextResponse.json({ success: true, user }, { status: 200 });
  } catch (error) {
    console.error("POST /api/cosmetics error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
