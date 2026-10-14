/**
 * ============================================================================
 * PIXEL DISPLAY — PALETTE
 * ============================================================================
 * Color tokens sampled from the approved Pixel Display reference artwork.
 * These are *content*, not engine: the engine never names a color (boundary
 * B1), and content never invents a logical coordinate system (boundary B3).
 *
 * The sampled reference values are the source of truth here; they are ordinary
 * content constants, so retuning the character later is a content edit.
 * ============================================================================
 */

import { hexToPixColor, type PixColor } from "../engine/color";

export const SYLF_PALETTE = {
  /** Screen behind the matrix: the reference's deep navy, not pure black. */
  displayBackdrop: hexToPixColor("#0b1220"),
  /** Character body highlight. */
  bodyHighlight: hexToPixColor("#dcebfd"),
  /** Character body mid tone. */
  body: hexToPixColor("#c0d8f0"),
  /** Character body shade. */
  bodyShade: hexToPixColor("#a8c0f0"),
  /** Deep body shade under the form. */
  bodyDeep: hexToPixColor("#7890c0"),
  /** Leaf / sprout greens. */
  leaf: hexToPixColor("#43e1b0"),
  leafShade: hexToPixColor("#48c0a8"),
  /** Ambient sparkle colors. */
  sparkle: hexToPixColor("#5ac9d1"),
  sparkleViolet: hexToPixColor("#a179fb"),
  /** Cheek blush. */
  blush: hexToPixColor("#fbd6ff"),
  /** Eye ink and the eye glint. */
  eye: hexToPixColor("#20243f"),
  eyeGlint: hexToPixColor("#ffffff"),
} as const;

export type SylfPaletteKey = keyof typeof SYLF_PALETTE;

export type SylfPalette = Readonly<Record<SylfPaletteKey, PixColor>>;
