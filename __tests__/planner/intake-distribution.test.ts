// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DISTRIBUTION_REASONS,
  distributeWeeklyBudget,
  weeklyFromSchedule,
  WEEKLY_BUDGET_LIMITS,
  type DistributionInput,
} from "@/lib/planner/intake/distribution";

// 2030-01-07 is a Monday; the following Sunday is 2030-01-13.
const MONDAY = "2030-01-07";
const SUNDAY = "2030-01-13";

const base = (over: Partial<DistributionInput> = {}): DistributionInput => ({
  weeklyMinutes: 180,
  firstDate: MONDAY,
  lastDate: SUNDAY,
  restWeekdays: [],
  ...over,
});

const total = (dailyMinutes: readonly number[]): number =>
  dailyMinutes.reduce((sum, minutes) => sum + minutes, 0);

describe("distributeWeeklyBudget", () => {
  it("spreads a 3-hour week across study days", () => {
    const result = distributeWeeklyBudget(base());
    expect(total(result.dailyMinutes)).toBe(180);
    expect(result.reachableMinutes).toBe(180);
    expect(result.shortfallMinutes).toBe(0);
    // Near-uniform: the remainder is ±1 across the week.
    expect(
      Math.max(...result.dailyMinutes) - Math.min(...result.dailyMinutes)
    ).toBeLessThanOrEqual(1);
  });

  it("spreads a 10-hour week across study days", () => {
    const result = distributeWeeklyBudget(base({ weeklyMinutes: 600 }));
    expect(total(result.dailyMinutes)).toBe(600);
    expect(result.reachableMinutes).toBe(600);
    expect(result.shortfallMinutes).toBe(0);
  });

  it("does not inflate a partial week above the stated weekly figure, and says what falls outside it", () => {
    // A 3-day horizon cannot reach a full week's budget, and the honest answer has
    // two halves: the weekly pattern is still the weekly figure (no day is inflated
    // to weekly / 3 = 60), and the part of the week the horizon does not contain is
    // reported rather than pretended away.
    const result = distributeWeeklyBudget(base({ lastDate: "2030-01-09" }));
    expect(total(result.dailyMinutes)).toBe(180);
    expect(Math.max(...result.dailyMinutes)).toBeLessThanOrEqual(Math.ceil(180 / 7));
    // Mon–Wed of the pattern: three of the seven days, so three sevenths of 180.
    expect(result.reachableMinutes).toBe(78);
    expect(result.shortfallMinutes).toBe(102);
    expect(result.note).toMatch(/falls outside it/);
  });

  it("reports a full week as fully reachable", () => {
    const result = distributeWeeklyBudget(base());
    expect(result.reachableMinutes).toBe(180);
    expect(result.shortfallMinutes).toBe(0);
  });

  it("scales a partial week by the weekdays it actually contains", () => {
    // Sunday-only horizon: the pattern's Sunday share, not the whole week.
    const sunday = distributeWeeklyBudget({ ...base(), firstDate: SUNDAY, lastDate: SUNDAY });
    expect(sunday.reachableMinutes).toBe(sunday.dailyMinutes[0]);
    expect(sunday.shortfallMinutes).toBe(180 - sunday.dailyMinutes[0]);
    // A four-week horizon never claims more than the budget that was stated.
    const month = distributeWeeklyBudget({ ...base(), lastDate: "2030-02-03" });
    expect(month.reachableMinutes).toBe(180);
    expect(month.shortfallMinutes).toBe(0);
  });

  it("subtracts a dated rest day from what the horizon can realize", () => {
    const result = distributeWeeklyBudget({
      ...base(),
      lastDate: "2030-01-09",
      floatingRestDates: ["2030-01-08"],
    });
    // Tuesday is removed from an already partial week.
    expect(result.reachableMinutes).toBe(78 - result.dailyMinutes[2]);
  });

  it("leaves rest weekdays at zero", () => {
    const result = distributeWeeklyBudget(base({ restWeekdays: [0, 6] }));
    expect(result.dailyMinutes[0]).toBe(0);
    expect(result.dailyMinutes[6]).toBe(0);
    expect(total(result.dailyMinutes)).toBe(180);
  });

  it("excludes a floating rest date and echoes it in blockedDates", () => {
    const floating = "2030-01-08";
    const outside = "2030-02-01";
    const result = distributeWeeklyBudget(base({ floatingRestDates: [floating, outside] }));
    expect(result.blockedDates).toEqual([floating]);
    const day = result.preview.find((entry) => entry.date === floating);
    expect(day).toMatchObject({ minutes: 0, reason: "FLOATING_REST" });
  });

  it("reduces a loaded day's share without subtracting it from the budget", () => {
    const result = distributeWeeklyBudget(base({ existingLoadByDate: { "2030-01-07": 60 } }));
    // Monday (weekday 1) is pulled down by its existing work ...
    expect(result.dailyMinutes[1]).toBeLessThan(result.dailyMinutes[0]);
    // ... but nothing is subtracted from the total: the engine does that separately.
    expect(total(result.dailyMinutes)).toBe(180);
    expect(result.reachableMinutes).toBe(180);
  });

  it("zeroes a hard-unavailable weekday", () => {
    const result = distributeWeeklyBudget(base({ hardUnavailableWeekdays: [2] }));
    expect(result.dailyMinutes[2]).toBe(0);
    expect(total(result.dailyMinutes)).toBe(180);
  });

  it("evenSpread produces near-uniform days even when workload differs", () => {
    const loaded = base({ existingLoadByDate: { "2030-01-07": 60 } });
    const uneven = distributeWeeklyBudget(loaded);
    expect(
      Math.max(...uneven.dailyMinutes) - Math.min(...uneven.dailyMinutes)
    ).toBeGreaterThan(1);
    const even = distributeWeeklyBudget({ ...loaded, softHints: { evenSpread: true } });
    expect(Math.max(...even.dailyMinutes) - Math.min(...even.dailyMinutes)).toBeLessThanOrEqual(1);
  });

  it("fewerDates concentrates the budget onto fewer days than are available", () => {
    const result = distributeWeeklyBudget(base({ softHints: { fewerDates: true } }));
    const active = result.dailyMinutes.filter((minutes) => minutes > 0).length;
    expect(active).toBeLessThan(7);
    expect(total(result.dailyMinutes)).toBe(180);
  });

  it("lets a stated daily override win and excludes it from the pool", () => {
    const result = distributeWeeklyBudget(
      base({ dailyOverrides: [null, 90, null, null, null, null, null] })
    );
    expect(result.dailyMinutes[1]).toBe(90);
    // The remaining 90 minutes (180 - 90) is split across the other six days.
    expect(total(result.dailyMinutes)).toBe(180);
    expect(result.dailyMinutes.filter((_, day) => day !== 1).reduce((sum, m) => sum + m, 0)).toBe(
      90
    );
  });

  it("is deterministic and does not pile the remainder onto the earliest days", () => {
    const input = base({ existingLoadByDate: { "2030-01-07": 60 } });
    expect(distributeWeeklyBudget(input)).toEqual(distributeWeeklyBudget(input));
    const result = distributeWeeklyBudget(input);
    // Weighting pulls the loaded Monday down; a naive floor + remainder-on-day-0
    // would leave Monday at its flat share instead of below its clear neighbours.
    expect(result.dailyMinutes[1]).toBeLessThan(result.dailyMinutes[0]);
    expect(result.dailyMinutes[1]).toBeLessThan(result.dailyMinutes[2]);
  });

  it("reports an impossible placement as all zeros with the full shortfall", () => {
    const result = distributeWeeklyBudget(base({ restWeekdays: [0, 1, 2, 3, 4, 5, 6] }));
    expect(result.dailyMinutes).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(result.reachableMinutes).toBe(0);
    expect(result.shortfallMinutes).toBe(180);
    expect(result.note).toContain("No study day is available");
  });

  it("reports a ceiling conflict as shortfall rather than compressing it", () => {
    const result = distributeWeeklyBudget(base({ weeklyMinutes: 10080 }));
    expect(result.shortfallMinutes).toBeGreaterThan(0);
    expect(total(result.dailyMinutes)).toBe(5040);
    expect(result.note).toContain("does not fit");
  });

  it("never assigns more than 720 minutes to a single day", () => {
    const result = distributeWeeklyBudget(base({ weeklyMinutes: 10080 }));
    expect(Math.max(...result.dailyMinutes)).toBeLessThanOrEqual(
      WEEKLY_BUDGET_LIMITS.dailyMinutes.max
    );
  });

  it("exposes the documented reason vocabulary", () => {
    expect(DISTRIBUTION_REASONS).toEqual([
      "STUDY_DAY",
      "REST_WEEKDAY",
      "HARD_UNAVAILABLE",
      "FLOATING_REST",
      "STATED_OVERRIDE",
      "DAILY_CEILING",
      "FEWER_DATES",
    ]);
  });
});

describe("weeklyFromSchedule", () => {
  it("returns null when no daily goal is given", () => {
    expect(weeklyFromSchedule({ dailyGoalMinutes: null, restWeekdays: [] })).toBeNull();
    expect(weeklyFromSchedule({ dailyGoalMinutes: 0, restWeekdays: [] })).toBeNull();
  });

  it("multiplies the daily goal by the usable weekdays", () => {
    expect(weeklyFromSchedule({ dailyGoalMinutes: 60, restWeekdays: [] })).toBe(420);
    expect(weeklyFromSchedule({ dailyGoalMinutes: 60, restWeekdays: [0, 6] })).toBe(300);
    expect(
      weeklyFromSchedule({ dailyGoalMinutes: 60, restWeekdays: [], hardUnavailableWeekdays: [2] })
    ).toBe(360);
  });

  it("returns null when no weekday is usable", () => {
    expect(
      weeklyFromSchedule({
        dailyGoalMinutes: 60,
        restWeekdays: [],
        hardUnavailableWeekdays: [0, 1, 2, 3, 4, 5, 6],
      })
    ).toBeNull();
  });
});
