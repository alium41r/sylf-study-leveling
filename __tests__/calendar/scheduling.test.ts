import { describe, it, expect } from "vitest";
import { eventTime } from "@/lib/calendar/dates";
import {
  recurrenceDates,
  expandEvent,
  occurrenceInput,
} from "@/lib/calendar/recurrence";
import { parseQuickEvent } from "@/lib/calendar/quick-add";
import {
  dayWorkload,
  eventFields,
  moveEvent,
  timelineSegments,
} from "@/lib/calendar/scheduling";
import { eventInputSchema, type CalendarEvent } from "@/lib/calendar/contracts";
import { dueReminders } from "@/lib/calendar/reminder-service";
import {
  defaultCalendarPreferences,
  preferencesSchema,
} from "@/lib/calendar/preferences";

const event: CalendarEvent = {
  id: "548335cf-214b-41d5-a234-58b629929423",
  title: "Seminar",
  description: "",
  color: "BLUE",
  category: "personal",
  allDay: false,
  startDate: "2026-03-01",
  endDate: "2026-03-01",
  startsAt: "2026-03-01T14:00:00.000Z",
  endsAt: "2026-03-01T15:00:00.000Z",
  timezone: "America/New_York",
  revision: 1,
  createdAt: "",
  updatedAt: "",
};
const weekly = {
  frequency: "weekly" as const,
  interval: 1,
  weekdays: [0],
  until: null,
  count: null,
};
describe("civil recurring schedules", () => {
  it("keeps local start/end times across DST and preserves the seed instant", () => {
    const series = { ...event, recurrence: weekly };
    const output = expandEvent(
      series,
      [],
      "2026-03-01",
      "2026-03-16",
      "America/New_York"
    );
    expect(output.map((item) => item.startsAt)).toEqual([
      "2026-03-01T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-15T13:00:00.000Z",
    ]);
    expect(output[1].occurrenceDate).toBe("2026-03-08");
    const lateFold = {
      ...event,
      startDate: "2026-11-01",
      endDate: "2026-11-01",
      startsAt: "2026-11-01T06:30:00.000Z",
      endsAt: "2026-11-01T07:30:00.000Z",
    };
    expect(occurrenceInput(lateFold, lateFold.startDate)?.startsAt).toBe(
      lateFold.startsAt
    );
  });
  it("skips nonexistent wall times and deterministically resolves repeated ones", () => {
    const gap = {
      ...event,
      startsAt: "2026-03-01T07:30:00Z",
      endsAt: "2026-03-01T08:30:00Z",
    };
    expect(occurrenceInput(gap, "2026-03-08")).toBeNull();
    expect(
      occurrenceInput(
        { ...gap, startsAt: "2026-03-01T06:30:00Z" },
        "2026-11-01"
      )?.startsAt
    ).toBe("2026-11-01T05:30:00.000Z");
  });
  it("supports intervals, selected weekdays, inclusive endings and occurrence counts", () => {
    expect(
      recurrenceDates(
        "2026-10-19",
        { ...weekly, interval: 2, weekdays: [1, 3], count: 4 },
        "2026-10-01",
        "2026-12-01"
      )
    ).toEqual(["2026-10-19", "2026-10-21", "2026-11-02", "2026-11-04"]);
    expect(
      recurrenceDates(
        "2026-10-18",
        { ...weekly, until: "2026-11-01" },
        "2026-10-01",
        "2026-12-01"
      )
    ).toEqual(["2026-10-18", "2026-10-25", "2026-11-01"]);
  });
  it("handles month ends, last weekdays and leap years without drifting", () => {
    const rule = {
      frequency: "monthly" as const,
      interval: 1,
      until: null,
      count: 3,
    };
    expect(
      recurrenceDates("2026-01-31", rule, "2026-01-01", "2026-06-01")
    ).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
    expect(
      recurrenceDates(
        "2026-01-30",
        { ...rule, monthly: "weekday" },
        "2026-01-01",
        "2026-04-01"
      )
    ).toEqual(["2026-01-30", "2026-02-27", "2026-03-27"]);
    expect(
      recurrenceDates(
        "2028-02-29",
        { ...rule, frequency: "yearly", count: 2 },
        "2028-01-01",
        "2034-01-01"
      )
    ).toEqual(["2028-02-29", "2032-02-29"]);
  });
  it("includes moved-in exceptions, removes cancelled dates and retains occurrence identity", () => {
    const output = expandEvent(
      { ...event, recurrence: weekly },
      [
        { originalDate: "2026-03-08", cancelled: true, data: null },
        {
          originalDate: "2026-06-07",
          cancelled: false,
          data: {
            ...eventFields(event),
            startDate: "2026-03-10",
            endDate: "2026-03-10",
            startsAt: "2026-03-10T14:00:00Z",
            endsAt: "2026-03-10T15:00:00Z",
          },
        },
      ],
      "2026-03-07",
      "2026-03-12",
      "America/New_York"
    );
    expect(output).toHaveLength(1);
    expect(output[0].occurrenceDate).toBe("2026-06-07");
  });
  it("validates advanced input and rejects duplicate reminders and invalid series starts", () => {
    expect(
      eventInputSchema.safeParse({
        ...eventFields(event),
        recurrence: { ...weekly, weekdays: [1] },
      }).success
    ).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...eventFields(event), reminders: [0, 0] })
        .success
    ).toBe(false);
    expect(
      eventInputSchema.safeParse({
        ...eventFields(event),
        recurrence: { ...weekly, until: "2026-02-30" },
      }).success
    ).toBe(false);
  });
});
describe("reviewable quick add", () => {
  it("understands the requested examples without AI", () => {
    const parse = (text: string) =>
      parseQuickEvent(text, "2026-10-18", "2026-10-18", "Asia/Karachi");
    expect(parse("Physics exam tomorrow at 10 AM").data).toMatchObject({
      title: "Physics exam",
      startDate: "2026-10-19",
      startsAt: "2026-10-19T05:00:00.000Z",
      allDay: false,
    });
    expect(parse("Math revision every Monday at 5 PM").data).toMatchObject({
      title: "Math revision",
      startDate: "2026-10-19",
      recurrence: { frequency: "weekly", weekdays: [1] },
      startsAt: "2026-10-19T12:00:00.000Z",
    });
    expect(parse("Dentist appointment next Friday").data).toMatchObject({
      title: "Dentist appointment",
      startDate: "2026-10-23",
      allDay: true,
    });
  });
  it("supports durations/overnight, explicit dates, weekdays and exposes uncertain/default interpretations", () => {
    const parse = (text: string) =>
      parseQuickEvent(text, "2026-10-18", "2026-11-02", "UTC");
    expect(
      parse("Write on 2026-12-31 at 23:30 for 90 minutes").data
    ).toMatchObject({
      endDate: "2027-01-01",
      endsAt: "2027-01-01T01:00:00.000Z",
    });
    expect(
      parse("Practice every weekdays at 9 AM").data.recurrence?.weekdays
    ).toEqual([1, 2, 3, 4, 5]);
    expect(parse("Lunch at 5").hints.join(" ")).toContain("AM");
    expect(parse("Walk next week").hints.join(" ")).toContain("not understood");
    expect(() => parse("Exam at 25:00")).toThrow();
  });
});
describe("time planning and reminders", () => {
  const make = (id: string, start: string, end: string) => ({
    ...event,
    id,
    timezone: "UTC",
    startsAt: `2026-03-01T${start}:00Z`,
    endsAt: `2026-03-01T${end}:00Z`,
  });
  it("separates overlap lanes and counts busy time once", () => {
    const list = [
      make("a", "09:00", "11:00"),
      make("b", "10:00", "12:00"),
      make("c", "12:00", "13:00"),
    ];
    const segments = timelineSegments(list, "2026-03-01", "UTC");
    expect(segments.map((item) => item.lanes)).toEqual([2, 2, 1]);
    expect(segments.map((item) => item.overlap)).toEqual([true, true, false]);
    expect(dayWorkload(list, "2026-03-01", "UTC")).toMatchObject({
      busy: 240,
      free: 480,
      conflicts: 2,
      largest: { start: 780, end: 1200 },
    });
  });
  it("converts viewer-zone drops back to the original event zone and rejects reverse resizing", () => {
    expect(moveEvent(event, "2026-03-10", 600, "Asia/Karachi")).toMatchObject({
      startsAt: "2026-03-10T05:00:00.000Z",
      startDate: "2026-03-10",
      endsAt: "2026-03-10T06:00:00.000Z",
      timezone: "America/New_York",
    });
    expect(() => moveEvent(event, "2026-03-01", 60, "UTC", true)).toThrow(
      "after"
    );
  });
  it("collapses due offsets after wake, bounds catch-up, and respects all-day event zones", () => {
    const now = Date.parse(event.startsAt!);
    const due = dueReminders([{ ...event, reminders: [0, 1, 3, 15] }], now);
    expect(due[0].due.map((item) => item.minutes)).toEqual([0, 1, 3]);
    expect(
      dueReminders([{ ...event, reminders: [0] }], now + 6 * 60000)
    ).toEqual([]);
    expect(
      dueReminders(
        [
          {
            ...event,
            allDay: true,
            startsAt: null,
            endsAt: null,
            endDate: "2026-03-02",
            reminders: [0],
          },
        ],
        Date.parse("2026-03-01T05:00:00Z")
      )
    ).toHaveLength(1);
  });
  it("keeps advanced presentation off by default without disabling schedules", () => {
    expect(preferencesSchema.parse(defaultCalendarPreferences)).toMatchObject({
      timePlanning: false,
      workload: false,
      organization: false,
      detailedEvents: false,
    });
    expect(
      Object.values(defaultCalendarPreferences.filters).every(Boolean)
    ).toBe(true);
  });
});

describe("series and clock-change preservation", () => {
  it("retains stored exception edits without projecting dates outside the current rule", () => {
    const seed = { ...event, recurrence: { ...weekly, count: 1 } };
    const exception = {
      originalDate: "2026-06-07",
      cancelled: false,
      data: {
        ...eventFields(event),
        startDate: "2026-03-10",
        endDate: "2026-03-10",
        startsAt: "2026-03-10T14:00:00Z",
        endsAt: "2026-03-10T15:00:00Z",
      },
    };
    expect(
      expandEvent(
        seed,
        [exception],
        "2026-03-07",
        "2026-03-12",
        "America/New_York"
      )
    ).toEqual([]);
    expect(
      expandEvent(
        { ...seed, recurrence: weekly },
        [exception],
        "2026-03-07",
        "2026-03-12",
        "America/New_York"
      ).some((item) => item.occurrenceDate === "2026-06-07")
    ).toBe(true);
  });
  it("keeps a commitment crossing the repeated hour visible and labels both offsets", () => {
    const folded = {
      ...event,
      startDate: "2026-11-01",
      endDate: "2026-11-01",
      startsAt: "2026-11-01T05:45:00Z",
      endsAt: "2026-11-01T06:15:00Z",
    };
    const segment = timelineSegments(
      [folded],
      "2026-11-01",
      "America/New_York"
    )[0];
    expect(segment.end - segment.start).toBe(30);
    expect(eventTime(folded, "America/New_York")).toContain("GMT-4");
    expect(eventTime(folded, "America/New_York")).toContain("GMT-5");
  });
});
