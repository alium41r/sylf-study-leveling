import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import {
  getActiveSession,
  enterFocus,
  mapFocusPartyError,
} from "@/lib/focus-party-service";

/**
 * GET /api/focus-party/[id]/session
 * Retrieves the currently active FocusSession for the party, including
 * all participating members and their authoritative timer states.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getSession(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id } = await params;
    const partyId = parseInt(id, 10);
    if (isNaN(partyId)) {
      return NextResponse.json({ error: "Invalid party ID", code: "PARTY_NOT_FOUND" }, { status: 400 });
    }

    const session = await getActiveSession(partyId, payload.userId);
    return NextResponse.json({ session });
  } catch (err) {
    const mapped = mapFocusPartyError(err);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.statusCode });
  }
}

/**
 * POST /api/focus-party/[id]/session
 * Enters focus mode for the caller within the specified party.
 * If no session is active, initializes one.
 * Body (optional): { title?: string, durationGoalMinutes?: number }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getSession(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id } = await params;
    const partyId = parseInt(id, 10);
    if (isNaN(partyId)) {
      return NextResponse.json({ error: "Invalid party ID", code: "PARTY_NOT_FOUND" }, { status: 400 });
    }

    let title: string | undefined;
    let durationGoalMinutes: number | undefined;

    try {
      const body = await req.json();
      if (typeof body.title === "string" && body.title.trim().length > 0) {
        title = body.title.trim();
      }
      if (typeof body.durationGoalMinutes === "number" && body.durationGoalMinutes > 0) {
        durationGoalMinutes = body.durationGoalMinutes;
      }
    } catch {
      // Body is optional
    }

    const result = await enterFocus(partyId, payload.userId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const mapped = mapFocusPartyError(err);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.statusCode });
  }
}
