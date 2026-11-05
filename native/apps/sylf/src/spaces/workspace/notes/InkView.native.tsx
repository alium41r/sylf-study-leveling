// Ink on tablets: the native writing surface captures every pen sample and draws the live stroke itself; this side turns what it
// sends into sylf-ink/1 through the same scene the web uses, and hands back finished outlines to draw. Without the native view
// (iOS until it is built, an old development build), strokes show read-only and the page says so.
import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { nativeInkView, type NativeInkHandle } from "@sylf/native-platform";
import { inkOutline, type InkSample } from "@sylf/shared";
import { brushFor, type Point } from "@sylf/notes";
import { eraserRadius, type InkViewProps } from "./ink-types";

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
  const sent = useRef(new Map<string, number>());
  const { scene, tool } = props;

  // Finished strokes go across in batches, and only those that changed.
  const sync = useRef<() => Promise<void>>(async () => undefined);
  sync.current = async () => {
    const handle = ref.current;
    if (!handle) return;
    const strokes = latest.current.scene.strokes();
    const live = new Set(strokes.map((s) => s.id));
    const gone = [...sent.current.keys()].filter((id) => !live.has(id));
    const changed = strokes.filter((s) => sent.current.get(s.id) !== s.version);
    for (const id of gone) sent.current.delete(id);
    if (gone.length) await handle.removeStrokes(gone);
    for (let i = 0; i < changed.length; i += CHUNK) {
      const part = changed.slice(i, i + CHUNK);
      for (const s of part) sent.current.set(s.id, s.version);
      await handle.upsertStrokes(JSON.stringify(part.map((s) => ({ id: s.id, d: s.d, color: s.color, opacity: s.opacity }))));
    }
  };
  useEffect(() => {
    sent.current.clear();
    void ref.current?.clearStrokes().then(() => sync.current());
    return scene.subscribe(() => void sync.current());
  }, [scene]);

  const paper = useMemo(() => {
    if (!props.drawPaper) return null;
    const p = scene.paper();
    const { lines, dots, labels } = inkOutline.paperGeometry(p, props.pageWidth, props.pageHeight);
    return JSON.stringify({ color: p.color, rule: p.rule, width: props.pageWidth, height: props.pageHeight, lines: lines.flat(), dots: dots.flat(), labels });
    // The paper changes with its own record, which is part of the scene version.
  }, [props.drawPaper, props.pageWidth, props.pageHeight, scene, scene.paper()]);

  const box = props.selection.length ? scene.boundsOf(props.selection) : null;
  const highlighter = tool.tool === "highlighter";
  const brushTool = tool.tool === "highlighter" ? "highlighter" : tool.tool === "shape" ? "shape" : "pen";

  return (
    <Native ref={ref} style={{ width: props.width, height: props.height }}
      tool={tool.tool} penOnly={tool.penOnly} fingerGestures={!!props.fingersMove} editable={props.editable}
      inkColor={tool.color} inkWidth={highlighter ? Math.max(8, tool.width * 4) : tool.width} inkOpacity={highlighter ? 0.28 : 1} eraserRadius={eraserRadius(tool)}
      camera={[props.camera.x, props.camera.y, props.camera.zoom]} selectionBox={box ? [box.x, box.y, box.width, box.height] : null} paper={paper}
      onPenSeen={() => latest.current.onPenSeen?.()}
      onPan={(e) => latest.current.onPan?.(e.nativeEvent.dx, e.nativeEvent.dy)}
      onPinch={(e) => latest.current.onPinch?.(e.nativeEvent.factor, e.nativeEvent.x, e.nativeEvent.y)}
      onErase={(e) => {
        const p = latest.current, path = pointsOf(e.nativeEvent.points, 2);
        try { if (p.tool.eraser === "precise") p.scene.erasePrecisely(path, eraserRadius(p.tool)); else p.scene.eraseStrokes(path, eraserRadius(p.tool)); } catch { /* A full page refuses precise erasing; the stroke eraser still works. */ }
      }}
      onStroke={(e) => {
        const p = latest.current, { kind, samples, pointer, live } = e.nativeEvent;
        if (kind === "lasso") { p.onSelection(p.scene.select(pointsOf(samples, 8))); return; }
        if (kind === "move") { p.scene.move(p.selection, samples[2] - samples[0], samples[3] - samples[1]); return; }
        if (p.selection.length) p.onSelection([]);
        const style = brushFor(brushTool, { color: p.tool.color, width: highlighter ? Math.max(8, p.tool.width * 4) : p.tool.width, input: pointer === "pen" ? "pen" : pointer === "mouse" ? "mouse" : "touch", shape: p.tool.shape });
        try {
          p.scene.begin(style);
          const all = samplesOf(samples);
          for (let i = 0; i < all.length; i += 256) p.scene.append(all.slice(i, i + 256));
          p.scene.end();
        } catch { p.scene.cancel(); }
        void sync.current().then(() => ref.current?.dropLive(live));
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
        {scene.strokes().map((s) => <Path key={`${s.id}:${s.version}`} d={s.d} fill={s.color} fillOpacity={s.opacity} />)}
      </Svg>
    </View>
  );
}
