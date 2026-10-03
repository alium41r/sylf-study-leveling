// ============================================================================
// User Focus Background Detail API (Phase 5A)
// ============================================================================
// PATCH  /api/user/focus-backgrounds/[id] — Update user background metadata (name, focal point, timerPosition)
// DELETE /api/user/focus-backgrounds/[id] — Delete background (DB first, then storage cleanup)
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import {
  deleteUserBackgroundFile,
  getUserBackgroundSignedUrl,
} from "@/lib/supabase-storage";
import {
  normalizeTimerPosition,
  isValidTimerPosition,
  normalizeLayoutKey,
  isValidLayoutKey,
} from "@/lib/focus-background-types";

export const dynamic = "force-dynamic";

/**
 * Strictly parses a route parameter into a positive safe integer.
 * Rejects non-digit strings like '1abc', floats like '1.5', and unsafe integers.
 */
function parseStrictPositiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: idParam } = await params;
    const id = parseStrictPositiveInt(idParam);
    if (id === null) {
      return NextResponse.json({ error: "Invalid background ID" }, { status: 400 });
    }

    // Uniform 404 for nonexistent IDs or IDs owned by another user (anti-enumeration)
    const existing = await prisma.userFocusBackground.findFirst({
      where: { id, userId: session.userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Background not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, focalX, focalY, timerPosition, layoutKey } = body;

    const dataToUpdate: Record<string, any> = {};

    if (name !== undefined) {
      if (typeof name !== "string") {
        return NextResponse.json(
          { error: "Name must be a string." },
          { status: 400 }
        );
      }
      const trimmed = name.trim();
      if (trimmed.length < 2 || trimmed.length > 60) {
        return NextResponse.json(
          { error: "Display name must be between 2 and 60 characters." },
          { status: 400 }
        );
      }
      dataToUpdate.name = trimmed;
    }

    if (focalX !== undefined) {
      if (typeof focalX !== "number" || isNaN(focalX) || focalX < 0 || focalX > 1) {
        return NextResponse.json(
          { error: "focalX must be a number between 0 and 1." },
          { status: 400 }
        );
      }
      dataToUpdate.focalX = focalX;
    }

    if (focalY !== undefined) {
      if (typeof focalY !== "number" || isNaN(focalY) || focalY < 0 || focalY > 1) {
        return NextResponse.json(
          { error: "focalY must be a number between 0 and 1." },
          { status: 400 }
        );
      }
      dataToUpdate.focalY = focalY;
    }

    if (timerPosition !== undefined) {
      if (!isValidTimerPosition(timerPosition)) {
        return NextResponse.json(
          { error: "timerPosition must be one of 'auto', 'left', 'right', 'center'." },
          { status: 400 }
        );
      }
      dataToUpdate.timerPosition = normalizeTimerPosition(timerPosition);
    }

    if (layoutKey !== undefined) {
      if (!isValidLayoutKey(layoutKey)) {
        return NextResponse.json(
          { error: "layoutKey must be one of 'classic', 'anime', 'landscape', 'fantasy'." },
          { status: 400 }
        );
      }
      dataToUpdate.layoutKey = normalizeLayoutKey(layoutKey);
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided to update." },
        { status: 400 }
      );
    }

    dataToUpdate.updatedAt = new Date();

    const updated = await prisma.userFocusBackground.update({
      where: { id: existing.id },
      data: dataToUpdate,
    });

    // If the user currently has this background selected, bump their preference version
    // so connected tabs / devices immediately invalidate cached preferences and re-render.
    await prisma.user.updateMany({
      where: {
        id: session.userId,
        selectedCustomBackgroundId: existing.id,
      },
      data: {
        focusBackgroundPreferenceVersion: { increment: 1 },
      },
    });

    const { signedUrl } = await getUserBackgroundSignedUrl(
      session.userId,
      updated.storagePath,
      3600
    );

    return NextResponse.json({
      background: {
        id: updated.id,
        userId: updated.userId,
        name: updated.name,
        storagePath: updated.storagePath,
        width: updated.width,
        height: updated.height,
        aspectRatio: updated.aspectRatio,
        focalX: updated.focalX,
        focalY: updated.focalY,
        timerPosition: updated.timerPosition,
        layoutKey: updated.layoutKey ?? "classic",
        fileSize: updated.fileSize,
        mimeType: updated.mimeType,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        signedUrl: signedUrl ?? null,
      },
    });
  } catch (err: any) {
    console.error("[user/focus-backgrounds/[id]] PATCH error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update background" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: idParam } = await params;
    const id = parseStrictPositiveInt(idParam);
    if (id === null) {
      return NextResponse.json({ error: "Invalid background ID" }, { status: 400 });
    }

    // 1. Verify ownership and capture storagePath (uniform 404)
    const existing = await prisma.userFocusBackground.findFirst({
      where: { id, userId: session.userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Background not found" }, { status: 404 });
    }

    const storagePath = existing.storagePath;

    // 2. Delete database record FIRST (DB metadata is the source of truth)
    await prisma.userFocusBackground.delete({
      where: { id: existing.id },
    });

    // 3. Delete Storage object
    const { error: storageError } = await deleteUserBackgroundFile(
      session.userId,
      storagePath
    );

    // 4. Handle partial failure: DB row deleted, but Storage file failed
    if (storageError) {
      console.error(
        "[StorageOrphan]",
        JSON.stringify({
          event: "STORAGE_ORPHAN_DETECTED",
          bucket: "focus-backgrounds-user",
          storagePath,
          userId: session.userId,
          backgroundId: existing.id,
          error: storageError,
          timestamp: new Date().toISOString(),
        })
      );
      return NextResponse.json({
        success: true,
        storageCleaned: false,
        warning:
          "Background deleted from library, but storage cleanup encountered an issue and was logged for reclamation.",
      });
    }

    return NextResponse.json({
      success: true,
      storageCleaned: true,
    });
  } catch (err: any) {
    console.error("[user/focus-backgrounds/[id]] DELETE error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete background" },
      { status: 500 }
    );
  }
}
