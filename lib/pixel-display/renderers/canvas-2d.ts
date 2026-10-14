/**
 * ============================================================================
 * PIXEL DISPLAY — CANVAS 2D RENDERER
 * ============================================================================
 * The only layer that knows about physical pixels. It reads the framebuffer and
 * paints one Canvas surface — never one DOM node per logical pixel (doc §10).
 *
 * CRISPNESS RULES
 *  - The canvas backing store is sized in device pixels; CSS size stays in CSS
 *    pixels, so the browser never resamples the result.
 *  - Cell boundaries are snapped to whole device pixels. A cell is therefore
 *    always fully on or fully off, with no half-lit edge and no shimmer when the
 *    presentation size is not an exact multiple of the logical resolution.
 *  - Image smoothing is disabled and the physical path never interpolates.
 *
 * INDEPENDENCE (boundary B3)
 *  - Logical coordinates are untouched by anything in this file. Resizing
 *    changes only how many device pixels one logical cell occupies.
 * ============================================================================
 */

import { unpackRgba, type PixColor } from "../engine/color";
import type { PixDisplay } from "../engine/display";
import type { PixRenderer, PixTimeline } from "../engine/runtime";
import {
  DEFAULT_PRESENTATION,
  type PixGridPresentation,
} from "./grid-presentation";

export interface PixPresentation {
  /** CSS pixel width of the canvas. */
  cssWidth: number;
  /** CSS pixel height of the canvas. */
  cssHeight: number;
  /** Device pixel ratio used for the backing store. */
  devicePixelRatio: number;
}

/** Where one logical cell lands in device pixels. */
export interface PixCellLayout {
  readonly originX: number;
  readonly originY: number;
  readonly pitch: number;
}

export interface CanvasPixRendererOptions {
  presentation?: Partial<PixGridPresentation>;
  /** Overrides the ambient device pixel ratio. */
  devicePixelRatio?: number;
}

function currentDevicePixelRatio(): number {
  const ratio =
    typeof window !== "undefined" && typeof window.devicePixelRatio === "number"
      ? window.devicePixelRatio
      : 1;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

export class CanvasPixRenderer implements PixRenderer {
  private readonly display: PixDisplay;
  private readonly presentation: PixGridPresentation;
  private readonly ratioOverride: number | null;

  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private presentationSize: PixPresentation = {
    cssWidth: 0,
    cssHeight: 0,
    devicePixelRatio: 1,
  };
  private cellPitch = 0;
  private drawnRevision = -1;
  private lastTimeline: PixTimeline | null = null;

  constructor(display: PixDisplay, options: CanvasPixRendererOptions = {}) {
    this.display = display;
    this.presentation = {
      ...DEFAULT_PRESENTATION,
      ...options.presentation,
    };
    this.ratioOverride = options.devicePixelRatio ?? null;
  }

  /** Binds this renderer to a canvas element. */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) {
      this.context = null;
      return;
    }
    context.imageSmoothingEnabled = false;
    this.context = context;
  }

  detach(): void {
    this.canvas = null;
    this.context = null;
    this.drawnRevision = -1;
  }

  isReady(): boolean {
    return this.context !== null && this.presentationSize.cssWidth > 0;
  }

  /** Replaces presentation values without touching logical coordinates. */
  setPresentation(patch: Partial<PixGridPresentation>): void {
    Object.assign(this.presentation, patch);
  }

  getPresentation(): PixGridPresentation {
    return { ...this.presentation };
  }

  /** Current CSS presentation size. */
  getPresentationSize(): PixPresentation {
    return { ...this.presentationSize };
  }

  /** Device pixels per logical cell under the current presentation. */
  getCellPitch(): number {
    return this.cellPitch;
  }

  /**
   * Resolves the physical presentation size and resizes the backing store.
   * Called on mount, on container resize, and on device-pixel-ratio change.
   */
  fit(cssWidth: number, cssHeight: number): void {
    const canvas = this.canvas;
    const context = this.context;
    const devicePixelRatio = this.ratioOverride ?? currentDevicePixelRatio();

    const safeWidth = Math.max(0, Math.floor(cssWidth));
    const safeHeight = Math.max(0, Math.floor(cssHeight));
    this.presentationSize = {
      cssWidth: safeWidth,
      cssHeight: safeHeight,
      devicePixelRatio,
    };

    if (!canvas) return;

    // Square matrix: the canvas is the largest square that fits the slot, so
    // logical pixels always stay square regardless of the slot's aspect ratio.
    const side = Math.min(safeWidth, safeHeight);
    const deviceSide = Math.max(1, Math.round(side * devicePixelRatio));

    if (canvas.width !== deviceSide) canvas.width = deviceSide;
    if (canvas.height !== deviceSide) canvas.height = deviceSide;

    const cssSide = side > 0 ? `${side}px` : "0px";
    if (canvas.style.width !== cssSide) canvas.style.width = cssSide;
    if (canvas.style.height !== cssSide) canvas.style.height = cssSide;

    this.cellPitch = deviceSide / this.display.width;

    if (context) context.imageSmoothingEnabled = false;
    // A resize invalidates whatever was painted at the previous scale.
    this.drawnRevision = -1;
  }

  /**
   * Paints the framebuffer. This is the renderer's only drawing entry point, so
   * nothing else owns physical pixels.
   */
  draw(timeline: PixTimeline): void {
    this.lastTimeline = timeline;
    const context = this.context;
    const canvas = this.canvas;
    if (!context || !canvas) return;

    const size = canvas.width;
    if (size <= 0) return;

    const { backdrop, gap, inactiveOpacity, litOpacity } = this.presentation;
    const backdropRgba = unpackRgba(backdrop);
    context.fillStyle = `rgb(${backdropRgba.r}, ${backdropRgba.g}, ${backdropRgba.b})`;
    context.fillRect(0, 0, size, size);

    const width = this.display.width;
    const height = this.display.height;
    const data = this.display.framebuffer.data;

    // Snap each boundary to a whole device pixel. Boundaries — not cell sizes —
    // are rounded, so consecutive cells share an edge and the grid never
    // develops a stray seam at the far edge.
    const pitch = size / width;
    const showInactive = inactiveOpacity > 0;
    const gapRatio = Math.max(0, Math.min(0.5, gap));

    for (let y = 0; y < height; y += 1) {
      const top = Math.round(y * pitch);
      const bottom = Math.round((y + 1) * pitch);
      const cellHeight = bottom - top;
      if (cellHeight <= 0) continue;
      // Round the *total* inset, then split it, so the separator is exactly the
      // requested fraction of the pitch instead of drifting by a pixel per side.
      const insetY = Math.round(cellHeight * gapRatio);
      const insetTop = Math.floor(insetY / 2);
      const drawHeight = cellHeight - insetY;

      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3];
        if (alpha === 0 && !showInactive) continue;

        const left = Math.round(x * pitch);
        const right = Math.round((x + 1) * pitch);
        const cellWidth = right - left;
        if (cellWidth <= 0) continue;
        const insetX = Math.round(cellWidth * gapRatio);
        const insetLeft = Math.floor(insetX / 2);
        const drawWidth = cellWidth - insetX;
        if (drawWidth <= 0 || drawHeight <= 0) continue;

        const opacity = alpha === 0 ? inactiveOpacity : litOpacity * (alpha / 255);
        if (opacity <= 0) continue;

        const color: PixColor = alpha === 0 ? backdrop : this.readColor(offset);
        context.globalAlpha = Math.min(1, opacity);
        context.fillStyle = this.cssColor(color);
        context.fillRect(
          left + insetLeft,
          top + insetTop,
          drawWidth,
          drawHeight,
        );
      }
    }

    context.globalAlpha = 1;
    this.drawnRevision = this.display.getRevision();
  }

  /** True when the last painted revision still matches the framebuffer. */
  isUpToDate(): boolean {
    return this.drawnRevision === this.display.getRevision();
  }

  getLastTimeline(): PixTimeline | null {
    return this.lastTimeline;
  }

  private readColor(offset: number): PixColor {
    const data = this.display.framebuffer.data;
    return (
      ((data[offset] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3]) >>>
      0
    );
  }

  private cssColor(color: PixColor): string {
    const { r, g, b } = unpackRgba(color);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

export function createCanvasPixRenderer(
  display: PixDisplay,
  options?: CanvasPixRendererOptions,
): CanvasPixRenderer {
  return new CanvasPixRenderer(display, options);
}
