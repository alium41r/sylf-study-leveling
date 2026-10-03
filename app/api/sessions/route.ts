import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { invalidateRankingsCache } from "@/lib/cache-service";
import { revalidateTag } from "next/cache";
import { durablePlanner } from "@/lib/planner/v2/server/web";
import { DurablePlannerError } from "@/lib/planner/v2/server/database";
import { StudySessionTransitionV2Schema } from "@/lib/planner/v2/contracts";

const startSessionSchema = z.object({
  questId: z.number().int().optional(),
  subjectId: z.number().int().optional(),
  initialSeconds: z.number().int().min(0).optional(),
  executionProtocol: z.literal(2).optional(),
});

const endSessionSchema = z.object({
  id: z.number().int(),
  durationMinutes: z.number().int().min(0),
  durationSeconds: z.number().int().min(0).optional(),
  breakSeconds: z.number().int().min(0).optional(),
  questId: z.number().int().optional(),
  completeQuest: z.boolean().optional(),
  final: z.boolean().optional(),
});

/** Restore an owned authoritative timer after refresh/client takeover. */
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  try { return NextResponse.json({ execution: await durablePlanner().sessions.read(session.userId, id) }); }
  catch (error) {
    if (error instanceof DurablePlannerError) return NextResponse.json({ error: error.detail.code, detail: error.detail }, { status: 404 });
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 503 });
  }
}

/**
 * POST /api/sessions
 * Start a new study session (optionally linked to a quest). When the client
 * has already accumulated focus seconds before the row existed (lazy start),
 * initialSeconds backdates the session's startedAt so the server-side
 * wall-clock clamp never truncates legitimate carried-over time.
 */
export async function POST(req: NextRequest) {
  try {
    const authSession = await getSession(req);
    if (!authSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authSession.userId;

    const body = await req.json();
    const validation = startSessionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { questId, subjectId, initialSeconds, executionProtocol } = validation.data;
    if (questId) {
      const linked = await prisma.quest.findFirst({ where: { id: questId, userId }, select: { plannedMinutes: true } });
      if (linked?.plannedMinutes !== null && linked?.plannedMinutes !== undefined) {
        if (executionProtocol !== 2) return NextResponse.json({ error: "PLANNER_EXECUTION_PROTOCOL_REQUIRED", message: "Update this client before starting this plan's work." }, { status: 409 });
        const execution = await durablePlanner().sessions.start(userId, questId);
        return NextResponse.json({ id: execution.sessionId, userId, questId, subjectId: subjectId ?? null,
          durationMinutes: Math.floor(execution.acceptedFocusSeconds / 60), durationSeconds: execution.acceptedFocusSeconds,
          startedAt: execution.startedAt, execution }, { status: 201 });
      }
    }

    // Execute atomic PostgreSQL start_study_session RPC
    const rows = await prisma.$queryRaw<
      [{ start_study_session: { id: number; userId: number; questId: number | null; subjectId: number | null; durationMinutes: number; durationSeconds: number; focusRate: number; startedAt: string } }]
    >`
      SELECT public.start_study_session(
        ${userId},
        ${questId ?? null},
        ${subjectId ?? null},
        ${initialSeconds ?? 0}
      ) AS start_study_session
    `;

    const session = rows[0]?.start_study_session;
    return NextResponse.json(session, { status: 201 });
  } catch (error: any) {
    if (error instanceof DurablePlannerError) return NextResponse.json({ error: error.detail.code, detail: error.detail }, { status: 409 });
    console.error("POST /api/sessions error:", error);
    // S5: map RPC ownership rejections to clean 4xx (cross-user quest/subject).
    const msg = String(error?.message || "");
    if (/unauthorized|not found/i.test(msg)) {
      return NextResponse.json(
        { error: "Quest or subject not found or unauthorized" },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/sessions
 * Heartbeat / final settlement. ALL session + quest + node + progression
 * mutations happen inside a single atomic PostgreSQL RPC
 * (settle_study_session_atomic): session duration (exact delta accounting),
 * quest completion (with early/GateKey/streak modifiers and HP heal),
 * syllabus node progress, XP/Sylph progression, ledgers, and system messages.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (body?.executionTransition) {
      const transition = StudySessionTransitionV2Schema.safeParse(body.executionTransition);
      if (!transition.success) return NextResponse.json({ error: "INVALID_OUTPUT", message: "Invalid versioned timer transition." }, { status: 400 });
      const result = await durablePlanner().sessions.transition(session.userId, transition.data);
      invalidateRankingsCache();
      return NextResponse.json({ ...result.settlement, execution: result.execution, durationSeconds: result.execution.acceptedFocusSeconds,
        breakSeconds: result.execution.acceptedBreakSeconds }, { status: 200 });
    }
    const validation = endSessionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { id, durationMinutes, durationSeconds, breakSeconds, questId, completeQuest, final } = validation.data;
    const claimedSeconds = durationSeconds ?? durationMinutes * 60;

    // ─── S4: SETTLE-CYCLE FLOOD GUARD ──────────────────────────
    // The settle RPC grants a small wall-clock grace (+60s), so a rapid
    // start→settle→start→settle loop could farm XP. Cap final settlements to
    // 6 per rolling 60 seconds per user (real studying never trips this).
    if (final === true) {
      const recentSettles = await prisma.studySession.count({
        where: {
          userId: session.userId,
          endedAt: { gte: new Date(Date.now() - 60_000) },
          NOT: { id },
        },
      }).catch(() => 0);
      if (recentSettles >= 6) {
        return NextResponse.json(
          { error: "Too many session settlements. Please wait a moment." },
          { status: 429, headers: { "Retry-After": "30" } }
        );
      }
    }

    const rpcResult = await durablePlanner().sessions.settleLegacy(session.userId, {
      id, focus: claimedSeconds, breaks: breakSeconds ?? 0, questId,
      complete: completeQuest === true, final: final === true,
    });
    // Cache invalidation is not an economic decision.
    const userRow = await prisma.user.findUnique({ where: { id: session.userId }, select: { username: true } });

    invalidateRankingsCache();

    const username = userRow?.username;
    if (username) {
      try {
        revalidateTag(`user-${username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${username.toLowerCase()}`, "max");
      } catch {}
    }

    // Respond immediately with the RPC result — no trailing re-read.
    return NextResponse.json(
      {
        ...rpcResult,
        questCompletedNow: rpcResult.questCompleted,
        weeklyAwarded: rpcResult.weeklyAwarded,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error && /Too many session settlements/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": "30" } });
    if (error instanceof Error && /Session not found/.test(error.message)) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (error instanceof DurablePlannerError) return NextResponse.json({ error: error.detail.code, detail: error.detail }, { status: 409 });
    if (error instanceof Error && /PLANNER_(EXECUTION_PROTOCOL_REQUIRED|EXPLICIT_STOP_REQUIRED)/.test(error.message))
      return NextResponse.json({ error: "PLANNER_EXECUTION_PROTOCOL_REQUIRED", message: "Reload or update this client to continue this plan's timer." }, { status: 409 });
    console.error("PATCH /api/sessions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
