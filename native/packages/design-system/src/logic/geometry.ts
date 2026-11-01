// Pure layout math, shared by components and tested without a renderer.

export function snapValue(value: number, min: number, max: number, step: number) {
  "worklet";
  const snapped = Math.round((value - min) / step) * step + min;
  return Math.min(max, Math.max(min, +snapped.toFixed(6)));
}

export const clampToStep = (value: number, min: number, max: number, step: number) => snapValue(value, min, max, step);

export interface Rect { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface Bounds { top: number; left: number; right: number; bottom: number }
export type Side = "top" | "bottom" | "left" | "right";
export type TuckCorner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export interface Placement { left: number; top: number; side: Side; tuck: TuckCorner; originX: number; originY: number }

/**
 * Places a floating surface next to its anchor, inside the safe window. The preferred side flips when it does not fit,
 * and the corner nearest the anchor is reported so a theme can tuck it: the surface points home without an arrow.
 */
export function placeFloating(anchor: Rect, size: Size, window: Size, insets: Bounds, preferred: Side = "bottom", gap = 8): Placement {
  const room: Record<Side, number> = {
    top: anchor.y - insets.top,
    bottom: window.height - insets.bottom - (anchor.y + anchor.height),
    left: anchor.x - insets.left,
    right: window.width - insets.right - (anchor.x + anchor.width),
  };
  const needed = (side: Side) => (side === "top" || side === "bottom" ? size.height : size.width) + gap;
  const opposite: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  let side = preferred;
  if (room[side] < needed(side)) side = room[opposite[side]] >= needed(opposite[side]) ? opposite[side] : (room.bottom >= room.top ? "bottom" : "top");

  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)));
  const minLeft = insets.left + gap;
  const maxLeft = window.width - insets.right - gap - size.width;
  const minTop = insets.top + gap;
  const maxTop = window.height - insets.bottom - gap - size.height;
  let left: number;
  let top: number;
  if (side === "top" || side === "bottom") {
    left = clamp(anchor.x, minLeft, maxLeft);
    top = clamp(side === "bottom" ? anchor.y + anchor.height + gap : anchor.y - size.height - gap, minTop, maxTop);
  } else {
    left = clamp(side === "right" ? anchor.x + anchor.width + gap : anchor.x - size.width - gap, minLeft, maxLeft);
    top = clamp(anchor.y, minTop, maxTop);
  }
  const anchorCenterX = anchor.x + anchor.width / 2;
  const anchorCenterY = anchor.y + anchor.height / 2;
  const isLeft = anchorCenterX < left + size.width / 2;
  const isTop = anchorCenterY < top + size.height / 2;
  const tuck = `${isTop ? "top" : "bottom"}${isLeft ? "Left" : "Right"}` as TuckCorner;
  return { left, top, side, tuck, originX: isLeft ? 0 : size.width, originY: isTop ? 0 : size.height };
}

/** Snaps a split ratio to useful positions when close, and always keeps both panes usable. */
export function resolveSplit(ratio: number, total: number, minPane: number, snaps: number[], threshold = 0.025) {
  "worklet";
  const min = total > 0 ? Math.min(0.5, minPane / total) : 0;
  const bounded = Math.min(1 - min, Math.max(min, ratio));
  for (let i = 0; i < snaps.length; i++) if (Math.abs(bounded - snaps[i]) <= threshold) return snaps[i];
  return bounded;
}

/** Keeps a dragged rectangle reachable inside its container: panels must survive rotation and window resizing. */
export function clampRect(rect: Rect, container: Size): Rect {
  const width = Math.min(rect.width, container.width);
  const height = Math.min(rect.height, container.height);
  return { width, height, x: Math.max(0, Math.min(rect.x, container.width - width)), y: Math.max(0, Math.min(rect.y, container.height - height)) };
}
