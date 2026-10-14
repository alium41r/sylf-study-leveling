/**
 * ============================================================================
 * PIXEL ASSET — PAINTING
 * ============================================================================
 * The one place reference coordinates become logical cells.
 *
 * Being the only such place is the point. Every asset, at every density and
 * every physical size, goes through the mapping below, so "does this asset work
 * at 110 px and at 640 px?" is answered by the mapping rather than by each asset.
 *
 * The mapping itself is the one Phases 0–4 settled: scale the reference so its
 * short side occupies a share of the display's short side, centre it
 * horizontally, and place it using a vertical bias. Spans are measured between
 * *snapped* edges — the correction Phase 3 forced — so consecutive reference rows
 * tile exactly and the grid cannot develop a seam at any scale.
 * ============================================================================
 */

import type { PixDisplay } from "../../engine/display";
import type { PixColor } from "../../engine/color";
import type { PixelAsset } from "./types";
import { resolveAsset, type ResolvedCell } from "./resolve";

/** Defaults applied when an asset does not state its own framing. */
export const DEFAULT_SCALE_SHARE = 0.63;
export const DEFAULT_VERTICAL_BIAS = 0.2;
export const DEFAULT_HORIZONTAL_BIAS = 0.5;

export interface AssetPlacement {
  readonly originX: number;
  readonly originY: number;
  readonly scale: number;
  readonly referenceWidth: number;
  readonly referenceHeight: number;
}

/** Maps one reference coordinate to a logical cell on a painter's axis. */
function snap(reference: number, origin: number, scale: number): number {
  return origin + Math.round(reference * scale);
}

/**
 * Where an asset's reference grid lands on a display.
 *
 * Exported because review tooling needs to ask — to draw an anchor, or to report
 * a density readout — without painting anything.
 */
export function placementFor(
  display: Pick<PixDisplay, "width" | "height">,
  asset: PixelAsset,
  scaleShareOverride?: number,
  placementOverride?: { originX: number; originY: number; scale: number },
): AssetPlacement {
  const framing = asset.framing ?? {};
  const scaleShare =
    scaleShareOverride ?? framing.scaleShare ?? DEFAULT_SCALE_SHARE;
  const verticalBias = framing.verticalBias ?? DEFAULT_VERTICAL_BIAS;
  const horizontalBias = framing.horizontalBias ?? DEFAULT_HORIZONTAL_BIAS;

  const shortSide = Math.min(display.width, display.height);
  const referenceShort = Math.min(
    asset.reference.width,
    asset.reference.height,
  );
  // A placed asset shares its host's origin *and* scale, because the attachment
  // offset is a reference-space delta that is added before mapping. Only the
  // host frames anything.
  if (placementOverride) {
    return {
      originX: placementOverride.originX,
      originY: placementOverride.originY,
      scale: placementOverride.scale,
      referenceWidth: asset.reference.width,
      referenceHeight: asset.reference.height,
    };
  }

  const scale =
    Math.max(1, Math.round(shortSide * scaleShare)) /
    Math.max(1, referenceShort);
  const drawnWidth = Math.max(1, Math.round(asset.reference.width * scale));
  const drawnHeight = Math.max(1, Math.round(asset.reference.height * scale));

  return {
    originX: Math.round((display.width - drawnWidth) * horizontalBias),
    originY: Math.max(
      0,
      Math.round((display.height - drawnHeight) * verticalBias),
    ),
    scale,
    referenceWidth: asset.reference.width,
    referenceHeight: asset.reference.height,
  };
}

/** Reference cell → logical cell, for a resolved placement. */
export function referenceToLogical(
  placement: AssetPlacement,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: snap(x, placement.originX, placement.scale),
    y: snap(y, placement.originY, placement.scale),
  };
}

export interface PaintAssetOptions {
  /** Which state to paint. Defaults to the asset's first declared state. */
  readonly state?: string;
  /**
   * Which animation frame to paint.
   *
   * Ignored by a static asset, so a caller that always passes a frame does not
   * need to know whether the thing it is drawing moves.
   */
  readonly frame?: number;
  /**
   * Plane ids to leave out of the composite.
   *
   * Applied *during* the paint rather than by erasing afterwards, so what remains
   * is a composite the asset could actually have made. Review tooling is the
   * intended user: isolating a plane by painting and then erasing would leave
   * clipping relationships wrong.
   */
  readonly omitPlanes?: readonly string[];
  /** Overrides the asset's own `framing.scaleShare`. */
  readonly scaleShare?: number;
  /**
   * Uses the host's placement instead of deriving one.
   *
   * Required for an attachment, and the reason it is explicit rather than
   * inferred: an asset's own framing fits *its own* reference grid to the
   * display, so a 5 × 15 wand and a 32 × 32 character derive different scales
   * and origins, and the wand would come out the wrong size in the wrong place.
   *
   * **Both** halves matter. Taking only the scale is a subtle bug: the
   * attachment offset is a *reference-space* delta, so it must be added to
   * reference coordinates and then mapped — inheriting the scale alone leaves the
   * origin at zero, which quietly turns the offset into a display coordinate.
   */
  readonly placementOverride?: {
    readonly originX: number;
    readonly originY: number;
    readonly scale: number;
  };
  /** Reference-space translation, for an attachment placed on a host. */
  readonly offsetX?: number;
  readonly offsetY?: number;
  /**
   * Draws only where an earlier `paintAsset` call already painted.
   *
   * The clip is a set of `x,y` keys in **reference** space, so a clipping asset
   * never needs to know the display.
   */
  readonly clipTo?: ReadonlySet<string>;
  /**
   * Skip clearing. A host paints its own planes and then an attachment into the
   * same framebuffer, and only the first call should clear.
   */
  readonly preserve?: boolean;
}

export interface PaintAssetResult {
  readonly placement: AssetPlacement;
  /** Reference-cell writes, not surviving framebuffer pixels. */
  readonly referenceWrites: number;
  /** @deprecated Use referenceWrites. This is not a surviving-pixel count. */
  readonly paintedCells: number;
  /** Reference-space keys this paint occupied, for clipping a later asset. */
  readonly occupied: ReadonlySet<string>;
  /** Plane ids painted, in paint order. */
  readonly planes: readonly string[];
}

/**
 * Paints an asset's selected planes onto a display.
 *
 * Returns what it painted so a caller can chain assets — a character, then a
 * wearable clipped to it, then a weapon placed at its anchor — without any of
 * them knowing about each other.
 */
export function paintAsset(
  display: PixDisplay,
  asset: PixelAsset,
  options: PaintAssetOptions = {},
): PaintAssetResult {
  const placement = placementFor(
    display,
    asset,
    options.scaleShare,
    options.placementOverride,
  );
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;

  if (!options.preserve) display.clear();

  const omitted = options.omitPlanes
    ? new Set(options.omitPlanes)
    : null;
  const allPlanes = resolveAsset(asset, options.state, options.frame ?? 0);
  const planes = omitted
    ? allPlanes.filter((plane) => !omitted.has(plane.id))
    : allPlanes;

  const occupied = new Set<string>();
  let paintedCells = 0;

  for (const plane of planes) {
    for (const cell of plane.cells) {
      // The attachment offset is applied in *reference* space, before the
      // mapping, so a placed asset scales with its host rather than drifting.
      const referenceX = cell.x + offsetX;
      const referenceY = cell.y + offsetY;
      const key = `${referenceX},${referenceY}`;
      if (options.clipTo && !options.clipTo.has(key)) continue;
      writeCell(display, placement, referenceX, referenceY, cell.color);
      occupied.add(key);
      paintedCells += 1;
    }
  }

  return {
    placement,
    referenceWrites: paintedCells,
    paintedCells,
    occupied,
    planes: planes.map((plane) => plane.id),
  };
}

/** Pixel-center nearest-neighbor intervals, shared by painting and effects. */
export function referenceCellRect(
  placement: AssetPlacement,
  referenceX: number,
  referenceY: number,
): { x: number; y: number; width: number; height: number } {
  // Destination pixel centers select floor((center - origin) / scale).
  // Inverse intervals are half-open; collapsed source cells paint zero pixels.
  const left = Math.ceil(placement.originX + referenceX * placement.scale - 0.5);
  const right = Math.ceil(placement.originX + (referenceX + 1) * placement.scale - 0.5);
  const top = Math.ceil(placement.originY + referenceY * placement.scale - 0.5);
  const bottom = Math.ceil(placement.originY + (referenceY + 1) * placement.scale - 0.5);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function writeCell(
  display: PixDisplay,
  placement: AssetPlacement,
  referenceX: number,
  referenceY: number,
  color: PixColor,
): void {
  const rect = referenceCellRect(placement, referenceX, referenceY);
  for (let dy = 0; dy < rect.height; dy += 1) {
    for (let dx = 0; dx < rect.width; dx += 1) {
      display.setPixel(rect.x + dx, rect.y + dy, color);
    }
  }
}

/** Cells an asset would paint, resolved but not rasterised. For tests. */
export function cellsFor(
  asset: PixelAsset,
  state?: string,
  frame = 0,
): readonly (readonly ResolvedCell[])[] {
  return resolveAsset(asset, state, frame).map((plane) => plane.cells);
}
