import { createPixGeometry, type PixGeometry } from "./geometry";
import { TRANSPARENT, unpackRgba, type PixColor } from "./color";

/**
 * ============================================================================
 * PIXEL DISPLAY — FRAMEBUFFER
 * ============================================================================
 * The authoritative state of every logical pixel.
 *
 * REPRESENTATION (roadmap [C4])
 *  - One canonical `Uint8ClampedArray` in RGBA byte order, 4 bytes per cell,
 *    row-major from the logical origin. No packed/integer view is introduced;
 *    that optimization is deferred until profiling justifies it.
 *  - Alpha `0` is the canonical "off" pixel. Whether an off pixel is drawn
 *    faintly is a *presentation* decision and lives in the renderer — the
 *    framebuffer only records state (roadmap boundary B5).
 *
 * DETERMINISM
 *  - Every mutating method is a plain synchronous write with no clamping of
 *    coordinates into neighbouring cells and no wrapping. Callers are expected
 *    to have checked bounds; the display layer is the single owner of that
 *    check.
 *
 * The framebuffer deliberately has no dependency on the DOM, on React, or on
 * anything Sylf-specific, so it is unit-testable without a browser.
 * ============================================================================
 */

export class PixFramebuffer {
  readonly geometry: PixGeometry;
  /** Live RGBA bytes. Exposed read-only for rendering and deterministic tests. */
  readonly data: Uint8ClampedArray;
  /** Increments on every mutation so consumers can skip redundant redraws. */
  private revision = 0;

  constructor(width: number, height: number) {
    this.geometry = createPixGeometry(width, height);
    this.data = new Uint8ClampedArray(this.geometry.byteLength);
  }

  get width(): number {
    return this.geometry.width;
  }

  get height(): number {
    return this.geometry.height;
  }

  /** Current revision counter. Advances on every framebuffer mutation. */
  getRevision(): number {
    return this.revision;
  }

  /**
   * Records that the framebuffer changed through a path that wrote `data`
   * directly. Callers that mutate `data` in place are responsible for calling
   * this exactly once per logical edit.
   */
  markDirty(): void {
    this.revision += 1;
  }

  /** Transparent everywhere. */
  clear(): void {
    this.data.fill(0);
    this.revision += 1;
  }

  /** Fills every cell with one color. */
  fill(color: PixColor): void {
    const { r, g, b, a } = unpackRgba(color);
    for (let offset = 0; offset < this.data.length; offset += 4) {
      this.data[offset] = r;
      this.data[offset + 1] = g;
      this.data[offset + 2] = b;
      this.data[offset + 3] = a;
    }
    this.revision += 1;
  }

  /** Reads a cell. `index` must come from `geometry.indexOf`. */
  readIndex(index: number): PixColor {
    const data = this.data;
    return (
      ((data[index] << 24) |
        (data[index + 1] << 16) |
        (data[index + 2] << 8) |
        data[index + 3]) >>>
      0
    );
  }

  /** Writes a cell. `index` must come from `geometry.indexOf`. */
  writeIndex(index: number, color: PixColor): void {
    const { r, g, b, a } = unpackRgba(color);
    const data = this.data;
    data[index] = r;
    data[index + 1] = g;
    data[index + 2] = b;
    data[index + 3] = a;
    this.revision += 1;
  }

  /**
   * Copies `source` into this framebuffer with its top-left at `(originX,
   * originY)`. Source cells that fall outside this framebuffer are skipped, so
   * a partially off-surface composition is well defined.
   */
  blit(
    source: PixFramebuffer,
    originX = 0,
    originY = 0,
    skipTransparent = true,
  ): void {
    const target = this.geometry;
    const sourceData = source.data;
    const targetData = this.data;
    const rowBytes = source.width * 4;

    for (let sy = 0; sy < source.height; sy += 1) {
      const ty = originY + sy;
      if (ty < 0 || ty >= target.height) continue;
      for (let sx = 0; sx < source.width; sx += 1) {
        const tx = originX + sx;
        if (tx < 0 || tx >= target.width) continue;
        const from = sy * rowBytes + sx * 4;
        if (skipTransparent && sourceData[from + 3] === 0) continue;
        const to = (ty * target.width + tx) * 4;
        targetData[to] = sourceData[from];
        targetData[to + 1] = sourceData[from + 1];
        targetData[to + 2] = sourceData[from + 2];
        targetData[to + 3] = sourceData[from + 3];
      }
    }
    this.revision += 1;
  }

  /** Writes a detached RGBA byte copy. The framebuffer keeps its own storage. */
  copyInto(target: Uint8ClampedArray): void {
    target.set(this.data);
  }

  /** Detached RGBA byte snapshot, used by deterministic tests. */
  toBytes(): Uint8ClampedArray {
    return this.data.slice();
  }

  /** Detached packed-color snapshot in logical row-major order. */
  toColors(): PixColor[] {
    const colors: PixColor[] = new Array(this.geometry.cellCount);
    for (let cell = 0; cell < this.geometry.cellCount; cell += 1) {
      colors[cell] = this.readIndex(cell * 4);
    }
    return colors;
  }

  /**
   * Number of cells that differ from the canonical "off" pixel. Useful as a
   * cheap composition assertion in tests and in the dev surface readout.
   */
  litCount(): number {
    let lit = 0;
    for (let offset = 3; offset < this.data.length; offset += 4) {
      if (this.data[offset] !== 0) lit += 1;
    }
    return lit;
  }

  /** True when nothing on the display is lit. */
  isEmpty(): boolean {
    for (let offset = 3; offset < this.data.length; offset += 4) {
      if (this.data[offset] !== 0) return false;
    }
    return true;
  }
}

/** Creates a blank framebuffer of the given logical size. */
export function createFramebuffer(width: number, height: number): PixFramebuffer {
  return new PixFramebuffer(width, height);
}

/** Resets a framebuffer to transparent without allocating a new buffer. */
export function clearFramebuffer(framebuffer: PixFramebuffer): void {
  framebuffer.clear();
}

export { TRANSPARENT };
