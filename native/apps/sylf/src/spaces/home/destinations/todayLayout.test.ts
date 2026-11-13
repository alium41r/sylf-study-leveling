import { describe, expect, it } from "vitest";
import { GRID_MIN, PAIRED_MIN, islandBox, todayLayout } from "./todayLayout";

describe("the dashboard's layout", () => {
  it("is a two by two grid on a desktop, a pair then a column on a portrait tablet, and one column on a phone", () => {
    // Content widths: 1440 and 1280 windows, an 820 and a 744 tablet in portrait, a 390 phone.
    expect([1200, 1164, 696, 620, 358].map(todayLayout)).toEqual(["grid", "grid", "paired", "paired", "stack"]);
    expect(todayLayout(GRID_MIN)).toBe("grid");
    expect(todayLayout(GRID_MIN - 1)).toBe("paired");
    expect(todayLayout(PAIRED_MIN - 1)).toBe("stack");
    expect(todayLayout(0)).toBe("stack");
  });

  it("gives the island a box that fits its column", () => {
    for (const width of [880, 1000, 1164, 1200]) {
      const box = islandBox("grid", width, 48);
      expect(box.width).toBeLessThan(width / 2);
      expect(box.height).toBeGreaterThanOrEqual(260);
      expect(box.height).toBeLessThanOrEqual(400);
    }
    for (const width of [560, 620, 696, 879]) {
      const box = islandBox("paired", width, 24);
      expect(width - box.width - 24).toBeGreaterThanOrEqual(300);
      expect(box.height).toBeGreaterThanOrEqual(150);
    }
    for (const width of [0, 280, 358, 559]) {
      const box = islandBox("stack", width, 16);
      expect(box.width).toBe(width);
      expect(box.height).toBeGreaterThanOrEqual(150);
      expect(box.height).toBeLessThanOrEqual(220);
    }
  });
});
