// The Workspace canvas in numbers: a finite world measured in points, and a camera over it. Nothing here knows about React or
// a screen. Functions marked as worklets also run on the UI thread, because the camera follows a finger there. A camera is saved
// as the world point at the middle of the viewport, so it still means the same place after a resize or a rotation.
export const GRID = 28;
/** 200 × 130 cells. Large enough to spread out in, and small enough to come back from. */
export const WORLD = { width: 5600, height: 3640 } as const;
export const ZOOM = { min: 0.2, max: 2, step: 1.25 } as const;
/** Below this zoom a window shows its name, not its content: nobody reads a tool at this size. */
export const OVERVIEW_ZOOM = 0.45;
/** How far past the edge of the world the camera may look, in screen points, so the edge is seen and not just hit. */
export const EDGE_GUTTER = 120;
/** One tile of the dot grid holds 8 × 8 cells. */

export interface Size { width: number; height: number }
export interface Point { x: number; y: number }
export interface Rect extends Point, Size {}
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface Camera extends Point { zoom: number }
/** The part of the screen the canvas has, and how much of it is covered by chrome. */
export interface Frame { viewport: Size; insets: Insets }

export const HOME_CAMERA: Camera = { x: WORLD.width / 2, y: WORLD.height / 2, zoom: 1 };
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export function clamp(value: number, low: number, high: number) {
  "worklet";
  return Math.max(low, Math.min(high, value));
}

export const clampZoom = (zoom: number) => {
  "worklet";
  return clamp(zoom, ZOOM.min, ZOOM.max);
};

function clampAxis(center: number, viewport: number, world: number, zoom: number) {
  "worklet";
  const half = viewport / (2 * zoom);
  const gutter = EDGE_GUTTER / zoom;
  if (half * 2 >= world + gutter * 2) return world / 2;
  return clamp(center, half - gutter, world - half + gutter);
}

/** Keeps the world in view: the camera can reach every edge and look a little past it, and never loses the world. */
export function clampCamera(camera: Camera, viewport: Size): Camera {
  "worklet";
  const zoom = clampZoom(camera.zoom);
  return { x: clampAxis(camera.x, viewport.width, WORLD.width, zoom), y: clampAxis(camera.y, viewport.height, WORLD.height, zoom), zoom };
}

/** Zooms around a point on the screen: whatever was under that point stays under it. */
export function zoomAt(camera: Camera, nextZoom: number, focal: Point, viewport: Size): Camera {
  "worklet";
  const zoom = clampZoom(nextZoom);
  const dx = focal.x - viewport.width / 2;
  const dy = focal.y - viewport.height / 2;
  return clampCamera({ x: camera.x + dx / camera.zoom - dx / zoom, y: camera.y + dy / camera.zoom - dy / zoom, zoom }, viewport);
}

export function screenToWorld(point: Point, camera: Camera, viewport: Size): Point {
  return { x: camera.x + (point.x - viewport.width / 2) / camera.zoom, y: camera.y + (point.y - viewport.height / 2) / camera.zoom };
}

export function worldToScreen(point: Point, camera: Camera, viewport: Size): Point {
  return { x: (point.x - camera.x) * camera.zoom + viewport.width / 2, y: (point.y - camera.y) * camera.zoom + viewport.height / 2 };
}

/** What the camera shows, in world points. */
export function visibleWorld(camera: Camera, viewport: Size): Rect {
  const width = viewport.width / camera.zoom;
  const height = viewport.height / camera.zoom;
  return { x: camera.x - width / 2, y: camera.y - height / 2, width, height };
}

/** What the camera shows once chrome is taken away. New windows go here, so they never land behind the Command Center. */
export function clearWorld(camera: Camera, frame: Frame): Rect {
  const seen = visibleWorld(camera, frame.viewport);
  const { top, right, bottom, left } = frame.insets;
  return { x: seen.x + left / camera.zoom, y: seen.y + top / camera.zoom, width: seen.width - (left + right) / camera.zoom, height: seen.height - (top + bottom) / camera.zoom };
}

export const intersects = (a: Rect, b: Rect, margin = 0) => a.x < b.x + b.width + margin && a.x + a.width > b.x - margin && a.y < b.y + b.height + margin && a.y + a.height > b.y - margin;
export const contains = (outer: Rect, inner: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

export function boundsOf(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return { x, y, width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x, height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y };
}

/** The camera that frames a rectangle in the clear part of the screen, never closer than `maxZoom`. */
export function frameRect(rect: Rect, frame: Frame, padding = GRID * 2, maxZoom = 1): Camera {
  const { viewport, insets } = frame;
  const room = { width: Math.max(1, viewport.width - insets.left - insets.right - padding * 2), height: Math.max(1, viewport.height - insets.top - insets.bottom - padding * 2) };
  const zoom = clampZoom(Math.min(room.width / rect.width, room.height / rect.height, maxZoom));
  const shiftX = (insets.left - insets.right) / (2 * zoom);
  const shiftY = (insets.top - insets.bottom) / (2 * zoom);
  return clampCamera({ x: rect.x + rect.width / 2 - shiftX, y: rect.y + rect.height / 2 - shiftY, zoom }, viewport);
}

/** The smallest camera move that shows a rectangle: nothing if it is already clear, a nudge if it fits, and a zoom out if it does not. */
export function revealRect(camera: Camera, rect: Rect, frame: Frame): Camera {
  const clear = clearWorld(camera, frame);
  if (contains(clear, rect)) return camera;
  if (rect.width > clear.width || rect.height > clear.height) return frameRect(rect, frame, GRID, Math.max(camera.zoom, ZOOM.min));
  const nudge = (low: number, size: number, clearLow: number, clearSize: number) => (low < clearLow ? low - clearLow : low + size > clearLow + clearSize ? low + size - clearLow - clearSize : 0);
  return clampCamera({ x: camera.x + nudge(rect.x, rect.width, clear.x, clear.width), y: camera.y + nudge(rect.y, rect.height, clear.y, clear.height), zoom: camera.zoom }, frame.viewport);
}

// Above `gridDots`: a worklet captures what it calls when it is defined, so nothing here is hoisted.
/** Below this many points apart, dots would blur into a texture, so a far view shows every other one. */
export const MIN_DOT_SPACING = 8;

export function gridSpacing(zoom: number): { spacing: number; level: number } {
  "worklet";
  // Spacing follows the zoom exactly, so zooming in visibly spreads the dots and zooming out draws them together (owner, Phase 14).
  let spacing = GRID * zoom;
  let level = 0;
  while (spacing < MIN_DOT_SPACING) { spacing *= 2; level++; }
  return { spacing, level };
}

/**
 * Where the dots go. They are drawn at one size whatever the zoom, and their spacing is the grid's at that zoom, so the dots show
 * how far in or out the view is. Only past MIN_DOT_SPACING does a dot stand for twice as much of the world, which keeps the widest
 * views from filling with dots. `x` and `y` place the first tile, whose dot is at its center, and `level` says which octave.
 */
export function gridDots(camera: Camera, viewport: Size): { spacing: number; x: number; y: number; level: number } {
  "worklet";
  const { spacing, level } = gridSpacing(camera.zoom);
  const originX = viewport.width / 2 - camera.x * camera.zoom + spacing / 2;
  const originY = viewport.height / 2 - camera.y * camera.zoom + spacing / 2;
  return { spacing, x: ((originX % spacing) + spacing) % spacing - spacing, y: ((originY % spacing) + spacing) % spacing - spacing, level };
}

export const snapToGrid = (value: number) => Math.round(value / GRID) * GRID;
