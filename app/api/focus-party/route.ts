import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import {
  createParty,
  getUserActiveParty,
  getUserPendingPartyInvites,
  mapFocusPartyError,
} from "@/lib/focus-party-service";

/**
 * GET /api/focus-party
 * Returns the current authenticated user's active Focus Party (if any)
 * and all pending Focus Party invitations.
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = payload.userId;
    const [activeParty, pendingInvites] = await Promise.all([
      getUserActiveParty(userId),
      getUserPendingPartyInvites(userId),
    ]);

    return NextResponse.json({
      activeParty,
      pendingInvites,
    });
  } catch (err) {
    const mapped = mapFocusPartyError(err);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.statusCode });
  }
}

/**
 * POST /api/focus-party
 * Creates a new Focus Party with the caller as initial leader.
 * Body: { name?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = payload.userId;
    let name: string | undefined;
    try {
      const body = await req.json();
      if (typeof body.name === "string" && body.name.trim().length > 0) {
        name = body.name.trim();
      }
    } catch {
      // Body is optional
    }

    const result = await createParty(userId, name);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const mapped = mapFocusPartyError(err);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.statusCode });
  }
}
