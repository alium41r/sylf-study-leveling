/**
 * ============================================================================
 * PIXEL DISPLAY — COLOR
 * ============================================================================
 * Colors are stored as a single 32-bit unsigned integer in the natural RGBA
 * byte order (`0xRRGGBBAA`), matching the canonical `Uint8ClampedArray` RGBA
 * framebuffer layout so a write needs no conversion.
 *
 * `ImageData` itself uses little-endian `0xAABBGGRR`, which is why the renderer
 * — and only the renderer — performs that byte swap. The engine model stays
 * endianness-agnostic and browser-agnostic.
 * ============================================================================
 */

/** `0xRRGGBBAA` as an unsigned 32-bit integer. */
export type PixColor = number;

/** Fully transparent — the canonical "off" pixel. */
export const TRANSPARENT: PixColor = 0x00000000;

/** Opaque black. Used for display backdrops, never for "off" pixels. */
export const BLACK: PixColor = 0x000000ff;

export function packRgba(
  r: number,
  g: number,
  b: number,
  a: number,
): PixColor {
  return (((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff)) >>> 0;
}

export function unpackRgba(color: PixColor): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  return {
    r: (color >>> 24) & 0xff,
    g: (color >>> 16) & 0xff,
    b: (color >>> 8) & 0xff,
    a: color & 0xff,
  };
}

/**
 * Builds a color from a `#rgb`, `#rrggbb` or `#rrggbbaa` string. Content
 * authoring is the only intended caller; invalid input throws so a typo is a
 * loud failure at authoring time rather than a silently transparent pixel.
 */
export function hexToPixColor(hex: string): PixColor {
  const value = hex.trim().replace(/^#/, "");
  const expanded =
    value.length === 3 || value.length === 4
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  if (expanded.length !== 6 && expanded.length !== 8) {
    throw new SyntaxError(`Unsupported color literal: "${hex}"`);
  }
  if (!/^[0-9a-fA-F]+$/.test(expanded)) {
    throw new SyntaxError(`Unsupported color literal: "${hex}"`);
  }
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  const a = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) : 0xff;
  return packRgba(r, g, b, a);
}

export function pixColorToHex(color: PixColor): string {
  const { r, g, b, a } = unpackRgba(color);
  const rgb = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  return a === 0xff ? rgb : `${rgb}${a.toString(16).padStart(2, "0")}`;
}

/** True when the color contributes nothing to the display. */
export function isTransparent(color: PixColor): boolean {
  return (color & 0xff) === 0;
}

/**
 * Multiplies a color's alpha by `factor` (0..1), preserving hue. Used by the
 * presenter to render inactive cells faintly without a second color model.
 */
export function scaleAlpha(color: PixColor, factor: number): PixColor {
  const { r, g, b, a } = unpackRgba(color);
  const alpha = Math.max(0, Math.min(255, Math.round(a * factor)));
  return packRgba(r, g, b, alpha);
}

/** Linear blend from `from` to `to` by `t` (0..1), including alpha. */
export function mixPixColor(from: PixColor, to: PixColor, t: number): PixColor {
  const clamped = Math.max(0, Math.min(1, t));
  const a = unpackRgba(from);
  const b = unpackRgba(to);
  const lerp = (start: number, end: number) =>
    Math.round(start + (end - start) * clamped);
  return packRgba(
    lerp(a.r, b.r),
    lerp(a.g, b.g),
    lerp(a.b, b.b),
    lerp(a.a, b.a),
  );
}
