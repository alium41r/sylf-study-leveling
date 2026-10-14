import { describe, expect, it } from "vitest";
import {
  createPixGeometry,
  isValidGridSize,
  pointAt,
} from "@/lib/pixel-display/engine/geometry";

describe("logical geometry", () => {
  it("carries dimensions, cell count and byte length", () => {
    const geometry = createPixGeometry(48, 48);
    expect(geometry.width).toBe(48);
    expect(geometry.height).toBe(48);
    expect(geometry.cellCount).toBe(2304);
    expect(geometry.byteLength).toBe(2304 * 4);
  });

  it("supports non-square and single-cell grids", () => {
    expect(createPixGeometry(1, 1).cellCount).toBe(1);
    expect(createPixGeometry(16, 9).byteLength).toBe(16 * 9 * 4);
  });

  it.each([
    [0, 48],
    [48, 0],
    [-1, 48],
    [48, -1],
    [1.5, 48],
    [48, 2.5],
    [Number.NaN, 48],
    [Number.POSITIVE_INFINITY, 48],
  ])("rejects invalid dimensions %s x %s", (width, height) => {
    expect(isValidGridSize(width, height)).toBe(false);
    expect(() => createPixGeometry(width, height)).toThrow(RangeError);
  });

  it("accepts positive integer dimensions", () => {
    expect(isValidGridSize(1, 1)).toBe(true);
    expect(isValidGridSize(64, 64)).toBe(true);
  });

  describe("bounds", () => {
    const geometry = createPixGeometry(8, 4);

    it("contains only real cells", () => {
      expect(geometry.contains(0, 0)).toBe(true);
      expect(geometry.contains(7, 3)).toBe(true);
      expect(geometry.contains(8, 0)).toBe(false);
      expect(geometry.contains(0, 4)).toBe(false);
      expect(geometry.contains(-1, 0)).toBe(false);
      expect(geometry.contains(0, -1)).toBe(false);
    });

    it("rejects non-integer coordinates", () => {
      expect(geometry.contains(1.5, 1)).toBe(false);
      expect(geometry.contains(1, 1.5)).toBe(false);
      expect(geometry.contains(Number.NaN, 1)).toBe(false);
    });
  });

  describe("indexing", () => {
    it("is row-major from the top-left origin", () => {
      const geometry = createPixGeometry(4, 3);
      expect(geometry.indexOf(0, 0)).toBe(0);
      expect(geometry.indexOf(1, 0)).toBe(4);
      expect(geometry.indexOf(0, 1)).toBe(4 * 4);
      expect(geometry.indexOf(3, 2)).toBe((2 * 4 + 3) * 4);
    });

    it("round-trips through pointAt", () => {
      const geometry = createPixGeometry(7, 5);
      for (let y = 0; y < geometry.height; y += 1) {
        for (let x = 0; x < geometry.width; x += 1) {
          expect(pointAt(geometry, geometry.indexOf(x, y))).toEqual({ x, y });
        }
      }
    });

    it("keeps the last byte of the buffer addressable", () => {
      const geometry = createPixGeometry(6, 6);
      const last = geometry.indexOf(5, 5);
      expect(last + 3).toBe(geometry.byteLength - 1);
    });
  });
});
