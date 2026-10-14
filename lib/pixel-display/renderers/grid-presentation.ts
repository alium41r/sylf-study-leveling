/**
 * ============================================================================
 * PIXEL DISPLAY — GRID PRESENTATION
 * ============================================================================
 * How a logical matrix is *presented* is a separate concern from what it
 * contains. This module owns the physical treatment the roadmap's Phase 0 is
 * chartered to evaluate:
 *
 *   - cell gap            how much of each cell pitch is separator
 *   - inactive cells      whether unlit cells stay faintly visible
 *   - character fill      how much of the display the art occupies
 *   - backdrop            the screen color behind the matrix
 *
 * Every value here is a *candidate* until Phase 0's visual comparison closes
 * it (roadmap open decisions O1 and O2). Nothing in this module may leak into
 * content: content only ever writes logical pixels (boundary B3).
 * ============================================================================
 */

import { BLACK, type PixColor } from "../engine/color";

export interface PixGridPresentation {
  /** Color behind the whole matrix. */
  backdrop: PixColor;
  /**
   * Fraction of a cell's pitch used as separator, 0..0.5. `0` renders solid
   * cells with no visible grid.
   */
  gap: number;
  /**
   * Opacity multiplier for unlit cells, 0..1. `0` leaves inactive cells
   * completely invisible; small non-zero values preserve the impression of a
   * physical matrix (doc §11).
   */
  inactiveOpacity: number;
  /**
   * Opacity multiplier applied to a cell's lit color. Used to keep the matrix
   * from competing with surrounding UI.
   */
  litOpacity: number;
  /**
   * Fraction of the display's short side the character art should occupy,
   * used by character content to centre itself. Presentation only — it never
   * changes logical coordinates.
   */
  characterFill: number;
}

export const DEFAULT_PRESENTATION: PixGridPresentation = {
  backdrop: BLACK,
  gap: 0.12,
  inactiveOpacity: 0,
  litOpacity: 1,
  characterFill: 0.63,
};

export interface PixPresentationPatch {
  backdrop?: PixColor;
  gap?: number;
  inactiveOpacity?: number;
  litOpacity?: number;
  characterFill?: number;
}

export function resolvePresentation(
  patch: PixPresentationPatch = {},
  base: PixGridPresentation = DEFAULT_PRESENTATION,
): PixGridPresentation {
  return {
    backdrop: patch.backdrop ?? base.backdrop,
    gap: clamp01(patch.gap ?? base.gap, 0, 0.5),
    inactiveOpacity: clamp01(patch.inactiveOpacity ?? base.inactiveOpacity, 0, 1),
    litOpacity: clamp01(patch.litOpacity ?? base.litOpacity, 0, 1),
    characterFill: clamp01(patch.characterFill ?? base.characterFill, 0.1, 1),
  };
}

/** Separator appearance is derived from the backdrop by the renderer's insets. */

function clamp01(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
