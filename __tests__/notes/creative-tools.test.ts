// @vitest-environment node
import * as Y from "yjs";
import { describe, it, expect } from "vitest";
import {
  InkModel,
  inkRecordSchema,
  type InkBrush,
  type InkSample,
} from "@/lib/notes/ink";
import {
  inkGeometry,
  inkSegments,
  inkOpacity,
  cutInk,
} from "@/lib/notes/ink-geometry";
import { inkOutline, hitInk, paperGeometry } from "@/lib/notes/ink-renderer";
import {
  paperTemplates,
  defaultPens,
  displayInkColor,
  displayPaper,
  DEFAULT_NOTE_STYLE,
} from "@/lib/notes/note-style";
import { PageBoxes, textFragments } from "@/lib/notes/text-boxes";
import { projectStream } from "@/lib/notes/interchange";
import { newId } from "@/lib/notes/contracts";
const pen: InkBrush = {
  tool: "pen",
  color: "#345bc6",
  width: 3,
  input: "pen",
  brush: "perfect-freehand/1.2.3:sylf-1",
};
const point = (x: number, y = 50): InkSample => [x, y, 0.6, 10, 0, 0, 0, 0];
const page = {
  pageId: newId(),
  streamId: newId(),
  width: 800,
  height: 1100,
  extensions: { textOrigin: { x: 80, y: 90 } },
};
describe("creative ink and paper", () => {
  it("keeps legacy brush bytes and rendering defaults without injecting new fields", () => {
    const doc = new Y.Doc(),
      model = new InkModel(doc);
    model.begin({ ...pen, nib: undefined, opacity: undefined, shape: undefined });
    model.append([point(10), point(300)]);
    model.finish();
    const part = [...model.records.values()].find(
      (r) => inkRecordSchema.parse(r).kind === "part"
    );
    const parsed = inkRecordSchema.parse(part);
    if (parsed.kind !== "part") throw new Error("Expected native stroke");
    expect(parsed.style).toEqual(pen);
    expect(inkOpacity(pen)).toBe(1);
    model.close();
    doc.destroy();
  });
  it("renders distinct pressure responses and all saved favorite settings", () => {
    const points = [
      point(10),
      [60, 80, 0.1, 20, 10, 15, 0, 0] as InkSample,
      point(120),
    ];
    expect(inkOutline(points, { ...pen, nib: "brush" })).not.toEqual(
      inkOutline(points, { ...pen, nib: "fineliner" })
    );
    for (const preset of defaultPens) {
      const doc = new Y.Doc(),
        m = new InkModel(doc);
      const style = {
        tool: preset.tool,
        nib: preset.nib,
        color: preset.color,
        opacity: preset.opacity,
        pressure: preset.pressure,
        smoothing: preset.smoothing,
        lineStyle: preset.lineStyle,
        straighten: preset.straighten,
      };
      m.begin({ ...pen, ...style, width: preset.width });
      m.append(points);
      m.finish();
      expect(m.strokes()[0].style.opacity).toBe(preset.opacity);
      m.close();
      doc.destroy();
    }
  });
  it("shares assisted shapes, dash pressure and geometric hit testing", () => {
    const points = [point(10), point(60, 51), point(120)];
    expect(inkGeometry(points, { ...pen, straighten: true })).toHaveLength(2);
    const segments = inkSegments(points, { ...pen, lineStyle: "dashed" });
    expect(segments.length).toBeGreaterThan(3);
    expect(segments.flat().every((p) => p[2] === 0.6)).toBe(true);
    const doc = new Y.Doc(),
      m = new InkModel(doc);
    m.begin({ ...pen, shape: "rectangle" });
    m.append([point(10), point(110, 150)]);
    m.finish();
    expect(hitInk(m.strokes()[0], 10, 100, 2)).toBe(true);
    expect(hitInk(m.strokes()[0], 60, 100, 2)).toBe(false);
    m.close();
    doc.destroy();
  });
  it("cuts a sparse line precisely, retaining originals and a single undo/redo action", () => {
    const doc = new Y.Doc(),
      m = new InkModel(doc);
    const id = m.begin(pen);
    m.append([point(0), point(200)]);
    m.finish();
    m.eraseSegments([id], [{ x: 100, y: 50, radius: 12 }]);
    expect(m.strokes()).toHaveLength(1);
    expect(m.strokes()[0].segments).toHaveLength(2);
    expect(m.strokes()[0].segments![0].at(-1)![0]).toBeCloseTo(88);
    expect(m.strokes()[0].segments![1][0][0]).toBeCloseTo(112);
    expect(hitInk(m.strokes()[0], 100, 50, 1)).toBe(false);
    m.undoEdit();
    expect(m.strokes()).toHaveLength(1);
    expect(m.strokes()[0].id).toBe(id);
    m.redoEdit();
    expect(m.strokes()[0].segments).toHaveLength(2);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    const n = new InkModel(copy);
    expect(n.strokes().map((s) => s.points)).toEqual(
      m.strokes().map((s) => s.points)
    );
    n.close();
    copy.destroy();
    m.close();
    doc.destroy();
  });
  it("merges concurrent precision erasers without duplicate ink and undoes only the local cut", () => {
    const a = new Y.Doc(),
      ma = new InkModel(a),
      id = ma.begin(pen);
    ma.append([point(0), point(200)]);
    ma.finish();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const mb = new InkModel(b);
    ma.eraseSegments([id], [{ x: 60, y: 50, radius: 10 }]);
    mb.eraseSegments([id], [{ x: 140, y: 50, radius: 10 }]);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(ma.strokes()).toHaveLength(1);
    expect(ma.strokes()[0].segments).toHaveLength(3);
    expect(ma.strokes()[0].segments).toEqual(mb.strokes()[0].segments);
    expect(ma.strokes()[0].points).toEqual([point(0), point(200)]);
    ma.undoEdit();
    expect(ma.strokes()[0].segments).toHaveLength(2);
    expect(hitInk(ma.strokes()[0], 60, 50, 1)).toBe(true);
    expect(hitInk(ma.strokes()[0], 140, 50, 1)).toBe(false);
    ma.close();
    mb.close();
    a.destroy();
    b.destroy();
  });
  it("never bridges two remaining pieces across an erased region", () => {
    const pieces = cutInk(
      [point(0), point(200)],
      [
        { x: 60, y: 50, radius: 10 },
        { x: 140, y: 50, radius: 10 },
      ]
    );
    expect(pieces).toHaveLength(3);
    expect(pieces.map((p) => [p[0][0], p.at(-1)![0]])).toEqual([
      [0, 50],
      [70, 130],
      [150, 200],
    ]);
  });
  it("renders every gallery template with bounded geometry and real dotted patterns", () => {
    for (const t of paperTemplates) {
      const g = paperGeometry(
        {
          ...DEFAULT_NOTE_STYLE.paper,
          template: t.template,
          spacing: t.spacing,
        },
        800,
        1100
      );
      expect(g.lines.length + g.dots.length).toBeLessThan(10000);
      if (t.template === "dotted") {
        expect(g.lines).toHaveLength(0);
        expect(g.dots.length).toBeGreaterThan(100);
      }
      if (t.template === "weekly") expect(g.labels).toHaveLength(8);
    }
  });
  it("adapts dark display without changing native authored colors", () => {
    const original = structuredClone(DEFAULT_NOTE_STYLE.paper);
    expect(displayPaper(original, true).color).not.toBe(original.color);
    expect(displayInkColor("#242830", true)).not.toBe("#242830");
    expect(displayInkColor("#242830", false)).toBe("#242830");
    expect(original).toEqual(DEFAULT_NOTE_STYLE.paper);
  });
});
describe("independent page content in native text streams", () => {
  it("preserves the original body while multiple fragments and geometry roundtrip", () => {
    const doc = new Y.Doc(),
      model = new PageBoxes(doc, page, () => true);
    const body = new Y.XmlText();
    body.insert(0, "Original text");
    doc.getXmlFragment("body").insert(0, [body]);
    const id = model.add(400, 200);
    const text = new Y.XmlText();
    text.insert(0, "Independent caption");
    doc.getXmlFragment(id).insert(0, [text]);
    model.set({
      ...model.boxes().find((b) => b.id === id)!,
      width: 240,
      height: 140,
      x: 420,
    });
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    const next = new PageBoxes(copy, page, () => false);
    expect(next.boxes()).toMatchObject([
      { id: "body", x: 80, y: 90 },
      { id, x: 420, width: 240, height: 140 },
    ]);
    expect(textFragments(copy)).toEqual(["body", id]);
    const projected = projectStream(copy, {
      streamId: newId(),
      epoch: 1,
      codec: "yjs13-update-v1",
      adapter: "blocknote/0.56.0",
      schemaVersion: 1,
    }) as { fragments: { content: { spans: { insert: string }[] }[] }[] };
    expect(projected.fragments[0].content[0].spans[0].insert).toBe(
      "Independent caption"
    );
    expect(doc.getXmlFragment("body").toString()).toBe("Original text");
    model.close();
    next.close();
    doc.destroy();
    copy.destroy();
  });
  it("retains removed text for history, supports arrangement undo and respects durability locks", () => {
    const doc = new Y.Doc(),
      model = new PageBoxes(doc, page, () => true);
    const id = model.add(100, 200);
    const original = model.boxes()[1];
    model.set({ ...original, removed: true });
    expect(textFragments(doc)).not.toContain(id);
    model.undo.undo();
    expect(model.boxes()[1]).toEqual(original);
    const locked = new PageBoxes(doc, page, () => false);
    expect(() => locked.set({ ...original, x: 300 })).toThrow("Retry saving");
    expect(() => model.set({ ...original, x: NaN })).toThrow();
    locked.close();
    model.close();
    doc.destroy();
  });
});
