import { prisma } from "@/lib/prisma";
import { TimezoneService } from "@/lib/timezone-service";
import { StudyScheduleService } from "@/lib/study-schedule-service";

export interface PenaltyReconciliationResult {
  penaltiesApplied: number;
  totalHpDeducted: number;
  newHp: number;
  evaluatedDays: string[];
}

export class HpPenaltyService {
  /**
   * Reconciles daily study targets against study logs for past unevaluated days.
   * Runs lazily on user heartbeat, login, or calendar views.
   */
  static async reconcileDailyHpPenalty(
    userId: number,
    timezoneOverride?: string
  ): Promise<PenaltyReconciliationResult> {
    let user: any = null;
    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          hp: true,
          maxHp: true,
          timezone: true,
          dailyGoalMinutes: true,
          restDays: true,
          enableHpPenalty: true,
          lastDailyPenaltyEvaluatedDate: true,
          createdAt: true,
        },
      });
    } catch (userErr) {
      console.warn("HpPenaltyService user query error:", userErr);
      return { penaltiesApplied: 0, totalHpDeducted: 0, newHp: 100, evaluatedDays: [] };
    }

    if (!user) {
      return { penaltiesApplied: 0, totalHpDeducted: 0, newHp: 100, evaluatedDays: [] };
    }

    const timezone = timezoneOverride || user.timezone || "UTC";
    const todayStr = TimezoneService.getUserLocalDate(timezone);

    // Calculate yesterday's date string in user's timezone
    const todayDateObj = new Date(`${todayStr}T12:00:00Z`);
    const yesterdayDateObj = new Date(todayDateObj.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterdayDateObj.toISOString().split("T")[0];

    // If already evaluated through yesterday, nothing to do
    if (user.lastDailyPenaltyEvaluatedDate === yesterdayStr) {
      return {
        penaltiesApplied: 0,
        totalHpDeducted: 0,
        newHp: user.hp,
        evaluatedDays: [],
      };
    }

    // Determine start evaluation date
    let evalStartDateStr: string;
    if (user.lastDailyPenaltyEvaluatedDate) {
      const lastEvalObj = new Date(`${user.lastDailyPenaltyEvaluatedDate}T12:00:00Z`);
      const nextDayObj = new Date(lastEvalObj.getTime() + 24 * 60 * 60 * 1000);
      evalStartDateStr = nextDayObj.toISOString().split("T")[0];
    } else {
      // First time initialization: start from yesterday (or at most user createdAt)
      const userCreatedDateStr = TimezoneService.getUserLocalDate(timezone, user.createdAt);
      evalStartDateStr = userCreatedDateStr < yesterdayStr ? yesterdayStr : userCreatedDateStr;
    }

    // Guard against running ahead of yesterday or evaluating future dates
    if (evalStartDateStr > yesterdayStr) {
      await prisma.user.update({
        where: { id: userId },
        data: { lastDailyPenaltyEvaluatedDate: yesterdayStr },
      });
      return {
        penaltiesApplied: 0,
        totalHpDeducted: 0,
        newHp: user.hp,
        evaluatedDays: [],
      };
    }

    // Cap evaluation range to maximum 7 days back to prevent catastrophic drain
    const maxBacktrackObj = new Date(todayDateObj.getTime() - 7 * 24 * 60 * 60 * 1000);
    const maxBacktrackStr = maxBacktrackObj.toISOString().split("T")[0];
    if (evalStartDateStr < maxBacktrackStr) {
      evalStartDateStr = maxBacktrackStr;
    }

    // Generate list of days to evaluate
    const daysToEvaluate: string[] = [];
    let curr = new Date(`${evalStartDateStr}T12:00:00Z`);
    const end = new Date(`${yesterdayStr}T12:00:00Z`);

    while (curr <= end) {
      daysToEvaluate.push(curr.toISOString().split("T")[0]);
      curr = new Date(curr.getTime() + 24 * 60 * 60 * 1000);
    }

    if (daysToEvaluate.length === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { lastDailyPenaltyEvaluatedDate: yesterdayStr },
      });
      return {
        penaltiesApplied: 0,
        totalHpDeducted: 0,
        newHp: user.hp,
        evaluatedDays: [],
      };
    }

    // Fetch all sessions in the evaluation window
    const firstDayUtc = new Date(`${daysToEvaluate[0]}T00:00:00Z`);
    firstDayUtc.setUTCDate(firstDayUtc.getUTCDate() - 2);
    const lastDayUtc = new Date(`${daysToEvaluate[daysToEvaluate.length - 1]}T23:59:59Z`);
    lastDayUtc.setUTCDate(lastDayUtc.getUTCDate() + 2);

    const sessions = await prisma.studySession.findMany({
      where: {
        userId,
        startedAt: {
          gte: firstDayUtc,
          lte: lastDayUtc,
        },
      },
      select: {
        durationMinutes: true,
        durationSeconds: true,
        startedAt: true,
      },
    });

    // Map sessions to local days
    const dailyMinutesMap: Record<string, number> = {};
    for (const d of daysToEvaluate) {
      dailyMinutesMap[d] = 0;
    }

    for (const s of sessions) {
      const localDate = TimezoneService.getUserLocalDate(timezone, s.startedAt);
      if (dailyMinutesMap[localDate] !== undefined) {
        const mins = s.durationMinutes > 0 ? s.durationMinutes : Math.floor(s.durationSeconds / 60);
        dailyMinutesMap[localDate] += mins;
      }
    }

    // Evaluate each day
    let currentHp = user.hp;
    let totalDeducted = 0;
    let penaltiesCount = 0;
    const penaltyEvents: Array<{ day: string; minutes: number; target: number; damage: number }> = [];

    const dailyGoal = Math.max(10, user.dailyGoalMinutes);
    const restDays = user.restDays || [0];

    for (const dayStr of daysToEvaluate) {
      const isRest = StudyScheduleService.isRestDay(dayStr, restDays);
      if (isRest) {
        // Rest days are 100% exempt from penalties
        continue;
      }

      const loggedMinutes = dailyMinutesMap[dayStr] || 0;
      if (loggedMinutes < dailyGoal) {
        const damage = 15;
        const actualDeduction = Math.min(currentHp, damage);
        currentHp = Math.max(0, currentHp - damage);
        totalDeducted += actualDeduction;
        penaltiesCount += 1;

        penaltyEvents.push({
          day: dayStr,
          minutes: loggedMinutes,
          target: dailyGoal,
          damage,
        });
      }
    }

    // Execute atomic update & ledger entries
    await prisma.$transaction(async (tx) => {
      // Update user HP & evaluation pointer
      await tx.user.update({
        where: { id: userId },
        data: {
          hp: currentHp,
          lastDailyPenaltyEvaluatedDate: yesterdayStr,
        },
      });

      // Create ledger entries and system notifications for each penalty event
      for (const event of penaltyEvents) {
        await tx.hpLedger.create({
          data: {
            userId,
            amount: -event.damage,
            source: "MISSED_DAILY_GOAL",
          },
        });

        await tx.systemMessage.create({
          data: {
            userId,
            type: "WARNING",
            content: `**Daily Focus Goal Missed**\n\nYou logged **${event.minutes}m** of study time on **${event.day}** (Daily Target: **${event.target}m**).\n\nPenalty Applied: **-${event.damage} HP** (Current HP: ${currentHp}/${user.maxHp}).\n\n*Designate off-days as Rest Days in your Study Calendar to protect your HP and streaks.*`,
          },
        });
      }
    });

    return {
      penaltiesApplied: penaltiesCount,
      totalHpDeducted: totalDeducted,
      newHp: currentHp,
      evaluatedDays: daysToEvaluate,
    };
  }
}
