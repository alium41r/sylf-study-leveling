// ============================================================
// Context Engine — Tiered, Intent-Aware Context Retrieval
// ============================================================
// Provides two tiers of context:
//
// 1. CORE CONTEXT — Cheap, always included (~200 tokens):
//    Identity, level, rank, HP, streak, today's quest summary,
//    active goals count, basic preferences.
//
// 2. RELEVANT CONTEXT — Dynamically selected by agent/intent:
//    Calendar, subject analytics, trends, memories, health,
//    social, achievements. Only fetched when needed.
//
// Design principles:
// - Backend computes all math (rates, averages, totals, trends)
// - AI receives pre-aggregated summaries, never raw records
// - Expensive queries are only run when the agent needs them
// - Deterministic calculations stay in TypeScript
// - Context is cache-friendly (core context changes rarely)
// ============================================================

import { prisma } from "@/lib/prisma";
import { getSituationalFlags, calculateDailyCapacity, getHighestEffortLevel } from "./planning-engine";
import type { AgentType } from "./agent-router";
import { getWeeklyBounds } from "@/lib/game-engine";
import { TimezoneService } from "../timezone-service";
import { getUserTimezone } from "../timezone-server";

// ─── Types ───────────────────────────────────────────────────

export interface CoreContext {
  user: {
    id: number;
    name: string;
    username: string;
    rank: string;
    level: number;
    currentXP: number;
    xpToNextLevel: number;
    hp: number;
    maxHp: number;
    sylph: number;
    streakWeeks: number;
    totalStudyHours: number;
    hasCompletedOnboarding: boolean;
    title: string;
  };
  localTimeContext: {
    timezone: string;
    localDate: string;
    localTime: string;
  };
  today: {
    date: string;
    dayOfWeek: string;
    totalQuests: number;
    completedQuests: number;
    pendingQuests: number;
    totalMinutesScheduled: number;
    overdueCount: number;
  };
  weeklyQuest: {
    targetMinutes: number;
    progressMinutes: number;
    percentComplete: number;
    isCompleted: boolean;
    daysRemaining: number;
    weekKey: string;
  };
  activeGoals: {
    count: number;
    summaries: Array<{ title: string; progressPercent: number }>;
  };
}

export interface CalendarSection {
  isOverloaded: boolean;
  next7Days: Array<{
    date: string;
    dayOfWeek: string;
    questCount: number;
    totalMinutes: number;
    pendingCount: number;
    remainingCapacity: number;
  }>;
  overdueQuests: Array<{
    id: number;
    title: string;
    scheduledFor: string;
    requiredMinutes: number;
  }>;
}

export interface SubjectSection {
  subjects: Array<{
    name: string;
    completionRate: number;
    avgSessionMinutes: number;
    avgFocusRate: number;
    totalSessions: number;
    strength: "strong" | "moderate" | "weak";
    trend: "improving" | "stable" | "declining";
  }>;
  strongestSubject: string | null;
  weakestSubject: string | null;
}

export interface TrendsSection {
  isStruggling: boolean;
  weeklyStudyMinutes: number[];       // last 4 weeks
  weeklyCompletionRates: number[];    // last 4 weeks (%)
  avgDailyMinutes: number;
  studyTimeDirection: "increasing" | "stable" | "decreasing";
  completionDirection: "improving" | "stable" | "declining";
  bestDayOfWeek: string | null;
  currentStreakDays: number;
  longestRecentStreak: number;
}

export interface MemorySection {
  memories: Array<{
    key: string;
    value: string;
    source: string;
  }>;
}

export interface HealthSection {
  isBurnoutRisk: boolean;
  hp: number;
  maxHp: number;
  recentDamage: number;       // total negative HP in last 7 days
  recentHealing: number;      // total positive HP in last 7 days
  damageEvents: number;       // count of damage events
}

export interface GoalsSection {
  goals: Array<{
    id: number;
    title: string;
    status: string;
    effortLevel: string;
    progressPercent: number;
    totalQuests: number;
    completedQuests: number;
  }>;
}

export interface SocialSection {
  friendCount: number;
}

export interface AchievementsSection {
  achievementCount: number;
  recentAchievements: Array<{ name: string; unlockedAt: Date }>;
  activeCosmeticSummary: string;
}

export interface RelevantContext {
  calendar?: CalendarSection;
  subjects?: SubjectSection;
  trends?: TrendsSection;
  memories?: MemorySection;
  health?: HealthSection;
  goals?: GoalsSection;
  social?: SocialSection;
  achievements?: AchievementsSection;
}

export type ContextSection = keyof RelevantContext;

// ─── Agent → Required Sections Mapping ───────────────────────

/**
 * Defines which dynamic context sections each agent needs.
 * This keeps irrelevant data out of the prompt.
 */
const AGENT_CONTEXT_MAP: Record<AgentType, ContextSection[]> = {
  general:  ["memories"],
  planner:  ["calendar", "subjects", "goals", "memories"],
  calendar: ["calendar"],
  coach:    ["trends", "subjects", "health", "memories"],
  analyst:  ["subjects", "trends", "goals"],
};

// ─── Helpers ─────────────────────────────────────────────────

function calcDirection(values: number[]): "increasing" | "stable" | "decreasing" {
  if (values.length < 2) return "stable";
  const [prev, curr] = values.slice(-2);
  const threshold = Math.max(prev * 0.1, 5);
  if (curr - prev > threshold) return "increasing";
  if (prev - curr > threshold) return "decreasing";
  return "stable";
}

function completionDir(values: number[]): "improving" | "stable" | "declining" {
  const d = calcDirection(values);
  return d === "increasing" ? "improving" : d === "decreasing" ? "declining" : "stable";
}

// ─── Core Context Builder ────────────────────────────────────

/**
 * Build the cheap, always-included core context.
 * This runs 3 parallel queries and produces ~200 tokens.
 */
export async function buildCoreContext(userId: number): Promise<CoreContext> {
  const timezone = await getUserTimezone(userId);
  const today = TimezoneService.getUserLocalDate(timezone);
  const todayDow = TimezoneService.getUserDayOfWeek(timezone, today);
  const localTime = TimezoneService.getUserLocalTime(timezone);

  const [user, todayQuestAgg, activeGoals] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, username: true, hunterRank: true,
        level: true, currentXP: true, xpToNextLevel: true,
        hp: true, maxHp: true, sylph: true, streakDays: true,
        totalStudyMinutes: true, hasCompletedOnboarding: true, activeTitle: true,
      },
    }),

    // Aggregate today's quests in DB rather than fetching all records
    prisma.quest.groupBy({
      by: ["status"],
      where: { userId, scheduledFor: today },
      _count: true,
      _sum: { requiredMinutes: true },
    }),

    prisma.goal.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        title: true,
        quests: { select: { status: true } },
      },
      take: 5, // cap at 5 active goals for prompt brevity
    }),
  ]);

  if (!user) throw new Error(`User ${userId} not found`);

  // Compute today's quest summary from the grouped aggregate
  let totalQuests = 0, completedQuests = 0, pendingQuests = 0, totalMinutes = 0;
  for (const group of todayQuestAgg) {
    const count = group._count;
    const mins = group._sum.requiredMinutes || 0;
    totalQuests += count;
    totalMinutes += mins;
    if (group.status === "COMPLETED") completedQuests += count;
    if (group.status === "PENDING" || group.status === "IN_PROGRESS") pendingQuests += count;
  }

  // Count overdue quests (fast count, no record fetch)
  const overdueCount = await prisma.quest.count({
    where: {
      userId,
      scheduledFor: { lt: today },
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
  });

  // Compute goal progress
  const goalSummaries = activeGoals.map(g => {
    const total = g.quests.length;
    const completed = g.quests.filter(q => q.status === "COMPLETED").length;
    return {
      title: g.title,
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  // Compute weekly quest progress
  const bounds = getWeeklyBounds(new Date(), timezone);
  const weeklySessionAgg = await prisma.studySession.aggregate({
    _sum: { durationMinutes: true },
    where: {
      userId,
      startedAt: { gte: bounds.weekStart, lte: bounds.weekEnd },
    },
  });
  const weeklyProgressMinutes = weeklySessionAgg._sum.durationMinutes || 0;
  const WEEKLY_TARGET = 180;

  return {
    user: {
      id: user.id,
      name: user.name || "Scholar",
      username: user.username,
      rank: user.hunterRank,
      level: user.level,
      currentXP: user.currentXP,
      xpToNextLevel: user.xpToNextLevel,
      hp: user.hp,
      maxHp: user.maxHp,
      sylph: user.sylph,
      streakWeeks: user.streakDays, // DB field is misnamed; this is consecutive weeks
      totalStudyHours: Math.round((user.totalStudyMinutes / 60) * 10) / 10,
      hasCompletedOnboarding: user.hasCompletedOnboarding,
      title: user.activeTitle || "Novice Hunter",
    },
    localTimeContext: {
      timezone,
      localDate: today,
      localTime,
    },
    today: {
      date: today,
      dayOfWeek: todayDow,
      totalQuests,
      completedQuests,
      pendingQuests,
      totalMinutesScheduled: totalMinutes,
      overdueCount,
    },
    weeklyQuest: {
      targetMinutes: WEEKLY_TARGET,
      progressMinutes: weeklyProgressMinutes,
      percentComplete: Math.min(100, Math.round((weeklyProgressMinutes / WEEKLY_TARGET) * 100)),
      isCompleted: weeklyProgressMinutes >= WEEKLY_TARGET,
      daysRemaining: bounds.daysRemaining,
      weekKey: bounds.weekKey,
    },
    activeGoals: {
      count: goalSummaries.length,
      summaries: goalSummaries,
    },
  };
}

// ─── Dynamic Section Builders ────────────────────────────────

async function buildCalendarSection(userId: number): Promise<CalendarSection> {
  const timezone = await getUserTimezone(userId);
  const today = TimezoneService.getUserLocalDate(timezone);

  // Fetch upcoming quests aggregated by day
  const next7Dates = Array.from({ length: 7 }, (_, i) => TimezoneService.getDateOffset(timezone, i + 1));
  const upcomingAgg = await prisma.quest.groupBy({
    by: ["scheduledFor", "status"],
    where: {
      userId,
      scheduledFor: { in: next7Dates },
    },
    _count: true,
    _sum: { requiredMinutes: true },
  });

  // Aggregate by date
  const dayMap: Record<string, { questCount: number; totalMinutes: number; pendingCount: number }> = {};
  for (const date of next7Dates) {
    dayMap[date] = { questCount: 0, totalMinutes: 0, pendingCount: 0 };
  }
  for (const row of upcomingAgg) {
    const date = row.scheduledFor;
    if (dayMap[date]) {
      dayMap[date].questCount += row._count;
      dayMap[date].totalMinutes += row._sum.requiredMinutes || 0;
      if (row.status === "PENDING" || row.status === "IN_PROGRESS") {
        dayMap[date].pendingCount += row._count;
      }
    }
  }

  const effortLevel = await getHighestEffortLevel(userId);
  const capacityMatrix = await calculateDailyCapacity(
    userId,
    effortLevel,
    next7Dates[0],
    next7Dates[next7Dates.length - 1]
  );

  const next7Days = next7Dates.map(date => ({
    date,
    dayOfWeek: TimezoneService.getUserDayOfWeek(timezone, date),
    remainingCapacity: capacityMatrix[date] || 0,
    ...dayMap[date],
  }));

  // Fetch overdue quests (limit to 5 most recent)
  const overdueQuests = await prisma.quest.findMany({
    where: {
      userId,
      scheduledFor: { lt: today },
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    select: { id: true, title: true, scheduledFor: true, requiredMinutes: true },
    orderBy: { scheduledFor: "desc" },
    take: 5,
  });

  const flags = await getSituationalFlags(userId);

  return { isOverloaded: flags.isOverloaded, next7Days, overdueQuests };
}

async function buildSubjectSection(userId: number): Promise<SubjectSection> {
  const subjects = await prisma.subject.findMany({
    where: { userId, archivedAt: null },
    select: {
      name: true,
      sessions: {
        select: { durationMinutes: true, focusRate: true, startedAt: true },
        orderBy: { startedAt: "desc" },
        take: 50, // cap at 50 most recent sessions per subject
      },
    },
  });

  // Also get quests for completion rate by subject name matching
  const recentQuests = await prisma.quest.findMany({
    where: {
      userId,
      createdAt: { gte: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000) },
    },
    select: { title: true, status: true, goal: { select: { title: true } } },
  });

  const subjectAnalytics = subjects.map(subject => {
    const sessions = subject.sessions;
    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((s, sess) => s + sess.durationMinutes, 0);
    const avgSessionMinutes = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;
    const avgFocusRate = totalSessions > 0
      ? Math.round(sessions.reduce((s, sess) => s + sess.focusRate, 0) / totalSessions)
      : 0;

    // Completion rate via title matching
    const subjectQuests = recentQuests.filter(q =>
      q.title.toLowerCase().includes(subject.name.toLowerCase()) ||
      q.goal?.title?.toLowerCase().includes(subject.name.toLowerCase())
    );
    const completedCount = subjectQuests.filter(q => q.status === "COMPLETED").length;
    const completionRate = subjectQuests.length > 0
      ? Math.round((completedCount / subjectQuests.length) * 100)
      : 0;

    // Strength classification
    let strength: "strong" | "moderate" | "weak" = "moderate";
    if (completionRate >= 80 && avgFocusRate >= 70) strength = "strong";
    else if (completionRate < 50 || avgFocusRate < 50) strength = "weak";

    // Trend: compare first half of sessions to second half
    let trend: "improving" | "stable" | "declining" = "stable";
    if (totalSessions >= 4) {
      const mid = Math.floor(totalSessions / 2);
      // sessions are desc-ordered, so first half = recent
      const recentAvg = sessions.slice(0, mid).reduce((s, sess) => s + sess.focusRate, 0) / mid;
      const olderAvg = sessions.slice(mid).reduce((s, sess) => s + sess.focusRate, 0) / (totalSessions - mid);
      if (recentAvg - olderAvg > 5) trend = "improving";
      else if (olderAvg - recentAvg > 5) trend = "declining";
    }

    return { name: subject.name, completionRate, avgSessionMinutes, avgFocusRate, totalSessions, strength, trend };
  });

  const sorted = [...subjectAnalytics].sort((a, b) => b.completionRate - a.completionRate);

  return {
    subjects: subjectAnalytics,
    strongestSubject: sorted.length > 0 ? sorted[0].name : null,
    weakestSubject: sorted.length > 0 ? sorted[sorted.length - 1].name : null,
  };
}

async function buildTrendsSection(userId: number): Promise<TrendsSection> {
  const timezone = await getUserTimezone(userId);

  // Fetch study sessions from last 28 days
  const sessions = await prisma.studySession.findMany({
    where: {
      userId,
      startedAt: { gte: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000) },
    },
    select: { durationMinutes: true, startedAt: true },
  });

  // Fetch quests from last 28 days for completion rates
  const quests = await prisma.quest.findMany({
    where: {
      userId,
      createdAt: { gte: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000) },
    },
    select: { status: true, scheduledFor: true, completedAt: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { streakDays: true },
  });

  // Compute weekly aggregates
  const weeklyStudyMinutes: number[] = [];
  const weeklyCompletionRates: number[] = [];

  for (let week = 3; week >= 0; week--) {
    const weekStart = new Date(Date.now() - (week + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(Date.now() - week * 7 * 24 * 60 * 60 * 1000);

    const weekSessions = sessions.filter(s => s.startedAt >= weekStart && s.startedAt < weekEnd);
    weeklyStudyMinutes.push(weekSessions.reduce((sum, s) => sum + s.durationMinutes, 0));

    const weekQuests = quests.filter(q => {
      const scheduled = new Date(q.scheduledFor + "T00:00:00");
      return scheduled >= weekStart && scheduled < weekEnd;
    });
    const weekCompleted = weekQuests.filter(q => q.status === "COMPLETED").length;
    weeklyCompletionRates.push(
      weekQuests.length > 0 ? Math.round((weekCompleted / weekQuests.length) * 100) : 0
    );
  }

  // Best/worst day of week
  const dayBuckets: Record<string, number[]> = {};
  for (const s of sessions) {
    const dow = TimezoneService.getUserDayOfWeek(timezone, TimezoneService.getDateString(s.startedAt, timezone));
    if (!dayBuckets[dow]) dayBuckets[dow] = [];
    dayBuckets[dow].push(s.durationMinutes);
  }

  let bestDay: string | null = null, worstDay: string | null = null;
  let bestAvg = 0, worstAvg = Infinity;
  for (const [day, mins] of Object.entries(dayBuckets)) {
    const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
    if (avg > bestAvg) { bestAvg = avg; bestDay = day; }
    if (avg < worstAvg) { worstAvg = avg; worstDay = day; }
  }

  const totalMinutes = sessions.reduce((s, sess) => s + sess.durationMinutes, 0);

  const flags = await getSituationalFlags(userId);

  return {
    isStruggling: flags.isStruggling,
    weeklyStudyMinutes,
    weeklyCompletionRates,
    avgDailyMinutes: Math.round(totalMinutes / 28),
    studyTimeDirection: calcDirection(weeklyStudyMinutes),
    completionDirection: completionDir(weeklyCompletionRates),
    bestDayOfWeek: bestDay,
    currentStreakDays: user?.streakDays || 0,
    longestRecentStreak: user?.streakDays || 0, // simplified for now
  };
}

async function buildMemorySection(userId: number, userMessageText?: string): Promise<MemorySection> {
  const rawMemories = await prisma.aiMemory.findMany({
    where: { userId },
    select: { key: true, value: true, source: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 50, // pull a pool of recent memories to rank
  });

  if (!userMessageText || rawMemories.length === 0) {
    rawMemories.sort((a, b) => {
      if (a.source === "user_stated" && b.source !== "user_stated") return -1;
      if (a.source !== "user_stated" && b.source === "user_stated") return 1;
      return 0; // recency already preserved by Prisma orderBy
    });
    return { memories: rawMemories.slice(0, 10).map(m => ({ key: m.key, value: m.value, source: m.source })) };
  }

  const keywords = userMessageText.toLowerCase().match(/\b\w{4,}\b/g) || [];
  
  const scoredMemories = rawMemories.map(m => {
    let score = 0;
    const memoryText = (m.key + " " + m.value).toLowerCase();
    
    for (const kw of keywords) {
      if (memoryText.includes(kw)) score += 2;
    }
    
    if (m.source === "user_stated") score += 5;
    
    return { ...m, score };
  });

  scoredMemories.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return { memories: scoredMemories.slice(0, 10).map(m => ({ key: m.key, value: m.value, source: m.source })) };
}

async function buildHealthSection(userId: number): Promise<HealthSection> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hp: true, maxHp: true },
  });

  const recentHp = await prisma.hpLedger.findMany({
    where: {
      userId,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: { amount: true },
  });

  const recentDamage = recentHp.filter(h => h.amount < 0).reduce((s, h) => s + h.amount, 0);
  const recentHealing = recentHp.filter(h => h.amount > 0).reduce((s, h) => s + h.amount, 0);

  const flags = await getSituationalFlags(userId);

  return {
    isBurnoutRisk: flags.isBurnoutRisk,
    hp: user?.hp || 100,
    maxHp: user?.maxHp || 100,
    recentDamage: Math.abs(recentDamage),
    recentHealing,
    damageEvents: recentHp.filter(h => h.amount < 0).length,
  };
}

async function buildGoalsSection(userId: number): Promise<GoalsSection> {
  const goals = await prisma.goal.findMany({
    where: { userId },
    select: {
      id: true, title: true, status: true, effortLevel: true,
      quests: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return {
    goals: goals.map(g => {
      const total = g.quests.length;
      const completed = g.quests.filter(q => q.status === "COMPLETED").length;
      return {
        id: g.id,
        title: g.title,
        status: g.status,
        effortLevel: g.effortLevel,
        progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
        totalQuests: total,
        completedQuests: completed,
      };
    }),
  };
}

async function buildSocialSection(userId: number): Promise<SocialSection> {
  const friendCount = await prisma.friendship.count({ where: { userId } });
  return { friendCount };
}

async function buildAchievementsSection(userId: number): Promise<AchievementsSection> {
  const [achievementCount, recentAchievements, user] = await Promise.all([
    prisma.userAchievement.count({ where: { userId } }),
    prisma.userAchievement.findMany({
      where: { userId },
      orderBy: { claimedAt: "desc" },
      take: 3,
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { activeTitle: true, activeAvatar: true, activeFrame: true },
    }),
  ]);

  return {
    achievementCount,
    recentAchievements: recentAchievements.map(a => ({
      name: a.achievementId, // No separate achievement model, using ID as name for now
      unlockedAt: a.claimedAt,
    })),
    activeCosmeticSummary: `Title: "${user?.activeTitle || "Novice"}", Class: ${user?.activeAvatar || "class_scholar"}, Frame: ${user?.activeFrame || "none"}`,
  };
}

// ─── Section Builder Registry ────────────────────────────────

const SECTION_BUILDERS: Record<ContextSection, (userId: number, userMessageText?: string) => Promise<any>> = {
  calendar: buildCalendarSection,
  subjects: buildSubjectSection,
  trends: buildTrendsSection,
  memories: buildMemorySection,
  health: buildHealthSection,
  goals: buildGoalsSection,
  social: buildSocialSection,
  achievements: buildAchievementsSection,
};

// ─── Main API ────────────────────────────────────────────────

/**
 * Build only the dynamic context sections relevant to the given agent.
 * Runs section builders in parallel for performance.
 */
export async function buildRelevantContext(
  userId: number,
  agent: AgentType,
  additionalSections: ContextSection[] = [],
  userMessageText?: string
): Promise<RelevantContext> {
  const neededSections = new Set([
    ...AGENT_CONTEXT_MAP[agent],
    ...additionalSections,
  ]);

  const result: RelevantContext = {};
  const promises: Promise<void>[] = [];

  for (const section of neededSections) {
    const builder = SECTION_BUILDERS[section];
    if (builder) {
      promises.push(
        builder(userId, userMessageText).then(data => {
          (result as any)[section] = data;
        })
      );
    }
  }

  await Promise.all(promises);
  return result;
}

// ─── Context Formatters ──────────────────────────────────────

/**
 * Format core context into a token-efficient prompt string (~200 tokens).
 */
export function formatCoreContext(core: CoreContext): string {
  let out = "=== CONTEXT (auto-injected — do NOT ask for or fabricate this data) ===\n";
  out += `User: ${core.user.name} (@${core.user.username}) | ${core.user.rank}-Rank | Lv.${core.user.level} | XP: ${core.user.currentXP}/${core.user.xpToNextLevel} | HP: ${core.user.hp}/${core.user.maxHp} | Sylph: ${core.user.sylph} | Streak: ${core.user.streakWeeks} weeks | Study: ${core.user.totalStudyHours}h | Title: "${core.user.title}"`;

  if (!core.user.hasCompletedOnboarding) {
    out += "\n⚠ New user — has NOT completed onboarding.";
  }

  out += `\n[System] LOCAL_TIME\nTimezone: ${core.localTimeContext.timezone}\nLocal date: ${core.localTimeContext.localDate}\nLocal time: ${core.localTimeContext.localTime}\n`;
  out += `\n[System] TODAY\nDate: ${core.today.date} (${core.today.dayOfWeek})\nQuests: ${core.today.completedQuests}/${core.today.totalQuests} completed, ${core.today.pendingQuests} pending (${core.today.totalMinutesScheduled} mins)\nOverdue: ${core.today.overdueCount}\n`;

  // Weekly focus quest
  const wq = core.weeklyQuest;
  const wqStatus = wq.isCompleted ? "✅ COMPLETED" : `${wq.progressMinutes}/${wq.targetMinutes} min (${wq.percentComplete}%)`;
  out += `\n[System] WEEKLY QUEST\nFocus Target: ${wqStatus} | ${wq.daysRemaining} days remaining (${wq.weekKey})\n`;

  // Active goals
  if (core.activeGoals.count > 0) {
    const goalStr = core.activeGoals.summaries
      .map(g => `"${g.title}" ${g.progressPercent}%`)
      .join(", ");
    out += `\nGoals: ${goalStr}`;
  }

  out += "\n=== END CORE ===";
  return out;
}

/**
 * Format relevant context sections into prompt strings.
 * Only formats sections that were actually fetched.
 */
export function formatRelevantContext(relevant: RelevantContext): string {
  const sections: string[] = [];

  if (relevant.calendar) {
    const cal = relevant.calendar;
    if (cal.next7Days.length > 0) {
      const lines = cal.next7Days.map(
        d => `- ${d.date} (${d.dayOfWeek}): ${d.questCount} quests (${d.pendingCount} pending) | ${d.totalMinutes}min scheduled | Capacity remaining: ${d.remainingCapacity}min`
      );
      let calSection = "CALENDAR (next 7 days):\n" + lines.join("\n");
      if (cal.overdueQuests.length > 0) {
        calSection += `\nOVERDUE (${cal.overdueQuests.length}):`;
        for (const q of cal.overdueQuests) {
          calSection += `\n- "${q.title}" (from ${q.scheduledFor}, ${q.requiredMinutes}min)`;
        }
      }
      sections.push(calSection);
    }
  }

  if (relevant.subjects) {
    const sub = relevant.subjects;
    if (sub.subjects.length > 0) {
      const subLines = sub.subjects.map(s => {
        const icon = s.strength === "strong" ? "💪" : s.strength === "weak" ? "⚠️" : "📊";
        return `- ${icon} ${s.name}: ${s.completionRate}% complete, ${s.avgSessionMinutes}min avg, ${s.avgFocusRate}% focus, ${s.trend} (${s.strength})`;
      });
      sections.push(`SUBJECTS:\n${subLines.join("\n")}${sub.strongestSubject ? `\nStrongest: ${sub.strongestSubject} | Weakest: ${sub.weakestSubject}` : ""}`);
    }
  }

  if (relevant.trends) {
    const tr = relevant.trends;
    sections.push(`TRENDS:\n- Study time: ${tr.studyTimeDirection} (avg ${tr.avgDailyMinutes}min/day, last 4 weeks: ${tr.weeklyStudyMinutes.join(", ")}min)\n- Completion: ${tr.completionDirection} (${tr.weeklyCompletionRates.join("%, ")}%)\n- Streak: ${tr.currentStreakDays}d${tr.bestDayOfWeek ? ` | Best day: ${tr.bestDayOfWeek}` : ""}`);
  }

  if (relevant.memories && relevant.memories.memories.length > 0) {
    const memLines = relevant.memories.memories.map(m => `- ${m.key}: ${m.value} (${m.source})`);
    sections.push(`REMEMBERED:\n${memLines.join("\n")}`);
  }

  if (relevant.health) {
    const h = relevant.health;
    sections.push(`HEALTH: HP ${h.hp}/${h.maxHp} | Last 7d: -${h.recentDamage} damage (${h.damageEvents} events), +${h.recentHealing} healed`);
  }

  if (relevant.goals) {
    const goalLines = relevant.goals.goals.map(g =>
      `- "${g.title}" (${g.status}, ${g.effortLevel}) — ${g.progressPercent}% (${g.completedQuests}/${g.totalQuests})`
    );
    sections.push(`GOALS:\n${goalLines.join("\n")}`);
  }

  if (relevant.social) {
    sections.push(`SOCIAL: ${relevant.social.friendCount} friends`);
  }

  if (relevant.achievements) {
    const a = relevant.achievements;
    let achSection = `ACHIEVEMENTS: ${a.achievementCount} unlocked | ${a.activeCosmeticSummary}`;
    if (a.recentAchievements.length > 0) {
      achSection += `\nRecent: ${a.recentAchievements.map(r => r.name).join(", ")}`;
    }
    sections.push(achSection);
  }

  return sections.join("\n\n");
}

/**
 * Convenience: build and format full prompt context for a given agent.
 * Returns both core and relevant context already formatted.
 */
export async function buildFormattedContext(
  userId: number,
  agent: AgentType,
  additionalSections: ContextSection[] = []
): Promise<{ coreString: string; relevantString: string; core: CoreContext; relevant: RelevantContext }> {
  const [core, relevant] = await Promise.all([
    buildCoreContext(userId),
    buildRelevantContext(userId, agent, additionalSections),
  ]);

  return {
    core,
    relevant,
    coreString: formatCoreContext(core),
    relevantString: formatRelevantContext(relevant),
  };
}
