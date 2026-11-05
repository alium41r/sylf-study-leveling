import * as Y from "yjs";
import { z } from "zod";
import { NotesError } from "./errors";
import { cutInk, inkGeometry, type EraseCircle } from "./ink-geometry";

export const INK_ADAPTER = "sylf-ink/1";
export const INK_LIMITS = {
  samples: 500000,
  strokes: 10000,
  records: 60000,
  chunk: 64,
} as const;
const coordinate = z.number().finite().min(-100000).max(100000);
/** Page units, pressure, elapsed milliseconds, tilt X/Y, twist, tangential pressure. */
export const inkSampleSchema = z.tuple([
  coordinate,
  coordinate,
  z.number().min(0).max(1),
  z.number().min(0).max(86400000),
  z.number().min(-90).max(90),
  z.number().min(-90).max(90),
  z.number().min(0).max(359),
  z.number().min(-1).max(1),
]);
export type InkSample = z.infer<typeof inkSampleSchema>;
export const paperSchema = z
  .object({
    template: z.enum([
      "blank",
      "ruled",
      "grid",
      "dotted",
      "cornell",
      "music",
      "weekly",
      "daily",
      "journal",
    ]),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    rule: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    spacing: z.number().min(12).max(80),
  })
  .strict();
export type InkPaper = z.infer<typeof paperSchema>;
export const DEFAULT_PAPER: InkPaper = {
  template: "ruled",
  color: "#fffdf7",
  rule: "#d9dfea",
  spacing: 28,
};
const brush = z
  .object({
    tool: z.enum(["pen", "highlighter"]),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    width: z.number().min(0.5).max(40),
    input: z.enum(["pen", "mouse", "touch"]),
    brush: z.literal("perfect-freehand/1.2.3:sylf-1"),
    nib: z
      .enum(["ballpoint", "fountain", "brush", "pencil", "fineliner"])
      .optional(),
    opacity: z.number().min(0.05).max(1).optional(),
    pressure: z.number().min(0).max(1).optional(),
    smoothing: z.number().min(0).max(1).optional(),
    lineStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    shape: z.enum(["line", "rectangle", "ellipse"]).optional(),
    straighten: z.boolean().optional(),
  })
  .strict();
export type InkBrush = z.infer<typeof brush>;
const order = {
  id: z.uuid(),
  clock: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
};
const partSchema = z
  .object({
    ...order,
    kind: z.literal("part"),
    stroke: z.uuid(),
    part: z.number().int().min(0).max(100000),
    style: brush,
    points: z.array(inkSampleSchema).min(1).max(INK_LIMITS.chunk),
    ended: z.enum(["complete", "interrupted"]).optional(),
  })
  .strict();
const editSchema = z
  .object({
    ...order,
    kind: z.literal("edit"),
    targets: z.array(z.uuid()).min(1).max(INK_LIMITS.strokes),
    erase: z.boolean().optional(),
    cut: z
      .array(
        z
          .object({
            x: coordinate,
            y: coordinate,
            radius: z.number().min(1).max(100),
          })
          .strict()
      )
      .min(1)
      .max(1024)
      .optional(),
    color: brush.shape.color.optional(),
    width: brush.shape.width.optional(),
    nib: brush.shape.nib,
    opacity: brush.shape.opacity,
    pressure: brush.shape.pressure,
    smoothing: brush.shape.smoothing,
    lineStyle: brush.shape.lineStyle,
    transform: z
      .object({
        dx: coordinate,
        dy: coordinate,
        scale: z.number().min(0.1).max(10),
        cx: coordinate,
        cy: coordinate,
      })
      .strict()
      .optional(),
  })
  .strict();
const paperOpSchema = z
  .object({ ...order, kind: z.literal("paper"), paper: paperSchema })
  .strict();
const endSchema = z
  .object({
    ...order,
    kind: z.literal("end"),
    stroke: z.uuid(),
    reason: z.enum(["complete", "interrupted"]),
  })
  .strict();
export const inkRecordSchema = z.discriminatedUnion("kind", [
  partSchema,
  editSchema,
  paperOpSchema,
  endSchema,
]);
type InkRecord = z.infer<typeof inkRecordSchema>;
export type InkEdit = Omit<z.infer<typeof editSchema>, "id" | "clock" | "kind">;
export interface InkStroke {
  id: string;
  order: number;
  style: InkBrush;
  points: InkSample[];
  segments?: InkSample[][];
  bounds: { x: number; y: number; width: number; height: number };
  version: number;
}
const compare = (a: InkRecord, b: InkRecord) =>
  a.clock - b.clock || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function parseSample(point: InkSample): InkSample {
  if (
    Array.isArray(point) &&
    point.length === 8 &&
    typeof point[0] === "number" &&
    point[0] >= -100000 &&
    point[0] <= 100000 &&
    typeof point[1] === "number" &&
    point[1] >= -100000 &&
    point[1] <= 100000 &&
    typeof point[2] === "number" &&
    point[2] >= 0 &&
    point[2] <= 1 &&
    typeof point[3] === "number" &&
    point[3] >= 0 &&
    point[3] <= 86400000 &&
    typeof point[4] === "number" &&
    point[4] >= -90 &&
    point[4] <= 90 &&
    typeof point[5] === "number" &&
    point[5] >= -90 &&
    point[5] <= 90 &&
    typeof point[6] === "number" &&
    point[6] >= 0 &&
    point[6] <= 359 &&
    typeof point[7] === "number" &&
    point[7] >= -1 &&
    point[7] <= 1
  ) {
    return [
      point[0],
      point[1],
      point[2],
      point[3],
      point[4],
      point[5],
      point[6],
      point[7],
    ];
  }
  return inkSampleSchema.parse(point);
}
function sameBrush(a: InkBrush, b: InkBrush) {
  return (
    a === b ||
    (a.tool === b.tool &&
      a.color === b.color &&
      a.width === b.width &&
      a.input === b.input &&
      a.brush === b.brush &&
      a.nib === b.nib &&
      a.opacity === b.opacity &&
      a.pressure === b.pressure &&
      a.smoothing === b.smoothing &&
      a.lineStyle === b.lineStyle &&
      a.shape === b.shape &&
      a.straighten === b.straighten)
  );
}
export function strokeBounds(points: readonly InkSample[], width: number) {
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const p of points) {
    x = Math.min(x, p[0]);
    y = Math.min(y, p[1]);
    right = Math.max(right, p[0]);
    bottom = Math.max(bottom, p[1]);
  }
  return {
    x: x - width,
    y: y - width,
    width: right - x + width * 2,
    height: bottom - y + width * 2,
  };
}

/** Sylf-owned vector operations in the ordinary Notes Y.Doc. No secondary storage. */
export class InkModel {
  readonly records: Y.Map<unknown>;
  readonly undo: Y.UndoManager;
  private readonly origin = {};
  private readonly parsed = new Map<string, InkRecord>();
  private readonly parts = new Map<
    string,
    Map<number, z.infer<typeof partSchema>>
  >();
  private readonly edits = new Map<string, z.infer<typeof editSchema>[]>();
  private readonly projected = new Map<string, InkStroke>();
  private sortedStrokes?: InkStroke[];
  private readonly listeners = new Set<() => void>();
  private paperOps: z.infer<typeof paperOpSchema>[] = [];
  private clock = 0;
  private samples = 0;
  private version = 0;
  private lastDirtyStroke?: string;
  private error?: Error;
  private active?: {
    id: string;
    clock: number;
    part: number;
    style: InkBrush;
    buffer: InkSample[];
    timer?: ReturnType<typeof setTimeout>;
  };
  constructor(
    readonly doc: Y.Doc,
    private readonly writable: () => boolean = () => true,
    records?: Y.Map<unknown>
  ) {
    this.records = records || doc.getMap("ink");
    this.undo = new Y.UndoManager(this.records, {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: 86400000,
    });
    if (this.records.size > INK_LIMITS.records)
      throw new NotesError(
        "LIMIT",
        "This page exceeds its operation budget; preserve a native recovery export."
      );
    this.update(new Set(this.records.keys()));
    this.records.observe(this.observe);
  }
  private observe = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
    try {
      this.update(event.keysChanged, transaction.origin === this.origin);
    } catch (error) {
      this.error =
        error instanceof Error ? error : new Error("Damaged ink source.");
    }
    for (const listener of this.listeners) listener();
  };
  private update(keys: Set<string>, trusted = false) {
    if (this.parsed.size > INK_LIMITS.records)
      throw new NotesError(
        "LIMIT",
        "This page exceeds the supported operation budget; preserve a native recovery export."
      );
    const dirty = new Set<string>();
    let editChanged = false,
      paperChanged = false;
    for (const key of keys) {
      const old = this.parsed.get(key);
      if (old?.kind === "part") {
        this.samples -= old.points.length;
        this.parts.get(old.stroke)?.delete(old.part);
        dirty.add(old.stroke);
      } else if (old?.kind === "edit") editChanged = true;
      else if (old?.kind === "paper") paperChanged = true;
      this.parsed.delete(key);
      if (!this.records.has(key)) continue;
      const raw = this.records.get(key);
      let op: InkRecord;
      if (
        trusted &&
        raw &&
        typeof raw === "object" &&
        (raw as { id?: string }).id === key
      ) {
        op = raw as InkRecord;
      } else {
        const result = inkRecordSchema.safeParse(raw);
        if (!result.success || result.data.id !== key)
          throw new NotesError(
            "CORRUPT",
            "This page contains unsupported or damaged ink. Original bytes were retained; export recovery before repairing."
          );
        op = result.data;
      }
      this.parsed.set(key, op);
      this.clock = Math.max(this.clock, op.clock);
      if (op.kind === "part") {
        this.samples += op.points.length;
        let parts = this.parts.get(op.stroke);
        if (!parts) this.parts.set(op.stroke, (parts = new Map()));
        if (parts.has(op.part))
          throw new NotesError(
            "CORRUPT",
            "Ambiguous ink chunks were retained."
          );
        parts.set(op.part, op);
        dirty.add(op.stroke);
      } else if (op.kind === "edit") editChanged = true;
      else if (op.kind === "paper") paperChanged = true;
    }
    if (
      this.parsed.size > INK_LIMITS.records ||
      this.samples > INK_LIMITS.samples ||
      this.parts.size > INK_LIMITS.strokes
    )
      throw new NotesError(
        "LIMIT",
        "This page is full. Start another page; all original ink is retained."
      );
    if (editChanged) {
      this.edits.clear();
      const edits = [...this.parsed.values()]
        .filter((op): op is z.infer<typeof editSchema> => op.kind === "edit")
        .sort(compare);
      for (const op of edits)
        for (const target of op.targets) {
          const list = this.edits.get(target) || [];
          list.push(op);
          this.edits.set(target, list);
          dirty.add(target);
        }
      for (const id of this.parts.keys()) dirty.add(id);
    }
    if (paperChanged) {
      this.paperOps = [...this.parsed.values()]
        .filter(
          (op): op is z.infer<typeof paperOpSchema> => op.kind === "paper"
        )
        .sort(compare);
      ++this.version;
    }
    if (dirty.size) this.sortedStrokes = undefined;
    this.lastDirtyStroke =
      !editChanged && !paperChanged && dirty.size === 1
        ? [...dirty][0]
        : undefined;
    for (const id of dirty) {
      const chunks = [...(this.parts.get(id)?.values() || [])].sort(
        (a, b) => a.part - b.part
      );
      // A stroke leaving the scene changes it too: without this, erasing the last stroke left the version, and every cached view, as they were.
      if (this.projected.delete(id)) ++this.version;
      if (!chunks.length) {
        this.parts.delete(id);
        continue;
      }
      if (
        chunks.some(
          (p, i) =>
            p.part !== i ||
            p.clock !== chunks[0].clock ||
            !sameBrush(p.style, chunks[0].style)
        )
      )
        throw new NotesError(
          "CORRUPT",
          "Ink chunk lineage is incomplete. Original source was retained."
        );
      let points = chunks.flatMap((p) => p.points),
        erased = false;
      let segments: InkSample[][] | undefined;
      const style = { ...chunks[0].style };
      for (const edit of this.edits.get(id) || []) {
        if (edit.erase !== undefined) erased = edit.erase;
        if (edit.color) style.color = edit.color;
        if (edit.width) style.width = edit.width;
        if (edit.nib !== undefined) style.nib = edit.nib;
        if (edit.opacity !== undefined) style.opacity = edit.opacity;
        if (edit.pressure !== undefined) style.pressure = edit.pressure;
        if (edit.smoothing !== undefined) style.smoothing = edit.smoothing;
        if (edit.lineStyle !== undefined) style.lineStyle = edit.lineStyle;
        if (edit.cut)
          segments = (segments || [inkGeometry(points, style)]).flatMap(
            (piece) => cutInk(piece, edit.cut!)
          );
        if (edit.transform) {
          const t = edit.transform;
          const transform = (p: InkSample) =>
            [
              t.cx + (p[0] - t.cx) * t.scale + t.dx,
              t.cy + (p[1] - t.cy) * t.scale + t.dy,
              ...p.slice(2),
            ] as InkSample;
          points = points.map(transform);
          segments = segments?.map((piece) => piece.map(transform));
          style.width = Math.max(0.5, Math.min(40, style.width * t.scale));
        }
      }
      if (!erased && (!segments || segments.length))
        this.projected.set(id, {
          id,
          order: chunks[0].clock,
          style,
          points,
          ...(segments ? { segments } : {}),
          bounds: strokeBounds(
            segments?.flat() || points,
            style.width *
              (style.nib === "pencil" && style.input === "pen" ? 2.8 : 1)
          ),
          version: ++this.version,
        });
    }
  }
  assertHealthy() {
    if (this.error) throw this.error;
  }
  strokes() {
    this.assertHealthy();
    if (!this.sortedStrokes)
      this.sortedStrokes = [...this.projected.values()].sort(
        (a, b) => a.order - b.order || a.id.localeCompare(b.id)
      );
    return [...this.sortedStrokes];
  }
  strokeCount() {
    this.assertHealthy();
    return this.projected.size;
  }
  sceneVersion() {
    this.assertHealthy();
    return this.version;
  }
  onlyDirtyStroke() {
    return this.lastDirtyStroke;
  }
  paper() {
    this.assertHealthy();
    return this.paperOps.at(-1)?.paper || DEFAULT_PAPER;
  }
  sampleCount() {
    return this.samples + (this.active?.buffer.length || 0);
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private assertWritable() {
    this.assertHealthy();
    if (!this.writable())
      throw new NotesError(
        "CONFLICT",
        "Writing is paused. Retry saving or export recovery before continuing."
      );
    if (this.parsed.size >= INK_LIMITS.records - 4)
      throw new NotesError("LIMIT", "This page is full. Start another page.");
  }
  begin(style: InkBrush) {
    this.assertWritable();
    this.finish();
    if (
      this.parts.size >= INK_LIMITS.strokes ||
      this.samples >= INK_LIMITS.samples - INK_LIMITS.chunk
    )
      throw new NotesError("LIMIT", "This page is full. Start another page.");
    this.undo.stopCapturing();
    this.active = {
      id: crypto.randomUUID(),
      clock: ++this.clock,
      part: 0,
      // Optional UI settings must not add unknown undefined keys to legacy
      // strokes: older strict readers must still recognize the original brush.
      style: brush.parse(
        Object.fromEntries(
          Object.entries(style).filter(([, value]) => value !== undefined)
        )
      ),
      buffer: [],
    };
    return this.active.id;
  }
  append(points: InkSample[]) {
    if (!this.active) return;
    for (const point of points) {
      if (
        this.sampleCount() >= INK_LIMITS.samples ||
        this.parsed.size >= INK_LIMITS.records - 3
      ) {
        this.finish("interrupted");
        throw new NotesError(
          "LIMIT",
          "This page is full; the captured stroke was retained. Start another page."
        );
      }
      this.active.buffer.push(parseSample(point));
      if (this.active.buffer.length >= INK_LIMITS.chunk) this.flushPart();
    }
    if (this.active) {
      clearTimeout(this.active.timer);
      if (this.active.buffer.length)
        this.active.timer = setTimeout(() => this.flushPart(), 140);
      else this.active.timer = undefined;
    }
  }
  /** Discard an un-flushed accidental touch tap when multi-touch navigation takes over. */
  cancelUnflushed() {
    if (!this.active || this.active.part > 0) return false;
    clearTimeout(this.active.timer);
    this.active = undefined;
    return true;
  }
  private flushPart(ended?: "complete" | "interrupted") {
    const active = this.active;
    if (!active) return;
    clearTimeout(active.timer);
    active.timer = undefined;
    if (!active.buffer.length) return;
    const id = crypto.randomUUID();
    this.doc.transact(
      () =>
        this.records.set(id, {
          kind: "part",
          id,
          clock: active.clock,
          stroke: active.id,
          part: active.part++,
          style: active.style,
          points: active.buffer.splice(0),
          ...(ended ? { ended } : {}),
        }),
      this.origin
    );
  }
  /** Flush observed samples even during a durability pause; never accept new input then. */
  finish(reason: "complete" | "interrupted" = "complete") {
    if (!this.active) return;
    const active = this.active;
    this.flushPart(reason);
    this.active = undefined;
    if (active.part) {
      const id = crypto.randomUUID();
      this.doc.transact(
        () =>
          this.records.set(id, {
            kind: "end",
            id,
            clock: active.clock,
            stroke: active.id,
            reason,
          }),
        this.origin
      );
    }
    this.undo.stopCapturing();
  }
  edit(edit: InkEdit, captured = false) {
    if (captured) this.assertHealthy();
    else this.assertWritable();
    this.finish();
    const id = crypto.randomUUID();
    const op = editSchema.parse({
      ...edit,
      kind: "edit",
      id,
      clock: ++this.clock,
    });
    this.undo.stopCapturing();
    this.doc.transact(() => this.records.set(id, op), this.origin);
    this.undo.stopCapturing();
  }
  /** Commutative cut geometry stays attached to its original stroke; concurrent erasers cannot duplicate fragments. */
  eraseSegments(targets: string[], circles: EraseCircle[]) {
    this.assertHealthy();
    this.finish();
    if (!circles.length || !targets.length) return;
    for (const target of targets) {
      const stroke = this.projected.get(target);
      if (!stroke) continue;
      const relevant = circles.filter(
        (c) =>
          c.x + c.radius >= stroke.bounds.x &&
          c.x - c.radius <= stroke.bounds.x + stroke.bounds.width &&
          c.y + c.radius >= stroke.bounds.y &&
          c.y - c.radius <= stroke.bounds.y + stroke.bounds.height
      );
      const pieces = (
        stroke.segments || [inkGeometry(stroke.points, stroke.style)]
      ).flatMap((piece) => cutInk(piece, relevant));
      if (
        pieces.reduce((sum, piece) => sum + piece.length, 0) >
        INK_LIMITS.samples
      )
        throw new NotesError(
          "LIMIT",
          "Precision erasing would exceed this page's geometry budget. Use the stroke eraser or start another page."
        );
    }
    this.edit({ targets, cut: circles }, true);
  }
  setPaper(paper: InkPaper) {
    const current = this.paper();
    if (
      current.template === paper.template &&
      current.color === paper.color &&
      current.rule === paper.rule &&
      current.spacing === paper.spacing
    ) {
      return;
    }
    this.assertWritable();
    this.finish();
    const id = crypto.randomUUID();
    const op = paperOpSchema.parse({
      kind: "paper",
      id,
      clock: ++this.clock,
      paper,
    });
    this.undo.stopCapturing();
    this.doc.transact(() => this.records.set(id, op), this.origin);
    this.undo.stopCapturing();
  }
  undoEdit() {
    this.assertWritable();
    this.finish();
    this.undo.undo();
  }
  redoEdit() {
    this.assertWritable();
    this.finish();
    this.undo.redo();
  }
  close() {
    this.finish("interrupted");
    this.records.unobserve(this.observe);
    this.undo.destroy();
    this.listeners.clear();
  }
}

export function initialInkUpdate(paper: InkPaper = DEFAULT_PAPER) {
  const doc = new Y.Doc();
  try {
    const id = crypto.randomUUID();
    doc
      .getMap("ink")
      .set(id, { kind: "paper", id, clock: 1, paper: { ...paper } });
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}
