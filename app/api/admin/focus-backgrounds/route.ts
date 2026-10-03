// ============================================================================
// Admin Focus Backgrounds Catalog Inspection API
// ============================================================================
// GET /api/admin/focus-backgrounds
// Returns all categories (active & inactive) with all backgrounds for Studio.
// Restricted strictly to authorized Sylf administrators.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-admin";
import { normalizeLayoutKey, normalizeTimerPosition } from "@/lib/focus-background-types";
import { getBackgroundPublicUrl } from "@/lib/supabase-storage";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const categories = await prisma.focusBackgroundCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        backgrounds: {
          orderBy: { sortOrder: "asc" },
        },
        _count: {
          select: { backgrounds: true },
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
      backgroundsCount: cat._count.backgrounds,
      backgrounds: cat.backgrounds.map((bg) => ({
        id: bg.id,
        categoryId: bg.categoryId,
        name: bg.name,
        storagePath: bg.storagePath,
        width: bg.width,
        height: bg.height,
        aspectRatio: bg.aspectRatio,
        focalX: bg.focalX ?? 0.5,
        focalY: bg.focalY ?? 0.5,
        timerPosition: normalizeTimerPosition(bg.timerPosition),
        sortOrder: bg.sortOrder,
        isActive: bg.isActive,
        createdAt: bg.createdAt,
        updatedAt: bg.updatedAt,
        publicUrl: getBackgroundPublicUrl(bg.storagePath),
      })),
    }));

    return NextResponse.json({
      categories: normalized,
      admin: {
        id: auth.user!.id,
        email: auth.user!.email,
      },
    });
  } catch (err: any) {
    console.error("[admin/focus-backgrounds] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load admin background catalog." },
      { status: 500 }
    );
  }
}
