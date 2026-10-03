// ============================================================================
// Admin Focus Background Categories API
// ============================================================================
// POST /api/admin/focus-background-categories - Create a new category
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-admin";
import { isValidLayoutKey, DEFAULT_LAYOUT_KEY, VALID_LAYOUT_KEYS } from "@/lib/focus-background-types";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let { name, slug, description, layoutKey, sortOrder, isActive } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Category name must be at least 2 characters." },
        { status: 400 }
      );
    }
    name = name.trim();

    // Slug generation/validation
    if (!slug || typeof slug !== "string") {
      slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    } else {
      slug = slug.toLowerCase().trim().replace(/[^a-z0-9-_]+/g, "-");
    }

    if (!slug || slug.length < 2) {
      return NextResponse.json(
        { error: "Slug must be at least 2 alphanumeric characters." },
        { status: 400 }
      );
    }

    // Check slug uniqueness
    const existing = await prisma.focusBackgroundCategory.findUnique({
      where: { slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: `A category with slug "${slug}" already exists.` },
        { status: 409 }
      );
    }

    // LayoutKey safety check
    let safeLayoutKey = DEFAULT_LAYOUT_KEY;
    if (layoutKey) {
      if (isValidLayoutKey(layoutKey)) {
        safeLayoutKey = layoutKey;
      } else {
        return NextResponse.json(
          {
            error: `Invalid layoutKey "${layoutKey}". Allowed keys: ${VALID_LAYOUT_KEYS.join(", ")}.`,
          },
          { status: 400 }
        );
      }
    }

    // Determine sort order
    let targetOrder = 0;
    if (typeof sortOrder === "number") {
      targetOrder = sortOrder;
    } else {
      const maxOrder = await prisma.focusBackgroundCategory.findFirst({
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      targetOrder = (maxOrder?.sortOrder ?? -1) + 1;
    }

    const category = await prisma.focusBackgroundCategory.create({
      data: {
        name,
        slug,
        description: typeof description === "string" ? description.trim() : null,
        layoutKey: safeLayoutKey,
        sortOrder: targetOrder,
        isActive: typeof isActive === "boolean" ? isActive : true,
      },
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (err: any) {
    console.error("[admin/focus-background-categories] POST error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create category." },
      { status: 500 }
    );
  }
}
