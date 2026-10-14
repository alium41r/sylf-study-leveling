"use client";

/**
 * ============================================================================
 * PIXEL STUDIO — EDITOR MODEL
 * ============================================================================
 * The state a drawing session needs, and the operations that change it.
 *
 * DELIBERATELY NOT REACT PER CELL
 *   A 48 × 48 drawing is 2,304 cells. Storing them in React state would mean
 *   2,304 values, a new array identity per keystroke, and a re-render of anything
 *   that subscribes. Instead a frame is a plain array of palette indices that
 *   lives in one piece of state, and the canvas draws it imperatively — which is
 *   the same division of labour the Pixel Display itself uses.
 *
 * THREE CONCEPTS THAT MUST NOT BE CONFUSED
 *   - **authored grid** — the logical resolution, fixed at creation time from the
 *     supported presets, and the only thing that is ever persisted;
 *   - **editor zoom** — how large the workspace is drawn, held only here;
 *   - **production card size** — what the dashboard renders at, which the editor
 *     never touches.
 *
 *   Changing zoom cannot change the artwork because zoom is not part of the
 *   document, and there is a test that says so.
 *
 * EVERY OPERATION IS TOTAL
 *   Tools clamp to the grid, fill is bounded, and history is bounded. Nothing in
 *   this module can be made to loop forever or allocate without limit by the
 *   shape of a drawing.
 * ============================================================================
 */

import {
  CREATION_ALLOWED_SIZES,
  MAX_CREATION_COLORS,
  MAX_CREATION_FRAMES,
  MAX_FRAME_MS,
  MIN_FRAME_MS,
  emptyFrame,
  decodeFrame,
  encodeFrame,
  type CellValue,
  type CreationPlayback,
  type PixelCreation,
} from "@/lib/pixel-display/content/asset";

/** How many edits a scholar can step back through. */
export const HISTORY_LIMIT = 40;

/**
 * A frame while it is being drawn.
 *
 * Cells rather than rows, because a drawing session edits cells. It becomes rows
 * only when the document is serialised, so the encoded form can never hold a
 * half-finished edit.
 */
export interface DraftFrame {
  readonly cells: readonly (readonly CellValue[])[];
  readonly durationMs: number;
}

export interface Draft {
  readonly id?: string;
  readonly name: string;
  readonly grid: number;
  readonly palette: readonly string[];
  readonly frames: readonly DraftFrame[];
  readonly playback: CreationPlayback;
  /** Editor recovery/history metadata. Saved separately in CharacterConfig. */
  readonly displayBorder?: string;
  readonly pixelGap?: number;
}

/** The drawing tools. A deliberately small set. */
export type StudioTool = "pencil" | "eraser" | "fill" | "eyedropper";

export const STUDIO_TOOLS: readonly {
  readonly id: StudioTool;
  readonly label: string;
  readonly hint: string;
}[] = [
  { id: "pencil", label: "Draw", hint: "Paint cells with the chosen colour" },
  { id: "eraser", label: "Erase", hint: "Clear cells back to transparent" },
  { id: "fill", label: "Fill", hint: "Flood the area under the pointer" },
  { id: "eyedropper", label: "Pick", hint: "Take a colour from the drawing" },
];

/** Starting swatches; the color picker adds any six-digit RGB color. */
export const DEFAULT_PALETTE: readonly string[] = [
  "#0b1220",
  "#ffffff",
  "#c0d8f0",
  "#7890c0",
  "#20243f",
  "#43e1b0",
  "#48c0a8",
  "#5ac9d1",
  "#a179fb",
  "#fbd6ff",
];

/** Editor zoom levels. Editor-only; never part of the document. */
export const ZOOM_LEVELS = [4, 6, 8, 12] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

// ─── Creating and copying ────────────────────────────────────────────────────

/** A new, empty drawing at one of the supported resolutions. */
export function createDraft(grid: number, name = "My companion"): Draft {
  const safeGrid = (CREATION_ALLOWED_SIZES as readonly number[]).includes(grid)
    ? grid
    : 48;
  const blank = emptyFrame(safeGrid);
  return {
    id: newCreationId(),
    name,
    grid: safeGrid,
    palette: [...DEFAULT_PALETTE].slice(0, MAX_CREATION_COLORS),
    frames: [
      {
        cells: decodeRows(blank.rows, safeGrid),
        durationMs: blank.durationMs,
      },
    ],
    playback: "loop",
  };
}

function decodeRows(rows: readonly string[], grid: number): CellValue[][] {
  return decodeFrame({ rows }, grid, MAX_CREATION_COLORS);
}

export function cloneFrame(frame: DraftFrame): DraftFrame {
  return {
    cells: frame.cells.map((row) => [...row]),
    durationMs: frame.durationMs,
  };
}

function cloneFrames(frames: readonly DraftFrame[]): DraftFrame[] {
  return frames.map(cloneFrame);
}

// ─── Editing ─────────────────────────────────────────────────────────────────

export interface CellPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Paints one cell into a frame, returning a **new** frame.
 *
 * Immutable so that history is a list of documents rather than a list of inverse
 * operations: an undo cannot be wrong about what it is undoing.
 */
export function paintCell(
  frame: DraftFrame,
  point: CellPoint,
  value: CellValue,
  grid: number,
  mirrored: boolean,
): DraftFrame {
  const cells = frame.cells.map((row) => [...row]);
  const put = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= grid || y >= grid) return;
    cells[y][x] = value;
  };
  put(point.x, point.y);
  if (mirrored) put(grid - 1 - point.x, point.y);
  return { cells, durationMs: frame.durationMs };
}

/**
 * Bounded flood fill.
 *
 * Iterative rather than recursive — a recursive fill on a large region is a stack
 * overflow waiting for a scholar to draw the wrong shape — and bounded by the
 * cell count, so the worst case is one pass over the grid and never more.
 */
export function fillRegion(
  frame: DraftFrame,
  point: CellPoint,
  value: CellValue,
  grid: number,
): DraftFrame {
  if (point.x < 0 || point.y < 0 || point.x >= grid || point.y >= grid) {
    return frame;
  }
  const cells = frame.cells.map((row) => [...row]);
  const target = cells[point.y][point.x];
  if (target === value) return frame;

  const queue: CellPoint[] = [point];
  const seen = new Set<number>([point.y * grid + point.x]);
  // The bound: at most every cell, once.
  while (queue.length > 0 && seen.size <= grid * grid) {
    const current = queue.pop() as CellPoint;
    if (cells[current.y][current.x] !== target) continue;
    cells[current.y][current.x] = value;
    const neighbours: CellPoint[] = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];
    for (const neighbour of neighbours) {
      if (
        neighbour.x < 0 ||
        neighbour.y < 0 ||
        neighbour.x >= grid ||
        neighbour.y >= grid
      ) {
        continue;
      }
      const key = neighbour.y * grid + neighbour.x;
      if (seen.has(key)) continue;
      seen.add(key);
      if (cells[neighbour.y][neighbour.x] === target) queue.push(neighbour);
    }
  }
  return { cells, durationMs: frame.durationMs };
}

/** The colour at a cell, for the eyedropper. `null` when transparent. */
export function colorAt(
  frame: DraftFrame,
  point: CellPoint,
  grid: number,
): number | null {
  if (point.x < 0 || point.y < 0 || point.x >= grid || point.y >= grid) {
    return null;
  }
  return frame.cells[point.y]?.[point.x] ?? null;
}

/** Which palette indices a drawing actually uses, in first-seen order. */
export function usedColors(draft: Draft): number[] {
  const seen = new Set<number>();
  for (const frame of draft.frames) {
    for (const row of frame.cells) {
      for (const value of row) {
        if (value !== null) seen.add(value);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** Resolve a brush color for a new stroke. Only unused slots may be recycled;
 * selecting a color must never recolor any existing pixel in any frame. */
export function choosePaintColor(draft: Draft, hex: string): { draft: Draft; index: number } | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const color = hex.toLowerCase();
  const existing = draft.palette.indexOf(color);
  if (existing >= 0) return { draft, index: existing };
  const used = new Set(usedColors(draft));
  const index = draft.palette.length < MAX_CREATION_COLORS
    ? draft.palette.length : draft.palette.findIndex((_, slot) => !used.has(slot));
  if (index < 0) return null;
  const palette = [...draft.palette];
  palette[index] = color;
  return { draft: { ...draft, palette }, index };
}

// ─── Frames ──────────────────────────────────────────────────────────────────

export function addFrame(draft: Draft, after = draft.frames.length - 1): Draft {
  if (draft.frames.length >= MAX_CREATION_FRAMES) return draft;
  const blank = emptyFrame(draft.grid);
  const frames = [...draft.frames];
  frames.splice(after + 1, 0, { cells: decodeRows(blank.rows, draft.grid), durationMs: blank.durationMs });
  return { ...draft, frames };
}

export function duplicateFrame(draft: Draft, index: number): Draft {
  if (draft.frames.length >= MAX_CREATION_FRAMES) return draft;
  const source = draft.frames[index];
  if (!source) return draft;
  const frames = cloneFrames(draft.frames);
  frames.splice(index + 1, 0, cloneFrame(source));
  return { ...draft, frames };
}

export function deleteFrame(draft: Draft, index: number): Draft {
  // A drawing always has at least one frame; deleting the last one clears it
  // instead of leaving nothing to draw on.
  if (draft.frames.length <= 1) {
    const blank = emptyFrame(draft.grid);
    return {
      ...draft,
      frames: [
        {
          cells: decodeRows(blank.rows, draft.grid),
          durationMs: draft.frames[0]?.durationMs ?? 240,
        },
      ],
    };
  }
  const frames = cloneFrames(draft.frames);
  frames.splice(index, 1);
  return { ...draft, frames };
}

/**
 * Moves a frame one place earlier or later.
 *
 * Exposed as a pair of buttons rather than drag-and-drop alone, so the operation
 * is reachable by keyboard — a drag-only reorder would exclude anyone not using a
 * pointer.
 */
export function moveFrame(
  draft: Draft,
  index: number,
  direction: -1 | 1,
): Draft {
  const target = index + direction;
  if (target < 0 || target >= draft.frames.length) return draft;
  const frames = cloneFrames(draft.frames);
  const [moved] = frames.splice(index, 1);
  frames.splice(target, 0, moved);
  return { ...draft, frames };
}

export function setFrameDuration(
  draft: Draft,
  index: number,
  durationMs: number,
): Draft {
  const clamped = Math.max(
    MIN_FRAME_MS,
    Math.min(MAX_FRAME_MS, Math.round(durationMs)),
  );
  const frames = cloneFrames(draft.frames);
  if (!frames[index]) return draft;
  frames[index] = { ...frames[index], durationMs: clamped };
  return { ...draft, frames };
}

export function totalDurationMs(draft: Draft): number {
  return draft.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
}

// ─── Serialising ─────────────────────────────────────────────────────────────

/** A URL-safe slug from a display name. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug.length > 0 ? slug : "my-companion";
}

/**
 * The draft as a persistable document.
 *
 * This is the only place a draft becomes stored content, so it is the only place
 * that has to be right about the encoding — and the result is validated before it
 * is sent anywhere.
 */
export function draftToCreation(draft: Draft): PixelCreation {
  return {
    version: 1,
    id: draft.id ?? `user:${slugify(draft.name)}`,
    name: draft.name.trim().slice(0, 32) || "My companion",
    grid: draft.grid,
    palette: [...draft.palette],
    frames: draft.frames.map((frame) => ({
      rows: encodeFrame(frame.cells, draft.grid),
      durationMs: frame.durationMs,
    })),
    playback: draft.playback,
  };
}

/** A draft from a stored document, so a creation can be reopened and edited. */
export function creationToDraft(creation: PixelCreation): Draft {
  return {
    id: creation.id,
    name: creation.name,
    grid: creation.grid,
    palette: [...creation.palette],
    frames: creation.frames.map((frame) => ({
      cells: decodeRows(frame.rows, creation.grid),
      durationMs: frame.durationMs,
    })),
    playback: creation.playback,
  };
}

/** Name-independent identity; old owner-scoped slugs remain unchanged on reopen. */
export function newCreationId(): string {
  const random = globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 24);
  return `user:${random}`;
}

/** Inclusive Bresenham segment, bounded by the authored grid. */
export function cellSegment(from: CellPoint, to: CellPoint): CellPoint[] {
  const points: CellPoint[] = [];
  let x = from.x, y = from.y;
  const dx = Math.abs(to.x - x), dy = -Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1, sy = y < to.y ? 1 : -1;
  let error = dx + dy;
  for (let n = 0; n <= 128; n++) {
    points.push({ x, y });
    if (x === to.x && y === to.y) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
  return points;
}
export function paintCells(frame: DraftFrame, points: readonly CellPoint[], value: CellValue, grid: number, mirrored: boolean): DraftFrame {
  let changed = false;
  const cells = frame.cells.map(row => [...row]);
  const put = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < grid && y < grid && cells[y][x] !== value) { cells[y][x] = value; changed = true; } };
  for (const point of points) { put(point.x, point.y); if (mirrored) put(grid - 1 - point.x, point.y); }
  return changed ? { ...frame, cells } : frame;
}
