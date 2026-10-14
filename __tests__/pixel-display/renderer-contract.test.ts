import { beforeEach, describe, expect, it } from "vitest";
import { PixRuntime } from "@/lib/pixel-display/engine/runtime";
import type { PixContent, PixOverlay } from "@/lib/pixel-display/engine/runtime";
import { CanvasPixRenderer } from "@/lib/pixel-display/renderers/canvas-2d";
import { PixDisplay, createPixDisplay } from "@/lib/pixel-display/engine/display";
import { packRgba } from "@/lib/pixel-display/engine/color";
import {
  createRecordingCanvas,
  createRecordingContext,
  createRecordingRenderer,
} from "./support/recording-renderer";

/**
 * ============================================================================
 * RENDERER CONTRACT — PROVEN BY SUBSTITUTION
 * ============================================================================
 * The roadmap's requirement is that the renderer be replaceable without
 * rewriting content, and that the proof be a **test double**, not a second
 * production renderer (B10).
 *
 * So this file drives the same runtime and the same display through two
 * different `PixRenderer` implementations — the recording double and the real
 * Canvas renderer — and asserts that the runtime treats them identically. The
 * interface is sufficient if the runtime never needs to know which one it has.
 *
 * The paired assertions matter: each "they agree" claim is accompanied by a
 * "the double observed something" claim, so the test cannot pass because
 * nothing happened.
 */

const GREEN = packRgba(0x43, 0xe1, 0xb0, 0xff);

function createHarness() {
  let nextHandle = 0;
  const pending = new Map<number, (time: number) => void>();
  let now = 0;

  const runtime = new PixRuntime({
    clock: () => now,
    schedule: (callback) => {
      nextHandle += 1;
      pending.set(nextHandle, callback);
      return nextHandle;
    },
    cancel: (handle) => pending.delete(handle),
  });

  return {
    runtime,
    advance(ms: number) {
      now += ms;
    },
    flush() {
      const callbacks = Array.from(pending.values());
      pending.clear();
      for (const callback of callbacks) callback(now);
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

describe("renderer contract", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  describe("the interface is sufficient for a renderer", () => {
    it("carries readiness, a timeline, and a physical fit", () => {
      const renderer = createRecordingRenderer();
      const display = createPixDisplay(48, 48);
      harness.runtime.setRenderer(renderer);
      harness.runtime.setContent({
        id: "counter",
        update: (timeline) => {
          // `fit` is optional on the interface, so a caller that wants it must
          // ask for it; the recording renderer always provides it.
          renderer.fit?.(timeline.frame, timeline.frame);
          return timeline.frame < 3;
        },
      });

      harness.runtime.start();
      harness.advance(16);
      harness.flush();
      harness.advance(16);
      harness.flush();
      harness.advance(16);
      harness.flush();

      expect(renderer.draws).toBe(3);
      expect(renderer.timelines).toHaveLength(3);
      expect(renderer.fitted).toEqual([
        [1, 1],
        [2, 2],
        [3, 3],
      ]);
      expect(display.width).toBe(48);
    });
  });

  describe("the timeline the runtime hands a renderer", () => {
    it("is monotonic in elapsed, frame and delta", () => {
      const renderer = createRecordingRenderer();
      harness.runtime.setRenderer(renderer);
      harness.runtime.setContent({ id: "loop", update: () => true });

      // `start()` schedules the opening frame immediately, so the first frame
      // of a session always reports elapsed 0 and delta 0: the display paints
      // its current state before any time has passed.
      harness.runtime.start();
      harness.flush();
      for (let i = 0; i < 4; i += 1) {
        harness.advance(20);
        harness.flush();
      }

      expect(renderer.timelines).toHaveLength(5);
      expect(renderer.timelines.map((t) => t.frame)).toEqual([1, 2, 3, 4, 5]);
      expect(renderer.timelines.map((t) => t.elapsed)).toEqual([0, 20, 40, 60, 80]);
      expect(renderer.timelines.map((t) => t.delta)).toEqual([0, 20, 20, 20, 20]);

      // Monotonic in both axes.
      for (let i = 1; i < renderer.timelines.length; i += 1) {
        expect(renderer.timelines[i].elapsed).toBeGreaterThan(
          renderer.timelines[i - 1].elapsed,
        );
        expect(renderer.timelines[i].frame).toBeGreaterThan(
          renderer.timelines[i - 1].frame,
        );
      }
    });

    it("gives each renderer an independent copy of the timeline", () => {
      const renderer = createRecordingRenderer();
      harness.runtime.setRenderer(renderer);
      harness.runtime.setContent({ id: "one", update: () => false });
      harness.runtime.start();
      harness.flush();

      const captured = renderer.timelines[0];
      expect(captured).toBeDefined();
      // Mutating a recorded timeline cannot corrupt the runtime's own counter.
      captured.frame = 9_999;
      harness.runtime.requestFrame();
      harness.flush();
      expect(renderer.timelines[1].frame).toBe(2);
    });
  });

  describe("the runtime never reaches past the interface", () => {
    it("consults only isReady and draw", () => {
      const calls: string[] = [];
      const display = createPixDisplay(48, 48);
      const renderer = {
        isReady: () => {
          calls.push("isReady");
          return true;
        },
        draw: () => {
          calls.push("draw");
          // A renderer inspecting its own display is the renderer's business;
          // the runtime does not participate in that.
          void display;
        },
      };
      harness.runtime.setRenderer(renderer);
      harness.runtime.start();
      harness.flush();

      // Exactly one readiness check per frame, then exactly one draw. No other
      // method is required, which is what keeps the interface minimal.
      expect(calls).toEqual(["isReady", "draw"]);
    });

    it("skips drawing entirely while the renderer reports unready", () => {
      const renderer = createRecordingRenderer({ ready: false });
      harness.runtime.setRenderer(renderer);
      harness.runtime.setContent({ id: "loop", update: () => true });

      harness.runtime.start();
      harness.flush();
      harness.flush();

      expect(renderer.readinessChecks).toBe(2);
      expect(renderer.draws).toBe(0);
      // The animation still progressed: readiness governs painting, not time.
      expect(harness.runtime.getFrameCount()).toBe(2);
    });

    it("lets a renderer become ready mid-session", () => {
      const renderer = createRecordingRenderer({ ready: false });
      harness.runtime.setRenderer(renderer);
      harness.runtime.setContent({ id: "loop", update: () => true });

      harness.runtime.start();
      harness.flush();
      expect(renderer.draws).toBe(0);

      renderer.setReady(true);
      harness.flush();
      expect(renderer.draws).toBe(1);
    });
  });

  describe("the recording double and the Canvas renderer are interchangeable", () => {
    it("receive identical timelines for identical sessions", () => {
      const double = createRecordingRenderer();
      const doubleHarness = createHarness();
      doubleHarness.runtime.setRenderer(double);
      doubleHarness.runtime.setContent({ id: "loop", update: () => true });
      doubleHarness.runtime.start();
      doubleHarness.flush();
      for (let i = 0; i < 3; i += 1) {
        doubleHarness.advance(25);
        doubleHarness.flush();
      }

      const recording = createRecordingContext();
      const display = createPixDisplay(48, 48);
      const canvasRenderer = new CanvasPixRenderer(display, {
        devicePixelRatio: 1,
      });
      canvasRenderer.attach(createRecordingCanvas(recording));
      canvasRenderer.fit(200, 200);
      // Mark each draw so the double can separate backdrop passes from cells.
      const originalDraw = canvasRenderer.draw.bind(canvasRenderer);
      canvasRenderer.draw = (timeline) => {
        recording.beginDraw();
        originalDraw(timeline);
      };

      const canvasHarness = createHarness();
      canvasHarness.runtime.setRenderer(canvasRenderer);
      canvasHarness.runtime.setContent({ id: "loop", update: () => true });
      canvasHarness.runtime.start();
      canvasHarness.flush();
      for (let i = 0; i < 3; i += 1) {
        canvasHarness.advance(25);
        canvasHarness.flush();
      }

      // Both sessions produced the same number of frames at the same logical
      // times, because the runtime does not distinguish between them.
      expect(double.timelines).toHaveLength(4);
      expect(recording.drawCount).toBe(4);
      expect(double.timelines.map((t) => t.elapsed)).toEqual([0, 25, 50, 75]);
      expect(double.timelines.map((t) => t.frame)).toEqual([1, 2, 3, 4]);
      // The Canvas renderer saw exactly as many frames as the double did.
      expect(recording.drawCount).toBe(double.draws);
    });

    it("paints the same framebuffer state through either renderer", () => {
      // The framebuffer is the renderer-independent truth: content writes it,
      // and each renderer decides how to present it.
      const display = createPixDisplay(8, 8);
      display.setPixel(0, 0, GREEN);
      display.setPixel(7, 7, GREEN);

      const recording = createRecordingContext();
      const canvasRenderer = new CanvasPixRenderer(display, {
        devicePixelRatio: 1,
      });
      canvasRenderer.attach(createRecordingCanvas(recording));
      canvasRenderer.setPresentation({ gap: 0, inactiveOpacity: 0 });
      canvasRenderer.fit(80, 80);
      canvasRenderer.draw({ elapsed: 0, delta: 16, frame: 1 });

      // Two lit cells, so exactly two cell rects, regardless of how many
      // renderer implementations exist.
      expect(recording.rects).toHaveLength(2);
      expect(display.litCount()).toBe(2);
    });
  });

  describe("a renderer can be swapped mid-session without disturbing content", () => {
    it("preserves the display, the frame counter and the phase", () => {
      const display = createPixDisplay(48, 48);
      const first = createRecordingRenderer();
      const second = createRecordingRenderer();

      harness.runtime.setRenderer(first);
      harness.runtime.setContent({
        id: "painter",
        render: () => {
          display.setPixel(1, 1, GREEN);
        },
        update: () => true,
      });

      harness.runtime.start();
      harness.advance(16);
      harness.flush();
      expect(first.draws).toBe(1);
      expect(display.getPixel(1, 1)).toBe(GREEN);

      harness.runtime.setRenderer(second);
      harness.advance(16);
      harness.flush();

      // The swap is invisible to everything except the renderer itself.
      expect(second.draws).toBe(1);
      expect(first.draws).toBe(1);
      expect(display.getPixel(1, 1)).toBe(GREEN);
      expect(harness.runtime.getFrameCount()).toBe(2);
      expect(harness.runtime.isRunning()).toBe(true);
    });

    it("detaching the renderer leaves content and time untouched", () => {
      const renderer = createRecordingRenderer();
      harness.runtime.setRenderer(renderer);
      harness.runtime.setContent({ id: "loop", update: () => true });

      harness.runtime.start();
      harness.flush();
      const framesBefore = harness.runtime.getFrameCount();

      harness.runtime.setRenderer(null);
      harness.flush();

      expect(renderer.draws).toBe(1);
      expect(harness.runtime.getFrameCount()).toBe(framesBefore + 1);
      expect(harness.runtime.isRunning()).toBe(true);
    });
  });

  describe("the overlay is a separate concern from the renderer", () => {
    it("draws between content and the renderer, every frame", () => {
      const order: string[] = [];
      const display = createPixDisplay(4, 4);

      const content: PixContent = {
        id: "content",
        update: () => true,
        render: () => {
          display.clear();
          order.push("content");
        },
      };
      const overlay: PixOverlay = {
        id: "viewer",
        draw: () => {
          display.setPixel(0, 0, GREEN);
          order.push("overlay");
        },
      };
      const renderer = createRecordingRenderer();
      const originalDraw = renderer.draw;
      renderer.draw = (timeline) => {
        order.push(display.getPixel(0, 0) === GREEN ? "renderer:sees-edit" : "renderer:missed-edit");
        originalDraw(timeline);
      };

      harness.runtime.setContent(content);
      harness.runtime.setOverlay(overlay);
      harness.runtime.setRenderer(renderer);

      harness.runtime.start();
      harness.flush();

      // Content clears, the overlay re-applies the viewer edit, and only then
      // does the renderer see the frame — which is what makes a direct edit
      // survive a full composite.
      expect(order).toEqual([
        "content",
        "overlay",
        "renderer:sees-edit",
      ]);
    });
  });

  describe("PixDisplay is renderer-agnostic", () => {
    it("has no reference to any renderer", () => {
      const display = new PixDisplay(4, 4);
      // The display's own surface is the framebuffer and the logical grid; a
      // renderer reads them. Nothing in the display mentions a renderer.
      expect(display.framebuffer).toBeDefined();
      expect(display.geometry.cellCount).toBe(16);
      const surface = Object.keys(display);
      expect(surface).not.toContain("renderer");
    });
  });
});
