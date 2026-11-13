// One page of ink, as every Native renderer sees it: the web's InkModel underneath (sylf-ink/1, unchanged), finished strokes as SVG
// paths from the web's own outline code, and the editing tools a page needs. Renderers draw `strokes()` and send input here; they
// never keep their own copy of a stroke. Coordinates are page units.
import type * as Y from "yjs";
import { ink, inkGeometry, inkOutline, type InkBrush, type InkPaper, type InkSample, type InkStroke } from "@sylf/shared";

/** A small excerpt of the real first-page ink, with a budget for gallery cards. */
export function inkThumbnail(doc: Y.Doc, bounds: Rect, records?: Y.Map<unknown>) {
  const model = new ink.InkModel(doc, () => false, records);
  try {
    const strokes: Pick<RenderStroke, "id" | "d" | "color" | "opacity">[] = [];
    let characters = 0;
    for (const stroke of model.strokes()) {
      if (!intersects(bounds, stroke.bounds)) continue;
      const d = svgPath(stroke);
      if (!d || d.length > 40000) continue;
      strokes.push({ id: stroke.id, d, color: stroke.style.color, opacity: inkOpacityOf(stroke.style) });
      characters += d.length;
      if (strokes.length >= 96 || characters >= 160000) break;
    }
    return { paper: model.paper(), strokes };
  } finally { model.close(); }
}

export type InkTool = "pen" | "highlighter" | "eraser" | "lasso" | "shape";
export type ShapeKind = "line" | "rectangle" | "ellipse";
export interface Rect { x: number; y: number; width: number; height: number }
export interface RenderStroke { id: string; d: string; color: string; opacity: number; bounds: Rect; version: number }
export interface Point { x: number; y: number }

const intersects = (a: Rect, b: Rect) => a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
function inside(point: Point, polygon: readonly Point[]) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}
const distanceToSegment = (p: Point, a: InkSample, b: InkSample) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / length)) : 0;
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
};

/** Samples arrive far apart when the eraser moves fast; fill the gaps so it never skips a stroke lying between two of them. */
function densify(sampled: readonly Point[], radius: number) {
  if (sampled.length < 2) return sampled;
  const step = Math.max(1, radius / 2), path: Point[] = [sampled[0]];
  for (let i = 1; i < sampled.length && path.length < 1024; i++) {
    const a = sampled[i - 1], b = sampled[i], n = Math.min(256, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) path.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return path;
}

export interface InkSceneOptions { records?: Y.Map<unknown>; writable?: () => boolean }

export class InkScene {
  readonly model: InkModelType;
  private readonly cache = new Map<string, RenderStroke>();
  private list: RenderStroke[] = [];
  private seen = "";
  // Strokes the eraser has passed over in the sweep under way: hidden now, removed in one edit when it lifts, so one sweep is one undo.
  private sweep: Set<string> | null = null;
  // Each stroke's centre line, kept while its version holds: the eraser tests it many times in one sweep.
  private readonly geometry = new Map<string, { version: number; pieces: InkSample[][] }>();
  private readonly listeners = new Set<() => void>();
  constructor(doc: Y.Doc, options: InkSceneOptions = {}) {
    this.model = new ink.InkModel(doc, options.writable, options.records);
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    const off = this.model.subscribe(listener);
    return () => { this.listeners.delete(listener); off(); };
  }
  paper(): InkPaper { return this.model.paper(); }
  /** Finished strokes in drawing order. Each keeps its object while its version holds, so a renderer can diff by identity. */
  strokes(): RenderStroke[] {
    const version = `${this.model.sceneVersion()}:${this.sweep?.size ?? -1}`;
    if (version === this.seen) return this.list;
    this.seen = version;
    const live = new Set<string>();
    this.list = this.model.strokes().filter((stroke) => !this.sweep?.has(stroke.id)).map((stroke) => {
      live.add(stroke.id);
      const cached = this.cache.get(stroke.id);
      if (cached && cached.version === stroke.version) return cached;
      const next: RenderStroke = { id: stroke.id, d: svgPath(stroke), color: stroke.style.color, opacity: inkOpacityOf(stroke.style), bounds: stroke.bounds, version: stroke.version };
      this.cache.set(stroke.id, next);
      return next;
    });
    for (const id of [...this.cache.keys()]) if (!live.has(id)) this.cache.delete(id);
    for (const id of [...this.geometry.keys()]) if (!live.has(id) && !this.sweep?.has(id)) this.geometry.delete(id);
    return this.list;
  }
  begin(style: InkBrush) { this.endSweep(); return this.model.begin(style); }
  append(points: InkSample[]) { this.model.append(points); }
  end() { this.model.finish("complete"); }
  cancel() { if (!this.model.cancelUnflushed()) this.model.finish("interrupted"); }
  /** Whole strokes under the eraser path. Inside a sweep they are hidden until `endSweep`; otherwise removed at once. */
  eraseStrokes(sampled: readonly Point[], radius: number) {
    const path = densify(sampled, radius), targets = this.hits(path, radius).filter((id) => !this.sweep?.has(id));
    if (!targets.length) return 0;
    if (this.sweep) { targets.forEach((id) => this.sweep!.add(id)); this.listeners.forEach((listener) => listener()); }
    else this.model.edit({ targets, erase: true });
    return targets.length;
  }
  /** One sweep of either eraser is one undo step, however many batches of samples it arrives in. */
  beginSweep() { this.endSweep(); this.sweep = new Set(); this.model.undo.stopCapturing(); }
  endSweep() {
    const swept = this.sweep;
    if (!swept) return;
    this.sweep = null;
    try { if (swept.size) this.model.edit({ targets: [...swept], erase: true }); } finally {
      this.model.undo.stopCapturing();
      if (swept.size) this.listeners.forEach((listener) => listener());
    }
  }
  /** Only the part of each stroke the eraser touched, cut by the web's own geometry. Inside a sweep the cuts share its undo step. */
  erasePrecisely(sampled: readonly Point[], radius: number) {
    const path = densify(sampled, radius), targets = this.hits(path, radius);
    if (targets.length) this.model.eraseSegments(targets, path.slice(0, 1024).map((p) => ({ x: p.x, y: p.y, radius: Math.max(1, Math.min(100, radius)) })), !!this.sweep);
    return targets.length;
  }
  /** Strokes with most of their points inside the lasso. */
  select(polygon: readonly Point[]) {
    if (polygon.length < 3) return [];
    const box = boundsOf(polygon);
    return this.model.strokes().filter((s) => intersects(s.bounds, box)).filter((s) => {
      const points = s.points.length > 64 ? s.points.filter((_, i) => i % Math.ceil(s.points.length / 64) === 0) : s.points;
      return points.filter((p) => inside({ x: p[0], y: p[1] }, polygon)).length >= points.length / 2;
    }).map((s) => s.id);
  }
  boundsOf(ids: readonly string[]): Rect | null {
    const chosen = this.model.strokes().filter((s) => ids.includes(s.id));
    if (!chosen.length) return null;
    return unionOf(chosen.map((s) => s.bounds));
  }
  move(ids: string[], dx: number, dy: number) {
    const box = this.boundsOf(ids);
    if (box && (dx || dy)) this.model.edit({ targets: ids, transform: { dx, dy, scale: 1, cx: box.x, cy: box.y } });
  }
  scale(ids: string[], factor: number) {
    const box = this.boundsOf(ids);
    if (box && factor !== 1) this.model.edit({ targets: ids, transform: { dx: 0, dy: 0, scale: Math.max(0.1, Math.min(10, factor)), cx: box.x + box.width / 2, cy: box.y + box.height / 2 } });
  }
  recolor(ids: string[], color: string) { if (ids.length) this.model.edit({ targets: ids, color }); }
  remove(ids: string[]) { if (ids.length) this.model.edit({ targets: ids, erase: true }); }
  setPaper(paper: InkPaper) { this.model.setPaper(paper); }
  undo() { this.model.undoEdit(); }
  redo() { this.model.redoEdit(); }
  canUndo() { return this.model.undo.canUndo(); }
  canRedo() { return this.model.undo.canRedo(); }
  close() { this.endSweep(); this.model.close(); }
  private piecesOf(stroke: InkStroke) {
    const kept = this.geometry.get(stroke.id);
    if (kept && kept.version === stroke.version) return kept.pieces;
    const pieces = stroke.segments ?? [inkGeometry.inkGeometry(stroke.points, stroke.style)];
    this.geometry.set(stroke.id, { version: stroke.version, pieces });
    return pieces;
  }
  private hits(path: readonly Point[], radius: number) {
    if (!path.length) return [];
    const box = boundsOf(path), reach = { x: box.x - radius, y: box.y - radius, width: box.width + radius * 2, height: box.height + radius * 2 };
    return this.model.strokes().filter((s) => intersects(s.bounds, reach)).filter((s) => {
      const geometry = this.piecesOf(s);
      return path.some((p) => geometry.some((piece) => piece.length === 1 ? Math.hypot(p.x - piece[0][0], p.y - piece[0][1]) <= radius + s.style.width / 2 : piece.some((point, i) => i > 0 && distanceToSegment(p, piece[i - 1], point) <= radius + s.style.width / 2)));
    }).map((s) => s.id);
  }
}

type InkModelType = InstanceType<typeof ink.InkModel>;
const inkOpacityOf = (style: InkBrush) => inkGeometry.inkOpacity(style);
const svgPath = (stroke: InkStroke) => inkOutline.strokeSvgPath(stroke);
export const boundsOf = (points: readonly Point[]): Rect => {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of points) { x = Math.min(x, p.x); y = Math.min(y, p.y); right = Math.max(right, p.x); bottom = Math.max(bottom, p.y); }
  return { x, y, width: right - x, height: bottom - y };
};
export const unionOf = (rects: readonly Rect[]): Rect => {
  const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y));
  return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y };
};

/**
 * What a shape gesture becomes: a line from its first point to its last, or for a rectangle or ellipse the two corners of everything
 * drawn, so a rough circle becomes a circle of that size and a drag from corner to corner still works. The web reads a shape stroke
 * by its first and last points, so these two samples are all it needs.
 */
export function shapeSamples(points: readonly InkSample[], shape: ShapeKind | undefined): InkSample[] {
  if (points.length < 2) return [...points];
  const first = points[0], last = points[points.length - 1];
  if (!shape || shape === "line") return [first, last];
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of points) { x1 = Math.min(x1, p[0]); y1 = Math.min(y1, p[1]); x2 = Math.max(x2, p[0]); y2 = Math.max(y2, p[1]); }
  return [[x1, y1, 0.5, first[3], 0, 0, 0, 0], [x2, y2, 0.5, last[3], 0, 0, 0, 0]];
}

/** The live stroke's outline while the pen is down, drawn the same way as a finished one (straightened, dashed or dotted as it will
 * be), so pen-up never changes its shape. */
export function liveOutline(points: readonly InkSample[], style: InkBrush) {
  if (!points.length) return "";
  return inkGeometry.inkSegments(points, style).map((segment) => inkOutline.outlineSvg(inkOutline.inkOutline(segment, style, false))).filter(Boolean).join(" ");
}

export type LineStyle = NonNullable<InkBrush["lineStyle"]>;
export interface PenOptions { color: string; width: number; input: InkBrush["input"]; nib?: InkBrush["nib"]; shape?: ShapeKind; pressure?: boolean; lineStyle?: LineStyle; straighten?: boolean }

/**
 * A pen preset as a sylf-ink/1 brush. `input` records what drew it, which changes how pressure is simulated. With `pressure: false`
 * the brush records pressure 0, which makes its thinning 0: every stroke is the brush's full width whatever the pen pressed, live and
 * finished. Line style and straightening are a pen's; a highlighter always straightens and a shape is always one even line.
 */
export function brushFor(tool: "pen" | "highlighter" | "shape", options: PenOptions): InkBrush {
  const highlighter = tool === "highlighter", pen = tool === "pen";
  return {
    tool: highlighter ? "highlighter" : "pen", color: options.color, width: options.width, input: options.input, brush: "perfect-freehand/1.2.3:sylf-1",
    nib: highlighter ? "fineliner" : (options.nib ?? "ballpoint"),
    ...(highlighter ? { opacity: 0.28, straighten: true } : {}),
    ...(tool === "shape" && options.shape ? { shape: options.shape } : {}),
    ...(!highlighter && options.pressure === false ? { pressure: 0 } : {}),
    ...(pen && options.lineStyle && options.lineStyle !== "solid" ? { lineStyle: options.lineStyle } : {}),
    ...(pen && options.straighten ? { straighten: true } : {}),
  };
}
