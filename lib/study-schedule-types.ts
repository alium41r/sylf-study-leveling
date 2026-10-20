/**
 * ============================================================================
 * Study Schedule & Calendar Pure Data Types
 * ============================================================================
 * Client-safe data contracts for the Study Calendar and Schedule subsystem.
 * Decoupled from server-only database modules (Prisma) so that client and mobile
 * screens can import types without triggering build-guard violations.
 * ============================================================================
 */

/** An objective deadline rendered as a milestone banner on the calendar. */
export interface GoalMilestone {
  id: number;
  title: string;
  color: string; // Goal.color token: EMERALD | CYAN | BLUE | VIOLET | ROSE | AMBER
  targetDate: string; // ISO UTC instant
  date: string; // YYYY-MM-DD local calendar date the milestone lands on
}

/** A quest relocated by the automatic floating-rest-day cascade. */
export interface QuestShift {
  questId: number;
  title: string;
  oldDate: string;
  newDate: string;
}

/** Live toggle status for a single calendar date. */
export interface FloatingRestDayStatus {
  dateKey: string;
  isFloatingRest: boolean;
  isFixedRest: boolean;
  weekKey: string; // "YYYY-Www"
  weekUsage: number;
  weekQuota: number;
  canAdd: boolean;
}

/** Hard quota of floating rest days per ISO week. */
export const FLOATING_REST_DAY_QUOTA = 1;

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
  /** Read-only session history; study service remains the sole owner. */
  sessions?: Array<{ id: number; title: string; startedAt: string; endedAt: string | null; minutes: number }>;
  quests: Array<{
    id: number;
    title: string;
    description: string | null;
    status: string;
    difficulty: string;
    requiredMinutes: number;
    plannedMinutes?: number | null;
    plannerOwned?: boolean;
    elapsedSeconds: number;
    xpReward: number;
    sylphReward: number;
    goal: { id: number; title: string; color: string } | null;
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
  /** Objective deadlines landing inside the displayed month. */
  milestones: GoalMilestone[];
  /** Floating rest day dateKeys (YYYY-MM-DD) inside the displayed month. */
  floatingRestDays: string[];
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
