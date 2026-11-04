import { describe, expect, it } from "vitest";
import type { PlanEvent } from "@sylf/backend";
import { addDays, dayDensity, eventsOn, monthRows, questOverdue, subjectCode, validDay, validTime, weekOf } from "./shared";

const event = (id: string, change: Partial<PlanEvent>): PlanEvent => ({ id, title: id, allDay: false, startDate: "2026-11-05", endDate: "2026-11-05", startsAt: null, endsAt: null, revision: 1, ...change });

describe("Plan's calendar", () => {
  it("starts weeks on Monday, and fills every row", () => {
    const rows = monthRows(2026, 10);
    expect(rows[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(rows[0][6]).toBe("2026-11-01");
    expect(rows.every((row) => row.length === 7)).toBe(true);
    expect(rows.flat().filter(Boolean)).toHaveLength(30);
  });
  it("gives the seven days of a week from any day in it", () => {
    expect(weekOf("2026-11-04")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });
  it("crosses a month boundary", () => { expect(addDays("2026-11-30", 1)).toBe("2026-12-01"); });
  it("treats an all-day end as exclusive, and puts all-day events first", () => {
    const allDay = event("trip", { allDay: true, startDate: "2026-11-05", endDate: "2026-11-07" });
    const timed = event("lab", { startsAt: new Date(2026, 10, 5, 9).toISOString() });
    expect(eventsOn([timed, allDay], "2026-11-05").map((item) => item.id)).toEqual(["trip", "lab"]);
    expect(eventsOn([allDay], "2026-11-06")).toHaveLength(1);
    expect(eventsOn([allDay], "2026-11-07")).toHaveLength(0);
  });
  it("caps a day's marks at three", () => {
    expect(dayDensity([], { questsCount: 9 } as never, "2026-11-05")).toBe(3);
    expect(dayDensity([], undefined, "2026-11-05")).toBe(0);
  });
});

describe("Plan's quests", () => {
  it("calls an open quest overdue only once its day has passed", () => {
    expect(questOverdue({ status: "ACTIVE" }, "2026-11-01", "2026-11-02")).toBe(true);
    expect(questOverdue({ status: "ACTIVE" }, "2026-11-02", "2026-11-02")).toBe(false);
    expect(questOverdue({ status: "COMPLETED" }, "2026-11-01", "2026-11-02")).toBe(false);
    expect(questOverdue({ status: "FAILED" }, "2026-11-01", "2026-11-02")).toBe(false);
  });
});

describe("Plan's forms", () => {
  it("makes a code from a name, unique against what exists", () => {
    expect(subjectCode("Further Maths", [])).toBe("FURTHERM");
    expect(subjectCode("Further Maths", ["furtherm"])).toBe("FURTHE2");
    expect(subjectCode("数学", [])).toBe("SUBJECT");
  });
  it("accepts a 24-hour time and a real date", () => {
    expect(validTime("14:30")).toBe(true);
    expect(validTime("9:05")).toBe(true);
    expect(validTime("25:00")).toBe(false);
    expect(validDay("2026-11-05")).toBe(true);
    expect(validDay("soon")).toBe(false);
  });
});
