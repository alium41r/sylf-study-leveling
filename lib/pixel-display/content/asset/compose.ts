/**
 * ============================================================================
 * PIXEL ASSET — MODULAR COMPOSITION
 * ============================================================================
 * Builds an equipped character out of several assets, and paints it.
 *
 * THE MODEL, IN ONE PARAGRAPH
 *   A character is the **base**. Everything else is attached to one of its
 *   anchors: a pedestal to `ground`, an aura to `core`, a wearable to
 *   `wear-neck`, a held item to `hold-right`. Every attached asset is painted
 *   with the character's own placement, so the whole composition shares one
 *   origin and one scale and cannot drift apart — and because that placement maps
 *   a reference grid onto whatever display it is given, the composition is
 *   independent of physical size and logical density for free.
 *
 * WHY THIS IS NOT A SCENE GRAPH
 *   There is one host and a flat list of parts. No part may itself be a host, so
 *   composition is exactly one level deep and cannot recurse, cannot cycle, and
 *   needs no traversal. That is a deliberate ceiling, not an omission: Phase 5
 *   established positional attachment and the real cosmetic catalogue needs
 *   nothing more. A part that wanted to host its own parts would be a different
 *   feature, and would be argued for on its own evidence.
 *
 * WHAT THE DISPLAY KNOWS
 *   A composition is asset ids, a state name, and anchors. There is no shop
 *   concept anywhere in this file — no price, no rarity, no ownership, no
 *   unlock. Turning an equipped key into one of these is the registry's job.
 * ============================================================================
 */

import type { PixDisplay } from "../../engine/display";
import { resolveAttachment } from "./attachment";
import { paintAsset, placementFor, referenceToLogical, type AssetPlacement } from "./paint";
import type { PixelAsset } from "./types";

/** Which character anchor a part attaches to. */
export const COMPOSITION_SLOTS = [
  /** The base. Exactly one, and it is the host. */
  "character",
  /** Ground content, attached to `ground`. Painted first, so it is behind. */
  "pedestal",
  /** Worn content, attached to `wear-neck`. */
  "wearable",
  /** Something that surrounds the body, attached to `core`. */
  "aura",
  /** Grip content, attached to `hold-right`. Painted last, so it is in front. */
  "held",
] as const;

export type CompositionSlot = (typeof COMPOSITION_SLOTS)[number];

/**
 * Paint order.
 *
 * Ground behind, then the figure, then what surrounds it, then what it holds.
 * An aura is painted *after* the body because it is clipped to it — a glow on
 * the body has to come after the body exists.
 */
const PAINT_ORDER: readonly CompositionSlot[] = [
  "pedestal",
  "character",
  "wearable",
  "aura",
  "held",
];

/** One slot's content, already resolved from whatever key named it. */
export interface CompositionPart {
  readonly slot: CompositionSlot;
  readonly asset: PixelAsset;
  /** Which of the asset's own states to present. */
  readonly state?: string;
}

/**
 * An equipped character, as the display sees it.
 *
 * `base` is mandatory: a composition with no character has nothing to attach to,
 * and a blank screen is a worse outcome than a fallback — which is why the
 * registry never produces one.
 */
export interface ModularComposition {
  readonly base: PixelAsset;
  readonly baseState?: string;
  readonly parts: readonly CompositionPart[];
}

/** Where one part landed, for review tooling and for tests. */
export interface ComposedPart {
  readonly slot: CompositionSlot;
  readonly assetId: string;
  readonly state: string | undefined;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly referenceWrites: number;
  /** @deprecated Reference-space writes; use referenceWrites. */
  readonly paintedCells: number;
  readonly problems: readonly string[];
}

export interface CompositionResult {
  readonly placement: AssetPlacement;
  /** Painted parts, in paint order. The base is always first. */
  readonly parts: readonly ComposedPart[];
  /** The cells the base painted, in reference space. Clipping uses these. */
  readonly silhouette: ReadonlySet<string>;
  readonly referenceWrites: number;
  /** @deprecated Reference-space writes; use referenceWrites. */
  readonly totalCells: number;
}

/**
 * Paints a composition onto a display.
 *
 * Returns what it painted, including any part that could not be placed — a
 * review tool wants to *show* a broken attachment rather than have it vanish, and
 * a test wants to assert none exist.
 *
 * The display is cleared **once**, here, before any part is painted. Every part
 * then preserves what is already on it, including the base: a part painted
 * before the character (a pedestal, which is ground) would otherwise be erased by
 * the character's own pass. That was a real defect — the ground was drawn and
 * then cleared on the same frame — and it is why `preserve` is not left to each
 * call site.
 */
export function paintComposition(
  display: PixDisplay,
  composition: ModularComposition,
  options: { frame?: number; state?: string } = {},
): CompositionResult {
  // One placement for the whole composition, derived from the base. Everything
  // else shares it, which is what keeps a part exactly as large as the figure it
  // belongs to and independent of the display's size and density.
  const placement = placementFor(display, composition.base);
  display.clear();

  /**
   * The state the base is painted in.
   *
   * A caller that knows what the companion is doing — the content does, since it
   * owns the state machine — passes it here; `composition.baseState` is the
   * fallback for a surface that resolved a composition for one presentation.
   * Without this the base always painted its own *first* state, so a celebrating
   * companion was drawn resting.
   */
  const baseState = options.state ?? composition.baseState;

  const bySlot = new Map<CompositionSlot, CompositionPart>();
  for (const part of composition.parts) {
    // Later declarations of a slot replace earlier ones, so a caller building a
    // composition imperatively cannot accidentally paint the same slot twice.
    bySlot.set(part.slot, part);
  }

  const composed: ComposedPart[] = [];
  let totalCells = 0;
  let silhouette = new Set<string>();

  for (const slot of PAINT_ORDER) {
    if (slot === "character") {
      const result = paintAsset(display, composition.base, {
        // The composition owns the clear; see above.
        preserve: true,
        state: baseState,
        placementOverride: placement,
        frame: options.frame,
      });
      silhouette = new Set(result.occupied);
      totalCells += result.paintedCells;
      composed.push({
        slot,
        assetId: composition.base.id,
        state: baseState,
        offsetX: 0,
        offsetY: 0,
        referenceWrites: result.referenceWrites,
        paintedCells: result.referenceWrites,
        problems: [],
      });
      continue;
    }

    const part = bySlot.get(slot);
    if (!part) continue;

    const attached = resolveAttachment(composition.base, part.asset);
    if (!attached.resolved) {
      // A part that cannot be placed is reported, not silently dropped. The rest
      // of the composition still paints, so the character is never blank because
      // one accessory is broken.
      composed.push({
        slot,
        assetId: part.asset.id,
        state: part.state,
        offsetX: 0,
        offsetY: 0,
        referenceWrites: 0,
        paintedCells: 0,
        problems: attached.problems.map((problem) => problem.message),
      });
      continue;
    }

    const result = paintAsset(display, part.asset, {
      preserve: true,
      state: part.state,
      placementOverride: placement,
      frame: options.frame,
      offsetX: attached.resolved.offsetX,
      offsetY: attached.resolved.offsetY,
      // Ambience and worn content that sits *on* the figure clips to it; ground
      // content does not, because it is legitimately outside the silhouette.
      clipTo: part.asset.planes.some((plane) => plane.clippedToPrevious)
        ? silhouette
        : undefined,
    });

    totalCells += result.paintedCells;
    composed.push({
      slot,
      assetId: part.asset.id,
      state: part.state,
      offsetX: attached.resolved.offsetX,
      offsetY: attached.resolved.offsetY,
      referenceWrites: result.referenceWrites,
      paintedCells: result.referenceWrites,
      problems: [],
    });
  }

  return { placement, parts: composed, silhouette, referenceWrites: totalCells, totalCells };
}

/**
 * Where a composition's anchors land, in logical cells.
 *
 * Review tooling draws marks from this, so a mark cannot disagree with where the
 * composition actually put something — the same rule the Phase 5 panel follows.
 */
export function compositionAnchors(
  display: Pick<PixDisplay, "width" | "height">,
  composition: ModularComposition,
): Array<{ id: string; slot: CompositionSlot; x: number; y: number }> {
  const placement = placementFor(display, composition.base);
  const marks: Array<{ id: string; slot: CompositionSlot; x: number; y: number }> =
    [];

  for (const anchor of composition.base.anchors ?? []) {
    const at = referenceToLogical(placement, anchor.x, anchor.y);
    marks.push({ id: anchor.id, slot: "character", x: at.x, y: at.y });
  }

  for (const part of composition.parts) {
    const attached = resolveAttachment(composition.base, part.asset);
    if (!attached.resolved) continue;
    for (const anchor of part.asset.anchors ?? []) {
      const at = referenceToLogical(
        placement,
        anchor.x + attached.resolved.offsetX,
        anchor.y + attached.resolved.offsetY,
      );
      marks.push({
        id: `${part.asset.name}: ${anchor.id}`,
        slot: part.slot,
        x: at.x,
        y: at.y,
      });
    }
  }

  return marks;
}
