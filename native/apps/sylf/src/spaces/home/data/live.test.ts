// Home's mappers against the shapes the server really sends. They hold no rule of the server's: a quest gets no invented time, a hidden value stays hidden, and
// levels, ranks and rewards pass through untouched.
import { describe, expect, it } from "vitest";
import type { CalendarEvent, Friend, Quest, UserStats, StudySummary } from "@sylf/backend";
import { localDay, mapCircle, mapProgress, mapRecent, mapToday } from "./live";

const at = (hour: number, minute = 0) => new Date(2026, 10, 2, hour, minute);
const event = (id: string, start: Date, end: Date, overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title: id, allDay: false, startDate: localDay(start), endDate: localDay(end), startsAt: start.toISOString(), endsAt: end.toISOString(), ...overrides });
const quest = (id: number, overrides: Partial<Quest> = {}): Quest => ({ id, title: `Quest ${id}`, status: "PENDING", scheduledFor: "2026-11-02", subjectId: 9, targetMinutes: 30, subject: { id: 9, name: "Physics" }, ...overrides });
const schedule = { dailyGoalMinutes: 120, restDays: [0] };

describe("Today", () => {
  it("puts timed events on the line, past then next then later, and never gives a quest a time", () => {
    const view = mapToday([event("later", at(16), at(17)), event("seminar", at(9), at(10)), event("next", at(13), at(14))], [quest(1), quest(2, { status: "COMPLETED" }), quest(3)], schedule, null, at(11));
    expect(view.entries.map((entry) => [entry.title, entry.state])).toEqual([["seminar", "past"], ["next", "next"], ["later", "later"]]);
    expect(view.objectives.map((objective) => objective.title)).toEqual(["Quest 1", "Quest 3", "Quest 2"]);
    expect(view.objectives[0]).toMatchObject({ questId: 1, subject: "Physics", subjectId: 9, minutes: 30, detail: "Physics, 30 min" });
    expect(view.objectives[0]).not.toHaveProperty("startsAt");
    expect(view.summary).toBe("2 quests to finish, and 2 events ahead.");
  });

  it("counts real study blocks toward planned time, without including a class", () => {
    const view = mapToday([event("class", at(8), at(9)), event("study", at(12), at(12, 45), { category: "time-block" })], [], schedule, { dailyStudy: [], todayDate: "2026-11-02" }, at(11));
    expect(view.entries[0].minutes).toBeUndefined();
    expect(view.entries[1].minutes).toBe(45);
    expect(view.target).toEqual({ studied: 0, goal: 120, rest: false });
    expect(mapToday([], [], schedule, null, at(11)).target).toBeUndefined();
  });

  it("keeps an event that started before now and has not ended as the next thing", () => {
    expect(mapToday([event("now", at(10), at(12))], [], schedule, null, at(11)).entries[0].state).toBe("next");
  });

  it("leaves all-day events off the line, and other days out", () => {
    const view = mapToday([event("trip", at(0), at(0), { allDay: true, startsAt: null, endsAt: null, title: "Field trip" }), event("tomorrow", new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 10))], [], schedule, null, at(11));
    expect(view.entries).toEqual([]);
    expect(view.allDay).toEqual(["Field trip"]);
  });

  it("says a rest day is one, and says when everything is done", () => {
    expect(mapToday([], [], schedule, { dailyStudy: [], todayDate: "2026-11-01" }, at(11)).summary).toBe("A rest day. Nothing is planned.");
    expect(mapToday([], [], schedule, null, at(11)).summary).toBe("Nothing is planned yet.");
    expect(mapToday([], [quest(1, { status: "COMPLETED" })], schedule, null, at(11)).summary).toBe("Everything for today is done.");
  });
});

describe("Focus history", () => {
  it("names a session after its quest, then its subject, and hides a tap that lasted nothing", () => {
    const row = { startedAt: at(9).toISOString(), endedAt: at(10).toISOString(), breakSeconds: 0, focusRate: null, subjectColor: null };
    const recent = mapRecent({ nextCursor: null, sessions: [{ ...row, id: 1, durationSeconds: 1500, subjectName: "Physics", questTitle: "Past paper" }, { ...row, id: 2, durationSeconds: 600, subjectName: "Physics", questTitle: null }, { ...row, id: 3, durationSeconds: 90, subjectName: null, questTitle: null }, { ...row, id: 4, durationSeconds: 0, subjectName: null, questTitle: null }] }, at(11));
    expect(recent.map((session) => [session.title, session.minutes])).toEqual([["Past paper", 25], ["Physics", 10], ["Study session", 2]]);
    expect(recent[0].detail).toContain("Physics. Today");
  });
});

describe("Progress", () => {
  const stats: UserStats = { hunterRank: "D", level: 12, currentXP: 320, xpToNextLevel: 500, streakDays: 1, totalStudySeconds: 7200 };
  const summary: StudySummary = { todayDate: "2026-11-04", dailyStudy: [{ date: "2026-11-01", minutes: 999 }, { date: "2026-11-02", minutes: 60 }, { date: "2026-11-04", minutes: 30 }], subjectBreakdown: [{ name: "Physics", color: "BLUE", seconds: 3000, minutes: 50, sessions: 2 }, { name: "Maths", color: "ROSE", seconds: 1000, minutes: 16, sessions: 1 }], summary: { totalSessions: 3, activeDaysLast30: 2, avgSessionSeconds: 1000, longestSessionSeconds: 2000 } };

  it("reads level, rank and streak as the server gives them, and adds up only this week", () => {
    const view = mapProgress(stats, summary, []);
    expect(view).toMatchObject({ level: 12, rank: "Rank D", levelProgress: 0.64, levelDetail: "320 of 500 XP" });
    expect(view.week.map((day) => day.day)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(view.week.find((day) => day.today)).toMatchObject({ day: "Wed", minutes: 30 });
    expect(view.stats[0]).toMatchObject({ id: "week", value: "1.5", unit: "hr" });
    expect(view.stats[1]).toMatchObject({ value: "1", unit: "day" });
    expect(mapProgress({ ...stats, totalStudySeconds: 72 }, { ...summary, dailyStudy: [{ date: "2026-11-04", minutes: 1.2 }] }, []).stats.map((stat) => [stat.value, stat.unit])).toEqual([["1", "min"], ["1", "day"], ["1", "min"]]);
    expect(view.subjects).toEqual([{ id: "Physics", name: "Physics", share: 0.75 }, { id: "Maths", name: "Maths", share: 0.25 }]);
  });

  it("puts what can be claimed first, then what is closest", () => {
    const record = (id: string, currentProgress: number, target: number, isClaimed = false) => ({ id, title: id, description: "", target, currentProgress, isClaimed });
    const view = mapProgress(stats, summary, [record("far", 1, 100), record("done", 1, 1, true), record("near", 9, 10), record("ready", 5, 5)]);
    expect(view.achievements.map((item) => [item.id, item.earned, item.claimable])).toEqual([["ready", false, true], ["near", false, false], ["far", false, false], ["done", true, false]]);
  });

  it("is honest on an empty account", () => {
    const view = mapProgress({ ...stats, level: 1, currentXP: 0, xpToNextLevel: 182, streakDays: 0, totalStudySeconds: 0 }, { ...summary, dailyStudy: [], subjectBreakdown: [] }, []);
    expect(view.levelProgress).toBe(0);
    expect(view.subjects).toEqual([]);
    expect(view.week.every((day) => day.minutes === 0)).toBe(true);
  });
});

describe("Circle", () => {
  const friend = (overrides: Partial<Friend>): Friend => ({ id: 1, name: "Amara", username: "amara", hunterRank: "C", level: 8, todaySeconds: 2700, isOnline: false, isStudying: false, activeSessionStartedAt: null, visible: { hours: true, session: true, online: true, rank: true }, ...overrides });
  const none = { activeParty: null, pendingInvites: [] };

  it("says hidden for what a friend hides, and never zero", () => {
    const [person] = mapCircle([friend({ hunterRank: null, level: null, todaySeconds: 0, visible: { hours: false, session: false, online: false, rank: false } })], none, [], at(11)).people;
    expect(person.status).toBe("Status hidden");
    expect(person.detail).toBe("Level hidden. Hours hidden");
    expect(JSON.stringify(person)).not.toMatch(/\b0\b/);
  });

  it("shows what is real", () => {
    const view = mapCircle([friend({ isStudying: true, activeSessionStartedAt: at(10, 30).toISOString() }), friend({ id: 2, isOnline: true, todaySeconds: 0 })], none, [], at(11));
    expect(view.people[0]).toMatchObject({ status: "Studying, 30 min", presence: "focusing", detail: "Level 8, Rank C. 45 min today" });
    expect(view.people[1]).toMatchObject({ status: "Online", presence: "online", detail: "Level 8, Rank C. Nothing today" });
  });

  it("carries a party, its invitations and friend requests, with no schedule", () => {
    const view = mapCircle([], { activeParty: { id: 4, name: "Exam prep", memberCount: 3 }, pendingInvites: [{ id: 5, partyName: "Night owls", senderName: null, senderUsername: "mei" }] }, [{ id: 6, sender: { id: 2, name: "Jonas", username: "jonas" } }], at(11));
    expect(view.parties).toEqual([{ id: "4", name: "Exam prep", members: 3, inSession: false }]);
    expect(view.invites).toEqual([{ id: "5", name: "Night owls", from: "mei" }]);
    expect(view.requests).toEqual([{ id: 6, name: "Jonas" }]);
  });
});
