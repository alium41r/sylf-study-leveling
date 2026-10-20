import * as Y from "yjs";
import { z } from "zod";
import { NotesError } from "./errors";

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
    template: z.enum(["blank", "ruled", "grid", "dotted"]),
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
    color: brush.shape.color.optional(),
    width: brush.shape.width.optional(),
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
  bounds: { x: number; y: number; width: number; height: number };
  version: number;
}
const compare = (a: InkRecord, b: InkRecord) =>
  a.clock - b.clock || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
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
  private readonly listeners = new Set<() => void>();
  private paperOps: z.infer<typeof paperOpSchema>[] = [];
  private clock = 0;
  private samples = 0;
  private version = 0;
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
    private readonly writable: () => boolean = () => true
  ) {
    this.records = doc.getMap("ink");
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
  private observe = (event: Y.YMapEvent<unknown>) => {
    try {
      this.update(event.keysChanged);
    } catch (error) {
      this.error =
        error instanceof Error ? error : new Error("Damaged ink source.");
    }
    for (const listener of this.listeners) listener();
  };
  private update(keys: Set<string>) {
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
      const result = inkRecordSchema.safeParse(this.records.get(key));
      if (!result.success || result.data.id !== key)
        throw new NotesError(
          "CORRUPT",
          "This page contains unsupported or damaged ink. Original bytes were retained; export recovery before repairing."
        );
      const op = result.data;
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
    if (paperChanged)
      this.paperOps = [...this.parsed.values()]
        .filter(
          (op): op is z.infer<typeof paperOpSchema> => op.kind === "paper"
        )
        .sort(compare);
    for (const id of dirty) {
      const chunks = [...(this.parts.get(id)?.values() || [])].sort(
        (a, b) => a.part - b.part
      );
      this.projected.delete(id);
      if (!chunks.length) {
        this.parts.delete(id);
        continue;
      }
      if (
        chunks.some(
          (p, i) =>
            p.part !== i ||
            p.clock !== chunks[0].clock ||
            JSON.stringify(p.style) !== JSON.stringify(chunks[0].style)
        )
      )
        throw new NotesError(
          "CORRUPT",
          "Ink chunk lineage is incomplete. Original source was retained."
        );
      let points = chunks.flatMap((p) => p.points),
        erased = false;
      const style = { ...chunks[0].style };
      for (const edit of this.edits.get(id) || []) {
        if (edit.erase !== undefined) erased = edit.erase;
        if (edit.color) style.color = edit.color;
        if (edit.width) style.width = edit.width;
        if (edit.transform) {
          const t = edit.transform;
          points = points.map(
            (p) =>
              [
                t.cx + (p[0] - t.cx) * t.scale + t.dx,
                t.cy + (p[1] - t.cy) * t.scale + t.dy,
                ...p.slice(2),
              ] as InkSample
          );
          style.width = Math.max(0.5, Math.min(40, style.width * t.scale));
        }
      }
      if (!erased)
        this.projected.set(id, {
          id,
          order: chunks[0].clock,
          style,
          points,
          bounds: strokeBounds(points, style.width),
          version: ++this.version,
        });
    }
  }
  assertHealthy() {
    if (this.error) throw this.error;
  }
  strokes() {
    this.assertHealthy();
    return [...this.projected.values()].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id)
    );
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
      style: brush.parse(style),
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
      this.active.buffer.push(inkSampleSchema.parse(point));
      if (this.active.buffer.length >= INK_LIMITS.chunk) this.flushPart();
    }
    if (this.active && !this.active.timer)
      this.active.timer = setTimeout(() => this.flushPart(), 32);
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
  setPaper(paper: InkPaper) {
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

export function initialInkUpdate() {
  const doc = new Y.Doc();
  try {
    const id = crypto.randomUUID();
    doc
      .getMap("ink")
      .set(id, { kind: "paper", id, clock: 1, paper: { ...DEFAULT_PAPER } });
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}
