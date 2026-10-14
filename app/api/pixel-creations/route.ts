import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import {
  MAX_PAYLOAD_BYTES,
  type PixelCreation,
  validateCreation,
} from "@/lib/pixel-display/content/asset";

import { creationSelection, deletePixelCreation, savePixelCreation, PixelCreationError } from "@/lib/pixel-creation-service";

export const dynamic = "force-dynamic";

/**
 * A scholar's Pixel Studio creations.
 *
 * USER CONTENT, TREATED AS HOSTILE
 *   Every write is validated with the same deterministic validator the display
 *   uses, and the payload size is bounded **before** the body is parsed into
 *   anything the database will hold. A creation that fails validation is refused
 *   with its reasons rather than stored and repaired later: a broken drawing that
 *   reaches the database is a broken drawing every surface has to defend against
 *   forever.
 *
 * WHY THIS IS ITS OWN ROUTE
 *   `characterConfig` records a *choice*; a creation is *artwork*. Mixing them
 *   would put up to 64 KB into a payload that `useDashboardData`, the stats
 *   route, conversations and profile views all read.
 */

/** The most creations one scholar may keep, so a row count cannot grow forever. */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creations = await prisma.pixelCreation.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
      select: creationSelection,
    });

    return NextResponse.json({ creations }, { status: 200 });
  } catch (error) {
    console.error("GET /api/pixel-creations error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Read as text first so the size bound applies to the *body*, not to a
    // parsed object a large payload has already been turned into.
    const raw = await req.text();
    if (raw.length > MAX_PAYLOAD_BYTES * 2) {
      return NextResponse.json(
        { error: "Creation is too large." },
        { status: 413 },
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const creation = (body as { creation?: unknown })?.creation;
    const issues = validateCreation(creation);
    if (issues.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", issues },
        { status: 400 },
      );
    }

    const saved = await savePixelCreation(session.userId, creation as PixelCreation, (body as { expectedRevision?: unknown }).expectedRevision);

    return NextResponse.json({ creation: saved }, { status: 200 });
  } catch (error) {
    if (error instanceof PixelCreationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("POST /api/pixel-creations error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "A slug is required." }, { status: 400 });
    }

    const rawRevision = req.nextUrl.searchParams.get("revision");
    const revision = rawRevision === null ? undefined : Number(rawRevision);
    if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) return NextResponse.json({ error: "Invalid revision." }, { status: 400 });
    const result = await deletePixelCreation(session.userId, slug, revision);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof PixelCreationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("DELETE /api/pixel-creations error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
