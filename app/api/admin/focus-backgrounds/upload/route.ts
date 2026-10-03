// ============================================================================
// Admin Focus Backgrounds Upload API
// ============================================================================
// POST /api/admin/focus-backgrounds/upload
// Authorized server-side image upload & database record creation.
// Enforces:
//   - Administrator authentication
//   - MIME allowlist + magic-byte content sniffing
//   - 15 MB file size boundary
//   - Minimum desktop resolution (1280x720)
//   - Path structure: <category-slug>/<safe-name>.<ext>
//   - Compensating cleanup: deletes uploaded object if DB creation fails.
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
import { normalizeTimerPosition } from "@/lib/focus-background-types";

export async function POST(req: NextRequest) {
  // 1. Authoritative Admin Guard
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 2. Sliding-Window Rate Limiting (10 uploads per minute per admin)
  const rl = await rateLimit(`admin-bg-upload:${auth.user!.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Upload rate limit exceeded. Please wait ${rl.retryAfterSeconds}s before uploading again.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const categoryIdStr = formData.get("categoryId") as string | null;
    const name = ((formData.get("name") as string) || "").trim();
    const focalXStr = formData.get("focalX") as string | null;
    const focalYStr = formData.get("focalY") as string | null;
    const timerPositionStr = formData.get("timerPosition") as string | null;
    const timerPosition = normalizeTimerPosition(timerPositionStr);

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Please select an image file to upload." }, { status: 400 });
    }

    if (!categoryIdStr) {
      return NextResponse.json({ error: "Category is required." }, { status: 400 });
    }

    const categoryId = parseInt(categoryIdStr, 10);
    if (isNaN(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "Invalid category ID." }, { status: 400 });
    }

    if (!name || name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: "Background display name must be between 2 and 100 characters." }, { status: 400 });
    }

    // 2. Verify Category exists in database
    const category = await prisma.focusBackgroundCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return NextResponse.json({ error: "Target category not found." }, { status: 404 });
    }

    // 3. File Size Validation
    if (file.size > MAX_BACKGROUND_BYTES) {
      return NextResponse.json(
        { error: `File size exceeds the 15 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).` },
        { status: 413 }
      );
    }

    // 4. Content Type Validation (Magic Bytes)
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

    // 5. Desktop Dimension & Aspect Ratio Validation
    const parsedDims = extractImageDimensions(buffer);
    const dimValidation = validateDesktopBackgroundDimensions(parsedDims);
    if (!dimValidation.ok) {
      return NextResponse.json({ error: dimValidation.error }, { status: dimValidation.status });
    }
    const { width, height, aspectRatio } = dimValidation.dimensions;

    // Parse Focal Point
    let focalX = 0.5;
    let focalY = 0.5;
    if (focalXStr) {
      const parsedX = parseFloat(focalXStr);
      if (!isNaN(parsedX)) focalX = Math.max(0, Math.min(1, parsedX));
    }
    if (focalYStr) {
      const parsedY = parseFloat(focalYStr);
      if (!isNaN(parsedY)) focalY = Math.max(0, Math.min(1, parsedY));
    }

    // 6. Upload to Supabase Storage (Path: <category-slug>/<safe-name>.<ext>)
    const { storagePath, publicUrl } = await uploadBackgroundFile(
      category.slug,
      buffer,
      detectedMime
    );

    // 7. Determine Next Sort Order
    const lastBg = await prisma.focusBackground.findFirst({
      where: { categoryId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const nextSortOrder = (lastBg?.sortOrder ?? -1) + 1;

    // 8. Create Database Record (with compensating cleanup on failure)
    let backgroundRecord;
    try {
      backgroundRecord = await prisma.focusBackground.create({
        data: {
          categoryId,
          name,
          storagePath,
          width,
          height,
          aspectRatio,
          focalX,
          focalY,
          timerPosition,
          sortOrder: nextSortOrder,
          isActive: true,
        },
      });
    } catch (dbErr: any) {
      console.error("[upload] DB insert failed. Executing compensating storage cleanup:", dbErr);
      // Compensating action: remove orphaned file from storage
      await deleteBackgroundFile(storagePath).catch((cleanErr) => {
        console.error("[upload] Compensating cleanup failed for", storagePath, cleanErr);
      });
      return NextResponse.json(
        { error: "Failed to persist background metadata in database." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        background: {
          ...backgroundRecord,
          publicUrl,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[admin/focus-backgrounds/upload] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process image upload." },
      { status: 500 }
    );
  }
}
