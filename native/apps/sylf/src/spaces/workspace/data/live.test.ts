import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@sylf/backend";
import { localDay } from "../../home/data/live";
import { LIMITED_TOOLS, mapCalendar, mapPlanner, monthRange } from "./live";

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({ id: "e", title: "Event", allDay: false, startDate: "2026-11-02", endDate: "2026-11-02", startsAt: null, endsAt: null, ...overrides });

describe("Calendar", () => {
  it("places a timed event on its local day", () => {
    const start = new Date(2026, 10, 2, 14, 30);
    const [entry] = mapCalendar([event({ startsAt: start.toISOString(), endsAt: new Date(2026, 10, 2, 15).toISOString() })]);
    expect(entry.day).toBe(localDay(start));
  });
  it("treats an all-day event's end as exclusive, as the Calendar contract does", () => {
    expect(mapCalendar([event({ allDay: true, startDate: "2026-11-02", endDate: "2026-11-04" })]).map((entry) => entry.day)).toEqual(["2026-11-02", "2026-11-03"]);
  });
  it("reads one month, with an exclusive end", () => {
    expect(monthRange(new Date(2026, 10, 15))).toEqual({ start: "2026-11-01", end: "2026-12-01" });
    expect(monthRange(new Date(2026, 11, 15))).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
});

describe("Planner", () => {
  it("lists open quests first, keeps what completing one needs, and reads goals as they are", () => {
    const quests = [{ id: 1, title: "Done", status: "COMPLETED", scheduledFor: null, subjectId: null }, { id: 2, title: "Open", status: "PENDING", scheduledFor: null, subjectId: 3, plannedMinutes: 25, executionVersion: 4, subject: { id: 3, name: "Physics" } }];
    const view = mapPlanner([], quests, [{ id: 8, title: "Exam", status: "ACTIVE", quests: [{ id: 1, status: "COMPLETED" }, { id: 2, status: "PENDING" }] }], new Date(2026, 10, 2));
    expect(view.objectives.map((item) => item.title)).toEqual(["Open", "Done"]);
    expect(view.objectives[0]).toMatchObject({ detail: "Physics, 25 min", completion: { id: 2, plannedMinutes: 25, executionVersion: 4 } });
    expect(view.goals).toEqual([{ id: "8", title: "Exam", detail: "1 of 2 quests done" }]);
  });
});

describe("Tools later work owns", () => {
  it("are limited, with no data and no sample", () => {
    for (const view of ["notes", "pdfs", "boards", "resources"] as const) {
      expect(LIMITED_TOOLS[view]).toMatchObject({ provenance: "live", data: null });
      expect(LIMITED_TOOLS[view]?.limited).toBeTruthy();
    }
  });
});
