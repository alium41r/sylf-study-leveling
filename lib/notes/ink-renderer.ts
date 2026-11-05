import { inkOutline, paperGeometry, paperLabelColor } from "./ink-outline";
import { displayInkColor } from "./note-style";
import { inkSegments, inkOpacity, strokePieces } from "./ink-geometry";
import type { InkStroke, InkPaper, InkSample, InkBrush } from "./ink";
export { inkOutline, paperGeometry, paperLabelColor };
export interface InkViewport {
  zoom: number;
  x: number;
  y: number;
}
export interface InkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const intersects = (a: InkRect, b: InkRect) =>
  a.x <= b.x + b.width &&
  a.x + a.width >= b.x &&
  a.y <= b.y + b.height &&
  a.y + a.height >= b.y;
/** Rebuildable page-local grid; very large strokes use a separate bounded bucket. */
export class InkSpatialIndex {
  private readonly cells = new Map<string, Set<string>>();
  private readonly entries = new Map<
    string,
    { version: number; keys: string[] }
  >();
  private readonly large = new Set<string>();
  sync(strokes: readonly InkStroke[]) {
    const ids = new Set(strokes.map((s) => s.id));
    for (const [id, entry] of this.entries)
      if (!ids.has(id)) this.remove(id, entry.keys);
    for (const s of strokes) {
      const old = this.entries.get(s.id);
      if (old?.version === s.version) continue;
      if (old) this.remove(s.id, old.keys);
      const keys = this.keys(s.bounds);
      if (!keys.length) this.large.add(s.id);
      for (const key of keys) {
        const set = this.cells.get(key) || new Set();
        set.add(s.id);
        this.cells.set(key, set);
      }
      this.entries.set(s.id, { version: s.version, keys });
    }
  }
  private keys(r: InkRect) {
    const left = Math.floor(r.x / 128),
      top = Math.floor(r.y / 128),
      right = Math.floor((r.x + r.width) / 128),
      bottom = Math.floor((r.y + r.height) / 128);
    if ((right - left + 1) * (bottom - top + 1) > 128) return [];
    const keys: string[] = [];
    for (let x = left; x <= right; x++)
      for (let y = top; y <= bottom; y++) keys.push(`${x}:${y}`);
    return keys;
  }
  private remove(id: string, keys: string[]) {
    for (const key of keys) {
      const set = this.cells.get(key);
      set?.delete(id);
      if (!set?.size) this.cells.delete(key);
    }
    this.large.delete(id);
    this.entries.delete(id);
  }
  query(rect: InkRect) {
    const keys = this.keys(rect);
    if (!keys.length) return new Set(this.entries.keys());
    const ids = new Set(this.large);
    for (const k of keys) for (const id of this.cells.get(k) || []) ids.add(id);
    return ids;
  }
}
function pathFor(
  points: readonly InkSample[],
  style: InkBrush,
  last = true,
  pieces?: InkSample[][],
  tiltOverride?: number
) {
  const path = new Path2D();
  for (const segment of pieces
    ? pieces.flatMap((piece) =>
        inkSegments(piece, { ...style, shape: undefined, straighten: false })
      )
    : inkSegments(points, style)) {
    const outline = inkOutline(segment, style, last, tiltOverride);
    if (!outline.length) continue;
    path.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) {
      const p = outline[i],
        next = outline[(i + 1) % outline.length];
      path.quadraticCurveTo(
        p[0],
        p[1],
        (p[0] + next[0]) / 2,
        (p[1] + next[1]) / 2
      );
    }
    path.closePath();
  }
  return path;
}
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  paper: InkPaper,
  width: number,
  height: number,
  gallery = false
) {
  ctx.fillStyle = paper.color;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = paper.rule;
  ctx.fillStyle = paper.rule;
  ctx.lineWidth = gallery
    ? Math.max(0.65, 0.5 / Math.abs(ctx.getTransform().a))
    : 0.65;
  const transform = ctx.getTransform();
  const { lines, dots, labels } = paperGeometry(paper, width, height, {
    x: -transform.e / transform.a,
    y: -transform.f / transform.d,
    width: ctx.canvas.width / transform.a,
    height: ctx.canvas.height / transform.d,
  });
  if (!gallery && paper.spacing * Math.abs(ctx.getTransform().a) < 3) return;
  ctx.beginPath();
  for (const [x, y, x2, y2] of lines) {
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.beginPath();
  for (const [x, y] of dots) {
    ctx.moveTo(x + 0.9, y);
    ctx.arc(x, y, 0.9, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = paperLabelColor(paper);
  ctx.font = `500 ${gallery ? 19 : 13}px Arial, sans-serif`;
  for (const [text, x, y] of labels) ctx.fillText(text, x, y);
}
export class InkRenderer {
  readonly index = new InkSpatialIndex();
  private raster?: HTMLCanvasElement;
  private rasterPaper = "";
  private readonly rasterVersions = new Map<string, number>();
  private rasterLast?: InkStroke;
  private readonly cache = new Map<
    string,
    { version: number; path: Path2D; points: number }
  >();
  private cachedPoints = 0;
  private liveDirty?: InkRect;
  private liveCache?: {
    firstX: number;
    firstY: number;
    checkIdx: number;
    checkX: number;
    checkY: number;
    styleKey: string;
    tilt: number;
    prefixEnd: number;
    prefixPath: Path2D;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  };
  private width = 1;
  private height = 1;
  private dpr = 1;
  adaptDark = false;
  viewport: InkViewport = { zoom: 1, x: 0, y: 0 };
  constructor(
    readonly base: HTMLCanvasElement,
    readonly live: HTMLCanvasElement,
    public pageWidth: number,
    public pageHeight: number,
    private readonly transparent = false
  ) {}
  surfaceWidth() {
    return this.width;
  }
  surfaceHeight() {
    return this.height;
  }
  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = Math.min(
      devicePixelRatio || 1,
      2,
      Math.sqrt(4000000 / (this.width * this.height))
    );
    const cssW = `${this.width}px`,
      cssH = `${this.height}px`;
    for (const canvas of [this.base, this.live]) {
      const w = Math.ceil(this.width * this.dpr),
        h = Math.ceil(this.height * this.dpr);
      if (canvas.width !== w || canvas.height !== h) {
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        if (canvas === this.live) this.liveDirty = undefined;
      }
      if (canvas.style.width !== cssW) canvas.style.width = cssW;
      if (canvas.style.height !== cssH) canvas.style.height = cssH;
    }
  }
  fit() {
    const zoom = Math.min(
      1.5,
      Math.max(0.3, (this.width - 32) / this.pageWidth)
    );
    this.viewport = {
      zoom,
      x: (this.width - this.pageWidth * zoom) / 2,
      y: 20,
    };
  }
  pagePoint(x: number, y: number) {
    const v = this.viewport;
    return { x: (x - v.x) / v.zoom, y: (y - v.y) / v.zoom };
  }
  zoom(factor: number, x = this.width / 2, y = this.height / 2) {
    const p = this.pagePoint(x, y),
      zoom = Math.max(
        Math.min(0.6, Math.max(0.3, (this.width - 32) / this.pageWidth)),
        Math.min(4, this.viewport.zoom * factor)
      );
    this.viewport = { zoom, x: x - p.x * zoom, y: y - p.y * zoom };
    this.clamp();
  }
  pan(dx: number, dy: number) {
    this.viewport.x += dx;
    this.viewport.y += dy;
    this.clamp();
  }
  private clamp() {
    const v = this.viewport;
    v.x = Math.max(
      -this.pageWidth * v.zoom + 48,
      Math.min(this.width - 48, v.x)
    );
    v.y = Math.max(
      -this.pageHeight * v.zoom + 48,
      Math.min(this.height - 48, v.y)
    );
  }
  private context(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const v = this.viewport;
    ctx.setTransform(
      this.dpr * v.zoom,
      0,
      0,
      this.dpr * v.zoom,
      this.dpr * v.x,
      this.dpr * v.y
    );
    return ctx;
  }
  private path(s: InkStroke) {
    let item = this.cache.get(s.id);
    if (item?.version !== s.version) {
      if (item) this.cachedPoints -= item.points;
      item = {
        version: s.version,
        path: pathFor(s.points, s.style, true, s.segments),
        points:
          s.segments?.reduce((sum, piece) => sum + piece.length, 0) ||
          s.points.length,
      };
      this.cache.set(s.id, item);
      this.cachedPoints += item.points;
    }
    this.cache.delete(s.id);
    this.cache.set(s.id, item);
    while (this.cache.size > 384 || this.cachedPoints > 100000) {
      const key = this.cache.keys().next().value!;
      const old = this.cache.get(key)!;
      this.cachedPoints -= old.points;
      this.cache.delete(key);
    }
    return item.path;
  }
  draw(
    strokes: readonly InkStroke[],
    paper: InkPaper,
    omit = new Set<string>()
  ) {
    const ctx = this.context(this.base),
      v = this.viewport;
    const scale = Math.min(
      this.width <= 160 && this.height <= 200 ? 0.25 : 2,
      Math.sqrt(4000000 / (this.pageWidth * this.pageHeight))
    );
    this.index.sync(strokes);
    if (v.zoom * this.dpr <= scale * 1.5) {
      const visible = strokes.filter((s) => !omit.has(s.id)),
        byId = new Map(visible.map((s) => [s.id, s]));
      const paperKey = JSON.stringify([paper, this.adaptDark]);
      const additions = visible.filter((s) => !this.rasterVersions.has(s.id));
      const stale =
        !this.raster ||
        this.raster.width !== Math.ceil(this.pageWidth * scale) ||
        this.raster.height !== Math.ceil(this.pageHeight * scale) ||
        this.rasterPaper !== paperKey ||
        [...this.rasterVersions].some(
          ([id, version]) => byId.get(id)?.version !== version
        ) ||
        additions.some(
          (s) =>
            this.rasterLast &&
            (s.order < this.rasterLast.order ||
              (s.order === this.rasterLast.order && s.id < this.rasterLast.id))
        );
      if (
        !this.raster ||
        this.raster.width !== Math.ceil(this.pageWidth * scale) ||
        this.raster.height !== Math.ceil(this.pageHeight * scale)
      ) {
        this.raster = document.createElement("canvas");
        this.raster.width = Math.ceil(this.pageWidth * scale);
        this.raster.height = Math.ceil(this.pageHeight * scale);
      }
      const raster = this.raster.getContext("2d")!;
      raster.setTransform(scale, 0, 0, scale, 0, 0);
      if (stale) {
        raster.globalAlpha = 1;
        raster.clearRect(0, 0, this.pageWidth, this.pageHeight);
        if (!this.transparent)
          drawPaper(raster, paper, this.pageWidth, this.pageHeight);
        this.rasterVersions.clear();
      }
      raster.save();
      raster.beginPath();
      raster.rect(0, 0, this.pageWidth, this.pageHeight);
      raster.clip();
      for (const s of stale ? visible : additions) {
        raster.fillStyle = displayInkColor(s.style.color, this.adaptDark);
        raster.globalAlpha = inkOpacity(s.style);
        raster.fill(this.path(s));
        this.rasterVersions.set(s.id, s.version);
      }
      raster.restore();
      raster.globalAlpha = 1;
      this.rasterPaper = paperKey;
      this.rasterLast = visible.at(-1);
      ctx.drawImage(this.raster, 0, 0, this.pageWidth, this.pageHeight);
      return;
    }
    if (!this.transparent)
      drawPaper(ctx, paper, this.pageWidth, this.pageHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.pageWidth, this.pageHeight);
    ctx.clip();
    const rect = {
        x: -v.x / v.zoom,
        y: -v.y / v.zoom,
        width: this.width / v.zoom,
        height: this.height / v.zoom,
      },
      ids = this.index.query(rect);
    const present = new Set(strokes.map((s) => s.id));
    for (const [id, item] of this.cache)
      if (!present.has(id)) {
        this.cachedPoints -= item.points;
        this.cache.delete(id);
      }
    for (const stroke of strokes)
      if (
        ids.has(stroke.id) &&
        !omit.has(stroke.id) &&
        intersects(rect, stroke.bounds)
      ) {
        ctx.fillStyle = displayInkColor(stroke.style.color, this.adaptDark);
        ctx.globalAlpha = inkOpacity(stroke.style);
        ctx.fill(this.path(stroke));
      }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  private liveStrokePath(
    points: readonly InkSample[],
    predicted: readonly InkSample[] | undefined,
    style: InkBrush
  ): {
    path: Path2D;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  } {
    const canChunk =
      points.length >= 160 &&
      !style.shape &&
      !style.straighten &&
      (!style.lineStyle || style.lineStyle === "solid");
    if (!canChunk) {
      this.liveCache = undefined;
      const all = predicted?.length ? [...points, ...predicted] : points;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of all) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
      }
      return {
        path: pathFor(all, style, false),
        bounds: { minX, minY, maxX, maxY },
      };
    }
    const pencil = style.input === "pen" && style.nib === "pencil";
    let tilt = 0;
    if (pencil) {
      const step = Math.max(1, Math.floor(points.length / 64));
      let sum = 0,
        count = 0;
      for (let i = 0; i < points.length; i += step) {
        sum += Math.min(1, Math.hypot(points[i][4], points[i][5]) / 80);
        count++;
      }
      tilt = Math.round((sum / count) * 50) / 50;
    }
    const styleKey = `${style.tool}:${style.nib || ""}:${style.width}:${style.input}:${style.pressure ?? 1}:${style.smoothing ?? 0.65}:${tilt}`;
    const targetPrefixEnd = Math.floor((points.length - 64) / 64) * 64;
    let cache = this.liveCache;
    if (
      !cache ||
      cache.styleKey !== styleKey ||
      cache.firstX !== points[0][0] ||
      cache.firstY !== points[0][1] ||
      cache.prefixEnd > targetPrefixEnd ||
      points[cache.checkIdx]?.[0] !== cache.checkX ||
      points[cache.checkIdx]?.[1] !== cache.checkY
    ) {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (let i = 0; i < targetPrefixEnd; i++) {
        const p = points[i];
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
      }
      const checkIdx = targetPrefixEnd - 1;
      cache = {
        firstX: points[0][0],
        firstY: points[0][1],
        checkIdx,
        checkX: points[checkIdx][0],
        checkY: points[checkIdx][1],
        styleKey,
        tilt,
        prefixEnd: targetPrefixEnd,
        prefixPath: pathFor(
          points.slice(0, Math.min(points.length, targetPrefixEnd + 8)),
          style,
          false,
          undefined,
          tilt
        ),
        bounds: { minX, minY, maxX, maxY },
      };
      this.liveCache = cache;
    } else if (cache.prefixEnd < targetPrefixEnd) {
      for (let i = cache.prefixEnd; i < targetPrefixEnd; i++) {
        const p = points[i];
        if (p[0] < cache.bounds.minX) cache.bounds.minX = p[0];
        if (p[1] < cache.bounds.minY) cache.bounds.minY = p[1];
        if (p[0] > cache.bounds.maxX) cache.bounds.maxX = p[0];
        if (p[1] > cache.bounds.maxY) cache.bounds.maxY = p[1];
      }
      cache.prefixPath.addPath(
        pathFor(
          points.slice(
            Math.max(0, cache.prefixEnd - 12),
            Math.min(points.length, targetPrefixEnd + 8)
          ),
          style,
          false,
          undefined,
          tilt
        )
      );
      cache.prefixEnd = targetPrefixEnd;
      cache.checkIdx = targetPrefixEnd - 1;
      cache.checkX = points[cache.checkIdx][0];
      cache.checkY = points[cache.checkIdx][1];
    }
    let { minX, minY, maxX, maxY } = cache.bounds;
    for (let i = cache.prefixEnd; i < points.length; i++) {
      const p = points[i];
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    if (predicted)
      for (const p of predicted) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
      }
    const tailSlice = points.slice(Math.max(0, cache.prefixEnd - 12));
    const tail = predicted?.length ? [...tailSlice, ...predicted] : tailSlice;
    const combined = new Path2D(cache.prefixPath);
    combined.addPath(pathFor(tail, style, false, undefined, tilt));
    return { path: combined, bounds: { minX, minY, maxX, maxY } };
  }
  overlay(
    active?: {
      id?: string;
      points: InkSample[];
      predicted?: InkSample[];
      style: InkBrush;
    },
    lasso?: { x: number; y: number }[],
    selection?: InkRect,
    ghost?: { strokes: InkStroke[]; dx: number; dy: number }
  ) {
    const hasActive = !!active?.points.length,
      hasExtra = !!(lasso?.length || selection || ghost);
    if (!hasActive && !hasExtra) {
      this.liveCache = undefined;
      if (this.liveDirty) {
        const ctx = this.live.getContext("2d")!;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(
          this.liveDirty.x,
          this.liveDirty.y,
          this.liveDirty.width,
          this.liveDirty.height
        );
        this.liveDirty = undefined;
      }
      return;
    }
    const ctx = this.live.getContext("2d")!,
      v = this.viewport,
      zoom = v.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.liveDirty) {
      ctx.clearRect(
        this.liveDirty.x,
        this.liveDirty.y,
        this.liveDirty.width,
        this.liveDirty.height
      );
    } else {
      ctx.clearRect(0, 0, this.live.width, this.live.height);
    }
    ctx.setTransform(
      this.dpr * v.zoom,
      0,
      0,
      this.dpr * v.zoom,
      this.dpr * v.x,
      this.dpr * v.y
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.pageWidth, this.pageHeight);
    ctx.clip();
    let nextDirty: InkRect | undefined;
    if (hasActive && active) {
      const { path, bounds } = this.liveStrokePath(
        active.points,
        active.predicted,
        active.style
      );
      ctx.fillStyle = displayInkColor(active.style.color, this.adaptDark);
      ctx.globalAlpha = inkOpacity(active.style);
      ctx.fill(path);
      ctx.globalAlpha = 1;
      if (!hasExtra) {
        const pad = active.style.width * 3.2 + 12;
        const x0 = Math.max(
          0,
          Math.floor(this.dpr * ((bounds.minX - pad) * zoom + v.x))
        );
        const y0 = Math.max(
          0,
          Math.floor(this.dpr * ((bounds.minY - pad) * zoom + v.y))
        );
        const x1 = Math.min(
          this.live.width,
          Math.ceil(this.dpr * ((bounds.maxX + pad) * zoom + v.x))
        );
        const y1 = Math.min(
          this.live.height,
          Math.ceil(this.dpr * ((bounds.maxY + pad) * zoom + v.y))
        );
        if (x1 > x0 && y1 > y0)
          nextDirty = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      }
    } else {
      this.liveCache = undefined;
    }
    if (ghost) {
      ctx.save();
      ctx.translate(ghost.dx, ghost.dy);
      for (const stroke of ghost.strokes) {
        ctx.fillStyle = displayInkColor(stroke.style.color, this.adaptDark);
        ctx.globalAlpha = inkOpacity(stroke.style);
        ctx.fill(this.path(stroke));
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (lasso?.length || selection) {
      ctx.strokeStyle = "#5865dc";
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      if (lasso?.length) {
        ctx.beginPath();
        ctx.moveTo(lasso[0].x, lasso[0].y);
        for (const p of lasso.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      if (selection)
        ctx.strokeRect(
          selection.x,
          selection.y,
          selection.width,
          selection.height
        );
      ctx.setLineDash([]);
    }
    this.liveDirty = hasExtra
      ? { x: 0, y: 0, width: this.live.width, height: this.live.height }
      : nextDirty;
  }
  metrics() {
    return {
      cachedPaths: this.cache.size,
      cachedPoints: this.cachedPoints,
      canvasPixels: this.base.width * this.base.height * 2,
      rasterPixels: (this.raster?.width || 0) * (this.raster?.height || 0),
    };
  }
  close() {
    this.releaseCaches();
    this.base.width = this.live.width = 1;
    this.base.height = this.live.height = 1;
  }
  releaseCaches() {
    this.cache.clear();
    this.cachedPoints = 0;
    this.liveCache = undefined;
    this.liveDirty = undefined;
    if (this.raster) {
      this.raster.width = this.raster.height = 1;
      this.raster = undefined;
    }
    this.rasterVersions.clear();
    this.rasterLast = undefined;
    this.rasterPaper = "";
  }
}

export function distanceToSegment(
  x: number,
  y: number,
  a: readonly number[],
  b: readonly number[]
) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)
      )
    );
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
export function hitInk(
  stroke: InkStroke,
  x: number,
  y: number,
  radius: number
) {
  const r = radius + stroke.style.width;
  if (
    !intersects(stroke.bounds, {
      x: x - r,
      y: y - r,
      width: r * 2,
      height: r * 2,
    })
  )
    return false;
  return strokePieces(stroke).some((points) =>
    points.some(
      (p, i) => distanceToSegment(x, y, p, points[Math.max(0, i - 1)]) <= r
    )
  );
}
export function insidePolygon(
  x: number,
  y: number,
  polygon: readonly { x: number; y: number }[]
) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function lassoInk(
  stroke: InkStroke,
  polygon: readonly { x: number; y: number }[]
) {
  if (polygon.length < 3) return false;
  const xs = polygon.map((p) => p.x),
    ys = polygon.map((p) => p.y),
    x = Math.min(...xs),
    y = Math.min(...ys);
  if (
    !intersects(stroke.bounds, {
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
    })
  )
    return false;
  for (const points of strokePieces(stroke)) {
    if (points.some((p) => insidePolygon(p[0], p[1], polygon))) return true;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1];
      for (let j = 0; j < polygon.length; j++) {
        const c = polygon[j],
          d = polygon[(j + 1) % polygon.length],
          ex = d.x - c.x,
          ey = d.y - c.y,
          den = dx * ey - dy * ex;
        if (!den) continue;
        const t = ((c.x - a[0]) * ey - (c.y - a[1]) * ex) / den,
          u = ((c.x - a[0]) * dy - (c.y - a[1]) * dx) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
      }
    }
  }
  return false;
}
