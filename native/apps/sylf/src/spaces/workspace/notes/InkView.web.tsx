// Ink on the web and desktop: Pointer Events with coalesced samples (Phase 2 measured the JS gesture path dropping most of them), so
// every sample the digitizer sends reaches sylf-ink/1. Two canvases: finished strokes redraw only when the scene changes, and the live
// stroke, lasso and eraser draw on their own layer every frame. Each canvas is the size of the view, never of the page.
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { inkGeometry, inkOutline, type InkBrush } from "@sylf/shared";
import { liveOutline, shapeSamples, type Point, type RenderStroke } from "@sylf/notes";
import { brushOf, eraserRadius, type InkViewProps } from "./ink-types";

type Sample = [number, number, number, number, number, number, number, number];
/** A pointer that was cancelled before this handler ran cannot be captured; the stroke still works without capture. */
const capture = (element: Element, pointer: number) => { try { element.setPointerCapture(pointer); } catch { /* Not capturable. */ } };

export default function InkView(props: InkViewProps) {
  const base = useRef<HTMLCanvasElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => { if (__DEV__ && live.current) (live.current as unknown as { sylf: unknown }).sylf = { latest, gesture }; });
  const paths = useRef(new Map<string, { version: number; path: Path2D }>());
  const gesture = useRef<{ kind: "draw" | "erase" | "lasso" | "move" | "pan"; pointer: number; started: number; points: Sample[]; path: Point[]; origin?: Point; last?: Point; style?: InkBrush } | null>(null);
  const touches = useRef(new Map<number, Point>());
  const frame = useRef(0);
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);

  const pathFor = (stroke: RenderStroke) => {
    const cached = paths.current.get(stroke.id);
    if (cached && cached.version === stroke.version) return cached.path;
    const path = new Path2D(stroke.d);
    paths.current.set(stroke.id, { version: stroke.version, path });
    return path;
  };
  const transform = (ctx: CanvasRenderingContext2D) => {
    const { camera } = latest.current;
    ctx.setTransform(camera.zoom * dpr, 0, 0, camera.zoom * dpr, -camera.x * camera.zoom * dpr, -camera.y * camera.zoom * dpr);
  };
  const drawBase = () => {
    const canvas = base.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { scene, pageWidth, pageHeight, drawPaper, camera, width, height, selection } = latest.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    transform(ctx);
    const view = { x: camera.x, y: camera.y, width: width / camera.zoom, height: height / camera.zoom };
    if (drawPaper) {
      const paper = scene.paper();
      ctx.fillStyle = paper.color;
      ctx.fillRect(0, 0, pageWidth, pageHeight);
      if (paper.spacing * camera.zoom >= 3) {
        const { lines, dots, labels } = inkOutline.paperGeometry(paper, pageWidth, pageHeight, view);
        ctx.strokeStyle = paper.rule; ctx.fillStyle = paper.rule; ctx.lineWidth = Math.max(0.65, 0.6 / camera.zoom);
        ctx.beginPath();
        for (const [x, y, x2, y2] of lines) { ctx.moveTo(x, y); ctx.lineTo(x2, y2); }
        ctx.stroke();
        ctx.beginPath();
        const r = Math.max(0.9, 1 / camera.zoom);
        for (const [x, y] of dots) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
        ctx.fill();
        ctx.fillStyle = inkOutline.paperLabelColor(paper);
        ctx.font = "500 13px system-ui, sans-serif";
        for (const [text, x, y] of labels) ctx.fillText(text, x, y);
      }
    }
    const drag = gesture.current?.kind === "move" && gesture.current.origin && gesture.current.last ? { dx: gesture.current.last.x - gesture.current.origin.x, dy: gesture.current.last.y - gesture.current.origin.y } : null;
    if (latest.current.paperOnly) return;
    for (const stroke of scene.strokes()) {
      const b = stroke.bounds;
      const moving = drag && selection.includes(stroke.id);
      if (!moving && (b.x > view.x + view.width || b.y > view.y + view.height || b.x + b.width < view.x || b.y + b.height < view.y)) continue;
      ctx.globalAlpha = stroke.opacity;
      ctx.fillStyle = stroke.color;
      if (moving) { ctx.save(); ctx.translate(drag.dx, drag.dy); ctx.fill(pathFor(stroke)); ctx.restore(); } else ctx.fill(pathFor(stroke));
    }
    ctx.globalAlpha = 1;
    const box = selection.length ? scene.boundsOf(selection) : null;
    if (box) {
      ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
      ctx.strokeStyle = "#4a6cf7"; ctx.lineWidth = 1.2 / camera.zoom;
      ctx.strokeRect(box.x - 6 + (drag?.dx ?? 0), box.y - 6 + (drag?.dy ?? 0), box.width + 12, box.height + 12);
      ctx.setLineDash([]);
    }
  };
  const drawLive = () => {
    frame.current = 0;
    const canvas = live.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const g = gesture.current;
    if (!g) return;
    transform(ctx);
    const zoom = latest.current.camera.zoom;
    if (g.kind === "draw" && g.style) {
      ctx.globalAlpha = inkGeometry.inkOpacity(g.style);
      ctx.fillStyle = g.style.color;
      const d = liveOutline(g.style.shape ? shapeSamples(g.points, g.style.shape) : g.points, g.style);
      if (d) ctx.fill(new Path2D(d));
      ctx.globalAlpha = 1;
    } else if (g.kind === "lasso" && g.path.length > 1) {
      ctx.setLineDash([5 / zoom, 4 / zoom]); ctx.strokeStyle = "#4a6cf7"; ctx.lineWidth = 1.4 / zoom; ctx.fillStyle = "rgba(74,108,247,0.06)";
      ctx.beginPath(); g.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    } else if (g.kind === "erase" && g.last) {
      ctx.strokeStyle = "rgba(60,60,70,0.7)"; ctx.lineWidth = 1.2 / zoom;
      ctx.beginPath(); ctx.arc(g.last.x, g.last.y, eraserRadius(latest.current.tool), 0, Math.PI * 2); ctx.stroke();
    }
  };
  const requestLive = () => { if (!frame.current) frame.current = requestAnimationFrame(drawLive); };

  // Size, camera or scene changes redraw finished strokes. A scene change also drops stale cached paths.
  useEffect(() => {
    for (const canvas of [base.current, live.current]) {
      if (!canvas) continue;
      const w = Math.max(1, Math.round(props.width * dpr)), h = Math.max(1, Math.round(props.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    drawBase();
    requestLive();
  }, [props.width, props.height, props.camera.x, props.camera.y, props.camera.zoom, props.selection, props.drawPaper, dpr]);
  useEffect(() => () => props.scene.endSweep(), [props.scene]);
  useEffect(() => props.scene.subscribe(() => {
    const ids = new Set(props.scene.strokes().map((s) => s.id));
    for (const id of [...paths.current.keys()]) if (!ids.has(id)) paths.current.delete(id);
    drawBase();
  }), [props.scene]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);
  // The wheel pans and Control or Command with it zooms, as a trackpad does. React's wheel handlers are passive, so listen directly.
  useEffect(() => {
    const canvas = live.current;
    if (!canvas || !props.wheel) return;
    const onWheel = (event: WheelEvent) => {
      const p = latest.current, zooming = event.ctrlKey || event.metaKey;
      if (!zooming && p.wheel !== "all") return;
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 16 : 1, rect = canvas.getBoundingClientRect();
      if (zooming) p.onPinch?.(Math.exp(-event.deltaY * scale * 0.01), event.clientX - rect.left, event.clientY - rect.top);
      else p.onPan?.(-event.deltaX * scale, -event.deltaY * scale);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [props.wheel]);

  const pagePoint = (event: PointerEvent | React.PointerEvent): Point => {
    const rect = live.current!.getBoundingClientRect();
    const { camera, width } = latest.current;
    // The canvas may be scaled by a zooming Workspace canvas around it: measure, never assume.
    const css = rect.width / width || 1;
    return { x: camera.x + (event.clientX - rect.left) / css / camera.zoom, y: camera.y + (event.clientY - rect.top) / css / camera.zoom };
  };
  const sample = (event: PointerEvent, started: number): Sample => {
    const p = pagePoint(event);
    return [p.x, p.y, event.pointerType === "mouse" ? 0.5 : Math.max(0, Math.min(1, event.pressure || 0.5)), Math.max(0, Math.min(86400000, event.timeStamp - started)), Math.max(-90, Math.min(90, event.tiltX || 0)), Math.max(-90, Math.min(90, event.tiltY || 0)), Math.max(0, Math.min(359, event.twist || 0)), Math.max(-1, Math.min(1, event.tangentialPressure || 0))];
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const p = latest.current;
    const native = event.nativeEvent;
    if (native.pointerType === "pen") p.onPenSeen?.();
    if (native.pointerType === "touch") {
      touches.current.set(native.pointerId, { x: native.clientX, y: native.clientY });
      // Two fingers always move the view. One finger draws only when the page is not pen-only.
      if (touches.current.size > 1 || p.tool.penOnly || !p.editable) {
        if (gesture.current?.kind === "draw") { p.scene.cancel(); }
        gesture.current = { kind: "pan", pointer: native.pointerId, started: native.timeStamp, points: [], path: [] };
        requestLive();
        capture(event.currentTarget, native.pointerId);
        return;
      }
    }
    if (!p.editable || (native.pointerType === "mouse" && native.button !== 0)) return;
    if (gesture.current && gesture.current.kind !== "pan") return;
    capture(event.currentTarget, native.pointerId);
    event.preventDefault();
    const point = pagePoint(native);
    const box = p.selection.length ? p.scene.boundsOf(p.selection) : null;
    if (box && point.x >= box.x - 8 && point.x <= box.x + box.width + 8 && point.y >= box.y - 8 && point.y <= box.y + box.height + 8) {
      gesture.current = { kind: "move", pointer: native.pointerId, started: native.timeStamp, points: [], path: [], origin: point, last: point };
      return;
    }
    if (p.selection.length) p.onSelection([]);
    const tool = native.pointerType === "pen" && native.button === 5 ? "eraser" : p.tool.tool;
    if (tool === "eraser") { gesture.current = { kind: "erase", pointer: native.pointerId, started: native.timeStamp, points: [], path: [point], last: point }; p.scene.beginSweep(); eraseAlong([point]); requestLive(); return; }
    if (tool === "lasso") { gesture.current = { kind: "lasso", pointer: native.pointerId, started: native.timeStamp, points: [], path: [point] }; return; }
    const style = brushOf({ ...p.tool, tool }, native.pointerType === "pen" ? "pen" : native.pointerType === "touch" ? "touch" : "mouse");
    try { p.scene.begin(style); } catch { return; }
    gesture.current = { kind: "draw", pointer: native.pointerId, started: native.timeStamp, points: [], path: [], style };
    const first = sample(native, native.timeStamp);
    gesture.current.points.push(first);
    // A shape is committed once, at the end, from the whole gesture.
    if (!style.shape) p.scene.append([first]);
    requestLive();
  };
  const eraseAlong = (path: Point[]) => {
    const p = latest.current, radius = eraserRadius(p.tool);
    try { if (p.tool.eraser === "precise") p.scene.erasePrecisely(path, radius); else p.scene.eraseStrokes(path, radius); } catch { /* A full page refuses precise erasing; the stroke eraser still works. */ }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const native = event.nativeEvent, g = gesture.current, p = latest.current;
    if (native.pointerType === "touch" && touches.current.has(native.pointerId)) {
      const before = touches.current.get(native.pointerId)!, now = { x: native.clientX, y: native.clientY };
      if (touches.current.size === 2 && p.onPinch) {
        const [a, b] = [...touches.current.values()];
        const other = a === before ? b : a;
        const was = Math.hypot(before.x - other.x, before.y - other.y), is = Math.hypot(now.x - other.x, now.y - other.y);
        const rect = live.current!.getBoundingClientRect();
        if (was > 0) p.onPinch(is / was, (now.x + other.x) / 2 - rect.left, (now.y + other.y) / 2 - rect.top);
        p.onPan?.((now.x - before.x) / 2, (now.y - before.y) / 2);
      } else if (g?.kind === "pan") p.onPan?.(now.x - before.x, now.y - before.y);
      touches.current.set(native.pointerId, now);
      return;
    }
    if (!g || g.pointer !== native.pointerId) return;
    const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [native];
    if (g.kind === "draw") {
      const samples = (events.length ? events : [native]).map((e) => sample(e, g.started));
      g.points.push(...samples);
      try { if (!g.style?.shape) p.scene.append(samples); } catch { gesture.current = null; }
    } else {
      const points = (events.length ? events : [native]).map((e) => pagePoint(e)), previous = g.last;
      g.last = points.at(-1);
      if (g.kind === "erase") { g.path.push(...points); eraseAlong(previous ? [previous, ...points] : points); }
      else if (g.kind === "lasso") g.path.push(...points);
      else if (g.kind === "move") { drawBase(); return; }
    }
    requestLive();
  };
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const native = event.nativeEvent, g = gesture.current, p = latest.current;
    if (native.pointerType === "touch") touches.current.delete(native.pointerId);
    if (!g || g.pointer !== native.pointerId) { if (g?.kind === "pan" && !touches.current.size) gesture.current = null; return; }
    gesture.current = null;
    if (g.kind === "draw") {
      if (native.type === "pointercancel") p.scene.cancel();
      else { try { if (g.style?.shape) p.scene.append(shapeSamples(g.points, g.style.shape)); } catch { /* A full page refuses the shape. */ } p.scene.end(); }
    }
    else if (g.kind === "erase") p.scene.endSweep();
    else if (g.kind === "lasso") p.onSelection(p.scene.select(g.path));
    else if (g.kind === "move" && g.origin && g.last) { p.scene.move(p.selection, g.last.x - g.origin.x, g.last.y - g.origin.y); }
    drawBase();
    requestLive();
  };

  const style = { position: "absolute", left: 0, top: 0, width: props.width, height: props.height, touchAction: "none" } as const;
  const cursor = props.tool.tool === "eraser" ? "cell" : props.tool.tool === "lasso" ? "crosshair" : props.editable ? "crosshair" : "default";
  return (
    <View style={{ width: props.width, height: props.height }} testID={props.paperOnly ? "ink-paper" : "ink-view"}>
      <canvas ref={base} style={style} aria-hidden />
      {props.paperOnly ? null : <canvas ref={live} data-owns-wheel={props.wheel} style={{ ...style, cursor }} aria-label="Writing surface" role="img" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onContextMenu={(e) => e.preventDefault()} />}
    </View>
  );
}
