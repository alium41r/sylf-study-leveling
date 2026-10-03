// ============================================================================
// Focus Background Signed URL Refresh API (Phase 5B)
// ============================================================================
// POST/GET /api/focus-backgrounds/preference/refresh-signed-url
//
// Rules enforced:
// 1. Session-bound: operates strictly on current authenticated session.userId.
// 2. Operates ONLY on user's current authoritative custom background preference.
//    Does NOT accept arbitrary backgroundId or storagePath from caller.
// 3. Sliding-window per-user rate limit (15 req / min).
// 4. Returns { backgroundId, signedUrl, signedUrlExpiresAt }.
// 5. Caching: strictly Cache-Control: private, no-store.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { getUserBackgroundSignedUrl } from "@/lib/supabase-storage";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

async function handleRefresh(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // 1. Per-user Rate Limiting (15 refreshes per minute)
    const rlKey = `focus_bg_refresh:${session.userId}`;
    const rl = await rateLimit(rlKey, { limit: 15, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many signed URL refresh requests. Please slow down." },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            "Retry-After": String(rl.retryAfterSeconds),
          },
        }
      );
    }

    // 2. Read user's authoritative custom background preference
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        focusBackgroundSource: true,
        selectedCustomBackgroundId: true,
        selectedCustomBackground: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    if (
      user.focusBackgroundSource !== "custom" ||
      !user.selectedCustomBackground ||
      user.selectedCustomBackground.userId !== session.userId
    ) {
      return NextResponse.json(
        { error: "No valid custom background currently selected" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // 3. Mint fresh 1-hour signed URL
    const customBg = user.selectedCustomBackground;
    const { signedUrl, error: storageError } = await getUserBackgroundSignedUrl(
      session.userId,
      customBg.storagePath,
      3600
    );

    if (storageError || !signedUrl) {
      return NextResponse.json(
        { error: "Failed to generate signed URL for background" },
        { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const signedUrlExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    return NextResponse.json(
      {
        backgroundId: customBg.id,
        signedUrl,
        signedUrlExpiresAt,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (err: any) {
    console.error("[api/focus-backgrounds/preference/refresh-signed-url] error:", err);
    return NextResponse.json(
      { error: "Failed to refresh signed URL" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  return handleRefresh(req);
}

export async function GET(req: NextRequest) {
  return handleRefresh(req);
}
