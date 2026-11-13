import { describe, expect, it } from "vitest";
import { gutterCentre, hubOffset } from "./todayLayout";

describe("where the dashboard's hub sits", () => {
  it("is centred on the page when no meeting point is given", () => {
    expect(hubOffset(undefined, 700)).toBe(0);
  });
  it("is centred on the gutter between the columns of the grid", () => {
    // 1200 wide, a 48 gutter, columns 6 to 5: the gutter's middle is 652 from the left.
    const width = 1200;
    const centre = gutterCentre(width, { left: 6, right: 5, gap: 48 });
    expect(centre).toBeCloseTo(652.4, 1);
    const margin = hubOffset(centre, width);
    expect((margin + width) / 2).toBeCloseTo(centre, 0);
  });
  it("never pushes left of the page", () => {
    expect(hubOffset(100, 1200)).toBe(0);
  });
});
