/**
 * ============================================================================
 * SYLF — REFERENCE CHARACTER: LUMIS THE CELESTIAL SCHOLAR FAMILIAR
 * ============================================================================
 * The primary visual companion for Sylf: an original celestial familiar
 * (star-hare / astral fox) wearing a hooded mystic scholar robe and holding
 * an illuminated celestial grimoire atop an observatory sanctuary dais.
 *
 * Authored natively for the 32 × 32 Pixel Display reference grid with
 * six expressive eye states (open, focused, half, closed, sleeping, happy),
 * ambient starlight motes, and rosy blush.
 * ============================================================================
 */

import type { PixelAsset, PixelAssetState, PixelPlane } from "@/lib/pixel-display/content/asset/types";
import { PIXEL_ASSET_VERSION } from "@/lib/pixel-display/content/asset/types";

/**
 * Palette for Lumis:
 * Single characters representing each tone, with single-character keys.
 */
const LUMIS_PALETTE = {
  // Fur & Ears
  f: "#f8fafc",
  b: "#e2e8f0",
  v: "#cbd5e1",
  p: "#c084fc",
  P: "#f472b6",
  e: "#475569",

  // Cowl & Robe
  H: "#1e1b4b",
  J: "#312e81",
  I: "#4338ca",
  i: "#6366f1",

  // Gold Trim, Amulet & Crest
  G: "#f59e0b",
  A: "#fbbf24",

  // Face, Eyes & Nose
  K: "#20243f",
  T: "#ffffff",
  E: "#38bdf8",
  N: "#475569",
  Q: "#fbd6ff",

  // Grimoire / Tome
  k: "#1e3a8a",
  q: "#ffffff",
  j: "#fef9c3",
  d: "#93c5fd",

  // Celestial Ambience Sparkles
  Z: "#38bdf8",
  V: "#c084fc",
  "1": "#ffffff",
} as const;

/**
 * 32 × 32 raster geometry for Lumis's body, cowl, grimoire, robe, and tail.
 */
const LUMIS_BODY_ROWS = [
  "................................", // 0
  "................................", // 1
  "................................", // 2
  "................................", // 3
  "................................", // 4
  ".........ee..........ee.........", // 5: Ear tips
  "........eppe........eppe........", // 6: Ear upper + pink/lavender glow
  "........ePpe..AA....epPe........", // 7: Ear mid + golden forehead crest
  "........ePPJHHHHHHHHJPe.........", // 8: Ear base into hood peak
  "........eJJHHHHHHHHHHJe.........", // 9: Hood upper drape
  "........JHHffffffffffHHJ........", // 10: Hood framing forehead/fur
  ".......JHHfbbbbbbbbbbbfHHJ......", // 11: Fur brow
  ".......JHfbb..bbbb..bbfHJ.......", // 12: Eye row 1 sockets open
  ".......JHfbb..bbbb..bbfHJ.......", // 13: Eye row 2 sockets open
  ".......JHfbbbbbNNbbbbbfHJ.......", // 14: Cheeks + cute nose
  "........JHHfvbbbbbbvfHHJ........", // 15: Chin & cowl wrap
  ".......JIIJGGAGGGIIiJ...........", // 16: Shoulders + golden star amulet
  "......JIIHbb....bbHIIJ..effe....", // 17: Robe chest + paws + tail upper
  ".....JIIHfb.qqqq.bfHIIJ.effe....", // 18: Grimoire page top + tail
  ".....JIIHfbqddddqbfHIIJ.effe....", // 19: Grimoire pages with blue runes + tail
  "......JHHbkjqqjjkbfHHJJ.ffee....", // 20: Grimoire spine + cover + tail body
  ".......JHbkk....kkbHHJ..ee......", // 21: Book bottom + robe lap
  "........JJJ......JJJ............", // 22: Robe hem
  "................................", // 23: Hem shadow (clears row 24 rim)
  "................................", // 24
  "................................", // 25
  "................................", // 26
  "................................", // 27
  "................................", // 28
  "................................", // 29
  "................................", // 30
  "................................", // 31
] as const;

/**
 * Cheek blush plane, activated during celebrations.
 */
const BLUSH_ROWS = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "..........QQ........QQ..........", // 14: Rosy blush on cheeks
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
] as const;

/**
 * Floating celestial motes and starlight sparks.
 */
const SPARKLES_ROWS = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  ".....Z..........................", // 11: Cyan spark
  "................................",
  "................................",
  "................................",
  "..........................V.....", // 15: Violet spark
  "................................",
  "...V............................", // 17: Violet spark
  "................................",
  "................................",
  "...........................Z....", // 20: Cyan spark
  "................................",
  "....1...........................", // 22: Pure star spark
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
] as const;

/**
 * Creates raster plane for each eye shape.
 */
function eyePlane(
  shape: "open" | "focused" | "half" | "closed" | "sleeping" | "happy",
  label: string,
): PixelPlane {
  const rows = Array.from({ length: 32 }, () => "................................");

  if (shape === "open") {
    rows[12] = "............TK....TK............";
    rows[13] = "............EK....EK............";
  } else if (shape === "focused") {
    rows[12] = "............KK....KK............";
    rows[13] = "............ET....ET............";
  } else if (shape === "half") {
    rows[12] = "............KK....KK............";
    rows[13] = "............EE....EE............";
  } else if (shape === "closed") {
    rows[13] = "............KK....KK............";
  } else if (shape === "sleeping") {
    rows[13] = "............KK....KK............";
  } else if (shape === "happy") {
    rows[12] = "............KK....KK............";
    rows[13] = "...........K..K..K..K...........";
  }

  return {
    id: `eyes-${shape}`,
    label: `Eyes — ${label}`,
    geometry: {
      geometry: "raster",
      rows,
    },
  };
}

function state(
  id: string,
  label: string,
  show: readonly string[],
): PixelAssetState {
  return { id, label, show };
}

export const SYLF_CHARACTER_ASSET: PixelAsset = {
  version: PIXEL_ASSET_VERSION,
  id: "sylf:sylf-character",
  kind: "character",
  name: "Sylf",
  description:
    "Lumis the Celestial Scholar Familiar: a star-hare companion in an observatory sanctuary with six expressive eye states.",
  reference: { width: 32, height: 32 },
  framing: { scale: "fit-short-side", scaleShare: 0.63, verticalBias: 0.2 },
  palette: { ...LUMIS_PALETTE },
  planes: [
    {
      id: "body",
      label: "Body & Grimoire",
      geometry: { geometry: "raster", rows: [...LUMIS_BODY_ROWS] },
    },
    {
      id: "blush",
      label: "Cheeks",
      geometry: { geometry: "raster", rows: [...BLUSH_ROWS] },
    },
    eyePlane("open", "Open"),
    eyePlane("focused", "Focused"),
    eyePlane("half", "Half-lidded"),
    eyePlane("closed", "Closed"),
    eyePlane("sleeping", "Asleep"),
    eyePlane("happy", "Happy"),
    {
      id: "sparkles",
      label: "Celestial Ambience",
      geometry: { geometry: "raster", rows: [...SPARKLES_ROWS] },
    },
  ],
  anchors: [
    {
      id: "hold-right",
      x: 31,
      y: 21,
      label: "Right grip — beside the widest row, where a held thing belongs",
    },
    {
      id: "wear-neck",
      x: 16,
      y: 10,
      label: "Neck — where a wearable sits",
    },
    {
      id: "ground",
      x: 16,
      y: 24,
      label: "Ground — where the character meets the crystal dais",
    },
    {
      id: "core",
      x: 16,
      y: 17,
      label: "Core — the body's centre, for an aura that surrounds it",
    },
  ],
  states: [
    state("IDLE", "Resting", ["body", "eyes-open", "sparkles"]),
    state("FOCUSING", "Studying", ["body", "eyes-focused"]),
    state("REST", "Asleep", ["body", "eyes-sleeping"]),
    state("CELEBRATING", "Celebrating", [
      "body",
      "blush",
      "eyes-happy",
      "sparkles",
    ]),
    state("THINKING", "Thinking", ["body", "eyes-focused", "sparkles"]),
    state("BLINK", "Blinking", ["body", "eyes-closed", "sparkles"]),
  ],
};
