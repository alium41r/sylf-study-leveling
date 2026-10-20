import { describe, it, expect } from "vitest";
import {
  analyzeCalendarDay,
  schedulingConflicts,
} from "@/lib/calendar/intelligence";
import type { CalendarEvent } from "@/lib/calendar/contracts";
import type { DayStudySummary } from "@/lib/study-schedule-types";
const event = (
  id: string,
  startsAt: string,
  endsAt: string
): CalendarEvent => ({
  id,
  title: id,
  description: "",
  color: "VIOLET",
  allDay: false,
  startDate: startsAt.slice(0, 10),
  endDate: endsAt.slice(0, 10),
  startsAt,
  endsAt,
  timezone: "UTC",
  revision: 1,
  createdAt: "",
  updatedAt: "",
});
const study = (
  date: string,
  quests: DayStudySummary["quests"] = []
): DayStudySummary => ({
  date,
  dayOfWeek: 1,
  isRestDay: false,
  dailyGoalMinutes: 120,
  totalMinutes: 0,
  totalSeconds: 0,
  completionPercentage: 0,
  goalMet: false,
  sessionsCount: 0,
  questsCount: quests.length,
  questsCompleted: 0,
  xpGained: 0,
  subjectBreakdown: [],
  quests,
});
const quest = {
  id: 1,
  title: "Physics",
  description: null,
  status: "PENDING",
  difficulty: "NORMAL",
  requiredMinutes: 120,
  elapsedSeconds: 1800,
  xpReward: 0,
  sylphReward: 0,
  goal: null,
};
describe("deterministic calendar intelligence", () => {
  it("finds real overlaps without counting touching endpoints", () => {
    const a = event("a", "2026-10-19T08:00:00Z", "2026-10-19T10:00:00Z");
    const b = event("b", "2026-10-19T09:00:00Z", "2026-10-19T11:00:00Z");
    const c = event("c", "2026-10-19T11:00:00Z", "2026-10-19T12:00:00Z");
    expect(schedulingConflicts([a, b, c], "UTC")).toMatchObject({
      total: 1,
      conflicts: [
        {
          first: "a",
          second: "b",
          startsAt: "2026-10-19T09:00:00.000Z",
          endsAt: "2026-10-19T10:00:00.000Z",
        },
      ],
    });
    const day = analyzeCalendarDay(
      [a, b, c],
      study("2026-10-19", [quest]),
      "UTC",
      480,
      720,
      0
    );
    expect(day).toMatchObject({
      busyMinutes: 240,
      freeMinutes: 0,
      studyMinutesRemaining: 90,
      overloaded: true,
    });
  });
  it("does not turn dated quests or study history into clock reservations", () => {
    const day = analyzeCalendarDay(
      [],
      {
        ...study("2026-10-19", [quest]),
        totalMinutes: 200,
        sessions: [
          {
            id: 1,
            title: "History",
            startedAt: "2026-10-19T09:00:00Z",
            endedAt: "2026-10-19T12:00:00Z",
            minutes: 180,
          },
        ],
      },
      "UTC",
      480,
      720,
      0
    );
    expect(day).toMatchObject({
      busyMinutes: 0,
      freeMinutes: 240,
      studyMinutesRemaining: 90,
      overloaded: false,
    });
  });
  it("clips elapsed time and respects account-local all-day boundaries", () => {
    const allDay = {
      ...event("day", "2026-10-19T00:00:00Z", "2026-10-20T00:00:00Z"),
      allDay: true,
      startDate: "2026-10-19",
      endDate: "2026-10-20",
      startsAt: null,
      endsAt: null,
    };
    expect(
      analyzeCalendarDay(
        [allDay],
        study("2026-10-19"),
        "Asia/Karachi",
        480,
        1200,
        0
      )
    ).toMatchObject({ freeMinutes: 0, busyMinutes: 720 });
    expect(
      analyzeCalendarDay(
        [allDay],
        study("2026-10-20"),
        "Asia/Karachi",
        480,
        1200,
        0
      )
    ).toMatchObject({ freeMinutes: 720 });
    expect(
      analyzeCalendarDay(
        [],
        study("2026-10-19"),
        "UTC",
        480,
        720,
        Date.parse("2026-10-19T10:00:00Z")
      )
    ).toMatchObject({ freeMinutes: 120 });
  });
  it("uses actual DST durations and rejects nonexistent clock windows", () => {
    const fall = analyzeCalendarDay(
      [],
      study("2026-11-01"),
      "America/New_York",
      0,
      240,
      0
    );
    expect(fall).toMatchObject({ freeMinutes: 300 });
    expect(
      analyzeCalendarDay([], study("2026-03-08"), "America/New_York", 0, 240, 0)
    ).toMatchObject({ freeMinutes: 180 });
    expect(
      analyzeCalendarDay(
        [],
        study("2026-03-08"),
        "America/New_York",
        150,
        240,
        0
      )
    ).toMatchObject({ unavailableWindow: true });
    const early = event(
        "early",
        "2026-11-01T05:15:00Z",
        "2026-11-01T05:45:00Z"
      ),
      late = event("late", "2026-11-01T06:15:00Z", "2026-11-01T06:45:00Z");
    expect(schedulingConflicts([early, late], "America/New_York").total).toBe(
      0
    );
  });
  it("bounds conflicts and counts focused conflicts even behind many unrelated pairs", () => {
    const items = Array.from({ length: 20 }, (_, n) =>
      event(String(n), "2026-10-19T08:00:00Z", "2026-10-19T12:00:00Z")
    );
    expect(schedulingConflicts(items, "UTC")).toMatchObject({
      total: 190,
      truncated: true,
    });
    expect(schedulingConflicts(items, "UTC", new Set(["19"])).total).toBe(19);
  });
});
