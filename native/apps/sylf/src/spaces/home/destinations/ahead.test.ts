import { describe, expect, it } from "vitest";
import { dayWords, upcomingQuests } from "./ahead";

describe("dayWords", () => {
  const now = new Date(2026, 10, 5, 9, 0, 0); // Thursday 5 November
  it("says Today and Tomorrow, then the weekday, then the date", () => {
    expect(dayWords("2026-11-05", now)).toBe("Today");
    expect(dayWords("2026-11-06", now)).toBe("Tomorrow");
    expect(dayWords("2026-11-09", now)).toBe(new Date(2026, 10, 9).toLocaleDateString([], { weekday: "long" }));
    expect(dayWords("2026-11-20", now)).toBe(new Date(2026, 10, 20).toLocaleDateString([], { day: "numeric", month: "short" }));
  });
  it("never says a past day is in the future", () => {
    expect(dayWords("2026-11-01", now)).toBe("Today");
  });
});

describe("upcomingQuests", () => {
  const now = new Date(2026, 10, 5, 9, 0, 0);
  const quest = (id: number, scheduledFor: string | null, status = "PENDING") => ({ id, scheduledFor, status });
  it("keeps open quests after today and within a week, soonest first", () => {
    const quests = [quest(1, "2026-11-05"), quest(2, "2026-11-09"), quest(3, "2026-11-06"), quest(4, "2026-11-13"), quest(5, null), quest(6, "2026-11-07", "COMPLETED"), quest(7, "2026-11-12T00:00:00.000Z")];
    expect(upcomingQuests(quests, now).map((item) => item.id)).toEqual([3, 2, 7]);
  });
  it("stops at its limit", () => {
    expect(upcomingQuests([quest(1, "2026-11-06"), quest(2, "2026-11-07"), quest(3, "2026-11-08")], now, 2).map((item) => item.id)).toEqual([1, 2]);
  });
});
