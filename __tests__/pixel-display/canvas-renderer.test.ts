import { beforeEach, describe, expect, it } from "vitest";
import { CanvasPixRenderer } from "@/lib/pixel-display/renderers/canvas-2d";
import { createPixDisplay } from "@/lib/pixel-display/engine/display";
import { packRgba } from "@/lib/pixel-display/engine/color";
import type { PixTimeline } from "@/lib/pixel-display/engine/runtime";
import { DEFAULT_PRESENTATION } from "@/lib/pixel-display/renderers/grid-presentation";
import {
  createRecordingCanvas,
  createRecordingContext,
  type RecordingContext,
} from "./support/recording-renderer";

/**
 * jsdom has no canvas implementation, and this repository deliberately does not
 * depend on a native canvas package. The engine's logic is therefore pure and
 * asserted directly, and the Canvas renderer — the one layer that touches the
 * DOM — is verified against a recording 2D context double (roadmap boundary
 * B10: the renderer interface is proven by a test double, never a second
 * production renderer).
 */
const GREEN = packRgba(0x43, 0xe1, 0xb0, 0xff);
const TIMELINE: PixTimeline = { elapsed: 0, delta: 16, frame: 1 };

let recorded: RecordingContext;

function createCanvas(_ratio = 1): HTMLCanvasElement {
  return createRecordingCanvas(recorded);
}

describe("canvas renderer", () => {
  beforeEach(() => {
    recorded = createRecordingContext();
  });

  describe("resizing never changes a logical coordinate", () => {
    it("keeps the framebuffer untouched across a large resize matrix", () => {
      const display = createPixDisplay(48, 48);
      display.setPixel(17, 20, GREEN);
      display.setPixel(19, 22, GREEN);
      const before = display.framebuffer.toBytes();

      const renderer = new CanvasPixRenderer(display);
      const canvas = createCanvas(2);
      renderer.attach(canvas);

      for (const size of [60, 96, 110, 180, 320, 640, 37, 1024]) {
        renderer.fit(size, size);
        expect(display.framebuffer.toBytes()).toEqual(before);
        expect(display.getPixel(17, 20)).toBe(GREEN);
        expect(display.getPixel(19, 22)).toBe(GREEN);
      }
    });

    it("reports the same logical size at every presentation size", () => {
      const display = createPixDisplay(40, 40);
      const renderer = new CanvasPixRenderer(display);
      renderer.attach(createCanvas(1));

      for (const size of [50, 200, 500]) {
        renderer.fit(size, size);
        expect(display.width).toBe(40);
        expect(display.height).toBe(40);
        expect(display.geometry.cellCount).toBe(1600);
      }
    });

    it("changes only how many device pixels one cell occupies", () => {
      const display = createPixDisplay(48, 48);
      const renderer = new CanvasPixRenderer(display, { devicePixelRatio: 2 });
      const canvas = createCanvas();
      renderer.attach(canvas);

      renderer.fit(96, 96);
      const small = renderer.getCellPitch();
      renderer.fit(192, 192);
      const large = renderer.getCellPitch();

      expect(large).toBeGreaterThan(small);
      expect(small).toBeCloseTo((96 * 2) / 48, 5);
      expect(large).toBeCloseTo((192 * 2) / 48, 5);
    });
  });

  describe("physical presentation", () => {
    it("sizes the backing store in device pixels and CSS in CSS pixels", () => {
      const display = createPixDisplay(48, 48);
      const renderer = new CanvasPixRenderer(display, { devicePixelRatio: 2 });
      const canvas = createCanvas();
      renderer.attach(canvas);

      renderer.fit(100, 100);

      expect(canvas.width).toBe(200);
      expect(canvas.height).toBe(200);
      expect(canvas.style.width).toBe("100px");
      expect(canvas.style.height).toBe("100px");
    });

    it("stays square when the slot is not", () => {
      const display = createPixDisplay(48, 48);
      const renderer = new CanvasPixRenderer(display, { devicePixelRatio: 1 });
      const canvas = createCanvas();
      renderer.attach(canvas);

      renderer.fit(400, 120);

      expect(canvas.width).toBe(120);
      expect(canvas.height).toBe(120);
      expect(renderer.getPresentationSize().cssWidth).toBe(400);
      expect(renderer.getPresentationSize().cssHeight).toBe(120);
    });

    it("disables image smoothing so nothing is interpolated", () => {
      const display = createPixDisplay(48, 48);
      const renderer = new CanvasPixRenderer(display);
      renderer.attach(createCanvas());
      expect(recorded.context.imageSmoothingEnabled).toBe(false);
    });

    it("tracks the ambient device pixel ratio unless overridden", () => {
      const display = createPixDisplay(48, 48);
      const renderer = new CanvasPixRenderer(display, { devicePixelRatio: 3 });
      renderer.attach(createCanvas());
      renderer.fit(64, 64);
      expect(renderer.getPresentationSize().devicePixelRatio).toBe(3);
      expect(createCanvas().width).toBe(0);
    });
  });

  describe("drawing", () => {
    it("paints the backdrop first and then one rect per lit cell", () => {
      const display = createPixDisplay(4, 4);
      display.setPixel(0, 0, GREEN);
      display.setPixel(3, 3, GREEN);

      const renderer = new CanvasPixRenderer(display, {
        devicePixelRatio: 1,
        presentation: { gap: 0, inactiveOpacity: 0 },
      });
      renderer.attach(createCanvas());
      renderer.fit(40, 40);
      renderer.draw(TIMELINE);

      expect(recorded.backdrop).toHaveLength(1);
      expect(recorded.backdrop[0]).toMatchObject({
        x: 0,
        y: 0,
        width: 40,
        height: 40,
      });
      expect(recorded.rects).toHaveLength(2);
    });

    it("skips unlit cells entirely when inactive cells are invisible", () => {
      const display = createPixDisplay(4, 4);
      display.setPixel(1, 1, GREEN);

      const renderer = new CanvasPixRenderer(display, {
        devicePixelRatio: 1,
        presentation: { inactiveOpacity: 0 },
      });
      renderer.attach(createCanvas());
      renderer.fit(40, 40);
      renderer.draw(TIMELINE);

      expect(recorded.rects).toHaveLength(1);
    });

    it("draws every cell when inactive cells are enabled", () => {
      const display = createPixDisplay(4, 4);
      display.setPixel(1, 1, GREEN);

      const renderer = new CanvasPixRenderer(display, {
        devicePixelRatio: 1,
        presentation: { inactiveOpacity: 0.08 },
      });
      renderer.attach(createCanvas());
      renderer.fit(40, 40);
      renderer.draw(TIMELINE);

      expect(recorded.rects).toHaveLength(16);
    });

    it("leaves a gap between cells without shifting their boundaries", () => {
      const display = createPixDisplay(2, 2);
      display.fill(GREEN);

      const renderer = new CanvasPixRenderer(display, {
        devicePixelRatio: 1,
        presentation: { gap: 0.5 },
      });
      renderer.attach(createCanvas());
      renderer.fit(20, 20);
      renderer.draw(TIMELINE);

      // Cell pitch is 10 device pixels, so a 50% gap removes exactly 5: the
      // separator is half the pitch on each axis rather than two rounded halves.
      // The odd pixel goes to the trailing side so cells advance on a fixed grid.
      const [first, second] = recorded.rects;
      expect(first).toMatchObject({ x: 2, y: 2, width: 5, height: 5 });
      expect(second).toMatchObject({ x: 12, y: 2, width: 5, height: 5 });
    });

    it("snaps every cell boundary to a whole device pixel", () => {
      const display = createPixDisplay(48, 48);
      display.fill(GREEN);

      const renderer = new CanvasPixRenderer(display, {
        devicePixelRatio: 1,
        presentation: { gap: 0 },
      });
      renderer.attach(createCanvas());
      // 110 is not a multiple of 48, so naive maths would produce fractional edges.
      renderer.fit(110, 110);
      renderer.draw(TIMELINE);

      expect(recorded.rects).toHaveLength(48 * 48);
      for (const rect of recorded.rects) {
        expect(Number.isInteger(rect.x)).toBe(true);
        expect(Number.isInteger(rect.y)).toBe(true);
        expect(Number.isInteger(rect.width)).toBe(true);
        expect(Number.isInteger(rect.height)).toBe(true);
      }
    });

    it("covers the full surface with adjacent cells at zero gap", () => {
      const display = createPixDisplay(3, 3);
      display.fill(GREEN);

      const renderer = new CanvasPixRenderer(display, {
        devicePixelRatio: 1,
        presentation: { gap: 0 },
      });
      renderer.attach(createCanvas());
      renderer.fit(30, 30);
      renderer.draw(TIMELINE);

      // 30 / 3 = 10 device pixels per cell, contiguous and complete.
      const rects = recorded.rects;
      expect(rects[0]).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
      expect(rects[1]).toMatchObject({ x: 10, y: 0, width: 10, height: 10 });
      expect(rects[8]).toMatchObject({ x: 20, y: 20, width: 10, height: 10 });
    });

    it("does nothing before a size has been established", () => {
      const display = createPixDisplay(4, 4);
      display.fill(GREEN);
      const renderer = new CanvasPixRenderer(display);
      renderer.attach(createCanvas());

      expect(renderer.isReady()).toBe(false);
      renderer.draw(TIMELINE);
      expect(recorded.rects).toHaveLength(0);
    });

    it("reports whether the painted revision is still current", () => {
      const display = createPixDisplay(4, 4);
      const renderer = new CanvasPixRenderer(display, { devicePixelRatio: 1 });
      renderer.attach(createCanvas());
      renderer.fit(40, 40);

      renderer.draw(TIMELINE);
      expect(renderer.isUpToDate()).toBe(true);

      display.setPixel(0, 0, GREEN);
      expect(renderer.isUpToDate()).toBe(false);

      renderer.draw(TIMELINE);
      expect(renderer.isUpToDate()).toBe(true);
    });

    it("treats a resize as invalidating the painted state", () => {
      const display = createPixDisplay(4, 4);
      const renderer = new CanvasPixRenderer(display, { devicePixelRatio: 1 });
      renderer.attach(createCanvas());
      renderer.fit(40, 40);
      renderer.draw(TIMELINE);
      expect(renderer.isUpToDate()).toBe(true);

      renderer.fit(80, 80);
      expect(renderer.isUpToDate()).toBe(false);
    });
  });

  describe("presentation configuration", () => {
    it("merges patches over the defaults", () => {
      const display = createPixDisplay(4, 4);
      const renderer = new CanvasPixRenderer(display);
      expect(renderer.getPresentation()).toEqual(DEFAULT_PRESENTATION);

      renderer.setPresentation({ gap: 0.25, inactiveOpacity: 0.05 });
      expect(renderer.getPresentation()).toMatchObject({
        gap: 0.25,
        inactiveOpacity: 0.05,
        backdrop: DEFAULT_PRESENTATION.backdrop,
      });
    });
  });
});
