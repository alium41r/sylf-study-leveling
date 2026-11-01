// Home over the real backend. Each destination is one resource, composed here from the reads it needs, so a screen sees one state and one retry.
// The mappers are pure and hold no rule the server owns: levels, ranks, streaks and rewards are read as they come. What a quest does not have, a time
// of day, is not invented: timed events go on the line, and quests follow in order.
import type { Backend, CalendarEvent, Friend, FriendRequest, FocusParty, Quest, RecentSessions, ResourceDefinition, StudySummary, UserStats, AchievementRecord, PlannerCapabilities } from "@sylf/backend";
import type { Achievement, CircleView, DayEntry, FocusView, Objective, ProgressView, RecentSession, TodayView } from "./contracts";
import { formatMinutes } from "../format";

const MINUTE = 60_000;
export const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const clock = (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const plural = (count: number, one: string) => (count === 1 ? `one ${one}` : `${count} ${one}s`);
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function questMinutes(quest: Quest) { return quest.plannedMinutes ?? quest.requiredMinutes ?? quest.targetMinutes ?? null; }

export function mapToday(events: CalendarEvent[], quests: Quest[], capabilities: PlannerCapabilities | null, now: Date): TodayView {
  const day = localDay(now);
  const timed = events.filter((event) => !event.allDay && event.startsAt && localDay(new Date(event.startsAt)) === day).sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
  const allDay = events.filter((event) => event.allDay).map((event) => event.title);
  let nextGiven = false;
  const entries: DayEntry[] = timed.map((event) => {
    const startsAt = Date.parse(event.startsAt!);
    const endsAt = event.endsAt ? Date.parse(event.endsAt) : startsAt;
    const minutes = Math.round((endsAt - startsAt) / MINUTE);
    const past = endsAt < now.getTime() || (endsAt === startsAt && startsAt < now.getTime());
    const state = past ? "past" : nextGiven ? "later" : "next";
    if (state === "next") nextGiven = true;
    return { id: event.occurrenceDate ? `${event.id}:${event.occurrenceDate}` : event.id, startsAt, title: event.title, detail: minutes > 0 ? `${formatMinutes(minutes)}, until ${clock(endsAt)}` : "Event", kind: event.category === "time-block" ? "session" : "class", state };
  });
  // Open work first, in the server's order. A plan's order is the student's own.
  const objectives: Objective[] = [...quests.filter((quest) => quest.status !== "COMPLETED"), ...quests.filter((quest) => quest.status === "COMPLETED")].map((quest) => {
    const minutes = questMinutes(quest);
    return { id: `quest-${quest.id}`, questId: quest.id, title: quest.title, detail: [quest.subject?.name, minutes ? formatMinutes(minutes) : null].filter(Boolean).join(", ") || "Quest", done: quest.status === "COMPLETED", subject: quest.subject?.name ?? null, subjectId: quest.subjectId, minutes: minutes ?? undefined };
  });
  const restDay = capabilities ? capabilities.restDays.includes(new Date(`${capabilities.today}T12:00:00Z`).getUTCDay()) : false;
  const open = objectives.filter((objective) => !objective.done).length;
  const ahead = entries.filter((entry) => entry.state !== "past").length;
  const parts = [open ? `${plural(open, "quest")} to finish` : null, ahead ? `${plural(ahead, "event")} ahead` : null].filter(Boolean);
  const summary = parts.length ? `${sentence(parts.join(", and "))}.` : objectives.length ? "Everything for today is done." : restDay ? "A rest day. Nothing is planned." : "Nothing is planned yet.";
  return { entries, objectives, allDay, summary };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function mapRecent(page: RecentSessions, now: Date): RecentSession[] {
  const today = localDay(now);
  const yesterday = localDay(addDays(now, -1));
  // A session of no time is a tap that was undone. The server keeps it, and nobody wants to read it.
  return page.sessions.filter((session) => session.durationSeconds >= 1).slice(0, 8).map((session) => {
    const when = new Date(session.startedAt);
    const key = localDay(when);
    const day = key === today ? "Today" : key === yesterday ? "Yesterday" : when.toLocaleDateString([], { day: "numeric", month: "short" });
    return { id: String(session.id), title: session.questTitle ?? session.subjectName ?? "Study session", detail: [session.questTitle ? session.subjectName : null, `${day}, ${clock(when.getTime())}`].filter(Boolean).join(". "), minutes: Math.max(1, Math.round(session.durationSeconds / 60)) };
  });
}

function pickAchievements(records: AchievementRecord[]): Achievement[] {
  const ready = (record: AchievementRecord) => !record.isClaimed && record.currentProgress >= record.target;
  const nearness = (record: AchievementRecord) => record.currentProgress / Math.max(1, record.target);
  const ordered = [...records.filter(ready), ...records.filter((record) => !record.isClaimed && !ready(record)).sort((a, b) => nearness(b) - nearness(a)), ...records.filter((record) => record.isClaimed)];
  return ordered.slice(0, 5).map((record) => ({ id: record.id, title: record.title, detail: record.description, earned: record.isClaimed, claimable: ready(record) }));
}

/** Hours once there are hours to speak of. A first session is minutes, and "0.0 hr" would say it did not count. */
const amount = (minutes: number) => (minutes < 60 ? { value: String(Math.round(minutes)), unit: "min" } : { value: (minutes / 60).toFixed(minutes < 6000 ? 1 : 0), unit: "hr" });

export function mapProgress(stats: UserStats, summary: StudySummary, achievements: AchievementRecord[]): ProgressView {
  const today = new Date(`${summary.todayDate}T12:00:00Z`);
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86_400_000);
  const minutesOn = new Map(summary.dailyStudy.map((day) => [day.date, day.minutes]));
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday.getTime() + index * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    return { day: DAY_NAMES[date.getUTCDay()], minutes: Math.round(minutesOn.get(key) ?? 0), today: key === summary.todayDate };
  });
  const weekMinutes = week.reduce((sum, day) => sum + day.minutes, 0);
  const totalSeconds = summary.subjectBreakdown.reduce((sum, subject) => sum + subject.seconds, 0);
  return {
    level: stats.level,
    levelProgress: Math.min(1, stats.currentXP / Math.max(1, stats.xpToNextLevel)),
    levelDetail: `${stats.currentXP.toLocaleString()} of ${stats.xpToNextLevel.toLocaleString()} XP`,
    rank: `Rank ${stats.hunterRank}`,
    stats: [
      { id: "week", label: "This week", ...amount(weekMinutes) },
      { id: "streak", label: "Current streak", value: String(stats.streakDays), unit: stats.streakDays === 1 ? "day" : "days" },
      { id: "total", label: "All time", ...amount((stats.totalStudySeconds ?? 0) / 60) },
    ],
    week,
    subjects: summary.subjectBreakdown.map((subject) => ({ id: subject.name, name: subject.name, share: totalSeconds ? subject.seconds / totalSeconds : 0 })),
    achievements: pickAchievements(achievements),
  };
}

const friendName = (friend: { name: string | null; username: string }) => friend.name || friend.username;

export function mapCircle(friends: Friend[], party: FocusParty, requests: FriendRequest[], now: Date): CircleView {
  return {
    people: friends.map((friend) => {
      const visible = friend.visible ?? { hours: true, session: true, online: true, rank: friend.level !== null };
      const studying = friend.isStudying;
      const started = friend.activeSessionStartedAt ? Math.max(1, Math.round((now.getTime() - Date.parse(friend.activeSessionStartedAt)) / MINUTE)) : null;
      const status = studying ? (started ? `Studying, ${formatMinutes(started)}` : "Studying") : friend.isOnline ? "Online" : visible.online ? "Offline" : "Status hidden";
      const rank = visible.rank && friend.level !== null ? `Level ${friend.level}${friend.hunterRank ? `, Rank ${friend.hunterRank}` : ""}` : "Level hidden";
      const hours = visible.hours ? (friend.todaySeconds ? `${formatMinutes(Math.max(1, Math.round(friend.todaySeconds / 60)))} today` : "Nothing today") : "Hours hidden";
      return { id: String(friend.id), name: friendName(friend), status, detail: `${rank}. ${hours}`, ...(studying ? { presence: "focusing" as const } : friend.isOnline ? { presence: "online" as const } : {}) };
    }),
    parties: party.activeParty ? [{ id: String(party.activeParty.id), name: party.activeParty.name, members: party.activeParty.memberCount, inSession: false }] : [],
    invites: party.pendingInvites.map((invite) => ({ id: String(invite.id), name: invite.partyName, from: invite.senderName || invite.senderUsername })),
    requests: requests.map((request) => ({ id: request.id, name: friendName(request.sender) })),
  };
}

export type HomeView = "today" | "focus" | "circle" | "progress";

export function liveHomeViews(backend: Backend) {
  const { reads } = backend;
  const views: { today: ResourceDefinition<TodayView>; focus: ResourceDefinition<FocusView>; circle: ResourceDefinition<CircleView>; progress: ResourceDefinition<ProgressView> } = {
    today: {
      key: "home-today", tags: ["today"], ttlMs: 60_000,
      async load(signal) {
        const now = new Date();
        const [quests, capabilities, calendar] = await Promise.all([reads.questsToday(signal), reads.planner(signal), reads.calendar(localDay(now), localDay(addDays(now, 1)), signal)]);
        return mapToday(calendar.events, quests, capabilities, new Date());
      },
    },
    focus: {
      key: "home-focus", tags: ["sessions"], ttlMs: 60_000,
      async load(signal) { return { subject: "", topic: "", desks: [], recent: mapRecent(await reads.recentSessions(20, signal), new Date()) }; },
    },
    circle: {
      key: "home-circle", tags: ["circle"], ttlMs: 30_000,
      async load(signal) {
        const [friends, party, requests] = await Promise.all([reads.friends(signal), reads.party(signal), reads.friendRequests(signal)]);
        return mapCircle(friends, party, requests, new Date());
      },
    },
    progress: {
      key: "home-progress", tags: ["progress"], ttlMs: 60_000,
      async load(signal) {
        const [stats, summary, achievements] = await Promise.all([reads.stats(signal), reads.studySummary(signal), reads.achievements(signal)]);
        return mapProgress(stats, summary, achievements.achievements);
      },
    },
  };
  return views;
}
