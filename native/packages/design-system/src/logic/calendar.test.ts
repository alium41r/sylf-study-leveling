import { describe, expect, it } from "vitest";
import { clampDay, firstOfMonth, inRange, isDateKey, lastOfMonth, monthGrid, monthOf, monthOpen, shiftDays, shiftMonth, shiftMonths, weekIndex, weekdayNames } from "./calendar";

describe("the date picker's calendar", () => {
  it("accepts only real days", () => {
    expect(isDateKey("2026-12-01")).toBe(true);
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2027-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2026-12-1")).toBe(false);
    expect(isDateKey("")).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });

  it("moves by days across months, years and daylight-saving changes", () => {
    expect(shiftDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDays("2027-03-01", -1)).toBe("2027-02-28");
    // Every day of a year, one at a time, lands on each date exactly once.
    let day = "2026-01-01";
    const seen = new Set<string>();
    for (let index = 0; index < 365; index++) { seen.add(day); day = shiftDays(day, 1); }
    expect(seen.size).toBe(365);
    expect(day).toBe("2027-01-01");
  });

  it("moves by months to the same day, or the last day of a shorter month", () => {
    expect(shiftMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(shiftMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(shiftMonths("2026-11-14", -12)).toBe("2025-11-14");
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it("lays every month out as six Monday-first weeks", () => {
    for (let month = 0; month < 24; month++) {
      const shown = shiftMonth({ year: 2026, month: 0 }, month);
      const rows = monthGrid(shown);
      expect(rows).toHaveLength(6);
      rows.forEach((row) => expect(row).toHaveLength(7));
      const days = rows.flat().filter(Boolean) as string[];
      expect(days[0]).toBe(firstOfMonth(shown));
      expect(days[days.length - 1]).toBe(lastOfMonth(shown));
      days.forEach((day, index) => { if (index) expect(day).toBe(shiftDays(days[index - 1], 1)); });
      // Each day sits under its own weekday.
      rows.forEach((row) => row.forEach((day, column) => { if (day) expect(weekIndex(day)).toBe(column); }));
    }
    // 1 December 2026 is a Tuesday: one empty cell before it.
    expect(monthGrid({ year: 2026, month: 11 })[0]).toEqual([null, "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
  });

  it("keeps choices inside the allowed range", () => {
    expect(inRange("2026-11-14", "2026-11-14")).toBe(true);
    expect(inRange("2026-11-13", "2026-11-14")).toBe(false);
    expect(inRange("2026-12-02", null, "2026-12-01")).toBe(false);
    expect(clampDay("2026-01-01", "2026-11-14", "2026-12-01")).toBe("2026-11-14");
    expect(clampDay("2027-01-01", "2026-11-14", "2026-12-01")).toBe("2026-12-01");
    expect(monthOpen({ year: 2026, month: 9 }, "2026-11-14")).toBe(false);
    expect(monthOpen({ year: 2026, month: 10 }, "2026-11-14")).toBe(true);
    expect(monthOpen({ year: 2027, month: 0 }, null, "2026-12-31")).toBe(false);
    expect(monthOf("2026-12-01")).toEqual({ year: 2026, month: 11 });
  });

  it("names seven weekdays, Monday first", () => {
    const names = weekdayNames("short");
    expect(names).toHaveLength(7);
    expect(new Set(names).size).toBe(7);
    expect(names[0]).toBe(new Date(2024, 0, 1, 12).toLocaleDateString([], { weekday: "short" }));
  });
});
