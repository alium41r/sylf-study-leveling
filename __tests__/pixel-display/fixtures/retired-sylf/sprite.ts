/**
 * ============================================================================
 * PIXEL DISPLAY — SYLF CHARACTER SPRITE
 * ============================================================================
 * The Sylf companion authored entirely as logical pixel data. There is no PNG,
 * no SVG, no sprite sheet and no texture: every cell below is a span on a small
 * reference grid, resolved to a palette color at draw time.
 *
 * FLAT AND EXPLICITLY ORDERED (roadmap §13, and Phase 2's constraint)
 *   A character is a **flat list of named planes painted in a declared order**:
 *
 *     body → leaves → blush → eyes
 *
 *   There is no scene graph, no layer hierarchy, no z-index and no compositing
 *   algebra. "Composition" means exactly "paint these planes in this order",
 *   which is the whole abstraction the doc asks for at this stage: a state is a
 *   selection of planes, not a separate full-character image.
 *
 * EACH PLANE IS INDEPENDENT
 *   Every plane has its own table and its own draw entry point, so a test can
 *   paint one plane and assert that nothing else changed. That property is what
 *   makes a blink cheap: the eye plane is swapped and the body is untouched.
 *
 * COORDINATE MODEL (boundary B3)
 *   Everything is authored on `SPRITE_REFERENCE` and scaled proportionally onto
 *   whatever logical resolution the display uses. Nothing here knows a CSS size,
 *   a viewport, or a device pixel ratio.
 * ============================================================================
 */

import { SYLF_PALETTE } from "@/lib/pixel-display/content/palette";
import type { PixColor } from "@/lib/pixel-display/engine/color";

/** Reference-grid size every plane below is authored against. */
export const SPRITE_REFERENCE = 32;

/** Legend key used by the authored plane tables. */
export type SpriteKey =
  | "H"
  | "B"
  | "S"
  | "D"
  | "L"
  | "G"
  | "K"
  | "T"
  | "P";

/** Maps a legend key to its palette color. `null` means "no cell". */
export const SPRITE_LEGEND: Record<SpriteKey, PixColor | null> = {
  /** Body highlight — the lit side, light falling from the upper left. */
  H: SYLF_PALETTE.bodyHighlight,
  /** Body mid tone. */
  B: SYLF_PALETTE.body,
  /** Body shade — the trailing side of the form. */
  S: SYLF_PALETTE.bodyShade,
  /** Deep body shade, used on the hem's edge. */
  D: SYLF_PALETTE.bodyDeep,
  /** Leaf. */
  L: SYLF_PALETTE.leaf,
  /** Leaf shade, stem and ground. */
  G: SYLF_PALETTE.leafShade,
  /** Eye ink. */
  K: SYLF_PALETTE.eye,
  /** Eye glint. */
  T: SYLF_PALETTE.eyeGlint,
  /** Cheek blush. */
  P: SYLF_PALETTE.blush,
};

/**
 * One row of a plane, authored as spans rather than a character string. Spans
 * keep the silhouette readable as numbers and make a row impossible to
 * mis-count — a hand-written row of 32 characters is one slipped keystroke away
 * from a silently wrong shape.
 */
export interface PlaneSpanRow {
  readonly y: number;
  /** Inclusive start column. */
  readonly from: number;
  /** Exclusive end column. */
  readonly to: number;
  readonly key: SpriteKey;
}

/**
 * One body row. The body is the only plane with directional shading, because it
 * is the only plane that describes a lit form.
 */
export interface BodySpanRow {
  readonly y: number;
  readonly from: number;
  readonly to: number;
  /**
   * Optional override for where the highlight ends and the base tone begins.
   * Left out for every row: the boundary is derived from the row's own width, so
   * the falloff stays parallel to the silhouette instead of banding.
   */
  readonly split?: number;
  /** Render the final column in deep shade, for the hem's edge. */
  readonly deepEdge?: boolean;
}

/**
 * BODY — the character's silhouette.
 *
 * A wide, soft bell: a narrow cap that flares quickly, holds its width, then
 * closes with a flat hem. The hem is *narrower* than the widest row above it,
 * which is what makes the form read as a seated creature rather than a cone.
 */
export const BODY_SPANS: readonly BodySpanRow[] = [
  // Rounded crown, flaring one column per side. A wide cap is what makes the
  // head read as round rather than as a shoulder line.
  { y: 9, from: 12, to: 20 },
  { y: 10, from: 10, to: 22 },
  { y: 11, from: 7, to: 25 },
  { y: 12, from: 6, to: 26 },
  // Face plate: the widest run on the head, so the eyes sit clear of the edge.
  { y: 13, from: 4, to: 28 },
  { y: 14, from: 4, to: 28 },
  { y: 15, from: 4, to: 28 },
  { y: 16, from: 4, to: 28 },
  // Bell flaring outward below the face.
  { y: 17, from: 3, to: 29 },
  { y: 18, from: 2, to: 30 },
  // Widest rows.
  { y: 19, from: 1, to: 31 },
  { y: 20, from: 1, to: 31 },
  // Skirt holding its width.
  { y: 21, from: 2, to: 30 },
  { y: 22, from: 2, to: 30 },
  // Hem closing to a flat, darker base.
  { y: 23, from: 5, to: 27, deepEdge: true },
];

/** The sprout stem, rising from the crown into the leaves. */
export const STEM_SPAN: PlaneSpanRow = { y: 8, from: 15, to: 17, key: "G" };

/**
 * LEAVES — the sprout. Painted after the body so the stem reads as growing from
 * behind the cap.
 */
export const LEAF_SPANS: readonly PlaneSpanRow[] = [
  // Larger leaf sweeping left.
  { y: 3, from: 9, to: 13, key: "L" },
  { y: 4, from: 7, to: 14, key: "L" },
  { y: 5, from: 6, to: 15, key: "L" },
  { y: 6, from: 7, to: 15, key: "L" },
  { y: 7, from: 9, to: 16, key: "G" },
  // Smaller leaf springing right.
  { y: 4, from: 17, to: 20, key: "L" },
  { y: 5, from: 16, to: 22, key: "L" },
  { y: 6, from: 16, to: 23, key: "L" },
  { y: 7, from: 18, to: 23, key: "G" },
];

/**
 * Cheek blush. Two short runs sitting just inside the bell's edges, one row
 * below the eyes.
 */
export const BLUSH_ROW = 19;
/**
 * Mirror pairs about the body's axis at column 16, one row below the eyes.
 *
 * The two planes are anchored independently in reference space and each rounds
 * to a logical cell on its own, so a run flush with the silhouette can land a
 * cell outside it at some fills. Rather than tune the numbers per fill, the
 * blush is clipped to the body while painting — the silhouette is the authority
 * for what is on the character.
 */
export const BLUSH_LEFT = { from: 8, to: 11 } as const;
export const BLUSH_RIGHT = { from: 21, to: 24 } as const;

export interface BlushSpanRow extends PlaneSpanRow {
  /** Which cheek this run belongs to, for symmetry assertions. */
  readonly side: "left" | "right";
}

/**
 * Blush as explicit spans rather than two loose constants, so the plane is
 * inspectable and its symmetry is testable.
 */
export const BLUSH_SPANS: readonly BlushSpanRow[] = [
  { y: BLUSH_ROW, from: BLUSH_LEFT.from, to: BLUSH_LEFT.to, key: "P", side: "left" },
  { y: BLUSH_ROW, from: BLUSH_RIGHT.from, to: BLUSH_RIGHT.to, key: "P", side: "right" },
];

// ─── Eyes ────────────────────────────────────────────────────────────────────

/** Eye socket positions. Widely spaced so the face reads as a face. */
export const EYE_LEFT_RANGE = { from: 10, to: 14 } as const;
export const EYE_RIGHT_RANGE = { from: 18, to: 22 } as const;
export const EYE_SOCKETS = [EYE_LEFT_RANGE, EYE_RIGHT_RANGE] as const;

/** The column each socket is centred on. */
export const EYE_CENTRE_LEFT = 13;
export const EYE_CENTRE_RIGHT = 19;

/**
 * The Sylf eye vocabulary.
 *
 * Six shapes, not two, because each one carries a different meaning:
 *
 *   open     the resting gaze — attention on the user
 *   focused  narrowed — studying
 *   half     the blink's mid-beat — eyes on the way shut
 *   closed   the blink's shut beat
 *   sleeping the resting gaze when the companion is asleep
 *   happy    the celebratory gaze
 *
 * `closed` and `sleeping` are deliberately different shapes: a state that means
 * "asleep" must not be visually identical to a single blink frame, or REST and
 * a mid-blink would be indistinguishable.
 */
export type EyeShape =
  | "open"
  | "focused"
  | "half"
  | "closed"
  | "sleeping"
  | "happy";

/**
 * One eye row: a horizontal ink run, placed relative to the socket's centre.
 * `offset` counts outward from the centre, so a shape stays centred in its
 * socket at any resolution.
 */
export interface EyeShapeRow {
  readonly y: number;
  /** Ink run start, as an offset from the socket centre. */
  readonly offset: number;
  /** Ink run width in reference columns. */
  readonly ink: number;
  /** Optional glint width in reference columns, drawn inside the ink run. */
  readonly glint?: number;
}

export const EYE_SHAPES: Record<EyeShape, readonly EyeShapeRow[]> = {
  // The resting gaze: a 4-wide iris over three rows, with a single-cell glint.
  // The glint is what makes a dark block read as an eye rather than a hole.
  open: [
    { y: 14, offset: -2, ink: 4 },
    { y: 15, offset: -2, ink: 4, glint: 1 },
    { y: 16, offset: -2, ink: 4 },
  ],
  // Studying: the same width, one row shallower and with a heavier lid, so it
  // is visibly *not* the resting gaze. Every shape must occupy a distinct set of
  // cells — otherwise swapping one for another would not change the picture, and
  // the palette test would pass while the character never blinked.
  focused: [
    { y: 15, offset: -2, ink: 4 },
    { y: 16, offset: -2, ink: 4 },
  ],
  // The blink's mid-beat.
  half: [{ y: 16, offset: -2, ink: 4 }],
  // The blink's shut beat: a flat, closed line, narrower than an open eye.
  closed: [{ y: 17, offset: -1, ink: 3 }],
  // Asleep: a heavier line one row above the shut beat. "Asleep" and "one frame
  // into a blink" must never look the same.
  sleeping: [{ y: 16, offset: -1, ink: 3 }],
  // Upturned at the outer corners: the celebratory gaze.
  happy: [
    { y: 17, offset: -1, ink: 3 },
    { y: 16, offset: -3, ink: 1 },
    { y: 16, offset: 2, ink: 1 },
  ],
};

// ─── Ambience ────────────────────────────────────────────────────────────────

/**
 * Ambient sparkles. Not part of the character — they are environment, and they
 * are painted first so the character always sits in front of them.
 */
export interface SparkleSpec {
  readonly x: number;
  readonly y: number;
  readonly color: PixColor;
}

export const SPARKLES: readonly SparkleSpec[] = [
  { x: 3, y: 4, color: SYLF_PALETTE.sparkle },
  { x: 28, y: 6, color: SYLF_PALETTE.sparkleViolet },
  { x: 30, y: 15, color: SYLF_PALETTE.sparkle },
  { x: 1, y: 16, color: SYLF_PALETTE.sparkleViolet },
  { x: 30, y: 24, color: SYLF_PALETTE.sparkle },
  { x: 2, y: 23, color: SYLF_PALETTE.sparkle },
  { x: 26, y: 2, color: SYLF_PALETTE.sparkleViolet },
];

/** Ground row the grass stands on, just below the hem. */
export const GROUND_ROW = 28;

export interface GrassSpec {
  readonly x: number;
  readonly height: number;
}

export const GRASS_TUFTS: readonly GrassSpec[] = [
  { x: 3, height: 1 },
  { x: 5, height: 2 },
  { x: 8, height: 1 },
  { x: 11, height: 2 },
  { x: 15, height: 1 },
  { x: 19, height: 2 },
  { x: 23, height: 1 },
  { x: 26, height: 2 },
  { x: 29, height: 1 },
];
