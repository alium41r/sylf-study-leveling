import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { respondToInvite, mapFocusPartyError } from "@/lib/focus-party-service";

/**
 * PATCH /api/focus-party/invites/[id]
 * Responds to a pending Focus Party invite.
 * Body: { response: "accept" | "decline" }
 * Enforces:
 * - Caller must be the recipient of the invite.
 * - If accepted, caller automatically joins the party if capacity allows.
 * - If declined, invite is marked declined.
 */
async function handleInviteResponse(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  try {
    const payload = await getSession(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id } = await params;
    const inviteId = parseInt(id, 10);
    if (isNaN(inviteId)) {
      return NextResponse.json({ error: "Invalid invite ID", code: "VALIDATION_FAILED" }, { status: 400 });
    }

    let parsedAction: "ACCEPTED" | "DECLINED" | undefined;
    try {
      const body = await req.json();
      if (body.action === "ACCEPTED" || body.action === "DECLINED") {
        parsedAction = body.action;
      } else if (body.response === "accept") {
        parsedAction = "ACCEPTED";
      } else if (body.response === "decline") {
        parsedAction = "DECLINED";
      }
    } catch {
      return NextResponse.json({ error: "Request body required", code: "VALIDATION_FAILED" }, { status: 400 });
    }

    if (!parsedAction) {
      return NextResponse.json(
        { error: "action must be 'ACCEPTED' or 'DECLINED' (or response 'accept'/'decline')", code: "VALIDATION_FAILED" },
        { status: 400 }
      );
    }

    const result = await respondToInvite(inviteId, payload.userId, parsedAction);
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapFocusPartyError(err);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.statusCode });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleInviteResponse(req, params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleInviteResponse(req, params);
}
