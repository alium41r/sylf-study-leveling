/**
 * ============================================================================
 * REFERENCE ASSET — EMBER AURA (aura)
 * ============================================================================
 * A visual cosmetic that surrounds a character rather than being worn or held.
 *
 * WHY A SEPARATE KIND
 *   `CharacterConfig.aura` is an equipped slot with its own identifier and its
 *   own catalogue, and the renderer draws it as a bloom *behind* everything
 *   else. An aura is not a wearable — it is not attached to a body part — and it
 *   is not a held item — it is not gripped. Giving it its own kind means its
 *   anchor says what it actually means ("the body's centre"), rather than
 *   pretending to be a hat.
 *
 * HOW IT IS CLIPPED
 *   The rays are authored across the whole grid and marked `clippedToPrevious`,
 *   so they paint **only where the character already painted**. That is what
 *   turns a scatter of cells into a glow *inside* the silhouette without the
 *   aura asset knowing anything about the character's shape — the body remains
 *   the authority, exactly as the character's own face planes are clipped to its
 *   body.
 *
 *   The alternative — an unclipped ring — would need coordinates chosen to miss
 *   the silhouette, which would break the moment the character changed. Clipping
 *   is the smaller and more durable mechanism, and Phase 5 already had it.
 * ============================================================================
 */

import type { PixelAsset } from "../types";
import { PIXEL_ASSET_VERSION } from "../types";

/**
 * Rays radiating from the core, on the character's own 32 × 32 grid.
 *
 * Authored as spans so the pattern is readable as angles rather than as rows of
 * dots. Every one of these cells is offered to the clip; the ones outside the
 * silhouette simply do not paint.
 */
function raySpans(): Array<{
  y: number;
  from: number;
  to: number;
  key: string;
}> {
  const spans: Array<{ y: number; from: number; to: number; key: string }> = [];
  // Eight directions from the core at (16, 18), each reaching outward.
  const rays: Array<[number, number, number]> = [
    // [dx, dy, length] — a coarse compass, not a circle: at this size a smooth
    // ring would be an indistinct blur, while distinct rays read as energy.
    [1, 0, 12],
    [-1, 0, 12],
    [0, -1, 9],
    [0, 1, 6],
    [1, -1, 8],
    [-1, -1, 8],
    [1, 1, 7],
    [-1, 1, 7],
  ];
  for (const [dx, dy, length] of rays) {
    for (let step = 2; step <= length; step += 1) {
      // Alternate the tone along the ray so it reads as embers rather than a
      // solid spike.
      const key = step % 3 === 0 ? "b" : "e";
      const x = 16 + dx * step;
      const y = 18 + dy * step;
      if (x < 0 || y < 0 || x >= 32 || y >= 32) continue;
      spans.push({ y, from: x, to: x + 1, key });
    }
  }
  return spans;
}

export const EMBER_AURA_ASSET: PixelAsset = {
  version: PIXEL_ASSET_VERSION,
  id: "sylf:aura-ember",
  kind: "aura",
  name: "Ember",
  description:
    "An ember glow radiating from the character's core, visible only inside the silhouette.",
  reference: { width: 32, height: 32 },
  palette: {
    /** The hotter inner tone. */
    e: "#f0a35e",
    /** The cooler outer tone. */
    b: "#a179fb",
  },
  planes: [
    {
      id: "rays",
      label: "Rays",
      clippedToPrevious: true,
      geometry: { geometry: "spans", rows: raySpans() },
    },
  ],
  anchors: [
    {
      id: "pivot",
      x: 16,
      // Meets the character's `core` anchor: an aura is centred on the body, not
      // attached to a limb.
      y: 18,
      label: "Pivot — the body's centre",
    },
  ],
  states: [
    { id: "steady", label: "Steady", show: ["rays"] },
  ],
  attachment: {
    hostKind: "character",
    hostAnchor: "core",
    pivot: "pivot",
  },
};
