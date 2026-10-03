import { prisma } from "@/lib/prisma";
import { executionTransaction, coordinateExecution } from "@/lib/execution-coordination";
import { assertNoLinkedQuests } from "@/lib/planner/server/mutation-guards";
import { TimezoneService } from "@/lib/timezone-service";
import { getWeeklyBounds } from "@/lib/game-engine";
import type { Prisma } from "@prisma/client";

import {
  GoalMilestone,
  QuestShift,
  FloatingRestDayStatus,
  FLOATING_REST_DAY_QUOTA,
  DayStudySummary,
  MonthCalendarData,
} from "./study-schedule-types";

export * from "./study-schedule-types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export class StudyScheduleService {
  /**
   * Get day-of-week index (0 = Sun, 1 = Mon, ..., 6 = Sat) for a date string (YYYY-MM-DD).
   */
  static getDayOfWeekIndex(dateStr: string): number {
    const parts = dateStr.split("-").map((n) => parseInt(n, 10));
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getDay();
  }

  /**
   * Check if a specific date string is a designated rest day for the user.
   */
  static isRestDay(dateStr: string, restDays: number[]): boolean {
    const dayOfWeek = this.getDayOfWeekIndex(dateStr);
    return restDays.includes(dayOfWeek);
  }

  /**
   * UNIFIED REST DAY RESOLVER (Workstream A.1)
   *
   * A date is a rest day when EITHER:
   *  - its day-of-week matches the user's fixed `User.restDays`, OR
   *  - a FloatingRestDay record exists for (userId, dateKey).
   *
   * Used by every ingestion vector (manual API, AI planner, chat tools,
   * calendar toggle, HP penalty engine) as the single source of truth.
   */
  static async isUserRestDay(userId: number, targetDate: Date | string, client: Prisma.TransactionClient = prisma): Promise<boolean> {
    let dateKey: string;
    let restDays: number[] = [];

    try {
      const user = await client.user.findUnique({
        where: { id: userId },
        select: { restDays: true, timezone: true },
      });
      restDays = user?.restDays || [];
      dateKey =
        typeof targetDate === "string"
          ? targetDate
          : TimezoneService.getUserLocalDate(user?.timezone || "UTC", targetDate);
    } catch (error) { throw error; }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
    if (this.isRestDay(dateKey, restDays)) return true;

    try {
      const floating = await client.floatingRestDay.findUnique({
        where: { userId_dateKey: { userId, dateKey } },
        select: { id: true },
      });
      return !!floating;
    } catch (error) { throw error; }
  }

  /**
   * Canonical Monday-based ISO week key ("YYYY-Www") for a YYYY-MM-DD date.
   * Reuses the same ISO-week algorithm as game-engine.getWeeklyBounds so
   * quota windows and streak windows always agree.
   */
  static getIsoWeekKey(dateKey: string): string {
    const bounds = getWeeklyBounds(new Date(`${dateKey}T12:00:00Z`), "UTC");
    return bounds.weekKey;
  }

  /**
   * Next active (non-rest) calendar date strictly after `fromDateKey`,
   * advancing day-by-day while respecting fixed + floating rest days.
   * Returns null if no active day exists within the lookahead window.
   */
  static findNextActiveDateKey(
    fromDateKey: string,
    restDays: number[],
    floatingSet: Set<string>,
    maxDays: number = 30
  ): string | null {
    const cursor = new Date(`${fromDateKey}T00:00:00Z`);
    for (let i = 1; i <= maxDays; i++) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const candidate = cursor.toISOString().split("T")[0];
      if (!this.isRestDay(candidate, restDays) && !floatingSet.has(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * WORKSTREAM B — Automatic Quest Shifting Cascade
   *
   * When a date becomes a floating rest day, every uncompleted quest
   * scheduled on it is atomically shifted to the next available active date.
   * Returns the list of shifted quests (questId, title, oldDate, newDate).
   */
  static async cascadeQuestShifts(
    userId: number,
    dateKey: string,
    opts?: { tx?: any }
  ): Promise<QuestShift[]> {
    const runner = async (client: any) => {
      const user = await client.user.findUnique({
          where: { id: userId },
          select: { restDays: true },
        });
      const restDays: number[] = user?.restDays || [];

      const quests = await client.quest.findMany({
        where: {
          userId,
          scheduledFor: dateKey,
          status: "PENDING",
          elapsedSeconds: 0,
          plannedMinutes: null,
          sessions: { none: {} },
        },
        select: { id: true, title: true, scheduledFor: true },
      });

      if (quests.length === 0) return [];
      await assertNoLinkedQuests(userId, { id: { in: quests.map((q: { id: number }) => q.id) } }, client);

      // Preload floating rest days across the lookahead window so the scan
      // is O(1) per candidate day.
      const end = new Date(`${dateKey}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 31);
      const floating: Array<{ dateKey: string }> = await client.floatingRestDay.findMany({
          where: {
            userId,
            NOT: { dateKey },
            dateKey: { gte: dateKey, lte: end.toISOString().split("T")[0] },
          },
          select: { dateKey: true },
        });
      const floatingSet = new Set(floating.map((f) => f.dateKey));

      const shifts: QuestShift[] = [];
      for (const q of quests) {
        const newDate = this.findNextActiveDateKey(q.scheduledFor, restDays, floatingSet);
        if (newDate && newDate !== q.scheduledFor) {
          await client.quest.update({
            where: { id: q.id },
            data: { scheduledFor: newDate },
          });
          shifts.push({
            questId: q.id,
            title: q.title,
            oldDate: q.scheduledFor,
            newDate,
          });
        }
      }
      return shifts;
    };

    if (opts?.tx) { await coordinateExecution(opts.tx, userId); return runner(opts.tx); }
    return executionTransaction(userId, runner);
  }

  /**
   * Resolve the toggle status + weekly quota state for a single date.
   */
  static async getFloatingRestDayStatus(
    userId: number,
    dateKey: string,
    client: Prisma.TransactionClient = prisma,
  ): Promise<FloatingRestDayStatus> {
    const weekKey = this.getIsoWeekKey(dateKey);

    let isFloatingRest = false;
    let isFixedRest = false;
    let weekUsage = 0;

    try {
      const [user, floating, weekRecords] = await Promise.all([
        client.user.findUnique({ where: { id: userId }, select: { restDays: true } }),
        client.floatingRestDay.findUnique({
          where: { userId_dateKey: { userId, dateKey } },
          select: { id: true },
        }),
        client.floatingRestDay.findMany({
          where: { userId, weekKey },
          select: { dateKey: true },
        }),
      ]);

      isFloatingRest = !!floating;
      isFixedRest = this.isRestDay(dateKey, user?.restDays || []);
      weekUsage = weekRecords.length;
    } catch (error) { throw error; }

    return {
      dateKey,
      isFloatingRest,
      isFixedRest,
      weekKey,
      weekUsage,
      weekQuota: FLOATING_REST_DAY_QUOTA,
      canAdd: !isFixedRest && !isFloatingRest && weekUsage < FLOATING_REST_DAY_QUOTA,
    };
  }

  /**
   * Get all days of a month in YYYY-MM-DD format.
   */
  static getMonthDateStrings(year: number, monthIndex: number): string[] {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const dates: string[] = [];
    const monthStr = String(monthIndex + 1).padStart(2, "0");
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, "0");
      dates.push(`${year}-${monthStr}-${dayStr}`);
    }
    return dates;
  }

  /**
   * Aggregate month calendar data for a user with rich subject breakdowns and quest lists.
   */
  static async getMonthCalendarData(
    userId: number,
    year: number,
    monthIndex: number
  ): Promise<MonthCalendarData> {
    let user: {
      id: number;
      timezone: string;
      dailyGoalMinutes: number;
      restDays: number[];
      enableHpPenalty: boolean;
    } | null = null;

    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          timezone: true,
          dailyGoalMinutes: true,
          restDays: true,
          enableHpPenalty: true,
        },
      });
    } catch (userErr) {
      console.warn("StudyScheduleService user query fallback:", userErr);
    }

    const timezone = user?.timezone || "UTC";
    const dailyGoalMinutes = Math.max(10, user?.dailyGoalMinutes ?? 120);
    const restDays = user?.restDays ?? [0];
    const enableHpPenalty = user?.enableHpPenalty ?? true;

    const dateStrings = this.getMonthDateStrings(year, monthIndex);
    const startDateStr = dateStrings[0];
    const endDateStr = dateStrings[dateStrings.length - 1];

    // Build wide UTC range covering the month across all timezones (-2 days to +2 days)
    const monthStartObj = new Date(`${startDateStr}T00:00:00Z`);
    monthStartObj.setUTCDate(monthStartObj.getUTCDate() - 2);
    const monthEndObj = new Date(`${endDateStr}T23:59:59Z`);
    monthEndObj.setUTCDate(monthEndObj.getUTCDate() + 2);

    // Fetch sessions, quests, objective milestones and floating rest days in parallel.
    // The goal/floating queries are best-effort: older environments/schedule lookups
    // must never break the calendar grid.
    const [sessions, quests, goals, floatingRest] = await Promise.all([
      prisma.studySession.findMany({
        where: {
          userId,
          startedAt: {
            gte: monthStartObj,
            lte: monthEndObj,
          },
        },
        include: {
          subject: {
            select: { id: true, name: true, color: true },
          },
          quest: {
            select: { id: true, title: true },
          },
        },
        orderBy: { startedAt: "asc" },
      }),
      prisma.quest.findMany({
        where: {
          userId,
          scheduledFor: {
            gte: startDateStr,
            lte: endDateStr,
          },
        },
        include: {
          goal: {
            select: { id: true, title: true, color: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.goal
        .findMany({
          where: {
            userId,
            status: "ACTIVE",
            targetDate: { not: null },
          },
          select: {
            id: true,
            title: true,
            color: true,
            targetDate: true,
            plannerPlans: { select: { id: true }, take: 1 },
          },
          orderBy: { targetDate: "asc" },
        })
        .catch((err) => {
          console.warn("StudyScheduleService goal milestone query fallback:", err);
          return [];
        }),
      prisma.floatingRestDay
        .findMany({
          where: {
            userId,
            dateKey: {
              gte: startDateStr,
              lte: endDateStr,
            },
          },
          select: { dateKey: true },
        })
        .catch((err) => {
          console.warn("StudyScheduleService floating rest day query fallback:", err);
          return [];
        }),
    ]);

    // Map objective deadlines (stored as UTC representational midnight) to
    // the user's local calendar days and keep only those in this month.
    const milestoneDateSet = new Set(dateStrings);
    const milestones: GoalMilestone[] = (goals || [])
      .map((g) => {
        if (!g.targetDate) return null;
        const localDate = g.plannerPlans?.length
          ? g.targetDate.toISOString().slice(0, 10)
          : TimezoneService.getUserLocalDate(timezone, g.targetDate);
        if (!milestoneDateSet.has(localDate)) return null;
        return {
          id: g.id,
          title: g.title,
          color: g.color,
          targetDate: g.targetDate.toISOString(),
          date: localDate,
        };
      })
      .filter((m): m is GoalMilestone => m !== null);

    // Map sessions to local calendar dates
    const dateSessionsMap: Record<string, typeof sessions> = {};
    for (const d of dateStrings) {
      dateSessionsMap[d] = [];
    }

    for (const s of sessions) {
      const localDate = TimezoneService.getUserLocalDate(timezone, s.startedAt);
      if (dateSessionsMap[localDate]) {
        dateSessionsMap[localDate].push(s);
      }
    }

    // Map quests to local calendar dates
    const dateQuestsMap: Record<string, typeof quests> = {};
    for (const d of dateStrings) {
      dateQuestsMap[d] = [];
    }

    for (const q of quests) {
      if (dateQuestsMap[q.scheduledFor]) {
        dateQuestsMap[q.scheduledFor].push(q);
      }
    }

    // Build enriched day objects
    let totalMonthMinutes = 0;
    let totalMonthSeconds = 0;
    let totalMonthSessions = 0;
    let activeDaysCount = 0;
    let goalsMetDaysCount = 0;
    let restDaysCount = 0;
    let totalMonthXp = 0;
    let totalMonthQuestsCompleted = 0;

    const days: DayStudySummary[] = dateStrings.map((dateStr) => {
      const dayOfWeek = this.getDayOfWeekIndex(dateStr);
      const isRest = restDays.includes(dayOfWeek);
      if (isRest) restDaysCount += 1;

      const daySessions = dateSessionsMap[dateStr] || [];
      const dayQuests = dateQuestsMap[dateStr] || [];

      let totalDaySeconds = 0;
      let totalDayMinutes = 0;

      // Group by subject
      const subjectMap: Record<
        string,
        {
          subjectId: number | null;
          subjectName: string;
          subjectColor: string;
          seconds: number;
          minutes: number;
        }
      > = {};

      for (const s of daySessions) {
        const sSeconds = s.durationSeconds > 0 ? s.durationSeconds : s.durationMinutes * 60;
        const sMinutes = s.durationMinutes > 0 ? s.durationMinutes : Math.floor(sSeconds / 60);

        totalDaySeconds += sSeconds;
        totalDayMinutes += sMinutes;

        const subKey = s.subjectId ? String(s.subjectId) : "general";
        const subName = s.subject ? s.subject.name : "General Focus";
        const subColor = s.subject?.color || "var(--accent-primary)";

        if (!subjectMap[subKey]) {
          subjectMap[subKey] = {
            subjectId: s.subjectId,
            subjectName: subName,
            subjectColor: subColor,
            seconds: 0,
            minutes: 0,
          };
        }
        subjectMap[subKey].seconds += sSeconds;
        subjectMap[subKey].minutes += sMinutes;
      }

      // Convert subject map to sorted breakdown with percentages
      const subjectBreakdown = Object.values(subjectMap)
        .map((sub) => ({
          ...sub,
          percentage: totalDaySeconds > 0 ? Math.round((sub.seconds / totalDaySeconds) * 100) : 0,
        }))
        .sort((a, b) => b.seconds - a.seconds);

      const questsCompletedCount = dayQuests.filter((q) => q.status === "COMPLETED").length;
      const dayXpEarned = dayQuests
        .filter((q) => q.status === "COMPLETED")
        .reduce((sum, q) => sum + q.xpReward, 0);

      // Estimated XP from timer focus sessions (1.5 XP per minute)
      const timerXp = Math.floor(totalDayMinutes * 1.5);
      const totalDayXp = dayXpEarned + timerXp;

      const completionPercentage = Math.min(
        1000,
        dailyGoalMinutes > 0 ? Math.round((totalDayMinutes / dailyGoalMinutes) * 100) : 0
      );
      const goalMet = totalDayMinutes >= dailyGoalMinutes;

      if (totalDayMinutes > 0 || daySessions.length > 0 || dayQuests.length > 0) {
        activeDaysCount += 1;
      }
      if (goalMet) {
        goalsMetDaysCount += 1;
      }

      totalMonthMinutes += totalDayMinutes;
      totalMonthSeconds += totalDaySeconds;
      totalMonthSessions += daySessions.length;
      totalMonthXp += totalDayXp;
      totalMonthQuestsCompleted += questsCompletedCount;

      return {
        date: dateStr,
        dayOfWeek,
        isRestDay: isRest,
        dailyGoalMinutes,
        totalMinutes: totalDayMinutes,
        totalSeconds: totalDaySeconds,
        completionPercentage,
        goalMet,
        sessionsCount: daySessions.length,
        questsCount: dayQuests.length,
        questsCompleted: questsCompletedCount,
        xpGained: totalDayXp,
        subjectBreakdown,
        quests: dayQuests.map((q) => ({
          id: q.id,
          title: q.title,
          description: q.description,
          status: q.status,
          difficulty: q.difficulty,
          requiredMinutes: q.requiredMinutes,
          elapsedSeconds: q.elapsedSeconds,
          xpReward: q.xpReward,
          sylphReward: q.sylphReward,
          goal: q.goal ? { id: q.goal.id, title: q.goal.title, color: q.goal.color } : null,
        })),
      };
    });

    return {
      year,
      month: monthIndex,
      monthName: MONTH_NAMES[monthIndex] || `Month ${monthIndex + 1}`,
      dailyGoalMinutes,
      restDays,
      enableHpPenalty,
      days,
      milestones,
      floatingRestDays: (floatingRest || []).map((r) => r.dateKey),
      monthStats: {
        totalMinutes: totalMonthMinutes,
        totalSeconds: totalMonthSeconds,
        totalSessions: totalMonthSessions,
        activeDays: activeDaysCount,
        totalDays: dateStrings.length,
        goalsMetDays: goalsMetDaysCount,
        restDaysCount,
        totalXpEarned: totalMonthXp,
        totalQuestsCompleted: totalMonthQuestsCompleted,
      },
    };
  }
}
