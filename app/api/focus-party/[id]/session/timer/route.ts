import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import {
  startTimer,
  pauseTimer,
  resumeTimer,
  leaveFocus,
  enterFocus,
  getActiveSession,
  mapFocusPartyError,
} from "@/lib/focus-party-service";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

/**
 * POST /api/focus-party/[id]/session/timer
 * Dispatches an authoritative timer action for the caller within the party session.
 * Body: { action: "start" | "pause" | "resume" | "leave", sessionId?: number }
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

    let action: string | undefined;
    let sessionId: number | undefined;
    let boundary: { joinedAt: string; endedAt: string } | undefined;

    try {
      const body = await req.json();
      if (body.expectedOwnerId !== undefined && body.expectedOwnerId !== payload.userId)
        return NextResponse.json({ error: "Sign in to the original account to sync this saved session.", code: "ACCOUNT_CHANGED" }, { status: 409 });
      action = body.action;
      if (typeof body.sessionId === "number") {
        sessionId = body.sessionId;
      }
      if (body.joinedAt !== undefined || body.endedAt !== undefined) {
        const parsed = z.object({ joinedAt: z.string().datetime(), endedAt: z.string().datetime() }).safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid focus room exit time", code: "VALIDATION_FAILED" }, { status: 400 });
        boundary = parsed.data;
      }
    } catch {
      return NextResponse.json({ error: "Request body required", code: "VALIDATION_FAILED" }, { status: 400 });
    }


    if (!action || !["start", "pause", "resume", "leave"].includes(action)) {
      return NextResponse.json(
        { error: "action must be one of: 'start', 'pause', 'resume', 'leave'", code: "VALIDATION_FAILED" },
        { status: 400 }
      );
    }

    let targetSessionId = sessionId;
    if (!targetSessionId) {
      const activeSession = await getActiveSession(partyId, payload.userId);
      if (!activeSession) {
        if (action === "start") {
          const entry = await enterFocus(partyId, payload.userId);
          targetSessionId = entry.sessionId;
        } else {
          return NextResponse.json(
            { error: "No active focus session found", code: "SESSION_NOT_FOUND" },
            { status: 404 }
          );
        }
      } else {
        targetSessionId = activeSession.id;
      }
    }

    const target = await prisma.focusSession.findUnique({ where: { id: targetSessionId }, select: { partyId: true } });
    if (!target || target.partyId !== partyId) return NextResponse.json({ error: "Focus session not found in this party", code: "SESSION_NOT_FOUND" }, { status: 404 });

    if (action === "start") {
      const isMemberOfSession = await prisma.focusSessionMember.findFirst({
        where: { sessionId: targetSessionId, userId: payload.userId, leftAt: null },
      });
      if (!isMemberOfSession) {
        await enterFocus(partyId, payload.userId);
      }
    }

    let result;
    switch (action) {
      case "start":
        result = await startTimer(targetSessionId, payload.userId);
        break;
      case "pause":
        result = await pauseTimer(targetSessionId, payload.userId);
        break;
      case "resume":
        result = await resumeTimer(targetSessionId, payload.userId);
        break;
      case "leave":
        result = await leaveFocus(targetSessionId, payload.userId, boundary);
        break;
      default:
        return NextResponse.json({ error: "Unsupported action", code: "VALIDATION_FAILED" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapFocusPartyError(err);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.statusCode });
  }
}
