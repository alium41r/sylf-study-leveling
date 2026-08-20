import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { StudyScheduleService } from "@/lib/study-schedule-service";
import { HpPenaltyService } from "@/lib/hp-penalty-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/month?year=YYYY&month=M
 * Returns the calendar month grid with enriched day statistics, targets, rest days,
 * and subject/quest breakdowns.
 * Also performs lazy HP penalty reconciliation for past missed active days.
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const { searchParams } = new URL(req.url);

    const now = new Date();
    let year = parseInt(searchParams.get("year") || "", 10);
    let month = parseInt(searchParams.get("month") || "", 10);

    if (isNaN(year) || year < 2000 || year > 2100) {
      year = now.getFullYear();
    }

    // Accept 0-11 or 1-12. If month is 1-12 from some clients, or 0-11:
    // Normalize to 0-indexed month (0 = Jan, 11 = Dec)
    if (isNaN(month) || month < 0 || month > 11) {
      month = now.getMonth();
    }

    // 1. Trigger lazy HP penalty reconciliation
    try {
      await HpPenaltyService.reconcileDailyHpPenalty(userId);
    } catch (penaltyError) {
      console.warn("Lazy HP penalty reconciliation blip in calendar API:", penaltyError);
    }

    // 2. Fetch enriched calendar month data
    const monthData = await StudyScheduleService.getMonthCalendarData(userId, year, month);

    return NextResponse.json(monthData, { status: 200 });
  } catch (error) {
    console.error("GET /api/calendar/month error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
