// ============================================================
// Intent Executors — the deterministic functions
// ============================================================
// One executor per registry intent. Pure data access + formatting;
// never fabricates, never writes. Scoped queries respect the user's
// timezone via TimezoneService.
// ============================================================

import { prisma } from "@/lib/prisma";
import { TimezoneService } from "../../timezone-service";
import { getUserTimezone } from "../../timezone-server";
import { getWeeklyBounds } from "@/lib/game-engine";
import { IntentParams, TimeScope } from "./registry";

const WEEKLY_TARGET_MIN = 180;

export type Executor = (
  userId: number,
  params: IntentParams
) => Promise<string | null>;

// ─── Scope helpers ────────────────────────────────────────────

interface ScopeWindow {
  /** Local date (YYYY-MM-DD) for single-day scopes. */
  date?: string;
  /** Inclusive start/end local dates for range scopes. */
  startDate?: string;
  endDate?: string;
  /** UTC start timestamp for aggregates (single-day scopes). */
  utcStart?: Date;
  utcEnd?: Date;
}

function scopeWindow(timezone: string, scope: TimeScope | null): ScopeWindow {
  switch (scope) {
    case "yesterday":
      return { date: TimezoneService.getUserLocalDateOffset(timezone, -1) };
    case "tomorrow":
      return { date: TimezoneService.getUserLocalDateOffset(timezone, 1) };
    case "this_week": {
      const b = getWeeklyBounds(new Date(), timezone);
      const start = TimezoneService.getDateString(b.weekStart, timezone);
      const end = TimezoneService.getDateString(b.weekEnd, timezone);
      return { startDate: start, endDate: end };
    }
    case "this_month": {
      const today = TimezoneService.getUserLocalDate(timezone);
      const [y, m] = today.split("-");
      const start = `${y}-${m}-01`;
      const days = new Date(Number(y), Number(m), 0).getDate();
      return { startDate: start, endDate: `${y}-${m}-${String(days).padStart(2, "0")}` };
    }
    case "today":
    default: {
      const date = TimezoneService.getUserLocalDate(timezone);
      const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
      return {
        date,
        utcStart: new Date(Date.UTC(y, m - 1, d)),
        utcEnd: new Date(Date.UTC(y, m - 1, d + 1)),
      };
    }
  }
}

function scopeLabel(scope: TimeScope | null): string {
  switch (scope) {
    case "yesterday": return "yesterday";
    case "tomorrow": return "tomorrow";
    case "this_week": return "this week so far";
    case "this_month": return "this month so far";
    case "total": return "total";
    default: return "today";
  }
}

// ─── Executors ────────────────────────────────────────────────

async function userRow(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      hunterRank: true,
      level: true,
      currentXP: true,
      xpToNextLevel: true,
      hp: true,
      maxHp: true,
      sylph: true,
      streakDays: true,
      activeTitle: true,
      name: true,
      username: true,
      timezone: true,
      createdAt: true,
    },
  });
}

const userXp: Executor = async (userId, params) => {
  const user = await userRow(userId);
  if (!user) return null;

  if (params.timeScope && params.timeScope !== "total") {
    const tz = user.timezone || "UTC";
    const win = scopeWindow(tz, params.timeScope);
    const where: any = { userId, amount: { gt: 0 } };
    if (win.utcStart) where.createdAt = { gte: win.utcStart, lt: win.utcEnd };
    else if (win.startDate && win.endDate) {
      // Range scopes: approximate by UTC of the local-date bounds.
      const [sy, sm, sd] = win.startDate.split("-").map((n) => parseInt(n, 10));
      const [ey, em, ed] = win.endDate.split("-").map((n) => parseInt(n, 10));
      where.createdAt = {
        gte: new Date(Date.UTC(sy, sm - 1, sd)),
        lt: new Date(Date.UTC(ey, em - 1, ed + 1)),
      };
    } else if (win.date) {
      const [y, m, d] = win.date.split("-").map((n) => parseInt(n, 10));
      where.createdAt = {
        gte: new Date(Date.UTC(y, m - 1, d)),
        lt: new Date(Date.UTC(y, m - 1, d + 1)),
      };
    }
    const agg = await prisma.xpLedger.aggregate({ _sum: { amount: true }, where });
    const earned = agg._sum.amount || 0;
    return earned > 0
      ? `You've earned **${earned} XP** ${scopeLabel(params.timeScope)}.`
      : `No XP earned ${scopeLabel(params.timeScope)}.`;
  }

  return `**${user.currentXP}/${user.xpToNextLevel} XP** — ${Math.max(
    0,
    user.xpToNextLevel - user.currentXP
  )} XP to Lv. ${user.level + 1}.`;
};

const userLevel: Executor = async (userId) => {
  const user = await userRow(userId);
  if (!user) return null;
  return `Lv. **${user.level}** — ${user.currentXP}/${user.xpToNextLevel} XP (${Math.max(
    0,
    user.xpToNextLevel - user.currentXP
  )} XP to Lv. ${user.level + 1}).`;
};

const xpToNextLevel: Executor = async (userId) => {
  const user = await userRow(userId);
  if (!user) return null;
  const needed = Math.max(0, user.xpToNextLevel - user.currentXP);
  return `You need **${needed} XP** to reach Lv. ${user.level + 1} (${user.currentXP}/${user.xpToNextLevel}).`;
};

const userHp: Executor = async (userId) => {
  const user = await userRow(userId);
  if (!user) return null;
  const pct = user.maxHp > 0 ? user.hp / user.maxHp : 0;
  const warning = pct < 0.4 && pct > 0 ? " Low — a break is advised." : "";
  return `HP **${user.hp}/${user.maxHp}**.${warning}`;
};

const userSylph: Executor = async (userId) => {
  const user = await userRow(userId);
  if (!user) return null;
  return `**${user.sylph} Sylph** in the bank.`;
};

const userStreak: Executor = async (userId) => {
  const user = await userRow(userId);
  if (!user) return null;
  return user.streakDays > 0
    ? `${user.streakDays} week${user.streakDays === 1 ? "" : "s"} streak.`
    : "No active weekly streak.";
};

const userRank: Executor = async (userId) => {
  const user = await userRow(userId);
  if (!user) return null;
  return `You're **${user.hunterRank}-Rank**, Lv. ${user.level} — "${user.activeTitle || "Novice Hunter"}".`;
};

const userName: Executor = async (userId) => {
  const user = await userRow(userId);
  if (!user) return null;
  return user.name
    ? `You are **${user.name}** (@${user.username}).`
    : `Your username is **@${user.username}**.`;
};

const whoAmI: Executor = async (userId) => {
  const user = await userRow(userId);
  if (!user) return null;
  const name = user.name || user.username;
  return `You are **${name}** (@${user.username}) — **${user.hunterRank}-Rank**, Lv. ${user.level}, "${user.activeTitle || "Novice Hunter"}".`;
};

const studyTime: Executor = async (userId, params) => {
  const tz = await getUserTimezone(userId);
  const scope = params.timeScope || "today";

  if (scope === "total") {
    const agg = await prisma.studySession.aggregate({
      _sum: { durationMinutes: true },
      _count: true,
      where: { userId },
    });
    const mins = agg._sum.durationMinutes || 0;
    return mins > 0
      ? `**${Math.floor(mins / 60)}h ${mins % 60}m** studied total (${agg._count} session${agg._count === 1 ? "" : "s"}).`
      : "No study time recorded yet.";
  }

  const win = scopeWindow(tz, scope);
  const where: any = { userId };
  if (win.utcStart) where.startedAt = { gte: win.utcStart, lt: win.utcEnd };
  else if (win.date) {
    const [y, m, d] = win.date.split("-").map((n) => parseInt(n, 10));
    where.startedAt = {
      gte: new Date(Date.UTC(y, m - 1, d)),
      lt: new Date(Date.UTC(y, m - 1, d + 1)),
    };
  } else if (win.startDate && win.endDate) {
    const [sy, sm, sd] = win.startDate.split("-").map((n) => parseInt(n, 10));
    const [ey, em, ed] = win.endDate.split("-").map((n) => parseInt(n, 10));
    where.startedAt = {
      gte: new Date(Date.UTC(sy, sm - 1, sd)),
      lt: new Date(Date.UTC(ey, em - 1, ed + 1)),
    };
  }
  const agg = await prisma.studySession.aggregate({
    _sum: { durationMinutes: true },
    _count: true,
    where,
  });
  const mins = agg._sum.durationMinutes || 0;
  return mins > 0
    ? `**${mins} min** studied ${scopeLabel(scope)} (${agg._count} session${agg._count === 1 ? "" : "s"}).`
    : `No study time ${scopeLabel(scope)}.`;
};

const quests: Executor = async (userId, params) => {
  const tz = await getUserTimezone(userId);
  const scope = params.timeScope || "today";
  const win = scopeWindow(tz, scope);

  let where: any = { userId };
  if (win.date) {
    where.scheduledFor = win.date;
  } else if (win.startDate) {
    const dates: string[] = [];
    const d = new Date(`${win.startDate}T00:00:00Z`);
    const end = new Date(`${win.endDate}T00:00:00Z`);
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    where.scheduledFor = { in: dates };
  }

  const list = await prisma.quest.findMany({
    where,
    select: { title: true, requiredMinutes: true, status: true },
    orderBy: { createdAt: "asc" },
    take: 8,
  });

  if (list.length === 0) {
    return scope === "today"
      ? "Nothing scheduled today."
      : `Nothing scheduled ${scopeLabel(scope)}.`;
  }
  const done = list.filter((q) => q.status === "COMPLETED").length;
  const totalMin = list.reduce((s, q) => s + q.requiredMinutes, 0);
  const lines = list
    .slice(0, 6)
    .map((q) => `- ${q.title} (${q.requiredMinutes}m)${q.status === "COMPLETED" ? " ✓" : ""}`);
  const more = list.length > 6 ? `\n*…and ${list.length - 6} more.*` : "";
  return `**${list.length} quest${list.length === 1 ? "" : "s"} ${scopeLabel(scope)}** (${done} done · ${totalMin} min total):\n${lines.join("\n")}${more}`;
};

const goals: Executor = async (userId) => {
  const list = await prisma.goal.findMany({
    where: { userId, status: "ACTIVE" },
    select: { title: true, quests: { select: { status: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  if (list.length === 0) return "No active goals right now.";
  const lines = list.slice(0, 3).map((g) => {
    const total = g.quests.length;
    const completed = g.quests.filter((q) => q.status === "COMPLETED").length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return `- "${g.title}" ${pct}%`;
  });
  const more = list.length > 3 ? `\n*…and ${list.length - 3} more.*` : "";
  return `**${list.length} active goal${list.length === 1 ? "" : "s"}**:\n${lines.join("\n")}${more}`;
};

const subjects: Executor = async (userId) => {
  const list = await prisma.subject.findMany({
    where: { userId, archivedAt: null },
    select: { name: true, examBoard: true, level: true },
    orderBy: { createdAt: "asc" },
    take: 6,
  });
  if (list.length === 0) return "No subjects yet — add one to start building a constellation.";
  const lines = list.slice(0, 4).map((s) => `- ${s.name} (${s.examBoard} ${s.level})`);
  const more = list.length > 4 ? `\n*…and ${list.length - 4} more.*` : "";
  return `**${list.length} subject${list.length === 1 ? "" : "s"}**:\n${lines.join("\n")}${more}`;
};

const timezoneInfo: Executor = async (userId) => {
  const user = await userRow(userId);
  if (!user) return null;
  return `Your timezone is **${user.timezone || "UTC"}**.`;
};

const accountAge: Executor = async (userId) => {
  const user = await userRow(userId);
  if (!user?.createdAt) return null;
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000))
  );
  const date = new Date(user.createdAt).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `You've been tracking since **${date}** (${days} day${days === 1 ? "" : "s"}).`;
};

const lastSession: Executor = async (userId) => {
  const session = await prisma.studySession.findFirst({
    where: { userId },
    select: { startedAt: true, durationMinutes: true, subject: { select: { name: true } } },
    orderBy: { startedAt: "desc" },
  });
  if (!session) return "No study sessions yet.";
  const date = new Date(session.startedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Last session: **${date}** — ${session.durationMinutes} min${
    session.subject?.name ? ` on ${session.subject.name}` : ""
  }.`;
};

const sessionSummary: Executor = async (userId, params) => {
  const tz = await getUserTimezone(userId);
  const scope = params.timeScope || "total";

  const total = await prisma.studySession.aggregate({
    _sum: { durationMinutes: true },
    _count: true,
    where: { userId },
  });
  const totalCount = total._count || 0;
  const totalMin = total._sum.durationMinutes || 0;
  if (totalCount === 0) return "No study sessions recorded yet.";

  let where: any = { userId };
  let label = "total";
  if (scope !== "total") {
    const win = scopeWindow(tz, scope);
    label = scopeLabel(scope);
    if (win.utcStart) where.startedAt = { gte: win.utcStart, lt: win.utcEnd };
    else if (win.date) {
      const [y, m, d] = win.date.split("-").map((n) => parseInt(n, 10));
      where.startedAt = {
        gte: new Date(Date.UTC(y, m - 1, d)),
        lt: new Date(Date.UTC(y, m - 1, d + 1)),
      };
    }
  }

  const recent = await prisma.studySession.findMany({
    where,
    select: { durationMinutes: true, startedAt: true, subject: { select: { name: true } } },
    orderBy: { startedAt: "desc" },
    take: 8,
  });
  const scopedMin = recent.reduce((s, r) => s + r.durationMinutes, 0);

  const topSubject = (() => {
    const counts: Record<string, number> = {};
    for (const r of recent) if (r.subject?.name) counts[r.subject.name] = (counts[r.subject.name] || 0) + 1;
    let best: string | null = null;
    let bestCount = 0;
    for (const [name, c] of Object.entries(counts)) if (c > bestCount) { bestCount = c; best = name; }
    return best;
  })();

  const avg = Math.round(totalMin / totalCount);
  let out =
    scope === "total"
      ? `**${totalCount} session${totalCount === 1 ? "" : "s"}** · **${Math.floor(totalMin / 60)}h ${totalMin % 60}m** total · avg **${avg} min**/session`
      : `**${recent.length} session${recent.length === 1 ? "" : "s"}** · **${scopedMin} min** ${label} (${totalCount} lifetime)`;
  if (topSubject) out += `\n- Most studied: **${topSubject}**`;
  if (recent.length > 0) {
    const last = recent[0];
    out += `\n- Latest: **${new Date(last.startedAt).toLocaleDateString([], { month: "short", day: "numeric" })}**${last.subject?.name ? ` — ${last.subject.name}` : ""} (${last.durationMinutes} min)`;
  }
  return out;
};

const weeklyTarget: Executor = async (userId) => {
  const tz = await getUserTimezone(userId);
  const bounds = getWeeklyBounds(new Date(), tz);
  const agg = await prisma.studySession.aggregate({
    _sum: { durationMinutes: true },
    where: {
      userId,
      startedAt: { gte: bounds.weekStart, lte: bounds.weekEnd },
    },
  });
  const mins = agg._sum.durationMinutes || 0;
  if (mins >= WEEKLY_TARGET_MIN) {
    return `Weekly target hit: **${WEEKLY_TARGET_MIN}/${WEEKLY_TARGET_MIN} min** ✓`;
  }
  const pct = Math.min(100, Math.round((mins / WEEKLY_TARGET_MIN) * 100));
  return `Weekly target: **${mins}/${WEEKLY_TARGET_MIN} min** (${pct}%) — ${
    WEEKLY_TARGET_MIN - mins
  } min to go, ${bounds.daysRemaining} day${bounds.daysRemaining === 1 ? "" : "s"} left.`;
};

const currentTime: Executor = async (userId) => {
  const tz = await getUserTimezone(userId);
  const date = TimezoneService.getUserLocalDate(tz);
  const dow = TimezoneService.getUserDayOfWeek(tz, date);
  const time = TimezoneService.getUserLocalTime(tz);
  return `It's **${time}** (${dow}, ${date}).`;
};

const currentDate: Executor = async (userId) => {
  const tz = await getUserTimezone(userId);
  const date = TimezoneService.getUserLocalDate(tz);
  const dow = TimezoneService.getUserDayOfWeek(tz, date);
  return `Today is **${dow}, ${date}**.`;
};

/** Map of intent id → executor. */
export const EXECUTORS: Record<string, Executor> = {
  get_user_xp: userXp,
  get_xp_to_next_level: xpToNextLevel,
  get_user_level: userLevel,
  get_user_hp: userHp,
  get_user_sylph: userSylph,
  get_streak: userStreak,
  get_user_rank: userRank,
  get_user_name: userName,
  who_am_i: whoAmI,
  get_study_time: studyTime,
  get_quests: quests,
  get_goals: goals,
  get_subjects: subjects,
  get_timezone: timezoneInfo,
  get_account_age: accountAge,
  get_last_session: lastSession,
  get_session_summary: sessionSummary,
  get_weekly_target: weeklyTarget,
  get_current_time: currentTime,
  get_current_date: currentDate,
};
