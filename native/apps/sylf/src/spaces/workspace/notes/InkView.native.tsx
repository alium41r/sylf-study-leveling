// Ink on tablets: the native writing surface captures every pen sample and draws the live stroke itself; this side turns what it
// sends into sylf-ink/1 through the same scene the web uses, and hands back finished outlines to draw. Without the native view
// (iOS until it is built, an old development build), strokes show read-only and the page says so.
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { nativeInkView, type NativeInkHandle } from "@sylf/native-platform";
import { inkGeometry, inkOutline, type InkSample } from "@sylf/shared";
import { shapeSamples, type Point } from "@sylf/notes";
import { brushOf, eraserRadius, type InkViewProps } from "./ink-types";

const NativeInk = nativeInkView();
const CHUNK = 120;

function samplesOf(flat: number[]): InkSample[] {
  const out: InkSample[] = [];
  for (let i = 0; i + 7 < flat.length; i += 8) out.push([flat[i], flat[i + 1], flat[i + 2], flat[i + 3], flat[i + 4], flat[i + 5], flat[i + 6], flat[i + 7]] as InkSample);
  return out;
}
const pointsOf = (flat: number[], stride: number): Point[] => { const out: Point[] = []; for (let i = 0; i + 1 < flat.length; i += stride) out.push({ x: flat[i], y: flat[i + 1] }); return out; };

export default function InkView(props: InkViewProps) {
  if (!NativeInk) return <ReadOnlyInk {...props} />;
  return <NativeInkSurface {...props} />;
}

function NativeInkSurface(props: InkViewProps) {
  const Native = NativeInk!;
  const ref = useRef<NativeInkHandle>(null);
  const latest = useRef(props);
  latest.current = props;
  const sync = useRef(() => {});
  const completed = useRef(new Set<number>());
  const { scene, tool } = props;
  // The selection box is drawn from the scene, so it follows a move, a resize or an undo while something is selected.
  const [, redraw] = useState(0);
  const selecting = props.selection.length > 0;
  useEffect(() => (selecting ? scene.subscribe(() => redraw((n) => n + 1)) : undefined), [scene, selecting]);

  useEffect(() => () => { if (!props.paperOnly) scene.endSweep(); }, [scene, props.paperOnly]);
  useEffect(() => {
    if (props.paperOnly) return;
    const sent = new Map<string, number>();
    let active = true, running = false, dirty = false, reset = true, frame = 0, tries = 0;
    const send = async () => {
      dirty = true;
      if (running || frame || !active) return;
      running = true;
      try {
        while (dirty && active) {
          dirty = false;
          const handle = ref.current;
          if (!handle) throw new Error("The ink surface is mounting.");
          if (reset) {
            await handle.clearStrokes();
            sent.clear();
            reset = false;
          }
          if (!active) return;
          const drops = [...completed.current];
          const strokes = scene.strokes();
          const live = new Set(strokes.map((stroke) => stroke.id));
          const gone = [...sent.keys()].filter((id) => !live.has(id));
          if (gone.length) await handle.removeStrokes(gone);
          for (const id of gone) sent.delete(id);
          const changed = strokes.filter((stroke) => sent.get(stroke.id) !== stroke.version);
          for (let i = 0; i < changed.length && active; i += CHUNK) {
            const part = changed.slice(i, i + CHUNK);
            await handle.upsertStrokes(JSON.stringify(part.map(({ id, d, color, opacity }) => ({ id, d, color, opacity }))));
            for (const stroke of part) sent.set(stroke.id, stroke.version);
          }
          // Keep the native preview until its final outline has actually reached the canvas.
          for (const id of drops) {
            if (!active) return;
            await handle.dropLive(id);
            completed.current.delete(id);
          }
          tries = 0;
        }
      } catch {
        reset = true;
        if (active && tries++ < 120) frame = requestAnimationFrame(() => { frame = 0; void send(); });
      } finally { running = false; }
    };
    const update = () => { void send(); };
    sync.current = update;
    const unsubscribe = scene.subscribe(update);
    update();
    return () => { active = false; unsubscribe(); cancelAnimationFrame(frame); };
  }, [scene, props.paperOnly]);

  const paper = useMemo(() => {
    if (!props.drawPaper) return null;
    const p = scene.paper();
    const { lines, dots, labels } = inkOutline.paperGeometry(p, props.pageWidth, props.pageHeight);
    return JSON.stringify({ color: p.color, rule: p.rule, width: props.pageWidth, height: props.pageHeight, lines: lines.flat(), dots: dots.flat(), labels });
    // The paper changes with its own record, which is part of the scene version.
  }, [props.drawPaper, props.pageWidth, props.pageHeight, scene, scene.paper()]);

  const box = props.selection.length ? scene.boundsOf(props.selection) : null;
  // The live stroke is drawn from the brush the finished stroke will have: it narrows with pressure only when pressure is on, is
  // dashed, dotted or straightened as it will be, a pencil shades with tilt, and a shape shows as the shape.
  const brush = brushOf(tool, "pen");
  const thinning = inkOutline.inkThinning(brush);

  return (
    <Native ref={ref} style={{ width: props.width, height: props.height }}
      tool={tool.tool} penOnly={tool.penOnly} fingerGestures={!!props.fingersMove} editable={props.editable && !props.paperOnly}
      pinchZoom={!props.fingersMove && !!props.onPagePinch && !props.paperOnly} inkThinning={thinning} inkShape={tool.tool === "shape" ? tool.shape : ""} inkSmoothing={brush.smoothing ?? 0.65} inkBrushCurve={brush.nib === "brush"}
      inkPencil={brush.nib === "pencil"} inkLineStyle={brush.lineStyle ?? "solid"} inkStraighten={!!brush.straighten && !brush.shape}
      inkColor={tool.color} inkWidth={brush.width} inkOpacity={inkGeometry.inkOpacity(brush)} eraserRadius={eraserRadius(tool)} buttonErases={tool.buttonErases}
      camera={[props.camera.x, props.camera.y, props.camera.zoom]} selectionBox={box ? [box.x, box.y, box.width, box.height] : null} paper={paper}
      onPenSeen={() => latest.current.onPenSeen?.()}
      onPan={(e) => latest.current.onPan?.(e.nativeEvent.dx, e.nativeEvent.dy)}
      onPinch={(e) => {
        const { phase, scale, factor, x, y } = e.nativeEvent, p = latest.current;
        if (phase && p.onPagePinch) p.onPagePinch(phase, scale ?? 1, x, y);
        else if (!phase) p.onPinch?.(factor, x, y);
      }}
      onErase={(e) => {
        const p = latest.current, { points, phase } = e.nativeEvent, path = pointsOf(points, 2);
        // A sweep is one undo step. Builds before the phase was sent erase batch by batch.
        if (phase === "start") p.scene.beginSweep();
        try { if (p.tool.eraser === "precise") p.scene.erasePrecisely(path, eraserRadius(p.tool)); else p.scene.eraseStrokes(path, eraserRadius(p.tool)); } catch { /* A full page refuses precise erasing; the stroke eraser still works. */ }
        if (phase === "end") p.scene.endSweep();
      }}
      onStroke={(e) => {
        const p = latest.current, { kind, samples, pointer, live } = e.nativeEvent;
        if (kind === "lasso") { p.onSelection(p.scene.select(pointsOf(samples, 8))); return; }
        if (kind === "move") { p.scene.move(p.selection, samples[2] - samples[0], samples[3] - samples[1]); return; }
        if (p.selection.length) p.onSelection([]);
        const style = brushOf(p.tool, pointer === "pen" ? "pen" : pointer === "mouse" ? "mouse" : "touch");
        try {
          p.scene.begin(style);
          const all = style.shape ? shapeSamples(samplesOf(samples), style.shape) : samplesOf(samples);
          for (let i = 0; i < all.length; i += 256) p.scene.append(all.slice(i, i + 256));
          p.scene.end();
        } catch { p.scene.cancel(); }
        completed.current.add(live);
        sync.current();
      }} />
  );
}

/** Strokes drawn from their outlines, with no input: a page stays readable where there is no native pen surface. */
function ReadOnlyInk(props: InkViewProps) {
  const { scene, camera, width, height, pageWidth, pageHeight, drawPaper } = props;
  const paper = scene.paper();
  return (
    <View style={{ width, height, overflow: "hidden" }} aria-label="Ink, read only on this device">
      <Svg width={width} height={height} viewBox={`${camera.x} ${camera.y} ${width / camera.zoom} ${height / camera.zoom}`}>
        {drawPaper ? <Rect x={0} y={0} width={pageWidth} height={pageHeight} fill={paper.color} /> : null}
        {props.paperOnly ? null : scene.strokes().map((s) => <Path key={`${s.id}:${s.version}`} d={s.d} fill={s.color} fillOpacity={s.opacity} />)}
      </Svg>
    </View>
  );
}
