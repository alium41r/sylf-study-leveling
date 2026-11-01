// @vitest-environment node
import * as Y from "yjs";
import { describe, it, expect } from "vitest";
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { notebookLayout, notebookWindow } from "@/lib/notes/notebook-layout";
import { snapBox, contentGroups } from "@/lib/notes/content-layout";
import { editPageContent, type ContentPage } from "@/lib/notes/content-edit";
import { PageBoxes } from "@/lib/notes/text-boxes";
import {
  InkModel,
  inkRecordSchema,
  type InkBrush,
  type InkSample,
} from "@/lib/notes/ink";
import { inkOutline, paperGeometry } from "@/lib/notes/ink-renderer";
import {
  notesPreferencesSchema,
  DEFAULT_NOTE_STYLE,
  notebookPrintSize,
} from "@/lib/notes/note-style";
import { PdfSearchText } from "@/lib/notes/pdf-search-text";
const point = (x: number, y = 150): InkSample => [x, y, 0.6, 20, 0, 0, 0, 0];
const pen: InkBrush = {
  tool: "pen",
  width: 3,
  color: "#345bc6",
  input: "pen",
  brush: "perfect-freehand/1.2.3:sylf-1",
};
const makePage = (): ContentPage => ({
  page: {
    pageId: crypto.randomUUID(),
    streamId: crypto.randomUUID(),
    width: 800,
    height: 1100,
    extensions: {},
  },
  text: new Y.Doc(),
  ink: new Y.Doc(),
});
describe("fluid notebook interaction", () => {
  it("retains the visual order of concurrent strokes when their chunk IDs sort differently", () => {
    const a = makePage(),
      b = makePage(),
      pages = new Map([
        [a.page.pageId, a],
        [b.page.pageId, b],
      ]);
    const ids = [
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
      "00000000-0000-4000-8000-000000000001",
    ];
    for (let i = 0; i < 2; i++) {
      const doc = new Y.Doc(),
        model = new InkModel(doc);
      model.begin({ ...pen, color: i ? "#ff0000" : "#0000ff" });
      model.append([point(100), point(200)]);
      model.finish();
      for (const value of model.records.values()) {
        const record = inkRecordSchema.parse(value);
        if (record.kind !== "part" && record.kind !== "end") continue;
        const id =
          record.kind === "part"
            ? i
              ? "ffffffff-ffff-4fff-8fff-fffffffffff1"
              : "00000000-0000-4000-8000-000000000002"
            : crypto.randomUUID();
        a.ink.getMap("ink").set(id, { ...record, id, stroke: ids[i] });
      }
      model.close();
      doc.destroy();
    }
    const before = new InkModel(a.ink);
    expect(before.strokes().map((s) => s.style.color)).toEqual([
      "#ff0000",
      "#0000ff",
    ]);
    editPageContent(
      pages,
      [{ pageId: a.page.pageId, boxes: [], strokes: ids }],
      { type: "copy", targetPageId: b.page.pageId }
    );
    const after = new InkModel(b.ink);
    expect(after.strokes().map((s) => s.style.color)).toEqual(
      before.strokes().map((s) => s.style.color)
    );
    before.close();
    after.close();
  });
  it("prints physical A4/Letter sizes with correct orientation and CSS-to-point custom geometry", () => {
    expect(notebookPrintSize(794, 1123)).toEqual([595.2756, 841.8898]);
    expect(notebookPrintSize(1056, 816)).toEqual([792, 612]);
    expect(notebookPrintSize(800, 1100)).toEqual([600, 825]);
  });
  it("culls long paper geometry to the visible tile without shifting its pattern", () => {
    const paper = {
      ...DEFAULT_NOTE_STYLE.paper,
      template: "dotted" as const,
      spacing: 16,
    };
    const visible = paperGeometry(paper, 800, 100000, {
      x: 0,
      y: 70000,
      width: 800,
      height: 800,
    });
    expect(visible.dots.length).toBeGreaterThan(1000);
    expect(visible.dots.length).toBeLessThan(3000);
    expect(
      visible.dots.every(
        ([x, y]) => x % 16 === 0 && y % 16 === 0 && y >= 69998 && y < 70802
      )
    ).toBe(true);
  });
  it("windows hundreds of heterogeneous and retained pages with exact gaps", () => {
    const pages = Array.from({ length: 500 }, (_, i) => ({
      ...makePage().page,
      height: i % 3 ? 1100 : 2000,
      extensions: { archived: i === 17 },
    }));
    const layout = notebookLayout(pages, 0.75);
    expect(layout.items).toHaveLength(499);
    const index = 330,
      target = layout.items[index];
    const visible = notebookWindow(layout.items, target.top, 900);
    expect(visible.some((p) => p.pageId === target.pageId)).toBe(true);
    expect(visible.length).toBeLessThan(5);
    expect(layout.items[1].top).toBe(layout.items[0].top + 2000 * 0.75 + 24);
    expect(notebookWindow(layout.items, 0, 0)).toHaveLength(0);
  });
  it("snaps to centers and peer edges within a screen-space tolerance", () => {
    const box = {
      id: "body",
      kind: "text" as const,
      x: 297,
      y: 99,
      width: 200,
      height: 100,
    };
    const peer = { ...box, id: "peer", x: 50, y: 100 };
    const snap = snapBox(box, [peer], 800, 6);
    expect(snap.box.x).toBe(300);
    expect(snap.box.y).toBe(100);
    expect(snap.guides).toEqual([
      { axis: "x", value: 400 },
      { axis: "y", value: 100 },
    ]);
    expect(snapBox({ ...box, x: 290, y: 90 }, [], 800, 6).guides).toHaveLength(
      0
    );
  });
  it("moves native text, image geometry, grouped ink and precision cuts without losing original samples", () => {
    const a = makePage(),
      b = makePage(),
      pages = new Map([
        [a.page.pageId, a],
        [b.page.pageId, b],
      ]);
    const root = a.text.getXmlFragment("body"),
      paragraph = new Y.XmlElement("paragraph"),
      text = new Y.XmlText();
    text.insert(0, "Unicode α 東京 😀");
    paragraph.insert(0, [text]);
    root.insert(0, [paragraph]);
    const boxes = new PageBoxes(a.text, a.page, () => true);
    const image = boxes.add(300, 400, {
      assetId: "a".repeat(64),
      width: 200,
      height: 100,
    });
    const model = new InkModel(a.ink);
    const id = model.begin({ ...pen, nib: "fountain", lineStyle: "dashed" });
    model.append(Array.from({ length: 200 }, (_, i) => point(120 + i * 2)));
    model.finish();
    model.eraseSegments([id], [{ x: 300, y: 150, radius: 18 }]);
    model.edit({
      targets: [id],
      transform: { dx: 0, dy: 12, scale: 1, cx: 0, cy: 0 },
    });
    const before = structuredClone(model.strokes()[0]);
    const selection = [
      { pageId: a.page.pageId, boxes: ["body", image], strokes: [id] },
    ];
    editPageContent(pages, selection, { type: "group" });
    expect(contentGroups(a.text)).toHaveLength(1);
    editPageContent(pages, selection, {
      type: "move",
      targetPageId: b.page.pageId,
    });
    const targetBoxes = new PageBoxes(b.text, b.page, () => true),
      targetInk = new InkModel(b.ink);
    expect(a.text.getXmlFragment("body").length).toBe(0);
    const movedText = targetBoxes
      .boxes()
      .find((box) => box.kind === "text" && box.id !== "body")!;
    expect(b.text.getXmlFragment(movedText.id).toString()).toContain(
      "Unicode α 東京 😀"
    );
    expect(
      targetBoxes.boxes().find((box) => box.kind === "image")?.assetId
    ).toBe("a".repeat(64));
    expect(targetInk.strokes()[0].points).toEqual(before.points);
    expect(targetInk.strokes()[0].segments).toEqual(before.segments);
    expect(targetInk.strokes()[0].style).toEqual(before.style);
    expect(model.strokes()).toHaveLength(0);
    expect(model.records.size).toBeGreaterThan(3);
    expect(contentGroups(b.text)).toHaveLength(1);
    targetBoxes.close();
    targetInk.close();
    boxes.close();
    model.close();
    for (const p of pages.values()) {
      p.text.destroy();
      p.ink.destroy();
    }
  });
  it("positions mixed groups together, rejects cropping, and retains originals on copy", () => {
    const a = makePage(),
      b = makePage(),
      pages = new Map([
        [a.page.pageId, a],
        [b.page.pageId, b],
      ]);
    const boxes = new PageBoxes(a.text, a.page, () => true),
      ink = new InkModel(a.ink);
    const boxId = boxes.add(200, 300);
    const arrangementSteps = boxes.undo.undoStack.length;
    boxes.measure(boxId, 2200);
    expect(boxes.undo.undoStack.length).toBe(arrangementSteps);
    const id = ink.begin(pen);
    ink.append([point(200, 500), point(300, 500)]);
    ink.finish();
    const selection = [
      { pageId: a.page.pageId, boxes: [boxId], strokes: [id] },
    ];
    editPageContent(pages, selection, { type: "position", x: 40, y: 50 });
    expect(boxes.boxes().find((b) => b.id === boxId)?.x).toBeCloseTo(43);
    expect(ink.strokes()[0].points[0][1]).toBeCloseTo(250);
    expect(() =>
      editPageContent(pages, selection, { type: "position", x: 790, y: 0 })
    ).toThrow(/page width/);
    editPageContent(pages, selection, {
      type: "copy",
      targetPageId: b.page.pageId,
    });
    expect(b.page.height).toBeGreaterThanOrEqual(2290);
    expect(ink.strokes()).toHaveLength(1);
    expect(boxes.boxes().find((b) => b.id === boxId)).toBeDefined();
    boxes.close();
    ink.close();
  });
  it("tilted pencil geometry broadens while legacy and upright ink remain deterministic", () => {
    const points = [point(20), point(100), point(200)],
      tilted = points.map((p) => [...p.slice(0, 4), 65, 15, 0, 0] as InkSample);
    expect(inkOutline(points, pen)).toEqual(inkOutline(tilted, pen));
    expect(inkOutline(points, { ...pen, nib: "pencil" })).not.toEqual(
      inkOutline(tilted, { ...pen, nib: "pencil" })
    );
    expect(points[0][4]).toBe(0);
  });
  it("adds bounded reusable paper preferences while accepting pre-phase-3 catalogs", () => {
    expect(notesPreferencesSchema.parse({}).templates).toEqual([]);
    const template = {
      id: crypto.randomUUID(),
      name: "Lecture grid",
      style: {
        ...DEFAULT_NOTE_STYLE,
        paper: {
          ...DEFAULT_NOTE_STYLE.paper,
          template: "grid" as const,
          spacing: 16,
        },
      },
    };
    expect(
      notesPreferencesSchema.parse({ templates: [template] }).templates[0]
    ).toEqual(template);
    expect(
      notesPreferencesSchema.safeParse({ templates: Array(25).fill(template) })
        .success
    ).toBe(false);
  });
  it("writes selectable Unicode mappings including surrogate pairs with bounded run placement", async () => {
    const output = await PDFDocument.create(),
      text = new PdfSearchText(output),
      page = output.addPage([800, 1100]);
    text.add(
      page,
      [
        { text: "Hi α 東京 😀", x: 64, top: 56, size: 16, width: 110 },
        { text: "Other tile", x: 64, top: 1200, size: 16, width: 100 },
      ],
      800,
      1100
    );
    text.finish();
    const fontDictionary = page.node
      .Resources()!
      .lookup(PDFName.of("Font"), PDFDict);
    const font = fontDictionary.lookup(fontDictionary.keys()[0], PDFDict);
    const cmap = font.lookup(PDFName.of("ToUnicode")) as PDFRawStream;
    const source = new TextDecoder().decode(decodePDFRawStream(cmap).decode());
    expect(source).toContain("<D83DDE00>");
    expect(source).toContain("<6771>");
    expect(source).not.toContain("<004F>"); // Off-sheet text is never indexed twice.
    const bytes = await output.save();
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
