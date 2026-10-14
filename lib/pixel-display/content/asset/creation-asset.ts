/**
 * ============================================================================
 * CREATION → PIXEL ASSET
 * ============================================================================
 * Turns a validated user creation into the asset the display already knows how
 * to paint, so a drawing made in Pixel Studio travels the **same** path as every
 * built-in character: the same resolver, the same painter, the same composition,
 * the same renderer and the same runtime.
 *
 * ONE-WAY ON PURPOSE
 *   A creation becomes an asset. An asset never becomes a creation. The trusted
 *   description and the untrusted one therefore cannot be confused, and there is
 *   no path by which a built-in asset could be round-tripped into user content.
 *
 * WHAT IT DOES NOT DO
 *   It does not decode, resize, repair or guess. It assumes the creation has
 *   already passed `validateCreation`, and it refuses rather than producing a
 *   partial asset if it has not. The caller supplies an explicit empty fallback.
 * ============================================================================
 */

import {
  PIXEL_ASSET_VERSION,
  type PixelAsset,
  type PixelPalette,
} from "./types";
import {
  PALETTE_DIGITS,
  validateCreation,
  type PixelCreation,
} from "./creation";

/** The plate a creation draws on. One plane, because a user drawing is one. */
export const CREATION_PLANE_ID = "drawing";
// Documents are immutable. Timeline thumbnails and all previews share one
// validated conversion; editing creates a new document and invalidates naturally.
const converted = new WeakMap<PixelCreation, { name?: string; revision?: number; asset: PixelAsset }>();

/**
 * The creation as an asset.
 *
 * Returns `null` when the creation does not validate. A `null` is what the
 * resolver turns into an empty display, which is the
 * behaviour a corrupted or unsupported creation must produce.
 */
export function creationToAsset(
  creation: PixelCreation,
  options: { name?: string; revision?: number } = {},
): PixelAsset | null {
  const cached = converted.get(creation);
  if (cached && cached.name === options.name && cached.revision === options.revision) return cached.asset;
  if (validateCreation(creation).length > 0) return null;

  const palette: Record<string, string> = {};
  creation.palette
    // Only the digits can appear in a frame, so only they can be referenced.
    // Exposing a colour with no addressable index would give the asset a palette
    // key that is not one character, which is a validation error — an asset that
    // fails its own validator is one whose anchors the resolver refuses to trust.
    .slice(0, PALETTE_DIGITS.length)
    .forEach((colour, index) => {
      // Digits are the frame alphabet, so the palette's keys *are* its indices.
      palette[PALETTE_DIGITS[index]] = colour;
    });

  const asset: PixelAsset = {
    version: PIXEL_ASSET_VERSION,
    id: creation.id,
    revision: options.revision,
    kind: "character",
    name: options.name ?? creation.name,
    description: "A companion drawn by its scholar in Pixel Studio.",
    reference: { width: creation.grid, height: creation.grid },
    // Native source coordinates fill the framebuffer. Physical padding belongs
    // to the presenter; no implicit logical shrink may alter authored pixels.
    framing: { scale: "fit-short-side", scaleShare: 1, verticalBias: 0.2 },
    // Stage ground is independent of anatomy; no hand/neck/core is invented.
    anchors: [{ id: "ground", x: creation.grid / 2, y: creation.grid - 7 }],
    palette: palette as PixelPalette,
    // A scholar's palette is a tool, not a description: a colour waiting to be
    // used is not a mistake.
    paletteMode: "allow-unused",
    planes: [
      {
        id: CREATION_PLANE_ID,
        label: "Drawing",
        geometry: {
          geometry: "animated",
          // Each entry *is* a raster geometry, not a wrapper around one.
          frames: creation.frames.map((frame) => ({
            geometry: "raster" as const,
            rows: frame.rows,
          })),
        },
      },
    ],
    animation: {
      mode: creation.playback,
      frameDurationsMs: creation.frames.map((frame) => frame.durationMs),
    },
  };
  converted.set(creation, { ...options, asset });
  return asset;
}

/**
 * The asset for a creation, or the fallback when it cannot be drawn.
 *
 * The single entry point a surface should use, so "untrusted input degrades to
 * something valid" is one function rather than a rule each caller remembers.
 */
export function creationAssetOrFallback(
  creation: unknown,
  fallback: PixelAsset,
  options: { name?: string; revision?: number } = {},
): PixelAsset {
  if (typeof creation !== "object" || creation === null) return fallback;
  return creationToAsset(creation as PixelCreation, options) ?? fallback;
}
