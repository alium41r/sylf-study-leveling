import { PixFramebuffer } from "./framebuffer";
import { createPixGeometry, type PixGeometry } from "./geometry";
import { TRANSPARENT, type PixColor } from "./color";

/**
 * ============================================================================
 * PIXEL DISPLAY — PUBLIC DISPLAY API
 * ============================================================================
 * `PixDisplay` is the object every consumer talks to. It owns a framebuffer and
 * is the single authority for what a logical coordinate means.
 *
 * BOUNDS CONTRACT (roadmap [C4] — deterministic no-op)
 *  - `setPixel` outside the logical grid returns `false` and leaves the
 *    framebuffer byte-identical. It never throws, never wraps to the next row,
 *    and never clamps onto a neighbouring edge cell. Clamping would silently
 *    paint the wrong pixel, which is strictly worse than refusing the write.
 *  - `getPixel` outside the grid returns the canonical "off" color.
 *  - `inBounds` is the one predicate behind all of the above.
 *
 * `PixPlane` is the presentation-side write interface: a plane only knows how
 * to write pixels, so a content module cannot read or reach the framebuffer
 * directly (roadmap boundaries B3 and B5).
 * ============================================================================
 */

export interface PixPlane {
  /** Writes one logical pixel. Out-of-bounds writes are ignored. */
  setPixel(x: number, y: number, color: PixColor): boolean;
  /** Fills the whole plane with one color. */
  fill(color: PixColor): void;
  /** Resets the whole plane to transparent. */
  clear(): void;
}

export interface PixDisplayOptions {
  /** Initial clear color. Defaults to transparent ("off"). */
  background?: PixColor;
}

export class PixDisplay implements PixPlane {
  readonly geometry: PixGeometry;
  readonly framebuffer: PixFramebuffer;

  constructor(width: number, height: number, options: PixDisplayOptions = {}) {
    this.geometry = createPixGeometry(width, height);
    this.framebuffer = new PixFramebuffer(width, height);
    if (options.background !== undefined) {
      this.framebuffer.fill(options.background);
    }
  }

  get width(): number {
    return this.geometry.width;
  }

  get height(): number {
    return this.geometry.height;
  }

  /** True when `(x, y)` addresses a real logical cell. */
  inBounds(x: number, y: number): boolean {
    return this.geometry.contains(x, y);
  }

  setPixel(x: number, y: number, color: PixColor): boolean {
    if (!this.geometry.contains(x, y)) return false;
    this.framebuffer.writeIndex(this.geometry.indexOf(x, y), color);
    return true;
  }

  getPixel(x: number, y: number): PixColor {
    if (!this.geometry.contains(x, y)) return TRANSPARENT;
    return this.framebuffer.readIndex(this.geometry.indexOf(x, y));
  }

  fill(color: PixColor): void {
    this.framebuffer.fill(color);
  }

  clear(): void {
    this.framebuffer.clear();
  }

  /**
   * Writes many pixels in one pass. Each cell records its own revision, so the
   * revision after this call has advanced by the number of cells written — it is
   * a change counter, not a batching mechanism. `blit` is the entry point that
   * records a whole plane as one edit.
   */
  setMany(pixels: Iterable<readonly [number, number, PixColor]>): void {
    for (const [x, y, color] of pixels) {
      if (!this.geometry.contains(x, y)) continue;
      this.framebuffer.writeIndex(this.geometry.indexOf(x, y), color);
    }
  }

  /**
   * Composites a detached source framebuffer onto this display at a logical
   * origin. Cells falling outside the display are skipped, so a partially
   * off-surface plane stays well defined.
   */
  blit(
    source: PixFramebuffer,
    originX = 0,
    originY = 0,
    skipTransparent = true,
  ): void {
    if (skipTransparent) {
      this.blitSkippingTransparent(source, originX, originY);
      return;
    }
    this.framebuffer.blit(source, originX, originY, false);
  }

  /**
   * Composites a sparse plane: transparent source cells leave the target alone,
   * and the whole plane is recorded as **one** revision, because a plane is one
   * logical edit.
   */
  blitPlane(source: PixFramebuffer, originX = 0, originY = 0): void {
    this.blitSkippingTransparent(source, originX, originY);
  }

  private blitSkippingTransparent(
    source: PixFramebuffer,
    originX: number,
    originY: number,
  ): void {
    const sourceData = source.data;
    const targetData = this.framebuffer.data;
    const targetWidth = this.geometry.width;
    const targetHeight = this.geometry.height;
    const rowBytes = source.width * 4;

    for (let sy = 0; sy < source.height; sy += 1) {
      const ty = originY + sy;
      if (ty < 0 || ty >= targetHeight) continue;
      for (let sx = 0; sx < source.width; sx += 1) {
        const tx = originX + sx;
        if (tx < 0 || tx >= targetWidth) continue;
        const from = sy * rowBytes + sx * 4;
        if (sourceData[from + 3] === 0) continue;
        const to = (ty * targetWidth + tx) * 4;
        targetData[to] = sourceData[from];
        targetData[to + 1] = sourceData[from + 1];
        targetData[to + 2] = sourceData[from + 2];
        targetData[to + 3] = sourceData[from + 3];
      }
    }
    // One revision for the whole composite: a plane is a single logical edit.
    this.framebuffer.markDirty();
  }

  /** Current framebuffer revision — advances on every observable change. */
  getRevision(): number {
    return this.framebuffer.getRevision();
  }

  /** Count of lit cells. Used by the dev readout and composition tests. */
  litCount(): number {
    return this.framebuffer.litCount();
  }

  /** Detached packed-color snapshot in logical row-major order. */
  snapshot(): PixColor[] {
    return this.framebuffer.toColors();
  }
}

export function createPixDisplay(
  width: number,
  height: number,
  options?: PixDisplayOptions,
): PixDisplay {
  return new PixDisplay(width, height, options);
}

