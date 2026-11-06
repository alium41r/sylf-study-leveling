// Two-finger zoom for paged documents (notes and PDFs), smooth on a tablet. While the fingers move, the pages are only scaled on screen,
// on the UI thread, about the point where the fingers landed and following it as it moves: nothing is laid out again, so nothing
// shakes. When the fingers lift, the document is laid out once at the new zoom and scrolled so the point between the fingers stays put.
// Points arrive in screen coordinates: the page moves under the fingers as it zooms, so measuring against it would feed back.
import { useLayoutEffect, useRef, type ComponentRef, type RefObject } from "react";
import type { ScrollView, View } from "react-native";
import { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

export const MIN_ZOOM = 0.5, MAX_ZOOM = 3;

interface Options {
  zoom: number;
  setZoom(zoom: number): void;
  /** Pixels per page unit at a zoom: the document's own scale rule. */
  scaleAt(zoom: number): number;
  offset: RefObject<{ x: number; y: number }>;
  vertical: RefObject<ComponentRef<typeof ScrollView> | null>;
  horizontal: RefObject<ComponentRef<typeof ScrollView> | null>;
}

export function usePagePinch({ zoom, setZoom, scaleAt, offset, vertical, horizontal }: Options) {
  const scale = useSharedValue(1), tx = useSharedValue(0), ty = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));
  const area = useRef<ComponentRef<typeof View>>(null);
  const origin = useRef({ x: 0, y: 0 });
  const gesture = useRef<{ start: { x: number; y: number }; scale: number; at: { x: number; y: number } } | null>(null);
  const settle = useRef<{ x: number; y: number } | null>(null);

  const measure = () => area.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
  const local = (x: number, y: number) => ({ x: x - origin.current.x, y: y - origin.current.y });

  const onPagePinch = (phase: "start" | "move" | "end", raw: number, sx: number, sy: number) => {
    if (phase === "start") { measure(); gesture.current = { start: { x: sx, y: sy }, scale: 1, at: { x: sx, y: sy } }; return; }
    const g = gesture.current;
    if (!g) return;
    // Both points through the same origin, so a measurement that lands mid-gesture moves nothing.
    const start = local(g.start.x, g.start.y), point = local(sx, sy);
    // The zoom stays within its limits while the fingers move, so letting go never jumps.
    const s = Math.max(MIN_ZOOM / zoom, Math.min(MAX_ZOOM / zoom, raw));
    g.scale = s; g.at = point;
    scale.value = s;
    tx.value = point.x - s * start.x;
    ty.value = point.y - s * start.y;
    if (phase !== "end") return;
    gesture.current = null;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * s));
    const ratio = scaleAt(next) / scaleAt(zoom);
    const at = offset.current;
    // The page point the fingers started over ends up under where they lifted.
    const target = { x: Math.max(0, (at.x + start.x) * ratio - point.x), y: Math.max(0, (at.y + start.y) * ratio - point.y) };
    if (next === zoom) { reset(); return; }
    settle.current = target;
    offset.current = target;
    setZoom(next);
  };
  const reset = () => { scale.value = 1; tx.value = 0; ty.value = 0; };

  // After the one layout at the new zoom, the scroll moves and the on-screen scale goes, in the same frame.
  useLayoutEffect(() => {
    const target = settle.current;
    if (!target) return;
    settle.current = null;
    vertical.current?.scrollTo({ y: target.y, animated: false });
    horizontal.current?.scrollTo({ x: target.x, animated: false });
    reset();
  }, [zoom]);

  return { style, area, onAreaLayout: measure, onPagePinch };
}
