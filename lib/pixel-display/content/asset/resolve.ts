/**
 * ============================================================================
 * PIXEL ASSET — READING AN ASSET
 * ============================================================================
 * Turns an authored asset into cells. No renderer, no runtime, no DOM: this
 * module resolves tokens to colours and geometry to reference coordinates, and
 * hands the result to whoever owns a display.
 *
 * Everything here works in **reference coordinates**. Mapping reference space
 * onto a display's logical grid happens once, in `paint`, so an asset can never
 * depend on a density, a CSS size or a device pixel ratio.
 * ============================================================================
 */

import { hexToPixColor, TRANSPARENT, type PixColor } from "../../engine/color";
import {
  TRANSPARENT_TOKEN,
  type PixelAsset,
  type PixelAssetState,
  type PixelAnimatedGeometry,
  type PixelGeometry,
  type PixelPalette,
  type PixelPlane,
  type PixelSpanRow,
  type AssetLookup,
} from "./types";

/** One reference cell that an asset wants painted. */
export interface ResolvedCell {
  readonly x: number;
  readonly y: number;
  readonly color: PixColor;
}

/** A plane resolved to concrete cells, ready to paint. */
export interface ResolvedPlane {
  readonly id: string;
  readonly clippedToPrevious: boolean;
  readonly cells: readonly ResolvedCell[];
}

/**
 * The plane selection a state names.
 *
 * Kept as a plain list of ids so a caller — the dev surface, a test — can ask
 * what a state shows without resolving any geometry, and so "state" stays a
 * statement about planes rather than about pixels.
 */
export function planeIdsForState(
  asset: PixelAsset,
  stateId?: string,
): readonly string[] {
  const declared = asset.planes.map((plane) => plane.id);
  // An asset with no state table at all shows everything it declares.
  if (!asset.states || asset.states.length === 0) return declared;

  // An asset that *does* have states shows its first one, and an unrecognised
  // name falls back to that same first state. Falling back to "every plane"
  // instead would render a state the asset never declared — a wand would show
  // its charging glow when asked for a state that does not exist.
  const state = findState(asset, stateId) ?? asset.states[0];
  if (!state) return declared;

  const shown = state.show ?? declared;
  const hidden = new Set(state.hide ?? []);
  // Order always follows the asset's declaration, never the state's list, so a
  // state cannot accidentally reorder the composition and change what overlaps
  // what.
  return declared.filter((id) => shown.includes(id) && !hidden.has(id));
}

/** The state with `stateId`, or the default state when none is named. */
export function findState(
  asset: PixelAsset,
  stateId?: string,
): PixelAssetState | undefined {
  const states = asset.states;
  if (!states || states.length === 0) return undefined;
  if (stateId === undefined) return states[0];
  return states.find((state) => state.id === stateId);
}

/** The id of the state a caller would get by naming nothing. */
export function defaultStateId(asset: PixelAsset): string {
  return asset.states?.[0]?.id ?? "default";
}

/**
 * Every colour an asset can paint, asset palette first and plane palettes over
 * it.
 *
 * Exported because validation needs exactly this view: a key is legal if it is
 * in the merged palette, and nowhere else.
 */
export function mergedPalette(
  asset: PixelAsset,
  plane?: PixelPlane,
): PixelPalette {
  if (!plane?.palette) return asset.palette;
  return { ...asset.palette, ...plane.palette };
}

/**
 * Resolves one plane's geometry to reference cells.
 *
 * The only place the two geometry forms meet. A raster is read row by row; spans
 * are expanded, and a `shaded` span is split by proportion so that its own width
 * decides where highlight becomes mid tone becomes shade.
 */
export function resolveGeometry(
  geometry: PixelGeometry,
  palette: PixelPalette,
  frame = 0,
): ResolvedCell[] {
  if (geometry.geometry === "raster") {
    return resolveRaster(geometry.rows, palette);
  }
  if (geometry.geometry === "animated") {
    return resolveRaster(
      frameRows(geometry, frame),
      palette,
    );
  }
  return resolveSpans(geometry.rows, palette);
}

/**
 * The rows an animated geometry shows on a given frame.
 *
 * Resolution is total: any frame number, including a negative or an
 * out-of-range one, maps onto a frame that exists. A malformed play order can
 * therefore never produce an empty picture — it produces a valid frame, which is
 * the safe direction for content that has not been validated yet.
 */
export function frameRows(
  geometry: PixelAnimatedGeometry,
  frame: number,
): readonly string[] {
  const total = frameCountOf(geometry);
  if (total === 0) return [];
  const normalized =
    ((Math.trunc(frame) % total) + total) % total;
  const order = geometry.order;
  const index = order && order.length > 0
    ? (order[normalized] ?? normalized) % geometry.frames.length
    : normalized % geometry.frames.length;
  return geometry.frames[index]?.rows ?? [];
}

/** How many frames an animated geometry plays. */
export function frameCountOf(geometry: PixelAnimatedGeometry): number {
  if (geometry.frames.length === 0) return 0;
  return geometry.order && geometry.order.length > 0
    ? geometry.order.length
    : geometry.frames.length;
}

/** The animated geometry on a plane, if it has one. */
export function animatedGeometryOf(
  plane: PixelPlane,
): PixelAnimatedGeometry | undefined {
  return plane.geometry?.geometry === "animated"
    ? plane.geometry
    : undefined;
}

function resolveRaster(
  rows: readonly string[],
  palette: PixelPalette,
): ResolvedCell[] {
  const cells: ResolvedCell[] = [];
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    for (let x = 0; x < row.length; x += 1) {
      const token = row[x];
      if (token === TRANSPARENT_TOKEN) continue;
      const color = palette[token];
      // An unknown token resolves to nothing rather than throwing here: the
      // validator is what reports it, once, with a position. Rasterising is not
      // the place to discover an authoring mistake.
      if (color === undefined) continue;
      cells.push({ x, y, color: hexToPixColor(color) });
    }
  }
  return cells;
}

function resolveSpans(
  rows: readonly PixelSpanRow[],
  palette: PixelPalette,
): ResolvedCell[] {
  const cells: ResolvedCell[] = [];
  for (const row of rows) {
    if (row.to <= row.from) continue;
    if (row.shaded) {
      appendShaded(cells, row, palette);
      continue;
    }
    const color = palette[row.key];
    if (color === undefined) continue;
    const parsed = hexToPixColor(color);
    for (let x = row.from; x < row.to; x += 1) {
      cells.push({ x, y: row.y, color: parsed });
    }
  }
  return cells;
}

/**
 * Share of a shaded run that stays highlight, and that closes in shade.
 *
 * The same proportions the Sylf body was tuned with, kept here so any shaded
 * span behaves the same way at every width — a fixed split makes a narrow run
 * almost entirely highlight.
 */
export const SHADED_HIGHLIGHT_SHARE = 0.45;
export const SHADED_DEEP_SHARE = 0.22;

/**
 * Splits a shaded run into highlight, mid tone and shade.
 *
 * The keys are the span's own plus `H`/`B`/`S`, which is the shading vocabulary
 * every shaded asset shares. A span whose palette has no such keys paints flat
 * in its own colour, so shading stays opt-in.
 */
function appendShaded(
  cells: ResolvedCell[],
  row: PixelSpanRow,
  palette: PixelPalette,
): void {
  const highlight = palette.H;
  const mid = palette.B;
  const shade = palette.S;
  if (highlight === undefined || mid === undefined || shade === undefined) {
    const flat = palette[row.key];
    if (flat === undefined) return;
    const parsed = hexToPixColor(flat);
    for (let x = row.from; x < row.to; x += 1) {
      cells.push({ x, y: row.y, color: parsed });
    }
    return;
  }

  const span = row.to - row.from;
  const highlightTo = clamp(
    row.from + Math.round(span * SHADED_HIGHLIGHT_SHARE),
    row.from + 1,
    row.to - 2,
  );
  const shadeFrom = clamp(
    row.to - Math.max(1, Math.round(span * SHADED_DEEP_SHARE)),
    highlightTo + 1,
    row.to - 1,
  );

  pushRun(cells, row.y, row.from, highlightTo, highlight);
  pushRun(cells, row.y, highlightTo, shadeFrom, mid);
  pushRun(cells, row.y, shadeFrom, row.to, shade);

  // The closing edge belongs *inside* the run, as its last column. Painting it
  // past `to` would widen the silhouette by a column.
  if (row.deepEdge) {
    const deep = palette.D ?? shade;
    pushRun(cells, row.y, row.to - 1, row.to, deep);
  }
}

function pushRun(
  cells: ResolvedCell[],
  y: number,
  from: number,
  to: number,
  color: string,
): void {
  if (to <= from) return;
  const parsed = hexToPixColor(color);
  for (let x = from; x < to; x += 1) {
    cells.push({ x, y, color: parsed });
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Resolves the planes a state selects, in paint order.
 *
 * Clipping is resolved here rather than at paint time so that "what counts as on
 * the asset" is a property of the asset, not of whoever draws it.
 */
export function resolveAsset(
  asset: PixelAsset,
  stateId?: string,
  frame = 0,
): readonly ResolvedPlane[] {
  const selected = new Set(planeIdsForState(asset, stateId));
  const resolved: ResolvedPlane[] = [];
  /** Cells painted so far, as `x,y` keys — the clip region for later planes. */
  let occupied: Set<string> | null = null;

  for (const plane of asset.planes) {
    if (!selected.has(plane.id)) continue;
    const palette = mergedPalette(asset, plane);
    const cells = resolveGeometry(plane.geometry, palette, frame);

    if (plane.clippedToPrevious && occupied) {
      const clipped = cells.filter((cell) => occupied?.has(`${cell.x},${cell.y}`));
      resolved.push({
        id: plane.id,
        clippedToPrevious: true,
        cells: clipped,
      });
      continue;
    }

    resolved.push({
      id: plane.id,
      clippedToPrevious: plane.clippedToPrevious === true,
      cells,
    });

    if (!occupied) occupied = new Set();
    for (const cell of cells) occupied.add(`${cell.x},${cell.y}`);
  }

  return resolved;
}

/** Total cells an asset paints in a state. Used by validation and by tests. */
export function countCells(
  asset: PixelAsset,
  stateId?: string,
  frame = 0,
): number {
  return resolveAsset(asset, stateId, frame).reduce(
    (total, plane) => total + plane.cells.length,
    0,
  );
}

/**
 * Builds a catalogue lookup from a list of assets.
 *
 * Lives here rather than at the application boundary because turning a list into
 * an id lookup is catalogue plumbing: it knows nothing about cosmetics, and both
 * a production surface and a test want the same one.
 */
export function createAssetLookup(
  assets: readonly PixelAsset[],
): AssetLookup {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return (id: string) => byId.get(id);
}

/** `TRANSPARENT`, re-exported so a consumer of this module needs one import. */
export { TRANSPARENT };
