/**
 * ============================================================================
 * PIXEL DISPLAY — SYLF CHARACTER PLANES
 * ============================================================================
 * The character as **flat, explicitly ordered planes**.
 *
 *   body → leaves → blush → eyes
 *
 * That list is the whole composition model. There is no scene graph, no layer
 * hierarchy, no compositing algebra and no generic part system: a plane is a
 * named function that paints reference-grid spans, and composing is painting
 * them in order.
 *
 * WHY THIS IS THE RIGHT SIZE
 *   The product document's requirement is that a character state must not become
 *   a separate full-character image (§13). That needs exactly two properties:
 *   planes can be selected independently, and their order is declared rather than
 *   incidental. Both are here. Anything more — per-plane blend modes, a
 *   dependency graph, reusable part types — would be architecture invented for
 *   content that does not exist yet.
 *
 * COORDINATES (boundary B3)
 *   Each plane is authored in reference cells and scaled onto the logical
 *   resolution. `toX`/`toY` round to whole logical cells because a logical
 *   coordinate is a cell index: emitting a fractional coordinate would be
 *   silently refused by the display's bounds contract.
 * ============================================================================
 */

import type { PixDisplay, PixPlane } from "@/lib/pixel-display/engine/display";
import type { SylfComposition } from "./frames";
import type { PixColor } from "@/lib/pixel-display/engine/color";
import {
  BLUSH_SPANS,
  BODY_SPANS,
  EYE_CENTRE_LEFT,
  EYE_CENTRE_RIGHT,
  EYE_SHAPES,
  GRASS_TUFTS,
  GROUND_ROW,
  LEAF_SPANS,
  SPARKLES,
  SPRITE_LEGEND,
  SPRITE_REFERENCE,
  STEM_SPAN,
  type BodySpanRow,
  type EyeShape,
  type PlaneSpanRow,
  type SpriteKey,
} from "./sprite";

/** Share of each body row that keeps the highlight, and the trailing shade. */
const HIGHLIGHT_SHARE = 0.45;
const SHADE_SHARE = 0.22;

/** The character's planes, in paint order. */
export const PLANE_ORDER = ["body", "leaves", "blush", "eyes"] as const;

export type SylfPlaneId = (typeof PLANE_ORDER)[number];

/** Environment planes, painted before the character so it sits in front. */
export const SCENERY_ORDER = ["sparkles", "ground"] as const;

export type SylfSceneryId = (typeof SCENERY_ORDER)[number];

/** Reference-to-logical coordinate mapping for one presentation. */
export interface PlaneMapping {
  /** Logical cell of reference column `0`. */
  readonly originX: number;
  /** Logical cell of reference row `0`. */
  readonly originY: number;
  /** Reference cells per logical cell, for diagnostics. */
  readonly scale: number;
  toX(referenceX: number): number;
  toY(referenceY: number): number;
  /** Logical cell count spanned by `[from, to)` reference columns. */
  spanX(from: number, to: number): number;
  spanY(from: number, to: number): number;
}

/**
 * Maps the reference grid onto a display at a given character fill.
 *
 * Exported because tests and the dev surface both need to answer "where would
 * this reference cell land?" without painting anything.
 */
export function createPlaneMapping(
  display: PixDisplay,
  characterFill: number,
): PlaneMapping {
  const shortSide = Math.min(display.width, display.height);
  const spriteSize = Math.max(1, Math.round(shortSide * characterFill));
  const originX = Math.floor((display.width - spriteSize) / 2);
  // The composition puts the companion low in the frame — sprout, body, ground —
  // so it needs more free space above the leaves than below the hem.
  const originY = Math.max(0, Math.round((display.height - spriteSize) * 0.2));

  const rawScale = spriteSize / SPRITE_REFERENCE;
  return {
    originX,
    originY,
    scale: rawScale,
    toX: (referenceX: number) => snap(referenceX, originX, rawScale),
    toY: (referenceY: number) => snap(referenceY, originY, rawScale),
    /**
     * Spans are measured between *snapped* edges, not from a scaled width.
     *
     * This is the correction Phase 3 forced. Scaling a width independently of
     * where the run starts lets adjacent reference rows round to the same cell
     * or to a one-cell gap between them; at the development surface's sizes the
     * result looked acceptable, but at the real 110 px card it produced visible
     * banding — some body rows one device pixel tall, others three.
     *
     * Deriving the span from the two snapped edges makes consecutive reference
     * rows tile exactly: a row's end *is* the next row's start, so the grid
     * cannot develop a seam at any scale.
     */
    spanX: (from: number, to: number) =>
      Math.max(1, snap(to, originX, rawScale) - snap(from, originX, rawScale)),
    spanY: (from: number, to: number) =>
      Math.max(1, snap(to, originY, rawScale) - snap(from, originY, rawScale)),
  };
}

/**
 * Maps one reference coordinate to a logical cell.
 *
 * The single place the reference grid meets the logical grid. Every span is
 * measured between two of these, so the mapping is consistent by construction
 * rather than by each caller rounding the same way.
 */
function snap(
  reference: number,
  origin: number,
  scale: number,
): number {
  return origin + Math.round(reference * scale);
}

/** Paints one axis-aligned run of logical cells. */
function paintRect(
  display: PixPlane,
  x: number,
  y: number,
  width: number,
  height: number,
  color: PixColor,
): void {
  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      display.setPixel(x + dx, y + dy, color);
    }
  }
}

/** Resolves a legend key to a color, skipping keys with no color. */
function colorFor(row: PlaneSpanRow): PixColor | null {
  return SPRITE_LEGEND[row.key];
}

// ─── Individual planes ───────────────────────────────────────────────────────

/**
 * BODY — the silhouette, and the only plane with directional shading.
 *
 * Returns the logical cells it occupies, which is what lets a test assert that
 * the face is drawn *on* the character rather than floating beside it.
 */
export function drawBody(
  display: PixDisplay,
  mapping: PlaneMapping,
): Set<number> {
  const occupied = new Set<number>();
  const tone = (key: SpriteKey): PixColor => SPRITE_LEGEND[key] as PixColor;

  /** Paints a run and records the cells it occupies. */
  const paint = (
    row: BodySpanRow,
    from: number,
    to: number,
    key: SpriteKey,
  ): void => {
    if (to <= from) return;
    const x = mapping.toX(from);
    const y = mapping.toY(row.y);
    const width = mapping.spanX(from, to);
    const height = mapping.spanY(row.y, row.y + 1);
    if (width <= 0 || height <= 0) return;
    paintRect(display, x, y, width, height, tone(key));
    for (let dy = 0; dy < height; dy += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        occupied.add(cellKey(display, x + dx, y + dy));
      }
    }
  };

  for (const row of BODY_SPANS) {
    // The highlight is a *share* of the row, not a fixed run: a constant split
    // makes the narrow crown rows almost entirely highlight while the wide bell
    // rows are mostly shade, which reads as a flat, banded form. Taking a share
    // keeps the light-to-shade falloff parallel to the silhouette at any width.
    const span = row.to - row.from;
    const highlightTo = clamp(
      row.from + Math.round(span * HIGHLIGHT_SHARE),
      row.from + 1,
      row.to - 2,
    );
    const shadeFrom = clamp(
      row.to - Math.max(1, Math.round(span * SHADE_SHARE)),
      highlightTo + 1,
      row.to - 1,
    );

    // Highlight, then mid tone, then shade. Three runs per row is the whole
    // shading model: light from the upper left, shade on the trailing edge.
    paint(row, row.from, highlightTo, "H");
    paint(row, highlightTo, shadeFrom, "B");
    paint(row, shadeFrom, row.to, "S");

    // The deep edge belongs *inside* the row, as the last column of the shade
    // run. Painting it as an extra run past `to` would widen the silhouette by
    // a column and put the shading outside the figure.
    if (row.deepEdge) paint(row, row.to - 1, row.to, "D");
  }

  return occupied;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

/** LEAVES — the sprout and its stem. Painted after the body. */
export function drawLeaves(display: PixDisplay, mapping: PlaneMapping): void {
  const stem = SPRITE_LEGEND[STEM_SPAN.key];
  if (stem) {
    paintRect(
      display,
      mapping.toX(STEM_SPAN.from),
      mapping.toY(STEM_SPAN.y),
      mapping.spanX(STEM_SPAN.from, STEM_SPAN.to),
      mapping.spanY(STEM_SPAN.y, STEM_SPAN.y + 1),
      stem,
    );
  }

  for (const row of LEAF_SPANS) {
    const color = colorFor(row);
    if (!color) continue;
    paintRect(
      display,
      mapping.toX(row.from),
      mapping.toY(row.y),
      mapping.spanX(row.from, row.to),
      mapping.spanY(row.y, row.y + 1),
      color,
    );
  }
}

/**
 * BLUSH — two cheek runs. Painted after the body, before the eyes.
 *
 * Clipped to `silhouette` when one is supplied. The body is the authority for
 * what counts as "on the character": face planes are authored separately and
 * round to logical cells independently, so without the clip a cheek can land a
 * cell outside the silhouette at some character fills. Clipping states that
 * invariant once instead of tuning spans per resolution.
 */
export function drawBlush(
  display: PixDisplay,
  mapping: PlaneMapping,
  silhouette?: ReadonlySet<number>,
): void {
  const painting: PixPlane = silhouette
    ? {
        setPixel(x, y, color) {
          if (!silhouette.has(cellKey(display, x, y))) return false;
          return display.setPixel(x, y, color);
        },
        fill: (color) => display.fill(color),
        clear: () => display.clear(),
      }
    : display;

  for (const row of BLUSH_SPANS) {
    const color = colorFor(row);
    if (!color) continue;
    paintRect(
      painting,
      mapping.toX(row.from),
      mapping.toY(row.y),
      mapping.spanX(row.from, row.to),
      mapping.spanY(row.y, row.y + 1),
      color,
    );
  }
}

/**
 * EYES — the one plane that changes shape.
 *
 * Swapping this plane is what a blink costs. The body, leaves and blush are not
 * touched, which is the doc's core claim about the architecture made concrete.
 */
export function drawEyes(
  display: PixDisplay,
  mapping: PlaneMapping,
  shape: EyeShape,
): void {
  const ink = SPRITE_LEGEND.K as PixColor;
  const glint = SPRITE_LEGEND.T as PixColor;
  const rows = EYE_SHAPES[shape];
  for (const centre of [EYE_CENTRE_LEFT, EYE_CENTRE_RIGHT]) {
    for (const row of rows) {
      const x = mapping.toX(centre + row.offset);
      const y = mapping.toY(row.y);
      const width = mapping.spanX(0, row.ink);
      const height = mapping.spanY(row.y, row.y + 1);
      paintRect(display, x, y, width, height, ink);
      if (row.glint !== undefined) {
        paintRect(
          display,
          x,
          y,
          Math.max(1, mapping.spanX(0, row.glint)),
          height,
          glint,
        );
      }
    }
  }
}

// ─── Scenery ─────────────────────────────────────────────────────────────────

/** Ambient sparkles. Environment, not character. */
export function drawSparkles(display: PixDisplay, mapping: PlaneMapping): void {
  for (const sparkle of SPARKLES) {
    paintRect(
      display,
      mapping.toX(sparkle.x),
      mapping.toY(sparkle.y),
      mapping.spanX(0, 1),
      mapping.spanY(0, 1),
      sparkle.color,
    );
  }
}

/** Ground grass along the hem. Environment, not character. */
export function drawGround(display: PixDisplay, mapping: PlaneMapping): void {
  const ground = SPRITE_LEGEND.G as PixColor;
  for (const tuft of GRASS_TUFTS) {
    const top = GROUND_ROW - tuft.height;
    paintRect(
      display,
      mapping.toX(tuft.x),
      mapping.toY(top),
      mapping.spanX(0, 1),
      mapping.spanY(top, GROUND_ROW),
      ground,
    );
  }
}

// ─── Plane registry ──────────────────────────────────────────────────────────

export interface PlanePaintContext {
  readonly mapping: PlaneMapping;
  /**
   * Logical cells the body occupies, when it has already been painted. Planes
   * that sit on the character clip to it; the scenery does not.
   */
  readonly silhouette?: ReadonlySet<number>;
  /** The eye shape to paint. Only the eye plane reads this. */
  readonly eyes: EyeShape;
  /**
   * What the current state composes. The eye plane reads `eyes`; a plane a
   * state does not select is skipped by the compositor rather than painted and
   * hidden, so there is exactly one place that decides what a state shows.
   */
  readonly plan: SylfComposition;
}

/**
 * Whether a state selects a plane.
 *
 * This is the composition model made explicit: a state selects planes, and a
 * plane it does not select is simply not painted. Keeping the rule in one
 * function means the composite and any partial repaint agree by construction.
 */
export function selectsPlane(
  plane: SylfPlaneId,
  plan: SylfComposition,
): boolean {
  switch (plane) {
    case "blush":
      return plan.blush;
    case "eyes":
      return true;
    case "body":
    case "leaves":
      return true;
    default: {
      const exhaustive: never = plane;
      return exhaustive;
    }
  }
}

/**
 * The plane registry: one entry per plane, in paint order.
 *
 * A plane receives the mapping and the composition, and writes only its own
 * cells. Because the registry is keyed by name, a test can paint a single plane
 * and assert that the rest of the display is untouched.
 */
export const SYLF_PLANES: Record<
  SylfPlaneId,
  (display: PixDisplay, context: PlanePaintContext) => void
> = {
  body: (display, context) => {
    drawBody(display, context.mapping);
  },
  leaves: (display, context) => {
    drawLeaves(display, context.mapping);
  },
  blush: (display, context) => {
    drawBlush(display, context.mapping, context.silhouette);
  },
  eyes: (display, context) => {
    drawEyes(display, context.mapping, context.eyes);
  },
};

export const SYLF_SCENERY: Record<
  SylfSceneryId,
  (display: PixDisplay, mapping: PlaneMapping) => void
> = {
  sparkles: drawSparkles,
  ground: drawGround,
};

/**
 * Stable key for a logical cell, used by composition assertions (does this eye
 * cell land on the body?).
 */
/**
 * A cell's key: its index in the framebuffer's **byte** space.
 *
 * Byte offsets rather than cell indices, because `PixDisplay`'s own API speaks
 * bytes and keeping one unit avoids a conversion at every call site. Consumers
 * that need coordinates back must divide by the four bytes a cell occupies —
 * `cellFromKey` exists so that conversion is written once.
 */
export function cellKey(display: PixDisplay, x: number, y: number): number {
  return display.geometry.indexOf(x, y);
}

/** The cell index a key refers to. See `cellKey`. */
export function cellIndexFromKey(key: number): number {
  return key / 4;
}
