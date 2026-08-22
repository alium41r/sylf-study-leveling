import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import {
  StudyScheduleService,
  FLOATING_REST_DAY_QUOTA,
} from "@/lib/study-schedule-service";

export const dynamic = "force-dynamic";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const toggleSchema = z.object({
  dateKey: z.string().regex(DATE_KEY_RE, "dateKey must be YYYY-MM-DD"),
});

/**
 * GET /api/user/study-schedule/floating-rest-day?dateKey=YYYY-MM-DD
 * Live toggle + weekly quota status for a single date.
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const { searchParams } = new URL(req.url);
    const dateKey = searchParams.get("dateKey") || "";

    if (!DATE_KEY_RE.test(dateKey)) {
      return NextResponse.json({ error: "Invalid dateKey. Expected YYYY-MM-DD." }, { status: 400 });
    }

    const status = await StudyScheduleService.getFloatingRestDayStatus(userId, dateKey);
    return NextResponse.json(status, { status: 200 });
  } catch (error) {
    console.error("GET floating-rest-day error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/user/study-schedule/floating-rest-day  { dateKey }
 *
 * Toggle semantics:
 *  - Existing floating rest day on `dateKey`  -> delete (toggle off) → 200
 *  - dateKey matches a FIXED rest day         -> 400 FIXED_REST_DAY (redundant)
 *  - weekly quota exhausted                   -> 400 WEEKLY_REST_DAY_LIMIT_REACHED
 *  - otherwise                               -> atomically create the record AND
 *    run the quest-shifting cascade (Workstream B) → 200 with shifted quests
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const body = await req.json().catch(() => null);
    const parsed = toggleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { dateKey } = parsed.data;
    const status = await StudyScheduleService.getFloatingRestDayStatus(userId, dateKey);

    // ─── Toggle OFF ────────────────────────────────────────────
    if (status.isFloatingRest) {
      try {
        await prisma.floatingRestDay.delete({
          where: { userId_dateKey: { userId, dateKey } },
        });
      } catch {
        // Already deleted concurrently — still return a stable removed state.
      }
      return NextResponse.json(
        {
          action: "removed",
          dateKey,
          weekKey: status.weekKey,
          weekUsage: 0,
          weekQuota: FLOATING_REST_DAY_QUOTA,
          shiftedQuests: [],
        },
        { status: 200 }
      );
    }

    // ─── Guardrail: fixed rest days cannot be re-designated ────
    if (status.isFixedRest) {
      return NextResponse.json(
        {
          error: "FIXED_REST_DAY",
          message: "This day is already a fixed rest day on your weekly schedule.",
        },
        { status: 400 }
      );
    }

    // ─── Guardrail: 1 floating rest day per ISO week ───────────
    if (status.weekUsage >= FLOATING_REST_DAY_QUOTA) {
      return NextResponse.json(
        {
          error: "WEEKLY_REST_DAY_LIMIT_REACHED",
          message: `You can only designate ${FLOATING_REST_DAY_QUOTA} floating rest day per week.`,
        },
        { status: 400 }
      );
    }

    // ─── Commit: create record + automatic quest cascade ───────
    let record;
    let shiftedQuests: Awaited<ReturnType<typeof StudyScheduleService.cascadeQuestShifts>> = [];
    try {
      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.floatingRestDay.create({
          data: { userId, dateKey, weekKey: status.weekKey },
        });
        const shifts = await StudyScheduleService.cascadeQuestShifts(userId, dateKey, { tx });
        return { created, shifts };
      });
      record = result.created;
      shiftedQuests = result.shifts;
    } catch (error) {
      // Unique-constraint race: another request already created it → toggle off.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        await prisma.floatingRestDay
          .delete({ where: { userId_dateKey: { userId, dateKey } } })
          .catch(() => {});
        return NextResponse.json(
          {
            action: "removed",
            dateKey,
            weekKey: status.weekKey,
            weekUsage: 0,
            weekQuota: FLOATING_REST_DAY_QUOTA,
            shiftedQuests: [],
          },
          { status: 200 }
        );
      }
      throw error;
    }

    return NextResponse.json(
      {
        action: "added",
        dateKey,
        weekKey: status.weekKey,
        weekUsage: 1,
        weekQuota: FLOATING_REST_DAY_QUOTA,
        restDay: record,
        shiftedQuests,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST floating-rest-day error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
