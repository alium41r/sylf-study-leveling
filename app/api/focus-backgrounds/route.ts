// ============================================================================
// Public / Authenticated Focus Backgrounds Catalog API
// ============================================================================
// GET /api/focus-backgrounds
// Returns all active categories with their active backgrounds.
// Guarantees layoutKey normalization and public CDN URLs for each background.
// ============================================================================
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeLayoutKey, normalizeTimerPosition } from "@/lib/focus-background-types";
import { getBackgroundPublicUrl } from "@/lib/supabase-storage";

export async function GET() {
  try {
    const categories = await prisma.focusBackgroundCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        backgrounds: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const normalized = categories.map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      name: cat.name,
      description: cat.description,
      layoutKey: normalizeLayoutKey(cat.layoutKey),
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
      backgrounds: cat.backgrounds.map((bg) => ({
        id: bg.id,
        categoryId: bg.categoryId,
        name: bg.name,
        storagePath: bg.storagePath,
        width: bg.width,
        height: bg.height,
        aspectRatio: bg.aspectRatio,
        focalX: bg.focalX,
        focalY: bg.focalY,
        timerPosition: normalizeTimerPosition(bg.timerPosition),
        sortOrder: bg.sortOrder,
        isActive: bg.isActive,
        createdAt: bg.createdAt,
        updatedAt: bg.updatedAt,
        publicUrl: getBackgroundPublicUrl(bg.storagePath),
      })),
    }));

    return NextResponse.json(
      { categories: normalized },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (err: any) {
    console.error("[api/focus-backgrounds] Failed to fetch catalog:", err);
    return NextResponse.json(
      { error: "Failed to load background catalog" },
      { status: 500 }
    );
  }
}
