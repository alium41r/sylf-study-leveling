// ============================================================================
// User Focus Backgrounds API (Phase 5A)
// ============================================================================
// GET  /api/user/focus-backgrounds — List user personal backgrounds with signed URLs
// POST /api/user/focus-backgrounds — Upload new personal background with concurrency-safe quota
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { detectImageType } from "@/lib/upload-security";
import {
  extractImageDimensions,
  validateCustomBackgroundDimensions,
  MAX_USER_BACKGROUND_BYTES,
} from "@/lib/image-dimensions";
import {
  uploadUserBackgroundFile,
  deleteUserBackgroundFile,
  getUserBackgroundSignedUrl,
} from "@/lib/supabase-storage";
import { rateLimit } from "@/lib/rate-limit";
import {
  normalizeTimerPosition,
  normalizeLayoutKey,
} from "@/lib/focus-background-types";

export const dynamic = "force-dynamic";

export const MAX_USER_BACKGROUNDS_QUOTA = 10;

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const backgrounds = await prisma.userFocusBackground.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
    });

    // Generate signed URLs in parallel with per-item error isolation
    const items = await Promise.all(
      backgrounds.map(async (bg) => {
        const { signedUrl } = await getUserBackgroundSignedUrl(
          session.userId,
          bg.storagePath,
          3600
        );
        return {
          id: bg.id,
          userId: bg.userId,
          name: bg.name,
          storagePath: bg.storagePath,
          width: bg.width,
          height: bg.height,
          aspectRatio: bg.aspectRatio,
          focalX: bg.focalX,
          focalY: bg.focalY,
          timerPosition: bg.timerPosition,
          layoutKey: bg.layoutKey ?? "classic",
          fileSize: bg.fileSize,
          mimeType: bg.mimeType,
          createdAt: bg.createdAt,
          updatedAt: bg.updatedAt,
          signedUrl: signedUrl ?? null,
        };
      })
    );

    return NextResponse.json(
      {
        backgrounds: items,
        quota: {
          used: backgrounds.length,
          max: MAX_USER_BACKGROUNDS_QUOTA,
        },
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (err: any) {
    console.error("[api/user/focus-backgrounds] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load personal backgrounds" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Sliding-Window Rate Limiting (5 uploads / minute per user)
    const rl = await rateLimit(`user-bg-upload:${session.userId}`, {
      limit: 5,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Upload rate limit exceeded. Please wait ${rl.retryAfterSeconds}s before uploading again.`,
        },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const nameRaw = ((formData.get("name") as string) || "").trim();
    const focalXStr = formData.get("focalX") as string | null;
    const focalYStr = formData.get("focalY") as string | null;
    const timerPositionStr = formData.get("timerPosition") as string | null;
    const layoutKeyStr = formData.get("layoutKey") as string | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Please select an image file to upload." }, { status: 400 });
    }

    // 2. Validate Name
    const name = nameRaw || file.name.replace(/\.[^/.]+$/, "").trim() || "My Background";
    if (name.length < 2 || name.length > 60) {
      return NextResponse.json(
        { error: "Background name must be between 2 and 60 characters." },
        { status: 400 }
      );
    }

    // 3. Validate Coordinates & Timer Position & Layout
    let focalX = 0.5;
    let focalY = 0.5;
    if (focalXStr !== null) {
      const parsed = parseFloat(focalXStr);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) focalX = parsed;
    }
    if (focalYStr !== null) {
      const parsed = parseFloat(focalYStr);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) focalY = parsed;
    }
    const timerPosition = normalizeTimerPosition(timerPositionStr);
    const layoutKey = normalizeLayoutKey(layoutKeyStr);

    // 4. File Size Boundary (10 MB)
    if (file.size > MAX_USER_BACKGROUND_BYTES) {
      return NextResponse.json(
        {
          error: `File size exceeds the 10 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
        },
        { status: 413 }
      );
    }

    // 5. Binary Content Sniffing & MIME Allowlist
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const detectedMime = detectImageType(buffer);

    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!detectedMime || !allowedMimes.includes(detectedMime)) {
      return NextResponse.json(
        {
          error:
            "Unsupported file format. Please upload a static JPEG, PNG, or WebP image.",
        },
        { status: 400 }
      );
    }

    // 6. Real Decoded Dimension, Resolution & Megapixel Bomb Validation
    const dimensions = extractImageDimensions(buffer);
    const dimValidation = validateCustomBackgroundDimensions(dimensions, detectedMime);
    if (!dimValidation.ok) {
      return NextResponse.json(
        { error: dimValidation.error },
        { status: dimValidation.status }
      );
    }

    const { width, height, aspectRatio } = dimValidation.dimensions;

    // 7. Upload to Private Storage (staged)
    const { storagePath } = await uploadUserBackgroundFile(
      session.userId,
      buffer,
      detectedMime
    );

    // 8. Concurrency-Safe Quota & Database Insertion Transaction
    let createdRecord;
    try {
      createdRecord = await prisma.$transaction(async (tx) => {
        // Serialize quota check by locking the user row
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.userId} FOR UPDATE`;

        const existingCount = await tx.userFocusBackground.count({
          where: { userId: session.userId },
        });

        if (existingCount >= MAX_USER_BACKGROUNDS_QUOTA) {
          throw new Error("QUOTA_EXCEEDED");
        }

        return await tx.userFocusBackground.create({
          data: {
            userId: session.userId,
            name,
            storagePath,
            width,
            height,
            aspectRatio,
            focalX,
            focalY,
            timerPosition,
            layoutKey,
            fileSize: file.size,
            mimeType: detectedMime,
          },
        });
      });
    } catch (txError: any) {
      // Compensating cleanup: delete newly uploaded file to avoid orphaned storage objects
      await deleteUserBackgroundFile(session.userId, storagePath).catch(() => {});

      if (txError.message === "QUOTA_EXCEEDED") {
        return NextResponse.json(
          {
            error: `Library quota exceeded. You can store up to ${MAX_USER_BACKGROUNDS_QUOTA} custom environments.`,
          },
          { status: 409 }
        );
      }

      console.error("[api/user/focus-backgrounds] POST error:", txError);
      return NextResponse.json(
        { error: "Failed to save personal background." },
        { status: 500 }
      );
    }

    // 9. Generate signed URL for instant client rendering
    const { signedUrl } = await getUserBackgroundSignedUrl(
      session.userId,
      createdRecord.storagePath,
      3600
    );

    return NextResponse.json(
      {
        background: {
          id: createdRecord.id,
          userId: createdRecord.userId,
          name: createdRecord.name,
          storagePath: createdRecord.storagePath,
          width: createdRecord.width,
          height: createdRecord.height,
          aspectRatio: createdRecord.aspectRatio,
          focalX: createdRecord.focalX,
          focalY: createdRecord.focalY,
          timerPosition: createdRecord.timerPosition,
          layoutKey: createdRecord.layoutKey ?? "classic",
          fileSize: createdRecord.fileSize,
          mimeType: createdRecord.mimeType,
          createdAt: createdRecord.createdAt,
          updatedAt: createdRecord.updatedAt,
          signedUrl: signedUrl ?? null,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[api/user/focus-backgrounds] POST error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to upload personal background" },
      { status: 500 }
    );
  }
}
