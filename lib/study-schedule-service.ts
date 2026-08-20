import { prisma } from "@/lib/prisma";
import { TimezoneService } from "@/lib/timezone-service";

export interface DayStudySummary {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  isRestDay: boolean;
  dailyGoalMinutes: number;
  totalMinutes: number;
  totalSeconds: number;
  completionPercentage: number;
  goalMet: boolean;
  sessionsCount: number;
  questsCount: number;
  questsCompleted: number;
  xpGained: number;
  subjectBreakdown: Array<{
    subjectId: number | null;
    subjectName: string;
    subjectColor: string;
    minutes: number;
    seconds: number;
    percentage: number;
  }>;
  quests: Array<{
    id: number;
    title: string;
    description: string | null;
    status: string;
    difficulty: string;
    requiredMinutes: number;
    elapsedSeconds: number;
    xpReward: number;
    sylphReward: number;
  }>;
}

export interface MonthCalendarData {
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  monthName: string;
  dailyGoalMinutes: number;
  restDays: number[];
  enableHpPenalty: boolean;
  days: DayStudySummary[];
  monthStats: {
    totalMinutes: number;
    totalSeconds: number;
    totalSessions: number;
    activeDays: number;
    totalDays: number;
    goalsMetDays: number;
    restDaysCount: number;
    totalXpEarned: number;
    totalQuestsCompleted: number;
  };
}

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

    // Fetch sessions and quests in parallel
    const [sessions, quests] = await Promise.all([
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
        orderBy: { createdAt: "asc" },
      }),
    ]);

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
