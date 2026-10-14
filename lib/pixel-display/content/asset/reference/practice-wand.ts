/**
 * ============================================================================
 * REFERENCE ASSET — PRACTICE WAND (held)
 * ============================================================================
 * A raster-authored held item, and the second half of the attachment story: the
 * character says where a held thing belongs, this asset says where it is gripped,
 * and the two meet by subtraction in reference space.
 *
 * WHAT THIS FILE DEMONSTRATES
 *   - a pivot that is deliberately **not** the art's centre: the grip is near the
 *     bottom, because that is where a hand would be. Getting this right is the
 *     whole reason a pivot is authored rather than assumed;
 *   - a plane-local palette (`gem`), so a plane can bring colours the asset
 *     palette does not carry while the shared tones stay shared;
 *   - two frames of the same asset expressed as **states**, one of them adding a
 *     plane rather than replacing pixels.
 *
 * This is engineering reference art, not final production art.
 * ============================================================================
 */

import type { PixelAsset } from "../types";
import { PIXEL_ASSET_VERSION } from "../types";

/**
 * The wand, on a 5 × 15 reference grid.
 *
 * Narrow on purpose. A held item is small relative to the character holding it,
 * and this one is placed by its **grip** — near the bottom — so the shaft rises
 * from the hand rather than hanging from it.
 *
 * The proportions matter more than they look: at the real dashboard card a
 * reference cell is about two device pixels, so a one-cell shaft reads as a
 * hairline and three cells reads as a plank. Two cells of wood inside a darker
 * outline is the thinnest that still reads as something held.
 */
const SHAFT_ROWS = [
  ".ooo.",
  ".www.",
  ".www.",
  ".www.",
  ".www.",
  ".ooo.",
  ".ooo.",
  ".ooo.",
  "okkkk",
  "okkkk",
  "okkkk",
  ".ooo.",
  ".ooo.",
  ".ooo.",
  ".o.o.",
] as const;

/** The focus crystal: a small flame, wider than the shaft so it reads at size. */
const CRYSTAL_ROWS = [
  "..h..",
  ".hHh.",
  "hHHHh",
  ".hHh.",
  "..h..",
] as const;

/**
 * The charging halo.
 *
 * Four corner pixels and nothing else — at this size a denser glow would swallow
 * the crystal it is meant to frame.
 */
const GLOW_ROWS = [
  "g...g",
  ".....",
  ".....",
  ".....",
  "g...g",
] as const;

export const PRACTICE_WAND_ASSET: PixelAsset = {
  version: PIXEL_ASSET_VERSION,
  id: "sylf:practice-wand",
  kind: "held",
  name: "Practice Wand",
  description:
    "A short wooden wand with a focus crystal and a charging glow. Reference held item for the authoring contract.",
  reference: { width: 5, height: 15 },
  /** Its own framing for standalone review; a host's placement overrides it. */
  framing: { scale: "fit-short-side", scaleShare: 0.55, verticalBias: 0.2 },
  palette: {
    /** Lit face of the wood. */
    w: "#b98a5c",
    /** Outline and shaded face, which is what gives the shaft an edge. */
    o: "#7d5636",
    /** The grip wrap. */
    k: "#46301f",
    /** The crystal's body and its bright core. */
    h: "#a179fb",
    H: "#e0d4ff",
    /** The charging halo. */
    g: "#5ac9d1",
  },
  planes: [
    {
      id: "shaft",
      label: "Shaft",
      geometry: { geometry: "raster", rows: SHAFT_ROWS },
    },
    {
      id: "crystal",
      label: "Focus crystal",
      geometry: { geometry: "raster", rows: CRYSTAL_ROWS },
      // A plane may carry colours of its own. Merged over the asset palette, so
      // the shared tones stay shared and only the exception is local.
      // A plane may carry colours of its own, merged over the asset palette.
      palette: { H: "#ffffff" },
    },
    {
      id: "glow",
      label: "Charging glow",
      geometry: {
        geometry: "raster",
        rows: [...blankRows(1), ...GLOW_ROWS],
      },
    },
  ],
  anchors: [
    {
      id: "pivot",
      x: 2,
      y: 12,
      label: "Grip — low on the shaft, where a hand closes",
    },
    {
      id: "tip",
      x: 2,
      y: 0,
      label: "Tip — where the crystal sits",
    },
  ],
  /**
   * Two frames of one asset.
   *
   * `idle` hides the glow plane rather than authoring a second wand without it.
   * That is the composition model: a state selects planes, so the two frames
   * share every pixel they have in common.
   */
  states: [
    {
      id: "idle",
      label: "At rest",
      show: ["shaft", "crystal"],
    },
    {
      id: "charging",
      label: "Charging",
      show: ["shaft", "crystal", "glow"],
    },
  ],
  attachment: {
    hostKind: "character",
    hostAnchor: "hold-right",
    pivot: "pivot",
  },
};

/** `count` empty rows, for offsetting a plane down the reference grid. */
function blankRows(count: number): string[] {
  return Array.from({ length: count }, () => "");
}
