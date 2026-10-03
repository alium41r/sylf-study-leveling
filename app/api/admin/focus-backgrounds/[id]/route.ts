// ============================================================================
// Admin Focus Background Detail API
// ============================================================================
// PATCH  /api/admin/focus-backgrounds/[id] - update metadata/status
// DELETE /api/admin/focus-backgrounds/[id] - delete record and storage object
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-admin";
import { deleteBackgroundFile, getBackgroundPublicUrl } from "@/lib/supabase-storage";
import { normalizeTimerPosition, isValidTimerPosition } from "@/lib/focus-background-types";

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
    return NextResponse.json({ error: "Invalid background ID." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { name, categoryId, isActive, focalX, focalY, timerPosition, sortOrder } = body;

    const dataToUpdate: any = {};

    if (typeof name === "string") {
      const trimmed = name.trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        return NextResponse.json(
          { error: "Background display name must be between 2 and 100 characters." },
          { status: 400 }
        );
      }
      dataToUpdate.name = trimmed;
    }

    if (typeof categoryId === "number" && categoryId > 0) {
      const catExists = await prisma.focusBackgroundCategory.findUnique({
        where: { id: categoryId },
      });
      if (!catExists) {
        return NextResponse.json({ error: "Target category does not exist." }, { status: 404 });
      }
      dataToUpdate.categoryId = categoryId;
    }

    if (typeof isActive === "boolean") {
      dataToUpdate.isActive = isActive;
    }

    if (typeof focalX === "number") {
      dataToUpdate.focalX = Math.max(0, Math.min(1, focalX));
    }

    if (typeof focalY === "number") {
      dataToUpdate.focalY = Math.max(0, Math.min(1, focalY));
    }

    if (timerPosition !== undefined) {
      dataToUpdate.timerPosition = normalizeTimerPosition(timerPosition);
    }

    if (typeof sortOrder === "number") {
      dataToUpdate.sortOrder = sortOrder;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: "No valid fields provided to update." }, { status: 400 });
    }

    dataToUpdate.updatedAt = new Date();

    const updated = await prisma.focusBackground.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({
      background: {
        ...updated,
        publicUrl: getBackgroundPublicUrl(updated.storagePath),
      },
    });
  } catch (err: any) {
    console.error("[admin/focus-backgrounds/[id]] PATCH error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update background." },
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
    return NextResponse.json({ error: "Invalid background ID." }, { status: 400 });
  }

  try {
    const existing = await prisma.focusBackground.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Background not found." }, { status: 404 });
    }

    // 1. Delete database record
    await prisma.focusBackground.delete({
      where: { id },
    });

    // 2. Delete storage file
    const storageRes = await deleteBackgroundFile(existing.storagePath);
    if (!storageRes.ok) {
      console.warn(
        `[delete] Inconsistency warning: Storage file "${existing.storagePath}" could not be deleted: ${storageRes.error}`
      );
    }

    return NextResponse.json({
      ok: true,
      deletedId: id,
      storageDeleted: storageRes.ok,
      warning: storageRes.ok ? undefined : "Database record removed, but storage object deletion failed.",
    });
  } catch (err: any) {
    console.error("[admin/focus-backgrounds/[id]] DELETE error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete background." },
      { status: 500 }
    );
  }
}
