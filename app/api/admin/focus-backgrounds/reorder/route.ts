// ============================================================================
// Admin Focus Backgrounds Reorder API
// ============================================================================
// POST /api/admin/focus-backgrounds/reorder
// Reorders backgrounds within a category in an atomic transaction.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-admin";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { categoryId, orderedIds } = body;

    if (typeof categoryId !== "number" || !Array.isArray(orderedIds)) {
      return NextResponse.json(
        { error: "Invalid payload. Expected { categoryId: number, orderedIds: number[] }." },
        { status: 400 }
      );
    }

    if (orderedIds.some((id) => typeof id !== "number" || id <= 0)) {
      return NextResponse.json(
        { error: "orderedIds must contain valid integer background IDs." },
        { status: 400 }
      );
    }

    // Execute atomic transaction to update sortOrder for each background
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.focusBackground.updateMany({
          where: {
            id,
            categoryId, // ensure the background belongs to this category
          },
          data: {
            sortOrder: index,
            updatedAt: new Date(),
          },
        })
      )
    );

    return NextResponse.json({ ok: true, reorderedCount: orderedIds.length });
  } catch (err: any) {
    console.error("[admin/focus-backgrounds/reorder] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to reorder backgrounds." },
      { status: 500 }
    );
  }
}
