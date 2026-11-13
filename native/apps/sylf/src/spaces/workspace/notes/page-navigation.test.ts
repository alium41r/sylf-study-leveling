import { describe, expect, it } from "vitest";
import { pageAt, pageOffset } from "./page-navigation";

const rows = [
  { top: 20, left: 0, width: 400, height: 550 },
  { top: 590, left: 0, width: 400, height: 550 },
  { top: 1160, left: 0, width: 400, height: 150 },
];

describe("note page navigation", () => {
  it("keeps the last page selected in the pull area below a short page", () => {
    expect(pageAt(rows, 1120, 450)).toBe(2);
    expect(pageAt(rows, 1312, 300)).toBe(2);
  });

  it("uses the next page when the reading point falls in a gap", () => {
    expect(pageAt(rows, 480, 300)).toBe(1);
    expect(pageAt([], 0, 300)).toBe(0);
  });

  it("aligns the selected page where possible and clamps the last page to the end", () => {
    expect(pageOffset(rows[1], 20, 1530, 450)).toBe(570);
    expect(pageOffset(rows[2], 20, 1530, 450)).toBe(1080);
    expect(pageOffset(rows[0], 20, 580, 600)).toBe(0);
  });
});
