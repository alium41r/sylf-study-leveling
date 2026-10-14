/**
 * ============================================================================
 * PIXEL DISPLAY — LOGICAL GEOMETRY
 * ============================================================================
 * The entire display is a fixed grid of logical cells. This module owns the
 * only arithmetic that maps a logical cell into framebuffer storage.
 *
 * INVARIANTS
 *  - Coordinates are logical cells. They know nothing about CSS pixels,
 *    viewport size, device pixel ratio or card width (roadmap boundary B3).
 *  - The origin `(0, 0)` is the top-left cell.
 *  - Out-of-bounds coordinates are representable but never indexable. The
 *    single `contains` predicate is the one source of truth for that rule;
 *    callers refuse out-of-bounds writes rather than clamping them.
 * ============================================================================
 */

export interface PixPoint {
  x: number;
  y: number;
}

export interface PixGeometry {
  /** Logical cells across. */
  readonly width: number;
  /** Logical cells down. */
  readonly height: number;
  /** Total addressable cells (`width * height`). */
  readonly cellCount: number;
  /** Total bytes in an RGBA framebuffer of this geometry (`cellCount * 4`). */
  readonly byteLength: number;
  /** True when `(x, y)` addresses a real cell. */
  contains(x: number, y: number): boolean;
  /** Byte offset of `(x, y)`. Only valid when `contains(x, y)`. */
  indexOf(x: number, y: number): number;
}

/** A geometry is only usable when both axes are positive whole cell counts. */
export function isValidGridSize(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0
  );
}

export function createPixGeometry(width: number, height: number): PixGeometry {
  if (!isValidGridSize(width, height)) {
    throw new RangeError(
      `Pixel geometry requires positive integer dimensions, received ${width}x${height}.`,
    );
  }
  const cellCount = width * height;
  return {
    width,
    height,
    cellCount,
    byteLength: cellCount * 4,
    contains(x: number, y: number) {
      return (
        Number.isInteger(x) &&
        Number.isInteger(y) &&
        x >= 0 &&
        y >= 0 &&
        x < width &&
        y < height
      );
    },
    indexOf(x: number, y: number) {
      return (y * width + x) * 4;
    },
  };
}

/** Unpacks a stored byte offset back into logical coordinates. */
export function pointAt(geometry: PixGeometry, index: number): PixPoint {
  const cell = index / 4;
  return { x: cell % geometry.width, y: Math.floor(cell / geometry.width) };
}
