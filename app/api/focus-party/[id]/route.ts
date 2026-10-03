import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import {
  getPartyState,
  leaveParty,
  mapFocusPartyError,
} from "@/lib/focus-party-service";

/**
 * GET /api/focus-party/[id]
 * Returns complete normalized state for the specified Focus Party.
 * Caller must be an active member of the party.
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

    const state = await getPartyState(partyId, payload.userId);
    return NextResponse.json(state);
  } catch (err) {
    const mapped = mapFocusPartyError(err);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.statusCode });
  }
}

/**
 * DELETE /api/focus-party/[id]
 * Leaves the specified Focus Party. Automatically transfers leadership if leader,
 * and marks the party disbanded if the last member leaves.
 */
export async function DELETE(
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

    const result = await leaveParty(partyId, payload.userId);
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapFocusPartyError(err);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.statusCode });
  }
}
