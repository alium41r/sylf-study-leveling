// Two-finger zoom for paged documents (notes and PDFs), smooth on a tablet. While the fingers move, the pages are only scaled on screen
// about the point where the fingers landed, following it as it moves: nothing is laid out again, so nothing shakes. Each step is placed
// with the layout the zoom will have, so the preview already shows where the page lands, edges and centring included. When the fingers
// lift, the document is laid out once at the new zoom, in the same commit that takes the on-screen scale away, so nothing jumps.
// Points arrive in screen coordinates: the page moves under the fingers as it zooms, so measuring against it would feed back.
import { createElement, useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
import { Platform, View, type ScrollView } from "react-native";
import { nativePinchArea } from "@sylf/native-platform";

export const MIN_ZOOM = 0.5, MAX_ZOOM = 3;

type Point = { x: number; y: number };
export interface Box { top: number; left: number; width: number; height: number }
/** A paged document laid out: where each page is, and the size of what scrolls. */
export interface Stack { rows: Box[]; width: number; height: number }
export interface Transform { scale: number; x: number; y: number }
const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

/** Pages one under another, `gap` apart and around, centred when narrower than the view: the one rule a document renders with and a pinch predicts with. */
export function stackPages(sizes: readonly { width: number; height: number }[], scale: number, view: number, gap: number): Stack {
  const width = Math.max(view, Math.max(1, ...sizes.map((size) => size.width)) * scale + gap * 2);
  let top = gap;
  const rows = sizes.map((size) => {
    const row = { top, left: (width - size.width * scale) / 2, width: size.width * scale, height: size.height * scale };
    top += row.height + gap;
    return row;
  });
  return { rows, width, height: top };
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function clampPageScroll(offset: Point, content: { width: number; height: number }, view: { width: number; height: number }): Point {
  return { x: clamp(offset.x, 0, content.width - view.width), y: clamp(offset.y, 0, content.height - view.height) };
}

/**
 * Where a pinch leaves the view. The page point that was under `start` (a point of the view, with the content scrolled to `offset`)
 * goes under `point` in the `after` layout, as far as that layout can scroll. `transform` shows the `before` layout on screen exactly
 * so, which is what makes letting go move nothing: at the top of a note, or with pages narrower than the view, the page stays where the
 * layout will keep it rather than following the fingers and jumping back.
 */
export function pinchTarget(before: Stack, after: Stack, view: { width: number; height: number }, offset: Point, start: Point, point: Point): { scroll: Point; transform: Transform } {
  const at = { x: offset.x + start.x, y: offset.y + start.y };
  // The page under the fingers, or the one below the gap they are in: places on a page scale with it, the gaps between pages do not.
  const found = before.rows.findIndex((row) => at.y < row.top + row.height);
  const index = found < 0 ? before.rows.length - 1 : found;
  const from = before.rows[index], to = after.rows[index];
  const there = from && to ? { x: to.left + ((at.x - from.left) / from.width) * to.width, y: to.top + ((at.y - from.top) / from.height) * to.height } : at;
  const scroll = clampPageScroll({ x: there.x - point.x, y: there.y - point.y }, after, view);
  const scale = from && to ? to.width / from.width : 1;
  return { scroll, transform: { scale, x: there.x - scroll.x - scale * start.x, y: there.y - scroll.y - scale * start.y } };
}

interface Options {
  zoom: number;
  /** The document laid out at a zoom, by the rule it renders with. */
  layoutAt(zoom: number): Stack;
  view: { width: number; height: number };
  content: { width: number; height: number };
  offset: RefObject<Point>;
  /** The fingers lifted: lay out at this zoom, scrolled here. Called in the same update that takes the on-screen scale away. */
  commit(zoom: number, scroll: Point): void;
  vertical: RefObject<ComponentRef<typeof ScrollView> | null>;
  horizontal: RefObject<ComponentRef<typeof ScrollView> | null>;
  /** The zoom as it changes, before anything is laid out: every step of a pinch, a wheel or a zoom control. */
  onZoom?(zoom: number): void;
}

export function usePagePinch({ zoom, layoutAt, view, content, offset, commit, vertical, horizontal, onZoom }: Options) {
  const stage = useRef<((transform: Transform) => void) | null>(null);
  // True from the fingers landing to their lifting: the document then draws what shrinking can bring into view, once, as it starts.
  const [pinching, setPinching] = useState(false);
  const area = useRef<ComponentRef<typeof View>>(null);
  const origin = useRef({ x: 0, y: 0 });
  const gesture = useRef<{ start: Point; zoom: number; before: Stack; offset: Point } | null>(null);
  const settle = useRef<Point | null>(null);
  const pending = useRef<{ zoom: number; point: Point } | null>(null);
  const frame = useRef(0);
  const latest = useRef({ zoom, view, layoutAt, commit, onZoom });
  latest.current = { zoom, view, layoutAt, commit, onZoom };

  const measure = () => {
    if (Platform.OS !== "web") area.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
  };
  const local = (x: number, y: number) => {
    if (Platform.OS === "web") {
      const box = (area.current as unknown as HTMLElement | null)?.getBoundingClientRect();
      if (box?.width && box.height) return { x: (x - box.left) * latest.current.view.width / box.width, y: (y - box.top) * latest.current.view.height / box.height };
    }
    return { x: x - origin.current.x, y: y - origin.current.y };
  };
  const finish = (next: number, scroll: Point) => {
    settle.current = scroll;
    offset.current = scroll;
    latest.current.zoom = next;
    latest.current.commit(next, scroll);
  };
  const zoomBy = (factor: number, x?: number, y?: number) => {
    if (gesture.current || !(factor > 0)) return;
    const current = latest.current;
    const next = clamp((pending.current?.zoom ?? current.zoom) * factor, MIN_ZOOM, MAX_ZOOM);
    pending.current = { zoom: next, point: { x: x ?? current.view.width / 2, y: y ?? current.view.height / 2 } };
    current.onZoom?.(next);
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const target = pending.current;
      pending.current = null;
      const { zoom, view, layoutAt } = latest.current;
      if (!target || target.zoom === zoom) return;
      const { scroll } = pinchTarget(layoutAt(zoom), layoutAt(target.zoom), view, offset.current, target.point, target.point);
      finish(target.zoom, scroll);
    });
  };
  const wheelZoom = useRef(zoomBy);
  wheelZoom.current = zoomBy;
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = area.current as unknown as HTMLElement | null;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const point = local(event.clientX, event.clientY);
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1;
      wheelZoom.current(Math.exp(-event.deltaY * units * 0.01), point.x, point.y);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onPagePinch = (phase: "start" | "move" | "end", raw: number, sx: number, sy: number) => {
    if (phase === "start") {
      measure();
      pending.current = null;
      gesture.current = { start: { x: sx, y: sy }, zoom, before: layoutAt(zoom), offset: { ...offset.current } };
      setPinching(true);
      onZoom?.(zoom);
      return;
    }
    const g = gesture.current;
    if (!g) return;
    // Both points through the same origin, so a measurement that lands mid-gesture moves nothing.
    const start = local(g.start.x, g.start.y), point = local(sx, sy);
    // The zoom stays within its limits while the fingers move, so letting go never jumps.
    const next = clamp(g.zoom * raw, MIN_ZOOM, MAX_ZOOM);
    onZoom?.(next);
    const { scroll, transform } = pinchTarget(g.before, layoutAt(next), view, g.offset, start, point);
    if (phase !== "end") { stage.current?.(transform); return; }
    gesture.current = null;
    stage.current?.(IDENTITY);
    setPinching(false);
    finish(next, scroll);
  };

  // The commit lays out the new zoom and takes the on-screen scale away; the scroll goes with it. Android runs scroll commands before
  // the layout they arrive with, so the content stays grown to the largest zoom until this commit and the scroll is never cut short.
  useLayoutEffect(() => {
    if (pinching) return;
    const landing = settle.current;
    const current = offset.current;
    const target = clampPageScroll(landing ?? current, content, view);
    if (!landing && current.x === target.x && current.y === target.y) return;
    settle.current = null;
    if (current.x !== target.x || current.y !== target.y) {
      // Resizing may shrink the native scroll extent without sending a scroll event. Keep the virtual ink slices in bounds too.
      offset.current = target;
      commit(zoom, target);
    }
    vertical.current?.scrollTo({ y: target.y, animated: false });
    horizontal.current?.scrollTo({ x: target.x, animated: false });
  });

  // Where the build has a pinch area over the whole document, it reports the pinch and the pages leave it alone.
  return { stage, pinching, area, zoomBy, onAreaLayout: measure, onPagePinch, inkPinch: nativePinchArea() ? undefined : onPagePinch };
}

/**
 * What a pinch scales on screen. The transform is this view's own state, so a finger moving renders this view and not the document in
 * it. Around it, where the build has one, the pinch area that hears two fingers anywhere over the document: margins, gaps, two pages.
 */
export function PinchStage({ stage, onPagePinch, children }: { stage: RefObject<((transform: Transform) => void) | null>; onPagePinch: ReturnType<typeof usePagePinch>["onPagePinch"]; children: ReactNode }) {
  const [transform, setTransform] = useState(IDENTITY);
  useLayoutEffect(() => { stage.current = setTransform; return () => { stage.current = null; }; }, [stage]);
  // At rest there is no transform at all: on the web even an identity transform makes a containing block, which moves the editor's popups.
  // Never flattened away, so the first transform does not create a view and move the pages under the fingers, which cancels the pinch.
  const moved = transform !== IDENTITY;
  const scaled = createElement(View, { collapsable: false, style: moved ? { flex: 1, transformOrigin: "0 0", transform: [{ translateX: transform.x }, { translateY: transform.y }, { scale: transform.scale }] } : { flex: 1 } }, children);
  const Area = nativePinchArea();
  return Area ? createElement(Area, { style: { flex: 1 }, onPinch: (event) => { const { phase, scale, x, y } = event.nativeEvent; onPagePinch(phase, scale, x, y); } }, scaled) : scaled;
}
