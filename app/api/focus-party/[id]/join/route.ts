import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { joinParty, mapFocusPartyError } from "@/lib/focus-party-service";

/**
 * POST /api/focus-party/[id]/join
 * Joins an existing Focus Party. Requires an active pending invitation or being the leader.
 * Enforces maximum capacity of 4 members.
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

    const result = await joinParty(partyId, payload.userId);
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapFocusPartyError(err);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.statusCode });
  }
}
