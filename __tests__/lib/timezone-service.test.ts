import { describe, it, expect } from "vitest";
import { TimezoneService } from "../../lib/timezone-service";

describe("TimezoneService", () => {
  describe("Validation & Timezone List", () => {
    it("validates standard IANA timezones correctly", () => {
      expect(TimezoneService.validateTimezone("UTC")).toBe(true);
      expect(TimezoneService.validateTimezone("America/New_York")).toBe(true);
      expect(TimezoneService.validateTimezone("Asia/Tokyo")).toBe(true);
      expect(TimezoneService.validateTimezone("Europe/London")).toBe(true);
      expect(TimezoneService.validateTimezone("Asia/Karachi")).toBe(true);
      expect(TimezoneService.validateTimezone("Asia/Kolkata")).toBe(true);

      // Invalid
      expect(TimezoneService.validateTimezone("")).toBe(false);
      expect(TimezoneService.validateTimezone("Invalid/Zone")).toBe(false);
      expect(TimezoneService.validateTimezone("Mars/Curiosity")).toBe(false);
      expect(TimezoneService.validateTimezone(null as any)).toBe(false);
    });

    it("generates a formatted list of curated timezones with UTC offsets", () => {
      const list = TimezoneService.getTimezoneList();
      expect(list.length).toBeGreaterThan(15);
      
      const ny = list.find(t => t.value === "America/New_York");
      expect(ny).toBeDefined();
      expect(ny?.region).toBe("Americas");
      expect(ny?.offset).toMatch(/^UTC[+-]\d{2}(:\d{2})?$/);

      const tokyo = list.find(t => t.value === "Asia/Tokyo");
      expect(tokyo).toBeDefined();
      expect(tokyo?.region).toBe("Asia");
      expect(tokyo?.offset).toMatch(/^UTC\+09(:00)?$/);
    });
  });

  describe("Midnight Boundaries & Offsets", () => {
    it("handles UTC vs Local midnight correctly (Asia/Karachi is UTC+5)", () => {
      // 23:00 UTC on Aug 8 is 04:00 Local on Aug 9
      const d1 = new Date("2026-08-08T23:00:00Z");
      expect(TimezoneService.getUserLocalDate("Asia/Karachi", d1)).toBe("2026-08-09");
      expect(TimezoneService.getUserLocalTime("Asia/Karachi", d1)).toBe("04:00");
      expect(TimezoneService.getUserDayOfWeek("Asia/Karachi", "2026-08-09")).toBe("Sunday");

      // 19:00 UTC on Aug 8 is 00:00 Local on Aug 9
      const midnight = new Date("2026-08-08T19:00:00Z");
      expect(TimezoneService.getUserLocalDate("Asia/Karachi", midnight)).toBe("2026-08-09");
      expect(TimezoneService.getUserLocalTime("Asia/Karachi", midnight)).toBe("00:00");
    });

    it("handles explicit date offset logic safely", () => {
      const baseNow = new Date("2026-08-08T15:00:00Z"); // 20:00 Local Karachi
      // Today offset = 0 -> 2026-08-08
      expect(TimezoneService.getUserLocalDateOffset("Asia/Karachi", 0, baseNow)).toBe("2026-08-08");
      // Tomorrow offset = 1 -> 2026-08-09
      expect(TimezoneService.getUserLocalDateOffset("Asia/Karachi", 1, baseNow)).toBe("2026-08-09");
      // Yesterday offset = -1 -> 2026-08-07
      expect(TimezoneService.getUserLocalDateOffset("Asia/Karachi", -1, baseNow)).toBe("2026-08-07");
    });

    it("calculates exact start of day UTC correctly", () => {
      // For Asia/Karachi (UTC+5), local midnight of Aug 9 is 19:00 UTC on Aug 8
      const d1 = new Date("2026-08-08T23:00:00Z"); // 04:00 local time
      const startOfDayPK = TimezoneService.getStartOfDayUTC("Asia/Karachi", d1);
      expect(startOfDayPK.toISOString()).toBe("2026-08-08T19:00:00.000Z");

      // For America/New_York (UTC-4 in summer), local midnight of Aug 9 is 04:00 UTC on Aug 9
      const d2 = new Date("2026-08-09T10:00:00Z"); // 06:00 local time
      const startOfDayNY = TimezoneService.getStartOfDayUTC("America/New_York", d2);
      expect(startOfDayNY.toISOString()).toBe("2026-08-09T04:00:00.000Z");
    });

    it("calculates next midnight and end of day UTC precisely", () => {
      // For Asia/Tokyo (UTC+9, no DST):
      // On Aug 15, 2026 at 15:00 JST (06:00 UTC):
      const jstNow = new Date("2026-08-15T06:00:00Z"); // 15:00 JST
      const startOfDay = TimezoneService.getStartOfDayUTC("Asia/Tokyo", jstNow);
      expect(startOfDay.toISOString()).toBe("2026-08-14T15:00:00.000Z"); // Tokyo midnight = 15:00 UTC previous day

      const nextMidnight = TimezoneService.getNextMidnightUTC("Asia/Tokyo", jstNow);
      expect(nextMidnight.toISOString()).toBe("2026-08-15T15:00:00.000Z"); // Next Tokyo midnight = 15:00 UTC today

      const endOfDay = TimezoneService.getEndOfDayUTC("Asia/Tokyo", jstNow);
      expect(endOfDay.toISOString()).toBe("2026-08-15T14:59:59.999Z");
    });
  });

  describe("DST (Daylight Saving Time) Handling", () => {
    it("handles DST transitions properly for America/New_York", () => {
      // In 2026, NY enters DST on March 8, 2:00 AM (EST -> EDT)
      // EST is UTC-5, EDT is UTC-4.
      
      // March 7, 2026 12:00 UTC = 07:00 EST (UTC-5)
      const winterDate = new Date("2026-03-07T12:00:00Z");
      expect(TimezoneService.getUserLocalDate("America/New_York", winterDate)).toBe("2026-03-07");
      expect(TimezoneService.getUserLocalTime("America/New_York", winterDate)).toBe("07:00");
      
      // July 15, 2026 12:00 UTC = 08:00 EDT (UTC-4)
      const summerDate = new Date("2026-07-15T12:00:00Z");
      expect(TimezoneService.getUserLocalDate("America/New_York", summerDate)).toBe("2026-07-15");
      expect(TimezoneService.getUserLocalTime("America/New_York", summerDate)).toBe("08:00");
    });
  });

  describe("Fallback Behavior", () => {
    it("falls back to UTC when provided an invalid timezone", () => {
      const d = new Date("2026-08-08T20:00:00Z");
      // "Invalid/Timezone" should fallback to UTC without crashing
      expect(TimezoneService.getUserLocalDate("Invalid/Timezone", d)).toBe("2026-08-08");
      expect(TimezoneService.getUserLocalTime("Invalid/Timezone", d)).toBe("20:00");
    });
  });
});
