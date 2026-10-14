import { beforeEach, describe, expect, it } from "vitest";
import { CanvasPixRenderer } from "@/lib/pixel-display/renderers/canvas-2d";
import { createPixDisplay } from "@/lib/pixel-display/engine/display";
import { packRgba } from "@/lib/pixel-display/engine/color";
import type { PixTimeline } from "@/lib/pixel-display/engine/runtime";
import {
  createRecordingCanvas,
  createRecordingContext,
  type RecordingContext,
} from "./support/recording-renderer";

/**
 * ============================================================================
 * CANVAS RENDERER — RESIZE, DPR AND SNAPPING
 * ============================================================================
 * The contract is that logical coordinates are completely independent of CSS
 * size, viewport size and device pixel ratio: changing any of them may change
 * *how many device pixels a cell occupies* and nothing else.
 *
 * Every assertion therefore comes in pairs — the presentation changed, and the
 * logical state is byte-identical — so a test cannot pass because the renderer
 * silently ignored the change.
 *
 * jsdom has no canvas, so the renderer runs against the shared recording 2D
 * context double (roadmap B10). No second production renderer exists.
 */

const GREEN = packRgba(0x43, 0xe1, 0xb0, 0xff);
const TIMELINE: PixTimeline = { elapsed: 0, delta: 16, frame: 1 };

const SIZES = [48, 64, 96, 110, 180, 320, 458, 640, 37, 1024];
const RATIOS = [1, 1.5, 2, 2.5, 3];

let recording: RecordingContext;

function mount(logical: number, dpr: number) {
  const display = createPixDisplay(logical, logical);
  const renderer = new CanvasPixRenderer(display, { devicePixelRatio: dpr });
  const canvas = createRecordingCanvas(recording);
  renderer.attach(canvas);
  return { display, renderer, canvas };
}

describe("canvas renderer resize and DPR", () => {
  beforeEach(() => {
    recording = createRecordingContext();
  });

  describe("a presentation change never reaches logical state", () => {
    it("holds the framebuffer byte-identical across every size and ratio", () => {
      const { display } = mount(48, 1);
      display.setPixel(17, 20, GREEN);
      display.setPixel(19, 22, GREEN);
      display.setPixel(0, 0, GREEN);
      display.setPixel(47, 47, GREEN);
      const before = display.framebuffer.toBytes();
      const revisionBefore = display.getRevision();

      for (const ratio of RATIOS) {
        for (const size of SIZES) {
          // A ratio change and a size change are both pure presentation events.
          const next = new CanvasPixRenderer(display, {
            devicePixelRatio: ratio,
          });
          next.attach(createRecordingCanvas(recording));
          next.fit(size, size);

          expect(display.framebuffer.toBytes(), `${size}@${ratio}`).toEqual(
            before,
          );
          expect(display.getRevision(), `${size}@${ratio}`).toBe(revisionBefore);
          expect(display.width).toBe(48);
          expect(display.height).toBe(48);
        }
      }
    });

    it("preserves every pixel's logical value, not just the byte total", () => {
      const { display, renderer } = mount(48, 2);
      display.setPixel(24, 24, GREEN);
      const sampled = display.getPixel(24, 24);

      for (const ratio of RATIOS) {
        const next = new CanvasPixRenderer(display, {
          devicePixelRatio: ratio,
        });
        next.attach(createRecordingCanvas(recording));
        next.fit(320, 320);
        expect(display.getPixel(24, 24)).toBe(sampled);
        expect(display.inBounds(24, 24)).toBe(true);
      }
      renderer.detach();
    });

    it("reports the same logical size at every presentation", () => {
      const { display, renderer } = mount(40, 1);
      for (const size of SIZES) {
        renderer.fit(size, size);
        expect(display.width).toBe(40);
        expect(display.height).toBe(40);
        expect(display.geometry.cellCount).toBe(1600);
      }
    });
  });

  describe("device pixel mapping stays integral", () => {
    it.each(RATIOS)(
      "snaps every cell to whole device pixels at ratio %s",
      (ratio) => {
        const { display, renderer } = mount(48, ratio);
        display.fill(GREEN);
        renderer.fit(110, 110); // deliberately not a multiple of 48
        renderer.draw(TIMELINE);

        expect(recording.rects).toHaveLength(48 * 48);
        for (const rect of recording.rects) {
          expect(Number.isInteger(rect.x)).toBe(true);
          expect(Number.isInteger(rect.y)).toBe(true);
          expect(Number.isInteger(rect.width)).toBe(true);
          expect(Number.isInteger(rect.height)).toBe(true);
          expect(rect.width).toBeGreaterThan(0);
          expect(rect.height).toBeGreaterThan(0);
        }
      },
    );

    it("sizes the backing store in device pixels and the canvas in CSS pixels", () => {
      for (const ratio of RATIOS) {
        const { renderer, canvas } = mount(48, ratio);
        renderer.fit(100, 100);
        expect(canvas.width).toBe(Math.round(100 * ratio));
        expect(canvas.height).toBe(Math.round(100 * ratio));
        expect(canvas.style.width).toBe("100px");
        expect(canvas.style.height).toBe("100px");
      }
    });

    it("keeps the reported pitch exactly on the logical grid", () => {
      for (const ratio of RATIOS) {
        const { renderer, canvas } = mount(48, ratio);
        renderer.fit(200, 200);
        const pitch = canvas.width / 48;
        expect(pitch).toBeGreaterThan(0);
        expect(renderer.getCellPitch()).toBeCloseTo(pitch, 10);
      }
    });

    it("stays square inside a non-square slot", () => {
      const { renderer, canvas } = mount(48, 2);
      renderer.fit(400, 120);
      expect(canvas.width).toBe(240);
      expect(canvas.height).toBe(240);
      // The slot is still reported faithfully for callers that need it.
      expect(renderer.getPresentationSize()).toMatchObject({
        cssWidth: 400,
        cssHeight: 120,
        devicePixelRatio: 2,
      });
    });
  });

  describe("cells tile the surface exactly", () => {
    it("covers the whole surface with no gap and no overlap at zero gap", () => {
      const { display, renderer } = mount(8, 2);
      display.fill(GREEN);
      renderer.setPresentation({ gap: 0 });
      renderer.fit(100, 100);
      renderer.draw(TIMELINE);

      const rects = recording.rects;
      expect(rects).toHaveLength(64);
      const row = rects.slice(0, 8);
      expect(row[0].x).toBe(0);
      for (let i = 1; i < row.length; i += 1) {
        expect(row[i].x).toBe(row[i - 1].x + row[i - 1].width);
      }
      const last = row[row.length - 1];
      expect(last.x + last.width).toBe(200);
    });

    it("keeps the trailing edge exact at an awkward ratio", () => {
      const { display, renderer } = mount(7, 1.5);
      display.fill(GREEN);
      renderer.setPresentation({ gap: 0 });
      renderer.fit(101, 101);
      renderer.draw(TIMELINE);

      const backing = Math.round(101 * 1.5);
      const row = recording.rects.slice(0, 7);
      const last = row[row.length - 1];
      expect(last.x + last.width).toBe(backing);
    });
  });

  describe("fit is idempotent and explicit", () => {
    it("does not disturb the canvas when the size is unchanged", () => {
      const { renderer, canvas } = mount(48, 2);
      renderer.fit(200, 200);
      const width = canvas.width;
      renderer.fit(200, 200);
      expect(canvas.width).toBe(width);
    });

    it("invalidates the painted state so a stale surface is never trusted", () => {
      const { renderer } = mount(48, 1);
      renderer.fit(200, 200);
      renderer.draw(TIMELINE);
      expect(renderer.isUpToDate()).toBe(true);

      renderer.fit(201, 201);
      expect(renderer.isUpToDate()).toBe(false);

      renderer.draw(TIMELINE);
      expect(renderer.isUpToDate()).toBe(true);
    });

    it("ignores a zero-size slot without producing a degenerate surface", () => {
      const { renderer, canvas, display } = mount(48, 2);
      display.setPixel(1, 1, GREEN);
      const before = display.framebuffer.toBytes();

      renderer.fit(0, 0);

      expect(canvas.width).toBe(1);
      expect(renderer.isReady()).toBe(false);
      expect(display.framebuffer.toBytes()).toEqual(before);
    });

    it("never paints while unready", () => {
      // No fit yet, so nothing has been sized and drawing must be a no-op.
      const { renderer } = mount(48, 1);
      expect(renderer.isReady()).toBe(false);

      renderer.draw(TIMELINE);

      expect(recording.rects).toHaveLength(0);
      expect(recording.backdrop).toHaveLength(0);
    });
  });
});
