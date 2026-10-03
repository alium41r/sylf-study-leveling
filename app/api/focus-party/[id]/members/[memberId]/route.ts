import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { removeMember, mapFocusPartyError } from "@/lib/focus-party-service";

/**
 * DELETE /api/focus-party/[id]/members/[memberId]
 * Leader removes a party member. Only the leader can execute this action.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const payload = await getSession(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id, memberId } = await params;
    const partyId = parseInt(id, 10);
    const targetUserId = parseInt(memberId, 10);

    if (isNaN(partyId) || isNaN(targetUserId)) {
      return NextResponse.json({ error: "Invalid party or member ID", code: "PARTY_NOT_FOUND" }, { status: 400 });
    }

    const result = await removeMember(partyId, payload.userId, targetUserId);
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapFocusPartyError(err);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.statusCode });
  }
}
