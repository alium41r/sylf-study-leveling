/**
 * ============================================================================
 * REFERENCE ASSET — STUDY SCARF (wearable)
 * ============================================================================
 * A raster-authored wearable, and the smallest complete example of the contract
 * for an author or an agent to copy.
 *
 * WHAT THIS FILE DEMONSTRATES
 *   - geometry authored as rows of tokens, which is the preferred form;
 *   - a plane order that *is* the composition — the knot paints after the band
 *     so it sits in front, and nothing declares a z-index;
 *   - an attachment expressed as two anchors and no coordinates: the scarf names
 *     a pivot, the character names a `wear-neck` position, and neither knows
 *     where the other is;
 *   - a palette that is entirely the asset's own, because a scarf's colours are
 *     not shared with a character.
 *
 * This is engineering reference art, not final production art.
 * ============================================================================
 */

import type { PixelAsset } from "../types";
import { PIXEL_ASSET_VERSION } from "../types";

/**
 * The band: the part that goes round the neck.
 *
 * Deliberately narrow — about a third of the reference width — because a scarf
 * reads as a scarf by its *tails*, and a band that filled the grid would leave
 * the tails nowhere to fall.
 */
const BAND_ROWS = [
  "..hhhhhhhhhhhh..",
  ".hhhhhhhhhhhhhh.",
  ".ssssssssssssss.",
] as const;

/** The knot, painted after the band so it sits in front of it. */
const KNOT_ROWS = [
  "...kkkkkk...",
  "..kkkkkkkk..",
  "..kkkkkkkk..",
  "...kkkkkk...",
] as const;

/** Two tails falling from the knot, each widening and then tapering. */
const TAIL_ROWS = [
  "..hhh..hhh..",
  "..hhh..hhh..",
  ".hhh....hhh.",
  ".hhh....hhh.",
  "hhh......hhh",
  "hhh......hhh",
  "sss......sss",
  "sss......sss",
] as const;

export const STUDY_SCARF_ASSET: PixelAsset = {
  version: PIXEL_ASSET_VERSION,
  id: "sylf:study-scarf",
  kind: "wearable",
  name: "Study Scarf",
  description:
    "A plain woven scarf with a knot and two tails. Reference wearable for the authoring contract.",
  reference: { width: 16, height: 15 },
  /**
   * Its own framing, so the scarf is reviewed at the size it would actually be
   * worn rather than filling the slot. On a host it takes the host's placement
   * instead — an attachment is sized by what holds it — so this only affects how
   * the asset looks on its own.
   */
  framing: { scale: "fit-short-side", scaleShare: 0.45, verticalBias: 0.25 },
  palette: {
    h: "#d98a6a",
    k: "#b86b4e",
    s: "#8f4f38",
  },
  planes: [
    {
      id: "band",
      label: "Band",
      geometry: { geometry: "raster", rows: BAND_ROWS },
    },
    {
      id: "tails",
      label: "Tails",
      // Starts below the knot's first row so the knot overlaps it, which is what
      // paint order is for.
      geometry: {
        geometry: "raster",
        rows: [...blankRows(4), ...TAIL_ROWS],
      },
    },
    {
      id: "knot",
      label: "Knot",
      geometry: {
        geometry: "raster",
        rows: [...blankRows(1), ...KNOT_ROWS],
      },
    },
  ],
  anchors: [
    {
      id: "pivot",
      x: 8,
      y: 1,
      label: "Pivot — the band's centre line",
    },
  ],
  attachment: {
    hostKind: "character",
    // The character's own anchor, named here without knowing its coordinates.
    hostAnchor: "wear-neck",
    pivot: "pivot",
  },
};

/** `count` empty rows, for offsetting a plane down the reference grid. */
function blankRows(count: number): string[] {
  return Array.from({ length: count }, () => "");
}
