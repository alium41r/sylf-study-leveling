import { describe, expect, it } from "vitest";
import { ringNumber } from "./todayRing";

describe("ringNumber", () => {
  it("counts minutes below an hour", () => {
    expect(ringNumber(0)).toEqual({ value: "0", unit: "min" });
    expect(ringNumber(47.4)).toEqual({ value: "47", unit: "min" });
    expect(ringNumber(-5)).toEqual({ value: "0", unit: "min" });
  });
  it("counts hours from an hour on, with one decimal only when it says something", () => {
    expect(ringNumber(60)).toEqual({ value: "1", unit: "hr" });
    expect(ringNumber(72)).toEqual({ value: "1.2", unit: "hr" });
    expect(ringNumber(600)).toEqual({ value: "10", unit: "hr" });
  });
});
