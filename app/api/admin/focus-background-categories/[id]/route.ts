// ============================================================================
// Admin Focus Background Category Detail API
// ============================================================================
// PATCH  /api/admin/focus-background-categories/[id] - update category
// DELETE /api/admin/focus-background-categories/[id] - delete category + associated storage files
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-admin";
import { isValidLayoutKey, VALID_LAYOUT_KEYS } from "@/lib/focus-background-types";
import { deleteMultipleBackgroundFiles } from "@/lib/supabase-storage";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid category ID." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { name, slug, description, layoutKey, sortOrder, isActive } = body;

    const dataToUpdate: any = {};

    if (typeof name === "string") {
      const trimmed = name.trim();
      if (trimmed.length < 2) {
        return NextResponse.json({ error: "Category name must be at least 2 characters." }, { status: 400 });
      }
      dataToUpdate.name = trimmed;
    }

    if (typeof slug === "string") {
      const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-_]+/g, "-");
      if (cleanSlug.length < 2) {
        return NextResponse.json({ error: "Slug must be at least 2 alphanumeric characters." }, { status: 400 });
      }
      const existing = await prisma.focusBackgroundCategory.findFirst({
        where: { slug: cleanSlug, NOT: { id } },
      });
      if (existing) {
        return NextResponse.json({ error: `Slug "${cleanSlug}" is already taken.` }, { status: 409 });
      }
      dataToUpdate.slug = cleanSlug;
    }

    if (typeof description === "string" || description === null) {
      dataToUpdate.description = description ? description.trim() : null;
    }

    if (layoutKey !== undefined) {
      if (isValidLayoutKey(layoutKey)) {
        dataToUpdate.layoutKey = layoutKey;
      } else {
        return NextResponse.json(
          {
            error: `Invalid layoutKey "${layoutKey}". Allowed keys: ${VALID_LAYOUT_KEYS.join(", ")}.`,
          },
          { status: 400 }
        );
      }
    }

    if (typeof sortOrder === "number") {
      dataToUpdate.sortOrder = sortOrder;
    }

    if (typeof isActive === "boolean") {
      dataToUpdate.isActive = isActive;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: "No fields provided to update." }, { status: 400 });
    }

    dataToUpdate.updatedAt = new Date();

    const category = await prisma.focusBackgroundCategory.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ category });
  } catch (err: any) {
    console.error("[admin/focus-background-categories/[id]] PATCH error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update category." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid category ID." }, { status: 400 });
  }

  try {
    const existing = await prisma.focusBackgroundCategory.findUnique({
      where: { id },
      include: {
        backgrounds: {
          select: { id: true, storagePath: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }

    // 1. Collect all storage paths to purge
    const storagePaths = existing.backgrounds.map((bg) => bg.storagePath);

    // 2. Delete storage files before/while deleting database records
    let storageDeletedCount = 0;
    if (storagePaths.length > 0) {
      const storagePurge = await deleteMultipleBackgroundFiles(storagePaths);
      storageDeletedCount = storagePurge.deletedCount;
      if (!storagePurge.ok) {
        console.warn(
          `[category-delete] Storage purge incomplete for category ${id}:`,
          storagePurge.errors
        );
      }
    }

    // 3. Delete database record (cascades to FocusBackground rows)
    await prisma.focusBackgroundCategory.delete({
      where: { id },
    });

    return NextResponse.json({
      ok: true,
      deletedCategoryId: id,
      deletedBackgroundsCount: existing.backgrounds.length,
      storageDeletedCount,
    });
  } catch (err: any) {
    console.error("[admin/focus-background-categories/[id]] DELETE error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete category." },
      { status: 500 }
    );
  }
}
