// The Workspace's state and every change to it, as pure functions over one small serializable value. Window positions and sizes
// are world coordinates, so moving the camera never touches them. A function returns the same object when nothing changed,
// so a no-op writes nothing and renders nothing.
import { GRID, HOME_CAMERA, WORLD, boundsOf, clamp, clampCamera, clampZoom, clearWorld, contains, frameRect, intersects, revealRect, snapToGrid, type Camera, type Frame, type Point, type Rect, type Size } from "./canvas";
import { TOOLS, isToolId, type ToolId } from "./tools";

export const WORKSPACE_LAYOUTS = ["free", "focus", "split", "assistant"] as const;
export type WorkspaceLayout = (typeof WORKSPACE_LAYOUTS)[number];
export const LAYOUT_LABELS: Record<WorkspaceLayout, string> = { free: "Free", focus: "Focus", split: "Split", assistant: "Assistant" };

/** A tool's own restorable state: small, serializable, and never a document. Documents stay with their owners. */
export type ToolState = Record<string, string | number | boolean | null | (string | number)[]>;
export const MAX_TOOL_STATE = 2048;
export const MAX_WINDOWS = 16;

export interface WorkspaceWindow extends Rect {
  id: string;
  tool: ToolId;
  z: number;
  minimized: boolean;
  state: ToolState;
}

/** How things stood before a preset, so a preset never costs anyone their arrangement. */
export interface SavedArrangement { camera: Camera; windows: (Rect & { id: string; minimized: boolean })[] }

/** An arrangement someone named and kept: windows, what each was showing, and the camera. Applying it opens fresh windows. */
export interface NamedLayout { id: string; name: string; camera: Camera; windows: (Rect & { tool: ToolId; minimized: boolean; state: ToolState })[] }
export const MAX_NAMED_LAYOUTS = 8;

export interface WorkspaceState {
  version: 1;
  camera: Camera;
  windows: WorkspaceWindow[];
  focused: string | null;
  layout: WorkspaceLayout;
  saved: SavedArrangement | null;
  /** Window ids, most recently used first. */
  recent: string[];
  sequence: number;
  /** Arrangements kept by name, on this device. */
  layouts: NamedLayout[];
}

export const INITIAL_WORKSPACE: WorkspaceState = { version: 1, camera: HOME_CAMERA, windows: [], focused: null, layout: "free", saved: null, recent: [], sequence: 0, layouts: [] };

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function parseToolState(raw: unknown): ToolState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const state: ToolState = {};
  for (const [key, value] of Object.entries(raw)) {
    const plain = value === null || ["string", "boolean"].includes(typeof value) || finite(value);
    const list = Array.isArray(value) && value.every((item) => typeof item === "string" || finite(item));
    if (plain || list) state[key] = value as ToolState[string];
  }
  return JSON.stringify(state).length <= MAX_TOOL_STATE ? state : {};
}

const fitSpec = (tool: ToolId, width: number, height: number): Size => {
  const { min, max } = TOOLS[tool];
  return { width: clamp(width, min.width, max.width), height: clamp(height, min.height, max.height) };
};

const inWorld = (rect: Rect): Rect => ({ ...rect, x: clamp(rect.x, 0, WORLD.width - rect.width), y: clamp(rect.y, 0, WORLD.height - rect.height) });

function parseWindow(raw: unknown): WorkspaceWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<WorkspaceWindow>;
  if (typeof value.id !== "string" || !isToolId(value.tool) || !finite(value.x) || !finite(value.y) || !finite(value.width) || !finite(value.height)) return null;
  const size = fitSpec(value.tool, value.width, value.height);
  return { ...inWorld({ x: value.x, y: value.y, ...size }), id: value.id, tool: value.tool, z: finite(value.z) ? value.z : 0, minimized: value.minimized === true, state: parseToolState(value.state) };
}

function parseCamera(raw: unknown): Camera {
  const value = raw as Partial<Camera> | null | undefined;
  return value && finite(value.x) && finite(value.y) && finite(value.zoom) && value.zoom > 0 ? { x: clamp(value.x, 0, WORLD.width), y: clamp(value.y, 0, WORLD.height), zoom: clampZoom(value.zoom) } : HOME_CAMERA;
}

function parseSaved(raw: unknown, ids: Set<string>): SavedArrangement | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<SavedArrangement>;
  if (!Array.isArray(value.windows)) return null;
  const windows = value.windows.filter((item) => item && ids.has(item.id) && finite(item.x) && finite(item.y) && finite(item.width) && finite(item.height));
  return { camera: parseCamera(value.camera), windows: windows.map(({ id, x, y, width, height, minimized }) => ({ id, x, y, width, height, minimized: minimized === true })) };
}

/** Reads what was stored. A window that cannot be read is dropped, and the rest of the arrangement survives. */
export function parseWorkspaceState(raw: unknown): WorkspaceState {
  if (!raw || typeof raw !== "object") return INITIAL_WORKSPACE;
  const value = raw as Partial<WorkspaceState>;
  if (value.version !== 1) return INITIAL_WORKSPACE;
  const seen = new Set<string>();
  const windows: WorkspaceWindow[] = [];
  for (const item of Array.isArray(value.windows) ? value.windows : []) {
    const window = parseWindow(item);
    if (!window || seen.has(window.id) || windows.length >= MAX_WINDOWS) continue;
    seen.add(window.id);
    windows.push(window);
  }
  // Stacking order is kept, and the numbers are made small again: they only ever climb.
  [...windows].sort((a, b) => a.z - b.z).forEach((window, index) => { window.z = index + 1; });
  const recent = (Array.isArray(value.recent) ? value.recent : []).filter((id): id is string => seen.has(id));
  for (const window of windows) if (!recent.includes(window.id)) recent.push(window.id);
  const focused = windows.some((window) => window.id === value.focused && !window.minimized) ? (value.focused as string) : null;
  const layout = WORKSPACE_LAYOUTS.includes(value.layout as WorkspaceLayout) ? (value.layout as WorkspaceLayout) : "free";
  return { version: 1, camera: parseCamera(value.camera), windows, focused, layout, saved: parseSaved(value.saved, seen), recent, sequence: finite(value.sequence) ? Math.max(0, Math.floor(value.sequence)) : windows.length, layouts: parseNamedLayouts(value.layouts) };
}

/** A layout that cannot be read is dropped, and so is a window in it whose tool no longer exists; the rest survive. */
function parseNamedLayouts(raw: unknown): NamedLayout[] {
  const layouts: NamedLayout[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const value = item as Partial<NamedLayout> | null;
    if (!value || typeof value.id !== "string" || typeof value.name !== "string" || !Array.isArray(value.windows) || layouts.length >= MAX_NAMED_LAYOUTS) continue;
    const windows = value.windows.map((w, index) => parseWindow({ ...(w as object), id: `l${index}`, z: index })).filter((w): w is WorkspaceWindow => !!w).slice(0, MAX_WINDOWS)
      .map(({ tool, x, y, width, height, minimized, state }) => ({ tool, x, y, width, height, minimized, state }));
    if (windows.length) layouts.push({ id: value.id.slice(0, 64), name: value.name.slice(0, 40), camera: parseCamera(value.camera), windows });
  }
  return layouts;
}

/** Keeps the current arrangement under a name. A name already in use is replaced, so saving again updates it. */
export function saveNamedLayout(state: WorkspaceState, name: string, id: string): WorkspaceState {
  const clean = name.trim().slice(0, 40);
  const open = state.windows.slice().sort((a, b) => a.z - b.z);
  if (!clean || !open.length) return state;
  const layout: NamedLayout = { id, name: clean, camera: state.camera, windows: open.map(({ tool, x, y, width, height, minimized, state: tool_state }) => ({ tool, x, y, width, height, minimized, state: tool_state })) };
  const others = state.layouts.filter((item) => item.name.toLowerCase() !== clean.toLowerCase());
  return { ...state, layouts: [layout, ...others].slice(0, MAX_NAMED_LAYOUTS) };
}

export function deleteNamedLayout(state: WorkspaceState, id: string): WorkspaceState {
  return state.layouts.some((item) => item.id === id) ? { ...state, layouts: state.layouts.filter((item) => item.id !== id) } : state;
}

/** Replaces the open windows with the layout's. Documents live in their own stores, so closing a window loses nothing. */
export function applyNamedLayout(state: WorkspaceState, id: string): WorkspaceState {
  const layout = state.layouts.find((item) => item.id === id);
  if (!layout) return state;
  let sequence = state.sequence;
  const windows: WorkspaceWindow[] = layout.windows.map((window, index) => ({ ...window, id: `w${++sequence}`, z: index + 1, state: { ...window.state } }));
  const top = [...windows].reverse().find((window) => !window.minimized);
  return { ...state, windows, camera: layout.camera, focused: top?.id ?? null, layout: "free", saved: null, recent: [...windows].reverse().map((window) => window.id), sequence };
}

const replace = (state: WorkspaceState, id: string, patch: Partial<WorkspaceWindow>) => state.windows.map((window) => (window.id === id ? { ...window, ...patch } : window));
const find = (state: WorkspaceState, id: string) => state.windows.find((window) => window.id === id);
const topZ = (state: WorkspaceState) => state.windows.reduce((top, window) => Math.max(top, window.z), 0);
const touched = (state: WorkspaceState, id: string) => [id, ...state.recent.filter((other) => other !== id)];
/** Arranging anything by hand makes the arrangement the person's own. The preset itself is never changed. */
const freed = { layout: "free", saved: null } as const;

export const openWindows = (state: WorkspaceState) => state.windows.filter((window) => !window.minimized);
export interface PinchRegion extends Rect { id: string; owned: boolean }
/** Open windows as a pinch sees them, top window first, because a finger lands on whichever is on top. */
export const pinchRegions = (state: WorkspaceState): PinchRegion[] => [...openWindows(state)].sort((a, b) => b.z - a.z).map(({ id, tool, x, y, width, height }) => ({ id, x, y, width, height, owned: !!TOOLS[tool].ownsPinch }));
/** The window a two-finger gesture belongs to, in world coordinates. Both fingers have to be on it: one on the canvas makes it the canvas's. */
export function pinchOwner(regions: PinchRegion[], first: Point, second: Point): string | null {
  "worklet";
  const under = (point: Point) => regions.find((region) => point.x >= region.x && point.x <= region.x + region.width && point.y >= region.y && point.y <= region.y + region.height);
  const window = under(first);
  return window && window.owned && under(second) === window ? window.id : null;
}
export const minimizedWindows = (state: WorkspaceState) => state.windows.filter((window) => window.minimized);
export const windowsOf = (state: WorkspaceState, tool: ToolId) => state.windows.filter((window) => window.tool === tool);

/** The window a person would call theirs right now, and the one behind it. */
function frontmost(state: WorkspaceState, exclude?: string) {
  const open = openWindows(state);
  return state.recent.map((id) => open.find((window) => window.id === id)).find((window) => window && window.id !== exclude) ?? null;
}

export function windowTitle(state: WorkspaceState, window: WorkspaceWindow) {
  if (typeof window.state.title === "string" && window.state.title) return window.state.title;
  const siblings = windowsOf(state, window.tool);
  return siblings.length > 1 ? `${TOOLS[window.tool].label} ${siblings.indexOf(window) + 1}` : TOOLS[window.tool].label;
}

export function focusWindow(state: WorkspaceState, id: string): WorkspaceState {
  const window = find(state, id);
  if (!window || window.minimized) return state;
  if (state.focused === id && window.z === topZ(state) && state.recent[0] === id) return state;
  return { ...state, focused: id, recent: touched(state, id), windows: window.z === topZ(state) ? state.windows : replace(state, id, { z: topZ(state) + 1 }) };
}

/** The clear part of the view, side by side with what is there before stacking on top of it. */
export function placeWindow(state: WorkspaceState, size: Size, frame: Frame): Point {
  const area = clearWorld(state.camera, frame);
  const center = { x: area.x + (area.width - size.width) / 2, y: area.y + (area.height - size.height) / 2 };
  const open = openWindows(state);
  // Snapping must not push a window that fits out of the clear area and under the chrome.
  const onGrid = (value: number, low: number, high: number) => clamp(snapToGrid(value), Math.ceil(low / GRID) * GRID, Math.max(Math.ceil(low / GRID), Math.floor(high / GRID)) * GRID);
  const settle = (point: Point): Rect => inWorld({ x: onGrid(point.x, area.x, area.x + area.width - size.width), y: onGrid(point.y, area.y, area.y + area.height - size.height), ...size });
  const free = (rect: Rect) => !open.some((window) => intersects(window, rect, GRID / 2 - 1));
  const home = settle(center);
  if (free(home) && contains(area, home)) return home;
  const gap = GRID;
  const beside = state.recent.flatMap((id) => {
    const window = open.find((item) => item.id === id);
    return window ? [{ x: window.x + window.width + gap, y: window.y }, { x: window.x - size.width - gap, y: window.y }, { x: window.x, y: window.y + window.height + gap }, { x: window.x, y: window.y - size.height - gap }] : [];
  });
  for (const spot of beside) {
    const rect = settle(spot);
    if (free(rect) && contains(area, rect)) return rect;
  }
  // Anything free in view, as near the middle as possible.
  let nearest: Rect | null = null;
  let distance = Infinity;
  for (let y = area.y; y + size.height <= area.y + area.height; y += GRID * 2) {
    for (let x = area.x; x + size.width <= area.x + area.width; x += GRID * 2) {
      const rect = settle({ x, y });
      const away = Math.hypot(rect.x - center.x, rect.y - center.y);
      if (away < distance && free(rect)) { nearest = rect; distance = away; }
    }
  }
  if (nearest) return nearest;
  // Nothing free in view: beside what is there, where the camera will follow, because the canvas is larger than the screen.
  for (const spot of beside) {
    const rect = inWorld({ x: snapToGrid(spot.x), y: snapToGrid(spot.y), ...size });
    if (rect.x === snapToGrid(spot.x) && rect.y === snapToGrid(spot.y) && free(rect)) return rect;
  }
  // A full world: a short cascade from the middle, so nothing lands exactly on top of something else.
  for (let step = 0; step < 12; step++) {
    const rect = settle({ x: center.x + (step % 6) * GRID * 2, y: center.y + (step % 6) * GRID * 2 });
    if (!open.some((window) => window.x === rect.x && window.y === rect.y)) return rect;
  }
  return home;
}

export interface OpenResult { state: WorkspaceState; id: string | null }

/** Opens a tool. A tool that allows one copy comes forward instead, and a full Workspace opens nothing (`id` is null). */
export function openWindow(state: WorkspaceState, tool: ToolId, frame: Frame, initial: ToolState = {}): OpenResult {
  const spec = TOOLS[tool];
  if (!spec.multiple) {
    const existing = windowsOf(state, tool)[0];
    if (existing) return { state: restoreWindow(state, existing.id), id: existing.id };
  }
  if (state.windows.length >= MAX_WINDOWS) return { state, id: null };
  const area = clearWorld(state.camera, frame);
  const onGridRoom = (room: number) => Math.floor((room - GRID) / GRID) * GRID;
  const size = fitSpec(tool, Math.min(spec.preferred.width, onGridRoom(area.width)), Math.min(spec.preferred.height, onGridRoom(area.height)));
  const sequence = state.sequence + 1;
  const id = `w${sequence}`;
  const window: WorkspaceWindow = { id, tool, ...placeWindow(state, size, frame), ...size, z: topZ(state) + 1, minimized: false, state: parseToolState(initial) };
  const next = { ...state, ...freed, sequence, focused: id, recent: [id, ...state.recent], windows: [...state.windows, window] };
  return { state: { ...next, camera: revealRect(next.camera, window, frame) }, id };
}

export function closeWindow(state: WorkspaceState, id: string): WorkspaceState {
  if (!find(state, id)) return state;
  const windows = state.windows.filter((window) => window.id !== id);
  const recent = state.recent.filter((other) => other !== id);
  const rest = { ...state, windows, recent };
  return { ...rest, ...freed, focused: state.focused === id ? frontmost(rest)?.id ?? null : state.focused };
}

export function minimizeWindow(state: WorkspaceState, id: string): WorkspaceState {
  const window = find(state, id);
  if (!window || window.minimized) return state;
  const windows = replace(state, id, { minimized: true });
  return { ...state, ...freed, windows, focused: state.focused === id ? frontmost({ ...state, windows }, id)?.id ?? null : state.focused };
}

export function restoreWindow(state: WorkspaceState, id: string): WorkspaceState {
  const window = find(state, id);
  if (!window) return state;
  if (!window.minimized) return focusWindow(state, id);
  return focusWindow({ ...state, ...freed, windows: replace(state, id, { minimized: false }) }, id);
}

/** A drop: the window settles on the grid and stays in the world. */
export function moveWindow(state: WorkspaceState, id: string, x: number, y: number): WorkspaceState {
  const window = find(state, id);
  if (!window) return state;
  const rect = inWorld({ ...window, x: snapToGrid(x), y: snapToGrid(y) });
  if (rect.x === window.x && rect.y === window.y) return state;
  return { ...state, ...freed, windows: replace(state, id, { x: rect.x, y: rect.y }) };
}

export function resizeWindow(state: WorkspaceState, id: string, rect: Rect): WorkspaceState {
  const window = find(state, id);
  if (!window) return state;
  const size = fitSpec(window.tool, snapToGrid(rect.width), snapToGrid(rect.height));
  const next = inWorld({ x: snapToGrid(rect.x), y: snapToGrid(rect.y), ...size });
  if (next.x === window.x && next.y === window.y && next.width === window.width && next.height === window.height) return state;
  return { ...state, ...freed, windows: replace(state, id, next) };
}

export function setToolState(state: WorkspaceState, id: string, patch: ToolState): WorkspaceState {
  const window = find(state, id);
  if (!window) return state;
  const merged = { ...window.state, ...patch };
  if (JSON.stringify(merged) === JSON.stringify(window.state)) return state;
  const parsed = parseToolState(merged);
  return Object.keys(parsed).length || !Object.keys(merged).length ? { ...state, windows: replace(state, id, { state: parsed }) } : state;
}

/** Moves focus through the open windows, in the order they were opened, which does not change as focus moves. */
export function cycleFocus(state: WorkspaceState, direction: 1 | -1): WorkspaceState {
  const open = openWindows(state);
  if (!open.length) return state;
  const index = open.findIndex((window) => window.id === state.focused);
  return focusWindow(state, open[(index + direction + open.length) % open.length].id);
}

const saveArrangement = (state: WorkspaceState): SavedArrangement => state.saved ?? { camera: state.camera, windows: state.windows.map(({ id, x, y, width, height, minimized }) => ({ id, x, y, width, height, minimized })) };

/** Goes back to how things stood before a preset. Windows opened since then stay where they are. */
export function restoreArrangement(state: WorkspaceState): WorkspaceState {
  const { saved } = state;
  if (!saved) return state.layout === "free" ? state : { ...state, layout: "free" };
  const windows = state.windows.map((window) => {
    const before = saved.windows.find((item) => item.id === window.id);
    return before ? { ...window, x: before.x, y: before.y, width: before.width, height: before.height, minimized: before.minimized } : window;
  });
  const focused = windows.some((window) => window.id === state.focused && !window.minimized) ? state.focused : frontmost({ ...state, windows })?.id ?? null;
  return { ...state, windows, focused, camera: saved.camera, layout: "free", saved: null };
}

const COMPANIONS: Partial<Record<ToolId, ToolId>> = { notes: "pdfs", pdfs: "notes", whiteboard: "pdfs" };

/** The size a preset has to work with: the clear part of the screen at 100%, which is where its tools read best. */
function presetArea(frame: Frame): Size {
  const { viewport, insets } = frame;
  const margin = GRID;
  return { width: Math.max(GRID, Math.floor((viewport.width - insets.left - insets.right - margin * 2) / GRID) * GRID), height: Math.max(GRID, Math.floor((viewport.height - insets.top - insets.bottom - margin * 2) / GRID) * GRID) };
}

function primaryOf(state: WorkspaceState) {
  return (state.focused ? find(state, state.focused) : null) ?? frontmost(state) ?? state.recent.map((id) => find(state, id)).find(Boolean) ?? null;
}

/**
 * Lays out what is open around the view. Everything a preset does not use is minimized, never closed, and the arrangement it
 * replaced is kept for the way back. A preset is computed fresh each time, so no adjustment ever changes what it means.
 */
export function applyLayout(state: WorkspaceState, layout: WorkspaceLayout, frame: Frame): WorkspaceState {
  if (layout === "free") return restoreArrangement(state);
  // Focus hides the Command Center, so the tool can have the room it would have covered.
  const room: Frame = layout === "focus" ? { ...frame, insets: { ...frame.insets, bottom: Math.min(frame.insets.bottom, GRID * 2) } } : frame;
  const saved = saveArrangement(state);
  let next = state;
  const ensure = (tool: ToolId): WorkspaceWindow | null => {
    const existing = next.recent.map((id) => find(next, id)).find((window) => window?.tool === tool);
    if (existing) return existing;
    const opened = openWindow(next, tool, frame);
    next = opened.state;
    return opened.id ? find(next, opened.id) ?? null : null;
  };

  const primary = primaryOf(next) ?? ensure("notes");
  if (!primary) return state;
  const area = presetArea(room);
  const gap = GRID;
  const parts: { window: WorkspaceWindow; width: number; left: number }[] = [];
  if (layout === "focus") parts.push({ window: primary, width: area.width, left: 0 });
  else {
    const main = layout === "assistant" && primary.tool === "sylvie" ? frontmost(next, primary.id) ?? ensure("notes") : primary;
    const other = layout === "assistant"
      ? primary.tool === "sylvie" ? primary : ensure("sylvie")
      : frontmost(next, primary.id) ?? ensure(COMPANIONS[primary.tool] ?? "notes");
    if (!main || !other) return state;
    const share = layout === "assistant" ? snapToGrid((area.width - gap) * (2 / 3)) : snapToGrid((area.width - gap) / 2);
    parts.push({ window: main, width: share, left: 0 }, { window: other, width: area.width - gap - share, left: share + gap });
  }

  // Each part takes what its tool allows, so a tool with a size limit leaves no hole: the group stays together and centered.
  const sized = parts.map((part) => ({ id: part.window.id, ...fitSpec(part.window.tool, part.width, area.height) }));
  const last = sized[sized.length - 1];
  if (layout === "split") last.width = fitSpec(next.windows.find((window) => window.id === last.id)!.tool, area.width - gap - sized[0].width, area.height).width;
  const groupWidth = sized.reduce((sum, part) => sum + part.width, 0) + gap * (sized.length - 1);
  const groupHeight = Math.max(...sized.map((part) => part.height));
  const anchor = { x: clamp(snapToGrid(next.camera.x - groupWidth / 2), 0, WORLD.width - groupWidth), y: clamp(snapToGrid(next.camera.y - groupHeight / 2), 0, WORLD.height - groupHeight) };
  const used = new Set(sized.map((part) => part.id));
  let left = 0;
  const lefts = new Map(sized.map((part) => { const at = left; left += part.width + gap; return [part.id, at]; }));
  const windows = next.windows.map((window) => {
    const part = sized.find((item) => item.id === window.id);
    if (!part) return { ...window, minimized: true };
    return { ...window, ...inWorld({ x: anchor.x + (lefts.get(part.id) ?? 0), y: anchor.y, width: part.width, height: part.height }), minimized: false };
  });
  const placed = windows.filter((window) => used.has(window.id));
  const focused = parts[0].window.id;
  const bounds = boundsOf(placed) as Rect;
  const arranged: WorkspaceState = { ...next, windows, focused, layout, saved, camera: frameRect(bounds, room, GRID, 1) };
  return { ...focusWindow(arranged, focused), layout, saved };
}

export function fitWorkspace(state: WorkspaceState, frame: Frame): Camera {
  const bounds = boundsOf(openWindows(state));
  return bounds ? frameRect(bounds, frame, GRID * 2, 1) : frameRect({ x: 0, y: 0, width: WORLD.width, height: WORLD.height }, frame, GRID, 1);
}

export function setCamera(state: WorkspaceState, camera: Camera, viewport: Size): WorkspaceState {
  const next = clampCamera(camera, viewport);
  return next.x === state.camera.x && next.y === state.camera.y && next.zoom === state.camera.zoom ? state : { ...state, camera: next };
}
