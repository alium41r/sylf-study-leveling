/**
 * ============================================================================
 * TEST SUPPORT — RECORDING 2D CONTEXT AND RECORDING RENDERER
 * ============================================================================
 * Two doubles, both test-only (roadmap boundary B10: the renderer contract is
 * proven by a test double, never by a second production renderer).
 *
 *  - `createRecordingContext()` stands in for `CanvasRenderingContext2D`, which
 *    jsdom does not implement. It records the draw calls it receives so a test
 *    can assert the physical output of the Canvas renderer.
 *  - `createRecordingRenderer()` implements `PixRenderer` and records the
 *    timelines the runtime hands it, so a test can assert what the runtime
 *    *told* a renderer to do. Because it satisfies the same interface as the
 *    Canvas renderer, it also demonstrates that the interface is sufficient:
 *    the runtime never reaches past it.
 *
 * This file is support, not a suite: it has no `.test.` in its name, so the test
 * runner does not collect it.
 */

import type { PixRenderer, PixTimeline } from "@/lib/pixel-display/engine/runtime";

export interface RecordedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  fillStyle: string;
  globalAlpha: number;
}

export interface RecordingContext {
  /** The context object to hand to `attach`. */
  context: CanvasRenderingContext2D;
  /** Every fill after the first per draw: the cells. */
  rects: RecordedRect[];
  /** Whole-surface fills: the backdrop pass that opens each draw. */
  backdrop: RecordedRect[];
  /** Draws observed, counted by whole-surface fills. */
  get drawCount(): number;
  /**
   * The context cannot see draw boundaries — every frame flows through the same
   * `fillRect` — so a test that draws more than once must mark the boundary
   * itself. Without this the second draw's backdrop would be recorded as a cell.
   */
  beginDraw(): void;
  /** Clears the recording between assertions. */
  reset(): void;
}

/**
 * A `CanvasRenderingContext2D` stand-in that records fills.
 *
 * `fillRect` is treated as `clearRect` when a rect covers the full surface at
 * zero alpha — but the Canvas renderer paints the backdrop as an opaque
 * full-surface fill, so the first fill of each draw is classified as the
 * backdrop and everything after it as a cell. That keeps the double's
 * bookkeeping trivial and its assertions readable.
 */
export function createRecordingContext(): RecordingContext {
  let rects: RecordedRect[] = [];
  let backdrop: RecordedRect[] = [];
  let fillsThisDraw = 0;

  const context = {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    fillStyle: "#000000",
    fillRect(x: number, y: number, width: number, height: number) {
      const entry: RecordedRect = {
        x,
        y,
        width,
        height,
        fillStyle: String(this.fillStyle),
        globalAlpha: this.globalAlpha,
      };
      if (fillsThisDraw === 0) backdrop.push(entry);
      else rects.push(entry);
      fillsThisDraw += 1;
    },
  };

  return {
    context: context as unknown as CanvasRenderingContext2D,
    get rects() {
      return rects;
    },
    get backdrop() {
      return backdrop;
    },
    get drawCount() {
      return backdrop.length;
    },
    beginDraw() {
      fillsThisDraw = 0;
    },
    reset() {
      rects = [];
      backdrop = [];
      fillsThisDraw = 0;
    },
  };
}

/** A canvas element wired to a recording context. */
export function createRecordingCanvas(
  recording: RecordingContext,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 0;
  canvas.height = 0;
  canvas.getContext = (() =>
    recording.context) as unknown as HTMLCanvasElement["getContext"];
  return canvas;
}

export interface RecordingRenderer extends PixRenderer {
  /** Every timeline the runtime passed to `draw`, in order. */
  readonly timelines: PixTimeline[];
  /** Every `(width, height)` pair passed to `fit`. */
  readonly fitted: Array<[number, number]>;
  /** How many times `isReady` was consulted. */
  readonly readinessChecks: number;
  /** Counts one draw. */
  readonly draws: number;
  setReady(ready: boolean): void;
  reset(): void;
}

/**
 * A minimal `PixRenderer` that records instead of drawing.
 *
 * It holds a framebuffer-like snapshot callback rather than a framebuffer, so it
 * proves the interface carries exactly what a renderer needs: a readiness
 * signal, a draw call with a timeline, and an optional physical fit.
 */
export function createRecordingRenderer(
  options: { ready?: boolean } = {},
): RecordingRenderer {
  const timelines: PixTimeline[] = [];
  const fitted: Array<[number, number]> = [];
  let ready = options.ready ?? true;
  let readinessChecks = 0;
  let draws = 0;

  return {
    timelines,
    fitted,
    get readinessChecks() {
      return readinessChecks;
    },
    get draws() {
      return draws;
    },
    setReady(next: boolean) {
      ready = next;
    },
    isReady() {
      readinessChecks += 1;
      return ready;
    },
    draw(timeline: PixTimeline) {
      draws += 1;
      timelines.push({ ...timeline });
    },
    fit(width: number, height: number) {
      fitted.push([width, height]);
    },
    reset() {
      timelines.length = 0;
      fitted.length = 0;
      readinessChecks = 0;
      draws = 0;
    },
  };
}
