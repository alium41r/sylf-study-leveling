import { describe, expect, it } from "vitest";
import {
  eventInputSchema,
  noteInputSchema,
  validDateKey,
  type CalendarEvent,
} from "@/lib/calendar/contracts";
import {
  addDays,
  eventsOnDate,
  localTimeToISO,
  monthDates,
  shiftMonth,
  weekStart,
} from "@/lib/calendar/dates";

const event = {
  title: "Seminar",
  description: "",
  color: "BLUE" as const,
  allDay: false,
  startDate: "2026-10-18",
  endDate: "2026-10-18",
  startsAt: "2026-10-18T04:00:00.000Z",
  endsAt: "2026-10-18T05:00:00.000Z",
  timezone: "Asia/Karachi",
};
const stored = (data: Partial<CalendarEvent> = {}): CalendarEvent => ({
  ...event,
  id: "event",
  revision: 1,
  createdAt: "",
  updatedAt: "",
  ...data,
});
describe("personal calendar civil dates and timezones", () => {
  it("rejects invalid dates rather than normalizing them", () => {
    for (const value of [
      "2026-02-29",
      "2026-13-01",
      "2026-99-99",
      "bad",
      "1999-12-31",
    ])
      expect(validDateKey(value)).toBe(false);
    expect(validDateKey("2028-02-29")).toBe(true);
  });
  it("navigates leap days, year boundaries, and clamps short months", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(weekStart("2027-01-01")).toBe("2026-12-27");
    expect(monthDates("2026-10-18")).toHaveLength(35);
    expect(monthDates("2026-05-01")).toHaveLength(42);
  });
  it("resolves fractional offsets and changes in daylight saving time", () => {
    expect(localTimeToISO("2026-10-18", "09:00", "Asia/Karachi")).toBe(
      "2026-10-18T04:00:00.000Z"
    );
    expect(localTimeToISO("2026-10-18", "09:00", "Asia/Kathmandu")).toBe(
      "2026-10-18T03:15:00.000Z"
    );
    expect(localTimeToISO("2026-03-08", "03:30", "America/New_York")).toBe(
      "2026-03-08T07:30:00.000Z"
    );
    expect(() =>
      localTimeToISO("2026-03-08", "02:30", "America/New_York")
    ).toThrow("does not exist");
    expect(localTimeToISO("2026-11-01", "01:30", "America/New_York")).toBe(
      "2026-11-01T05:30:00.000Z"
    );
  });
  it("projects overnight events in the viewer zone, with exclusive midnight ends", () => {
    const overnight = stored({
      startsAt: "2026-10-18T18:30:00Z",
      endsAt: "2026-10-18T20:00:00Z",
    });
    expect(
      eventsOnDate([overnight], "2026-10-18", "Asia/Karachi")
    ).toHaveLength(1);
    expect(
      eventsOnDate([overnight], "2026-10-19", "Asia/Karachi")
    ).toHaveLength(1);
    const midnight = stored({
      startsAt: "2026-10-18T18:30:00Z",
      endsAt: "2026-10-18T19:00:00Z",
    });
    expect(eventsOnDate([midnight], "2026-10-19", "Asia/Karachi")).toHaveLength(
      0
    );
    const allDay = stored({
      allDay: true,
      startsAt: null,
      endsAt: null,
      startDate: "2026-10-18",
      endDate: "2026-10-20",
    });
    expect(
      eventsOnDate([allDay], "2026-10-19", "Pacific/Honolulu")
    ).toHaveLength(1);
    expect(
      eventsOnDate([allDay], "2026-10-20", "Pacific/Auckland")
    ).toHaveLength(0);
  });
});
describe("personal calendar input boundary", () => {
  it("validates actual time order, zone, date consistency and unknown fields", () => {
    expect(eventInputSchema.safeParse(event).success).toBe(true);
    expect(
      eventInputSchema.safeParse({
        ...event,
        startsAt: "2026-10-18T04:00:00.000Z",
        endsAt: "2026-10-18T04:00:00Z",
      }).success
    ).toBe(false);
    for (const patch of [
      { title: " " },
      { endsAt: event.startsAt },
      { timezone: "fake/zone" },
      { startDate: "2026-10-17" },
      { userId: 7 },
    ])
      expect(eventInputSchema.safeParse({ ...event, ...patch }).success).toBe(
        false
      );
  });
  it("accepts date-only all-day spans and multiple independently identified notes", () => {
    expect(
      eventInputSchema.safeParse({
        ...event,
        allDay: true,
        startsAt: null,
        endsAt: null,
        endDate: "2026-10-19",
      }).success
    ).toBe(true);
    expect(
      noteInputSchema.safeParse({
        dateKey: "2026-10-18",
        title: "",
        document: { version: 1, text: "<script>plain text only</script>" },
      }).success
    ).toBe(true);
    expect(
      noteInputSchema.safeParse({
        dateKey: "2026-10-18",
        title: "",
        document: { version: 2, ink: [] },
      }).success
    ).toBe(false);
  });
});
