/**
 * ============================================================================
 * REFERENCE ASSET — OBSERVATORY SANCTUARY PEDESTAL (pedestal)
 * ============================================================================
 * The cohesive environment and ground pedestal for the Sylf companion:
 * an arched celestial observatory window framing the night sky, moon, stars,
 * hanging study lantern, and a floating geometric crystal dais.
 *
 * Owned by the pedestal slot so the environment and ground form a unified,
 * harmonious setting beneath and around the companion.
 * ============================================================================
 */

import type { PixelAsset } from "../types";
import { PIXEL_ASSET_VERSION } from "../types";

/**
 * Palette for the Observatory Sanctuary:
 * - Stone arch frame (D, S, M, L, l)
 * - Hanging brass lantern & flame (c, O, Y, W, o)
 * - Night sky, crescent moon & constellation stars (m, y, g, w, s)
 * - Floating crystal dais platform (R, r, C, U, u, X, x)
 */
const SANCTUARY_PALETTE = {
  // Stone arch
  D: "#0b0f19",
  S: "#1e293b",
  M: "#334155",
  L: "#475569",
  l: "#64748b",

  // Lantern
  c: "#78716c",
  O: "#d97706",
  Y: "#fbbf24",
  W: "#ffffff",
  o: "#92400e",

  // Night Sky, Moon & Stars
  m: "#fef9c3",
  y: "#fef08a",
  g: "#ca8a04",
  w: "#ffffff",
  s: "#93c5fd",

  // Crystal Dais Platform (Ground rows 24-31)
  R: "#38bdf8",
  r: "#0284c7",
  C: "#1d4ed8",
  U: "#1e3a8a",
  u: "#172554",
  X: "#60a5fa",
  x: "#93c5fd",
} as const;

/**
 * 32 × 32 raster geometry for the sanctuary environment and dais.
 * Coordinates where the character sits (rows 5..23, cols 7..26) are transparent (`.`)
 * to guarantee strict disjointness and zero pixel overwrites.
 */
const SANCTUARY_ROWS = [
  "DDDDSSSSMMLLllllLLMMSSSSDDDDDDDD", // 0
  "DSSMML..s......w......s...MMSSDD", // 1
  "DSML......s................LMSDD", // 2
  "SML..c......w............yymLSDD", // 3
  "SL..OcO.................yyymLSDD", // 4
  "ML..OYO....s...........gyyymMSDD", // 5
  "ML.OOWOO................yyymMSDD", // 6
  "ML..OYO..................yymMSDD", // 7
  "ML..OoO.....................MSDD", // 8
  "ML...o.s....................MSDD", // 9
  "ML..........................MSDD", // 10
  "SL..........................LSDD", // 11
  "SL..........................LSDD", // 12
  "SL..........................LSDD", // 13
  "SL....s.....................LSDD", // 14
  "SL..........................LSDD", // 15
  "SL..........................LSDD", // 16
  "SL..........................LSDD", // 17
  "SL..........................LSDD", // 18
  "SL..........................LSDD", // 19
  "SL..........................LSDD", // 20
  "SML........................LMSDD", // 21
  "SSML......................LMSSDD", // 22
  "SSSMMLL................LLMMSSSDD", // 23
  "....xRRRRRRRRRRRRRRRRRRRRXx.....", // 24
  ".....rXXXXXXXXXXXXXXXXXXr.......", // 25
  "......rUCCCCCCCCCCCCCCUr........", // 26
  "........uUCCCCCCCCCCUu..........", // 27
  "..........uUCCCCCCUu............", // 28
  "............uUUUUu..............", // 29
  ".............uuuu...............", // 30
  "..............uu................", // 31
] as const;

export const MEADOW_PEDESTAL_ASSET: PixelAsset = {
  version: PIXEL_ASSET_VERSION,
  id: "sylf:pedestal-meadow",
  kind: "pedestal",
  name: "Observatory Sanctuary",
  description:
    "The observatory sanctuary: an arched night-sky window with glowing crescent moon, hanging lantern, and floating faceted crystal dais.",
  reference: { width: 32, height: 32 },
  palette: { ...SANCTUARY_PALETTE },
  planes: [
    {
      id: "ground",
      label: "Ground & Sanctuary",
      geometry: {
        geometry: "raster",
        rows: [...SANCTUARY_ROWS],
      },
    },
  ],
  anchors: [
    {
      id: "pivot",
      x: 16,
      y: 24,
      label: "Pivot — where the character meets the crystal dais",
    },
  ],
  attachment: {
    hostKind: "character",
    hostAnchor: "ground",
    pivot: "pivot",
  },
};
