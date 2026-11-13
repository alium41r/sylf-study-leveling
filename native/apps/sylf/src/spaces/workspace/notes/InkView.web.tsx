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
  const penPointer = useRef<number | null>(null);
  const pagePinch = useRef<{ spread: number; factor: number; center: Point } | null>(null);
  const frame = useRef(0);
  // Where a mouse or a hovering pen is while the eraser is in hand, so its reach shows before it touches anything.
  const hover = useRef<Point | null>(null);
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
    const ring = g?.kind === "erase" ? g.last : !g && latest.current.tool.tool === "eraser" && latest.current.editable ? hover.current : null;
    if (!g && !ring) return;
    transform(ctx);
    const zoom = latest.current.camera.zoom;
    if (ring) {
      ctx.strokeStyle = "rgba(60,60,70,0.7)"; ctx.lineWidth = 1.2 / zoom;
      ctx.beginPath(); ctx.arc(ring.x, ring.y, eraserRadius(latest.current.tool), 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 0.6 / zoom;
      ctx.beginPath(); ctx.arc(ring.x, ring.y, eraserRadius(latest.current.tool) + 1 / zoom, 0, Math.PI * 2); ctx.stroke();
    }
    if (!g) return;
    if (g.kind === "draw" && g.style) {
      ctx.globalAlpha = inkGeometry.inkOpacity(g.style);
      ctx.fillStyle = g.style.color;
      const d = liveOutline(g.style.shape ? shapeSamples(g.points, g.style.shape) : g.points, g.style);
      if (d) ctx.fill(new Path2D(d));
      ctx.globalAlpha = 1;
    } else if (g.kind === "lasso" && g.path.length > 1) {
      ctx.setLineDash([5 / zoom, 4 / zoom]); ctx.strokeStyle = "#4a6cf7"; ctx.lineWidth = 1.4 / zoom; ctx.fillStyle = "rgba(74,108,247,0.06)";
      ctx.beginPath(); g.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
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
  }, [props.width, props.height, props.camera.x, props.camera.y, props.camera.zoom, props.selection, props.drawPaper, props.tool.tool, props.tool.eraserSize, dpr]);
  useEffect(() => () => {
    if (gesture.current?.kind === "draw") props.scene.cancel();
    if (gesture.current?.kind === "erase") props.scene.endSweep();
  }, [props.scene]);
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

  // Read the transform once per event, even when it carries many digitizer samples.
  const pointMapper = () => {
    const rect = live.current!.getBoundingClientRect();
    const { camera, width, height } = latest.current;
    const sx = rect.width ? width / rect.width : 1;
    const sy = rect.height ? height / rect.height : 1;
    return (event: PointerEvent): Point => ({
      x: camera.x + (event.clientX - rect.left) * sx / camera.zoom,
      y: camera.y + (event.clientY - rect.top) * sy / camera.zoom,
    });
  };
  const sample = (event: PointerEvent, p: Point, started: number): Sample => [
    p.x, p.y,
    event.pointerType === "pen" ? Math.max(0, Math.min(1, event.pressure)) : 0.5,
    Math.max(0, Math.min(86400000, event.timeStamp - started)),
    Math.max(-90, Math.min(90, event.tiltX || 0)),
    Math.max(-90, Math.min(90, event.tiltY || 0)),
    Math.max(0, Math.min(359, event.twist || 0)),
    Math.max(-1, Math.min(1, event.tangentialPressure || 0)),
  ];
  const pinchReading = () => {
    const [a, b] = touches.current.values();
    return { spread: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const p = latest.current;
    const native = event.nativeEvent;
    if (native.pointerType === "pen") p.onPenSeen?.();
    if (native.pointerType === "touch") {
      // The first finger down means no other finger is: a lift that never arrived must not leave one counted.
      if (native.isPrimary) { touches.current.clear(); pagePinch.current = null; }
      if (penPointer.current !== null || touches.current.size >= 2) return;
      touches.current.set(native.pointerId, { x: native.clientX, y: native.clientY });
      // Two fingers always move the view. One finger draws only when the page is not pen-only.
      if (touches.current.size > 1 || p.tool.penOnly || !p.editable) {
        if (gesture.current?.kind === "draw") p.scene.cancel();
        if (gesture.current?.kind === "erase") p.scene.endSweep();
        if (p.onPagePinch && touches.current.size === 2) {
          const { spread, center } = pinchReading();
          if (spread > 0) {
            pagePinch.current = { spread, center, factor: 1 };
            p.onPagePinch("start", 1, center.x, center.y);
          }
        }
        gesture.current = { kind: "pan", pointer: native.pointerId, started: native.timeStamp, points: [], path: [] };
        requestLive();
        capture(event.currentTarget, native.pointerId);
        return;
      }
    }
    if (!p.editable || (native.pointerType === "mouse" && native.button !== 0)) return;
    // The same pointer pressing again means its last gesture never heard its lift. End that one, so it cannot go on
    // erasing or drawing under a pointer that is only hovering, or swallow this press.
    if (gesture.current && gesture.current.kind !== "pan" && gesture.current.pointer === native.pointerId) finish(native, true);
    if (gesture.current && gesture.current.kind !== "pan") return;
    capture(event.currentTarget, native.pointerId);
    event.preventDefault();
    if (native.pointerType === "pen") penPointer.current = native.pointerId;
    const point = pointMapper()(native);
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
    const first = sample(native, point, native.timeStamp);
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
      const before = touches.current.get(native.pointerId)!;
      const now = { x: native.clientX, y: native.clientY };
      const two = touches.current.size === 2;
      const previous = two ? pinchReading() : null;
      touches.current.set(native.pointerId, now);
      if (two) {
        const { spread, center } = pinchReading();
        const active = pagePinch.current;
        if (active && p.onPagePinch) {
          active.factor = spread / active.spread;
          active.center = center;
          p.onPagePinch("move", active.factor, center.x, center.y);
        } else if (p.onPinch && previous?.spread) {
          const rect = live.current!.getBoundingClientRect();
          const sx = rect.width ? p.width / rect.width : 1, sy = rect.height ? p.height / rect.height : 1;
          p.onPinch(spread / previous.spread, (center.x - rect.left) * sx, (center.y - rect.top) * sy);
          p.onPan?.((center.x - previous.center.x) * sx, (center.y - previous.center.y) * sy);
        }
        return;
      }
      if (g?.kind === "pan") {
        const rect = live.current!.getBoundingClientRect();
        p.onPan?.((now.x - before.x) * p.width / (rect.width || p.width), (now.y - before.y) * p.height / (rect.height || p.height));
        return;
      }
    }
    if (!g && native.pointerType !== "touch" && p.tool.tool === "eraser" && p.editable) { hover.current = pointMapper()(native); requestLive(); }
    if (!g || g.pointer !== native.pointerId) return;
    // A mouse moving with no button held has let go, whether or not the lift was heard (it can be lost outside the window).
    if (native.pointerType === "mouse" && native.buttons === 0 && g.kind !== "pan") { finish(native, false); return; }
    const coalesced = native.getCoalescedEvents?.();
    const events = coalesced?.length ? coalesced : [native];
    const toPage = pointMapper();
    if (g.kind === "draw") {
      const samples = events.map((e) => sample(e, toPage(e), g.started));
      g.points.push(...samples);
      try { if (!g.style?.shape) p.scene.append(samples); }
      catch { p.scene.cancel(); gesture.current = null; }
    } else {
      const points = events.map(toPage), previous = g.last;
      g.last = points.at(-1);
      if (g.kind === "erase") eraseAlong(previous ? [previous, ...points] : points);
      else if (g.kind === "lasso") g.path.push(...points);
      else if (g.kind === "move") { drawBase(); return; }
    }
    requestLive();
  };
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const native = event.nativeEvent, p = latest.current;
    if (native.pointerId === penPointer.current) penPointer.current = null;
    if (native.pointerType === "touch" && touches.current.delete(native.pointerId) && pagePinch.current) {
      const { factor, center } = pagePinch.current;
      pagePinch.current = null;
      p.onPagePinch?.("end", factor, center.x, center.y);
      gesture.current = null;
      return;
    }
    finish(native, native.type !== "pointerup");
  };
  /** Ends the gesture this pointer began: commits it, or drops it when it was cancelled. */
  const finish = (native: PointerEvent, cancelled: boolean) => {
    const g = gesture.current, p = latest.current;
    if (!g || g.pointer !== native.pointerId) return;
    gesture.current = null;
    if (g.kind === "draw") {
      if (cancelled) p.scene.cancel();
      else {
        try {
          const point = pointMapper()(native), last = g.points.at(-1);
          if (last && (last[0] !== point.x || last[1] !== point.y)) {
            const end = sample(native, point, g.started);
            // A lift often reports zero pressure and reset tilt, even though its position is a real sample.
            if (native.pointerType === "pen" && end[2] === 0) {
              end[2] = last[2]; end[4] = last[4]; end[5] = last[5]; end[6] = last[6]; end[7] = last[7];
            }
            g.points.push(end);
            if (!g.style?.shape) p.scene.append([end]);
          }
          if (g.style?.shape) p.scene.append(shapeSamples(g.points, g.style.shape));
          p.scene.end();
        } catch { p.scene.cancel(); }
      }
    } else if (g.kind === "erase") {
      if (!cancelled && g.last) eraseAlong([g.last, pointMapper()(native)]);
      p.scene.endSweep();
    } else if (!cancelled && g.kind === "lasso") p.onSelection(p.scene.select([...g.path, pointMapper()(native)]));
    else if (!cancelled && g.kind === "move" && g.origin) {
      const end = pointMapper()(native);
      p.scene.move(p.selection, end.x - g.origin.x, end.y - g.origin.y);
    }
    drawBase();
    requestLive();
  };

  const style = { position: "absolute", left: 0, top: 0, width: props.width, height: props.height, touchAction: "none" } as const;
  const cursor = props.tool.tool === "eraser" && props.editable ? "none" : props.tool.tool === "lasso" ? "crosshair" : props.editable ? "crosshair" : "default";
  return (
    <View style={{ width: props.width, height: props.height }} testID={props.paperOnly ? "ink-paper" : "ink-view"}>
      <canvas ref={base} style={style} aria-hidden />
      {props.paperOnly ? null : <canvas ref={live} data-owns-wheel={props.wheel} style={{ ...style, cursor }} aria-label="Writing surface" role="img" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onLostPointerCapture={onPointerUp} onPointerLeave={() => { if (hover.current) { hover.current = null; requestLive(); } }} onContextMenu={(e) => e.preventDefault()} />}
    </View>
  );
}
