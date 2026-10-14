import { describe, expect, it } from "vitest";
import { createPixDisplay } from "@/lib/pixel-display/engine/display";
import { createFramebuffer } from "@/lib/pixel-display/engine/framebuffer";
import { packRgba, TRANSPARENT } from "@/lib/pixel-display/engine/color";

const GREEN = packRgba(0x43, 0xe1, 0xb0, 0xff);
const WHITE = packRgba(0xdc, 0xeb, 0xfd, 0xff);

describe("pixel display", () => {
  describe("deterministic out-of-bounds writes (roadmap [C4])", () => {
    // Out-of-bounds writes must be refused outright. Clamping would silently
    // paint a neighbouring cell, and wrapping would corrupt a distant row.
    const outsideCases: Array<[string, number, number]> = [
      ["negative x", -1, 0],
      ["negative y", 0, -1],
      ["just past the right edge", 8, 0],
      ["just past the bottom edge", 0, 8],
      ["far outside", 10_000, 10_000],
      ["negative far outside", -10_000, -10_000],
      ["mixed", -1, 8],
    ];

    it.each(outsideCases)(
      "leaves the framebuffer byte-identical for %s",
      (_label, x, y) => {
        const display = createPixDisplay(8, 8);
        display.setPixel(3, 3, GREEN);
        const before = display.framebuffer.toBytes();

        const wrote = display.setPixel(x, y, WHITE);

        expect(wrote).toBe(false);
        expect(display.framebuffer.toBytes()).toEqual(before);
        expect(display.litCount()).toBe(1);
      },
    );

    it("never wraps a stray column into the next row", () => {
      const display = createPixDisplay(4, 4);
      // (4, 0) would be index 16 in a wrapping implementation: cell (0, 1).
      expect(display.setPixel(4, 0, GREEN)).toBe(false);
      expect(display.getPixel(0, 1)).toBe(TRANSPARENT);
      expect(display.litCount()).toBe(0);
    });

    it("never clamps onto the nearest edge cell", () => {
      const display = createPixDisplay(4, 4);
      expect(display.setPixel(4, 2, GREEN)).toBe(false);
      expect(display.getPixel(3, 2)).toBe(TRANSPARENT);
      expect(display.getPixel(1, 2)).toBe(TRANSPARENT);
      expect(display.litCount()).toBe(0);
    });

    it("does not throw for non-finite or fractional coordinates", () => {
      const display = createPixDisplay(4, 4);
      expect(() => display.setPixel(Number.NaN, 0, GREEN)).not.toThrow();
      expect(() => display.setPixel(0, Number.POSITIVE_INFINITY, GREEN)).not.toThrow();
      expect(() => display.setPixel(1.5, 1, GREEN)).not.toThrow();
      expect(display.litCount()).toBe(0);
    });

    it("writes both in-bounds corners and refuses the cell just beyond each", () => {
      const display = createPixDisplay(6, 4);
      expect(display.setPixel(0, 0, GREEN)).toBe(true);
      expect(display.setPixel(5, 3, WHITE)).toBe(true);
      expect(display.setPixel(6, 3, GREEN)).toBe(false);
      expect(display.setPixel(5, 4, GREEN)).toBe(false);
      expect(display.getPixel(0, 0)).toBe(GREEN);
      expect(display.getPixel(5, 3)).toBe(WHITE);
      expect(display.litCount()).toBe(2);
    });

    it("returns the off color for out-of-bounds reads", () => {
      const display = createPixDisplay(4, 4);
      display.fill(GREEN);
      expect(display.getPixel(-1, -1)).toBe(TRANSPARENT);
      expect(display.getPixel(4, 4)).toBe(TRANSPARENT);
      expect(display.getPixel(Number.NaN, 0)).toBe(TRANSPARENT);
    });

    it("exposes the same predicate it enforces", () => {
      const display = createPixDisplay(5, 3);
      expect(display.inBounds(0, 0)).toBe(true);
      expect(display.inBounds(4, 2)).toBe(true);
      expect(display.inBounds(5, 2)).toBe(false);
      expect(display.inBounds(-1, 0)).toBe(false);
    });
  });

  describe("writing", () => {
    it("paints a plane in one call and ignores out-of-range entries", () => {
      const display = createPixDisplay(4, 4);
      display.setMany([
        [0, 0, GREEN],
        [1, 1, WHITE],
        [4, 0, GREEN],
        [-1, 0, GREEN],
        [0, 4, GREEN],
      ]);
      expect(display.getPixel(0, 0)).toBe(GREEN);
      expect(display.getPixel(1, 1)).toBe(WHITE);
      expect(display.litCount()).toBe(2);
    });

    it("tracks a revision per observable change", () => {
      const display = createPixDisplay(4, 4);
      const start = display.getRevision();
      display.setPixel(0, 0, GREEN);
      const afterWrite = display.getRevision();
      display.setPixel(99, 99, GREEN);
      expect(afterWrite).toBeGreaterThan(start);
      // A refused write is not an observable change.
      expect(display.getRevision()).toBe(afterWrite);
    });

    it("clears and fills the whole surface", () => {
      const display = createPixDisplay(3, 3);
      display.fill(GREEN);
      expect(display.litCount()).toBe(9);
      display.clear();
      expect(display.litCount()).toBe(0);
      expect(display.framebuffer.isEmpty()).toBe(true);
    });

    it("returns a detached logical snapshot", () => {
      const display = createPixDisplay(2, 2);
      display.fill(GREEN);
      const snapshot = display.snapshot();
      display.clear();
      expect(snapshot).toHaveLength(4);
      expect(snapshot[0]).toBe(GREEN);
      expect(display.litCount()).toBe(0);
    });
  });

  describe("compositing", () => {
    it("composites a plane at a logical origin, skipping transparent cells", () => {
      const display = createPixDisplay(4, 4);
      display.fill(WHITE);

      const plane = createFramebuffer(2, 2);
      plane.writeIndex(plane.geometry.indexOf(1, 1), GREEN);

      display.blitPlane(plane, 1, 1);

      expect(display.getPixel(2, 2)).toBe(GREEN);
      expect(display.getPixel(1, 1)).toBe(WHITE);
    });

    it("keeps an off-surface plane partially composited", () => {
      const display = createPixDisplay(3, 3);
      const plane = createFramebuffer(3, 3);
      plane.fill(GREEN);

      display.blitPlane(plane, -2, -2);

      expect(display.getPixel(0, 0)).toBe(GREEN);
      expect(display.litCount()).toBe(1);
    });

    it("is a no-op when the plane is entirely off-surface", () => {
      const display = createPixDisplay(2, 2);
      const plane = createFramebuffer(2, 2);
      plane.fill(GREEN);
      display.blitPlane(plane, 50, 50);
      expect(display.litCount()).toBe(0);
    });
  });
});
