import { describe, expect, it } from "vitest";
import type { StudySummary } from "@sylf/backend";
import { bandOf, barHeight, contextWindow, lastDays, mentionsHp, ordinal, rhythmByBand, thisWeek, weekTarget } from "./shared";

const summary = (todayDate: string, dailyStudy: { date: string; minutes: number }[]): StudySummary => ({ dailyStudy, subjectBreakdown: [], todayDate, summary: { totalSessions: 0, activeDaysLast30: 0, avgSessionSeconds: 0, longestSessionSeconds: 0 } });

describe("days", () => {
  it("lists the last days ending today, with gaps as no study", () => {
    const days = lastDays(summary("2026-11-04", [{ date: "2026-11-03", minutes: 40 }, { date: "2026-11-04", minutes: 15 }]), 5);
    expect(days.map((day) => day.date)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(days.map((day) => day.minutes)).toEqual([0, 0, 0, 40, 15]);
    expect(days.at(-1)?.today).toBe(true);
  });
  it("measures the week from Monday", () => {
    expect(thisWeek(summary("2026-11-04", [])).map((day) => day.date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(thisWeek(summary("2026-11-02", [])).length).toBe(1);
    expect(thisWeek(summary("2026-11-08", [])).length).toBe(7);
  });
  it("sets a week from the days that are not rest days", () => {
    expect(weekTarget(60, [0, 6])).toBe(300);
    expect(weekTarget(60, [])).toBe(420);
  });
});

describe("bars", () => {
  it("scale to the target, so one minute is one minute", () => {
    expect(barHeight(0, 90, 40)).toBe(0);
    expect(barHeight(1, 90, 40)).toBe(2);
    expect(barHeight(45, 90, 40)).toBe(20);
    expect(barHeight(500, 90, 40)).toBe(40);
  });
  it("survives a target of zero", () => { expect(barHeight(10, 0, 40)).toBe(40); });
});

describe("rhythm", () => {
  it("bands the hours", () => {
    expect([4, 5, 11, 12, 16, 17, 21, 22, 23, 0].map(bandOf)).toEqual(["Night", "Morning", "Morning", "Afternoon", "Afternoon", "Evening", "Evening", "Night", "Night", "Night"]);
  });
  it("adds minutes by band", () => {
    const sessions = [{ startedAt: new Date(2026, 10, 3, 9).toISOString(), durationSeconds: 1800 }, { startedAt: new Date(2026, 10, 3, 10).toISOString(), durationSeconds: 600 }, { startedAt: "nonsense", durationSeconds: 99 }];
    expect(rhythmByBand(sessions)).toEqual({ Morning: 40, Afternoon: 0, Evening: 0, Night: 0 });
  });
});

describe("standing", () => {
  const rows = (count: number, me: number) => Array.from({ length: count }, (_, index) => ({ id: index, isCurrentUser: index === me }));
  it("shows the top alone when you are in it", () => { expect(contextWindow(rows(20, 2))).toMatchObject({ around: [] }); });
  it("shows two above and two below when you are further down", () => {
    const { top, around } = contextWindow(rows(30, 12));
    expect(top.length).toBe(5);
    expect(around.map((row) => row.id)).toEqual([10, 11, 12, 13, 14]);
  });
  it("shows the top alone when you are not listed", () => { expect(contextWindow(rows(10, -1)).around).toEqual([]); });
  it("never overlaps the top with the window", () => { expect(contextWindow(rows(30, 6)).around.map((row) => row.id)).toEqual([5, 6, 7, 8]); });
  it("reads ordinals", () => { expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"]); });
});

describe("HP", () => {
  it("is spotted in copy so it can be left out", () => {
    expect(mentionsHp("Each tier: +5 max HP and less damage")).toBe(true);
    expect(mentionsHp("Gain hit points")).toBe(true);
    expect(mentionsHp("Focus Stamina — last longer")).toBe(false);
    expect(mentionsHp("Whip")).toBe(false);
  });
});
