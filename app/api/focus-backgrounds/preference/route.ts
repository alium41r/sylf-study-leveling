// ============================================================================
// Focus Background User Preference API (Phase 4 & Phase 5B)
// ============================================================================
// GET   /api/focus-backgrounds/preference — Authoritative server preference resolver
// PATCH /api/focus-backgrounds/preference — Update authenticated user preference
//
// Rules enforced:
// 1. Session-bound: user id comes strictly from getSession(req) (IDOR protected).
// 2. Discriminator & namespaces: 'classic' | 'official' | 'custom'.
//    - 'official' queries FocusBackground only.
//    - 'custom' queries UserFocusBackground scoped to session.userId only.
//    - Overlapping numeric IDs resolve according to source namespace.
// 3. Conditional stale cleanup: if selected background is deleted/inactive,
//    cleans up ONLY if the user's DB row still holds that specific stale ID,
//    preventing clobbering newer selections made concurrently.
// 4. Versioning: focusBackgroundPreferenceVersion tracks authoritative mutations.
// 5. Caching: strictly Cache-Control: private, no-store on all preference responses.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { CANONICAL_CLASSIC_SLUG } from "@/lib/focus-background-client";
import { getUserBackgroundSignedUrl } from "@/lib/supabase-storage";
import { isValidFocusBackgroundSource, FocusBackgroundSource } from "@/lib/focus-background-types";

export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        focusBackgroundSource: true,
        selectedFocusBackgroundId: true,
        selectedCustomBackgroundId: true,
        focusBackgroundPreferenceVersion: true,
        selectedFocusBackground: {
          include: { category: true },
        },
        selectedCustomBackground: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const version = user.focusBackgroundPreferenceVersion ?? 0;
    const source: FocusBackgroundSource =
      (user.focusBackgroundSource as FocusBackgroundSource) ||
      (user.selectedFocusBackgroundId
        ? "official"
        : user.selectedCustomBackgroundId
        ? "custom"
        : "classic");

    // 1. If preference was never initialized on server (version 0)
    if (version === 0) {
      return NextResponse.json(
        {
          initialized: false,
          version: 0,
          source: "classic",
          backgroundId: null,
          categorySlug: CANONICAL_CLASSIC_SLUG,
          isClassic: true,
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // 2. If preference is Classic
    if (source === "classic" || (!user.selectedFocusBackgroundId && !user.selectedCustomBackgroundId)) {
      return NextResponse.json(
        {
          initialized: true,
          version,
          source: "classic",
          backgroundId: null,
          categorySlug: CANONICAL_CLASSIC_SLUG,
          isClassic: true,
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // 3. Official Background Resolution
    if (source === "official") {
      const bg = user.selectedFocusBackground;
      const isInvalid = !bg || !bg.isActive || !bg.category || !bg.category.isActive;

      if (isInvalid) {
        // Conditional stale cleanup race protection: update only if still holding this stale ID and source
        const staleId = user.selectedFocusBackgroundId;
        if (staleId !== null) {
          const cleanupWhere: any = {
            id: session.userId,
            selectedFocusBackgroundId: staleId,
          };
          if (user.focusBackgroundSource) {
            cleanupWhere.focusBackgroundSource = "official";
          }
          const cleanupData: any = {
            selectedFocusBackgroundId: null,
          };
          if (user.focusBackgroundSource) {
            cleanupData.focusBackgroundSource = "classic";
            cleanupData.selectedCustomBackgroundId = null;
          }

          await prisma.user.updateMany({
            where: cleanupWhere,
            data: cleanupData,
          });
        }

        return NextResponse.json(
          {
            initialized: true,
            version,
            source: "classic",
            backgroundId: null,
            categorySlug: CANONICAL_CLASSIC_SLUG,
            isClassic: true,
            resetFromInvalid: true,
          },
          { headers: PRIVATE_NO_STORE_HEADERS }
        );
      }

      return NextResponse.json(
        {
          initialized: true,
          version,
          source: "official",
          backgroundId: bg.id,
          categorySlug: bg.category.slug,
          isClassic: false,
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // 4. Custom User Background Resolution
    if (source === "custom") {
      const customBg = user.selectedCustomBackground;
      // Stale or unauthorized if missing or owner mismatch
      const isInvalid = !customBg || customBg.userId !== session.userId;

      if (isInvalid) {
        // Conditional stale cleanup race protection
        const staleId = user.selectedCustomBackgroundId;
        if (staleId !== null) {
          await prisma.user.updateMany({
            where: {
              id: session.userId,
              focusBackgroundSource: "custom",
              selectedCustomBackgroundId: staleId,
            },
            data: {
              focusBackgroundSource: "classic",
              selectedFocusBackgroundId: null,
              selectedCustomBackgroundId: null,
            },
          });
        }

        return NextResponse.json(
          {
            initialized: true,
            version,
            source: "classic",
            backgroundId: null,
            categorySlug: CANONICAL_CLASSIC_SLUG,
            isClassic: true,
            resetFromInvalid: true,
          },
          { headers: PRIVATE_NO_STORE_HEADERS }
        );
      }

      // Valid custom background: mint 1-hour signed URL
      const { signedUrl } = await getUserBackgroundSignedUrl(
        session.userId,
        customBg.storagePath,
        3600
      );

      return NextResponse.json(
        {
          initialized: true,
          version,
          source: "custom",
          backgroundId: customBg.id,
          categorySlug: "custom",
          isClassic: false,
          customBackground: {
            id: customBg.id,
            userId: customBg.userId,
            name: customBg.name,
            width: customBg.width,
            height: customBg.height,
            aspectRatio: customBg.aspectRatio,
            focalX: customBg.focalX,
            focalY: customBg.focalY,
            timerPosition: customBg.timerPosition,
            layoutKey: customBg.layoutKey ?? "classic",
            fileSize: customBg.fileSize,
            mimeType: customBg.mimeType,
            createdAt: customBg.createdAt.toISOString(),
            signedUrl: signedUrl ?? null,
            signedUrlExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
          },
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Fallback safe default
    return NextResponse.json(
      {
        initialized: true,
        version,
        source: "classic",
        backgroundId: null,
        categorySlug: CANONICAL_CLASSIC_SLUG,
        isClassic: true,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (err: any) {
    console.error("[api/focus-backgrounds/preference] GET error:", err);
    return NextResponse.json(
      { error: "Failed to resolve focus background preference" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { source: rawSource, backgroundId } = body;

    // Resolve target source with backwards compatibility:
    // If source is not explicitly specified, deduce from backgroundId:
    // null -> 'classic', number -> 'official'
    let targetSource: FocusBackgroundSource;
    if (rawSource !== undefined) {
      if (!isValidFocusBackgroundSource(rawSource)) {
        return NextResponse.json(
          { error: "Invalid source. Must be 'classic', 'official', or 'custom'." },
          { status: 400 }
        );
      }
      targetSource = rawSource;
    } else {
      targetSource = backgroundId === null ? "classic" : "official";
    }

    // ── Case A: Selecting Classic Sylf ───────────────────────────
    if (targetSource === "classic") {
      const updated = await prisma.user.update({
        where: { id: session.userId },
        data: {
          focusBackgroundSource: "classic",
          selectedFocusBackgroundId: null,
          selectedCustomBackgroundId: null,
          focusBackgroundPreferenceVersion: { increment: 1 },
        },
        select: {
          focusBackgroundPreferenceVersion: true,
        },
      });

      return NextResponse.json(
        {
          success: true,
          initialized: true,
          version: updated.focusBackgroundPreferenceVersion,
          source: "classic",
          backgroundId: null,
          categorySlug: CANONICAL_CLASSIC_SLUG,
          isClassic: true,
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Validate backgroundId for official/custom selections
    const isValidInteger =
      typeof backgroundId === "number" &&
      Number.isSafeInteger(backgroundId) &&
      backgroundId > 0;

    if (!isValidInteger) {
      return NextResponse.json(
        {
          error:
            "Invalid backgroundId. Must be null for Classic Sylf or a positive safe integer.",
        },
        { status: 400 }
      );
    }

    // ── Case B: Selecting Official Background ────────────────────
    if (targetSource === "official") {
      const bg = await prisma.focusBackground.findUnique({
        where: { id: backgroundId as number },
        include: { category: true },
      });

      if (!bg) {
        return NextResponse.json({ error: "Background not found" }, { status: 404 });
      }

      if (!bg.isActive) {
        return NextResponse.json(
          { error: "Cannot select inactive background" },
          { status: 400 }
        );
      }

      if (!bg.category || !bg.category.isActive) {
        return NextResponse.json(
          { error: "Cannot select background from inactive category" },
          { status: 400 }
        );
      }

      // Single-operation atomic write strictly bound to session.userId
      const updated = await prisma.user.update({
        where: { id: session.userId },
        data: {
          focusBackgroundSource: "official",
          selectedFocusBackgroundId: bg.id,
          selectedCustomBackgroundId: null,
          focusBackgroundPreferenceVersion: { increment: 1 },
        },
        select: {
          focusBackgroundPreferenceVersion: true,
        },
      });

      return NextResponse.json(
        {
          success: true,
          initialized: true,
          version: updated.focusBackgroundPreferenceVersion,
          source: "official",
          backgroundId: bg.id,
          categorySlug: bg.category.slug,
          isClassic: false,
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // ── Case C: Selecting Custom User Background ─────────────────
    if (targetSource === "custom") {
      // Look ONLY in UserFocusBackground scoped strictly to session.userId
      const bg = await prisma.userFocusBackground.findFirst({
        where: {
          id: backgroundId as number,
          userId: session.userId,
        },
      });

      if (!bg) {
        return NextResponse.json(
          { error: "Custom background not found or unauthorized" },
          { status: 404 }
        );
      }

      // Mint 1-hour signed URL for active session
      const { signedUrl } = await getUserBackgroundSignedUrl(
        session.userId,
        bg.storagePath,
        3600
      );

      // Single-operation atomic write strictly bound to session.userId
      const updated = await prisma.user.update({
        where: { id: session.userId },
        data: {
          focusBackgroundSource: "custom",
          selectedFocusBackgroundId: null,
          selectedCustomBackgroundId: bg.id,
          focusBackgroundPreferenceVersion: { increment: 1 },
        },
        select: {
          focusBackgroundPreferenceVersion: true,
        },
      });

      return NextResponse.json(
        {
          success: true,
          initialized: true,
          version: updated.focusBackgroundPreferenceVersion,
          source: "custom",
          backgroundId: bg.id,
          categorySlug: "custom",
          isClassic: false,
          customBackground: {
            id: bg.id,
            userId: bg.userId,
            name: bg.name,
            width: bg.width,
            height: bg.height,
            aspectRatio: bg.aspectRatio,
            focalX: bg.focalX,
            focalY: bg.focalY,
            timerPosition: bg.timerPosition,
            layoutKey: bg.layoutKey ?? "classic",
            fileSize: bg.fileSize,
            mimeType: bg.mimeType,
            createdAt: bg.createdAt.toISOString(),
            signedUrl: signedUrl ?? null,
            signedUrlExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
          },
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ error: "Unhandled preference source" }, { status: 400 });
  } catch (err: any) {
    console.error("[api/focus-backgrounds/preference] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update focus background preference" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
