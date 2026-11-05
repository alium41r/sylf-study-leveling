import { describe, expect, it } from "vitest";
import { dayWords } from "./ahead";

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
