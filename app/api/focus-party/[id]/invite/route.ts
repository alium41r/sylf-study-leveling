import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { inviteFriend, mapFocusPartyError } from "@/lib/focus-party-service";

/**
 * POST /api/focus-party/[id]/invite
 * Invites a friend to join the Focus Party.
 * Body: { friendId: number }
 * Enforces:
 * - Caller must be an active member of the party.
 * - Party must not be disbanded or full (max 4).
 * - Invitee must be a confirmed friend of the caller.
 * - Invitee must not be in an active party or already have a pending invite.
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

    let friendId: number | undefined;
    try {
      const body = await req.json();
      if (typeof body.friendId === "number") {
        friendId = body.friendId;
      } else if (typeof body.friendId === "string") {
        friendId = parseInt(body.friendId, 10);
      }
    } catch {
      return NextResponse.json({ error: "Missing or invalid request body", code: "VALIDATION_FAILED" }, { status: 400 });
    }

    if (!friendId || isNaN(friendId)) {
      return NextResponse.json({ error: "Valid friendId is required", code: "VALIDATION_FAILED" }, { status: 400 });
    }

    const result = await inviteFriend(partyId, payload.userId, friendId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const mapped = mapFocusPartyError(err);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.statusCode });
  }
}
