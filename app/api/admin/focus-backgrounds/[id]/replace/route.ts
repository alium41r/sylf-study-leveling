// ============================================================================
// Admin Focus Background Replace API (Phase 1)
// ============================================================================
// POST /api/admin/focus-backgrounds/[id]/replace
// Explicit secure replace workflow:
//   1. Upload and validate new object in Storage
//   2. Update database metadata & storagePath
//   3. Only then delete the old object from Storage
//   4. Compensating cleanup: if DB update fails, delete new uploaded object
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-admin";
import { detectImageType } from "@/lib/upload-security";
import {
  extractImageDimensions,
  validateDesktopBackgroundDimensions,
  MAX_BACKGROUND_BYTES,
} from "@/lib/image-dimensions";
import {
  uploadBackgroundFile,
  deleteBackgroundFile,
  getBackgroundPublicUrl,
} from "@/lib/supabase-storage";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 2. Sliding-Window Rate Limiting (10 replaces per minute per admin)
  const rl = await rateLimit(`admin-bg-replace:${auth.user!.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Replace rate limit exceeded. Please wait ${rl.retryAfterSeconds}s before replacing again.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid background ID." }, { status: 400 });
  }

  try {
    // 1. Fetch existing background record with its category
    const existing = await prisma.focusBackground.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Background not found." }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Please select a replacement image." }, { status: 400 });
    }

    if (file.size > MAX_BACKGROUND_BYTES) {
      return NextResponse.json(
        { error: `File size exceeds the 15 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).` },
        { status: 413 }
      );
    }

    // 2. Sniff content type via magic bytes
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const detectedMime = detectImageType(buffer);
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!detectedMime || !allowedMimes.includes(detectedMime)) {
      return NextResponse.json(
        { error: "Unsupported image format. Please upload a high-resolution PNG, JPEG, or WebP image." },
        { status: 400 }
      );
    }

    // 3. Extract dimensions & validate resolution
    const parsedDims = extractImageDimensions(buffer);
    const dimValidation = validateDesktopBackgroundDimensions(parsedDims);
    if (!dimValidation.ok) {
      return NextResponse.json({ error: dimValidation.error }, { status: dimValidation.status });
    }
    const { width, height, aspectRatio } = dimValidation.dimensions;

    // 4. Upload new object to Supabase Storage
    const { storagePath: newStoragePath, publicUrl } = await uploadBackgroundFile(
      existing.category.slug,
      buffer,
      detectedMime
    );

    // 5. Update database record
    let updated;
    const oldStoragePath = existing.storagePath;

    try {
      updated = await prisma.focusBackground.update({
        where: { id },
        data: {
          storagePath: newStoragePath,
          width,
          height,
          aspectRatio,
          updatedAt: new Date(),
        },
      });
    } catch (dbErr: any) {
      console.error("[replace] Database update failed. Rolling back new storage object:", dbErr);
      // Rollback: delete the new uploaded file from storage
      await deleteBackgroundFile(newStoragePath).catch((cleanErr) => {
        console.error("[replace] Failed to cleanup new storage object after DB error:", cleanErr);
      });
      return NextResponse.json(
        { error: "Failed to update background record in database." },
        { status: 500 }
      );
    }

    // 6. Only after DB succeeds, remove the old object from Storage
    const deleteOldRes = await deleteBackgroundFile(oldStoragePath);
    if (!deleteOldRes.ok) {
      console.warn(
        `[replace] Inconsistency warning: Old storage object "${oldStoragePath}" could not be deleted: ${deleteOldRes.error}`
      );
    }

    return NextResponse.json({
      background: {
        ...updated,
        publicUrl,
      },
      warning: deleteOldRes.ok ? undefined : "Old storage asset could not be deleted automatically.",
    });
  } catch (err: any) {
    console.error("[replace] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to replace background image." },
      { status: 500 }
    );
  }
}
