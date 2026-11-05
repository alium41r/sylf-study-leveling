import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { notesContracts } from "@sylf/shared";
import { createMemoryStorage, createNotesLibrary, InkScene, brushFor, flowOf, kindOf, DEVICE_OWNER, ownerKey, type NotesStorage } from "./index";

const sha256 = async (bytes: Uint8Array) => {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const make = (storage: NotesStorage = createMemoryStorage(), owner = DEVICE_OWNER) => createNotesLibrary(storage, owner, { sha256 });
const sample = (x: number, y: number, t: number): [number, number, number, number, number, number, number, number] => [x, y, 0.5, t, 0, 0, 0, 0];
const PDF = new TextEncoder().encode("%PDF-1.7\n% test bytes\n");

describe("Notes library", () => {
  it("creates each kind as a descriptor the web schema accepts", async () => {
    const library = make();
    await library.ready();
    const ids = [await library.create({ kind: "note", template: "lecture" }), await library.create({ kind: "handwriting", paper: "grid" }), await library.create({ kind: "board" }), await library.importPdf({ bytes: PDF, name: "Paper 1.pdf", pages: [{ width: 595, height: 842, transform: [1, 0, 0, -1, 0, 842], rotation: 0 }], geometry: "pdfjs" })];
    const entries = library.getSnapshot().entries;
    expect(entries.map((e) => e.kind).sort()).toEqual(["board", "note", "note", "pdf"]);
    for (const id of ids) {
      const handle = await library.open(id);
      expect(() => notesContracts.documentSchema.parse(handle.descriptor())).not.toThrow();
      expect(kindOf(handle.descriptor())).toBe(entries.find((e) => e.id === id)!.kind);
      handle.release();
    }
    expect(entries.find((e) => e.kind === "pdf")!.title).toBe("Paper 1");
  });

  it("keeps ink across a restart, in sylf-ink/1", async () => {
    const storage = createMemoryStorage();
    const first = make(storage);
    const id = await first.create({ kind: "handwriting" });
    const handle = await first.open(id);
    const scene = new InkScene(handle.stream(handle.descriptor().pages[0].streamId));
    scene.begin(brushFor("pen", { color: "#222222", width: 2.5, input: "pen" }));
    scene.append([sample(10, 10, 0), sample(40, 30, 8), sample(80, 35, 16)]);
    scene.end();
    expect(scene.strokes()).toHaveLength(1);
    expect(scene.strokes()[0].d.startsWith("M ")).toBe(true);
    await first.close();

    const second = make(storage);
    const reopened = await second.open(id);
    const again = new InkScene(reopened.stream(reopened.descriptor().pages[0].streamId));
    expect(again.strokes()).toHaveLength(1);
    expect(again.strokes()[0].d).toBe(scene.strokes()[0].d);
  });

  it("shares one replica between windows and saves after a pause", async () => {
    const storage = createMemoryStorage();
    const library = make(storage);
    const id = await library.create({ kind: "note" });
    const a = await library.open(id), b = await library.open(id);
    expect(a).toBe(b);
    const stream = a.descriptor().streams[0].streamId;
    a.stream(stream).getXmlFragment("body").insert(0, [new Y.XmlText("hello")]);
    expect(a.saveState()).toBe("saving");
    await wait(320);
    expect(a.saveState()).toBe("saved");
    a.release(); b.release();
    const updates = await storage.readUpdates(id);
    const doc = new Y.Doc();
    for (const u of updates) Y.applyUpdate(doc, u.bytes);
    expect(doc.getXmlFragment("body").toString()).toContain("hello");
  });

  it("erases, selects, moves and undoes strokes", async () => {
    const library = make();
    const id = await library.create({ kind: "board" });
    const handle = await library.open(id);
    const scene = new InkScene(handle.stream(handle.descriptor().pages[0].streamId));
    const pen = brushFor("pen", { color: "#2244aa", width: 3, input: "mouse" });
    for (const y of [100, 300]) { scene.begin(pen); scene.append([sample(100, y, 0), sample(200, y, 10)]); scene.end(); }
    const [top] = scene.strokes();
    expect(scene.select([{ x: 50, y: 50 }, { x: 250, y: 50 }, { x: 250, y: 150 }, { x: 50, y: 150 }])).toEqual([top.id]);
    scene.move([top.id], 0, 500);
    expect(scene.strokes().find((s) => s.id === top.id)!.bounds.y).toBeGreaterThan(500);
    expect(scene.eraseStrokes([{ x: 150, y: 300 }], 6)).toBe(1);
    expect(scene.strokes()).toHaveLength(1);
    scene.undo();
    expect(scene.strokes()).toHaveLength(2);
  });

  it("erases every stroke, the last one too, and across gaps between eraser samples", async () => {
    const library = make();
    const handle = await library.open(await library.create({ kind: "board" }));
    const scene = new InkScene(handle.stream(handle.descriptor().pages[0].streamId));
    const pen = brushFor("pen", { color: "#2244aa", width: 3, input: "pen" });
    for (const y of [100, 200, 300]) { scene.begin(pen); scene.append([sample(100, y, 0), sample(200, y, 10)]); scene.end(); }
    const counts: number[] = [];
    for (const y of [100, 200, 300]) { scene.eraseStrokes([{ x: 150, y }], 6); counts.push(scene.strokes().length); }
    expect(counts).toEqual([2, 1, 0]);
    // A fast sweep: two eraser samples far apart, with three strokes between them.
    for (const y of [100, 140, 180]) { scene.begin(pen); scene.append([sample(100, y, 0), sample(200, y, 10)]); scene.end(); }
    expect(scene.eraseStrokes([{ x: 150, y: 60 }, { x: 150, y: 220 }], 6)).toBe(3);
    expect(scene.strokes()).toHaveLength(0);
    // One sweep, several batches of samples: hidden as it goes, one undo step brings it all back.
    scene.undo();
    expect(scene.strokes()).toHaveLength(3);
    scene.beginSweep();
    for (const y of [100, 140, 180]) scene.eraseStrokes([{ x: 150, y }], 6);
    expect(scene.strokes()).toHaveLength(0);
    expect(scene.model.strokes()).toHaveLength(3);
    scene.endSweep();
    expect(scene.model.strokes()).toHaveLength(0);
    scene.undo();
    expect(scene.strokes()).toHaveLength(3);
  });

  it("keeps an endless note as one page that grows, and switches between endless and pages", async () => {
    const library = make();
    const id = await library.create({ kind: "note", paper: "ruled", flow: "endless" });
    const handle = await library.open(id);
    expect(flowOf(handle.descriptor())).toBe("endless");
    expect(notesContracts.documentSchema.safeParse(handle.descriptor()).success).toBe(true);
    const page = handle.descriptor().pages[0];
    handle.growPage(page.pageId, 4000);
    expect(handle.descriptor().pages[0].height).toBe(4000);
    handle.growPage(page.pageId, 2000);
    expect(handle.descriptor().pages[0].height).toBe(4000);
    handle.growPage(page.pageId, 1e9);
    expect(handle.descriptor().pages[0].height).toBe(60000);
    handle.setFlow("pages");
    expect(flowOf(handle.descriptor())).toBe("pages");
    expect(handle.descriptor().pages).toHaveLength(1);
  });

  it("adds, moves and removes pages", async () => {
    const library = make();
    const handle = await library.open(await library.create({ kind: "handwriting" }));
    const second = handle.addPage(0, "dotted");
    handle.addPage();
    expect(handle.descriptor().pages).toHaveLength(3);
    handle.movePage(second, 2);
    expect(handle.descriptor().pages[2].pageId).toBe(second);
    handle.removePage(second);
    expect(handle.descriptor().pages).toHaveLength(2);
    expect(() => notesContracts.documentSchema.parse(handle.descriptor())).not.toThrow();
  });

  it("trashes before removing, and keeps an asset another document still uses", async () => {
    const storage = createMemoryStorage();
    const library = make(storage);
    const page = { width: 600, height: 800, transform: [1, 0, 0, -1, 0, 800] as [number, number, number, number, number, number], rotation: 0 as const };
    const a = await library.importPdf({ bytes: PDF, name: "a.pdf", pages: [page], geometry: "native" });
    await library.importPdf({ bytes: PDF, name: "b.pdf", pages: [page], geometry: "native" });
    await expect(library.remove(a)).rejects.toThrow();
    await library.trash(a);
    await library.remove(a);
    expect(storage.size().assets).toBe(1);
    expect(await library.asset(await sha256(PDF))).not.toBeNull();
  });

  it("moves device notes into an account library", async () => {
    const storage = createMemoryStorage();
    const device = make(storage);
    await device.create({ kind: "note", title: "Before sign-in" });
    const mine = make(storage, ownerKey(7));
    expect(await mine.adopt(device)).toBe(1);
    expect(mine.getSnapshot().entries[0].title).toBe("Before sign-in");
    expect((await storage.load(DEVICE_OWNER)).documents).toHaveLength(0);
    const handle = await mine.open(mine.getSnapshot().entries[0].id);
    expect(handle.descriptor().libraryId).not.toBe((await storage.load(DEVICE_OWNER)).library!.libraryId);
  });

  it("refuses writes after a failed save and says why", async () => {
    const storage = createMemoryStorage();
    const library = make({ ...storage, putDocument: async () => { throw new Error("Disk full"); } });
    const id = await library.create({ kind: "note" });
    await expect(library.rename(id, "x")).rejects.toThrow("Disk full");
    expect(library.getSnapshot().failure).toBe("Disk full");
    await expect(library.create({ kind: "note" })).rejects.toThrow();
  });

  it("organises notebooks and duplicates documents", async () => {
    const library = make();
    const notebook = await library.createNotebook("Physics");
    const id = await library.create({ kind: "note", notebookId: notebook });
    const copy = await library.duplicate(id);
    expect(library.getSnapshot().entries.find((e) => e.id === copy)!.title).toBe("Untitled note copy");
    await library.deleteNotebook(notebook);
    expect(library.getSnapshot().notebooks).toHaveLength(0);
    expect(library.getSnapshot().entries.every((e) => e.notebookId === null)).toBe(true);
  });

  it("links notes to the document they are about, and tags the studied subject", async () => {
    const library = make();
    const paper = await library.importPdf({ bytes: PDF, name: "Paper.pdf", pages: [{ width: 595, height: 842, transform: [1, 0, 0, -1, 0, 842], rotation: 0 }], geometry: "pdfjs", subjectId: "12" });
    const note = await library.create({ kind: "note", title: "Paper notes", linkedTo: paper, subjectId: "12" });
    const ghost = await library.create({ kind: "note", linkedTo: "not-a-document" });
    const entries = library.getSnapshot().entries;
    expect(entries.find((e) => e.id === note)).toMatchObject({ linkedTo: paper, subjectId: "12" });
    expect(entries.find((e) => e.id === paper)?.subjectId).toBe("12");
    expect(entries.find((e) => e.id === ghost)?.linkedTo).toBeNull();
  });

  it("names a typed note from its first line until it is renamed", async () => {
    const library = make();
    const handle = await library.open(await library.create({ kind: "note" }));
    handle.setText("\nComplex numbers\nThe modulus is |z|.");
    expect(handle.descriptor().title).toBe("Complex numbers");
    handle.rename("Paper 1 revision");
    handle.setText("Something else");
    expect(handle.descriptor().title).toBe("Paper 1 revision");
    await handle.flush();
    expect(library.getSnapshot().entries[0].text).toContain("Something else");
  });

  it("makes one note kind: pages with a text layer and an ink layer, valid for the web reader", async () => {
    const library = make();
    const handle = await library.open(await library.create({ kind: "note", template: "lecture" }));
    const [page] = handle.descriptor().pages;
    const streams = handle.descriptor().streams;
    expect(streams.find((s) => s.streamId === page.extensions.textStreamId)?.adapter).toBe("blocknote/0.56.0");
    expect(streams.find((s) => s.streamId === page.extensions.inkStreamId)?.adapter).toBe("sylf-ink/1");
    handle.addPage(0, "grid");
    expect(handle.descriptor().pages[1].extensions.textStreamId).toBeTruthy();
    expect(() => notesContracts.documentSchema.parse(handle.descriptor())).not.toThrow();
  });

  it("puts PDF pages where the writing ends, replacing the empty pages after it", async () => {
    const library = make();
    const handle = await library.open(await library.create({ kind: "note" }));
    const [first] = handle.descriptor().pages;
    const spare = handle.addPage();
    const asset = await library.storeAsset(PDF, "application/pdf", "Paper.pdf");
    const page = { width: 595, height: 842, transform: [1, 0, 0, -1, 0, 842] as [number, number, number, number, number, number], rotation: 0 as const };
    handle.insertPdfPages(asset, [page, page], 1, [spare]);
    const pages = handle.descriptor().pages;
    expect(pages.map((p) => p.pageId)[0]).toBe(first.pageId);
    expect(pages.slice(1).map((p) => [p.originalAssetId, p.sourcePage, p.width])).toEqual([[asset.hash, 0, 595], [asset.hash, 1, 595]]);
    expect(pages.some((p) => p.pageId === spare)).toBe(false);
    expect(() => notesContracts.documentSchema.parse(handle.descriptor())).not.toThrow();
    // A fresh note takes the PDF's shape: its blank first page is replaced.
    const fresh = await library.open(await library.create({ kind: "note" }));
    fresh.insertPdfPages(asset, [page], 0, [fresh.descriptor().pages[0].pageId]);
    expect(fresh.descriptor().pages.map((p) => p.width)).toEqual([595]);
  });

  it("keeps a picture as a page background, as an asset the web schema accepts", async () => {
    const library = make();
    const handle = await library.open(await library.create({ kind: "note" }));
    const picture = await library.storeAsset(new Uint8Array([137, 80, 78, 71]), "image/png", "photo.png");
    handle.setBackground(handle.descriptor().pages[0].pageId, picture);
    expect(handle.descriptor().pages[0].extensions.backgroundAssetId).toBe(picture.hash);
    expect(() => notesContracts.documentSchema.parse(handle.descriptor())).not.toThrow();
  });

  it("nests folders, refuses a loop, and moves contents up when a folder goes", async () => {
    const library = make();
    const top = await library.createNotebook("Maths");
    const sub = await library.createNotebook("Complex numbers", top);
    const id = await library.create({ kind: "note", notebookId: sub });
    await expect(library.updateNotebook(top, { parentId: sub })).rejects.toThrow();
    await library.updateNotebook(sub, { color: "#c2547a", icon: "🧮" });
    expect(library.getSnapshot().notebooks.find((n) => n.id === sub)).toMatchObject({ parentId: top, icon: "🧮", color: "#c2547a" });
    await library.deleteNotebook(sub);
    expect(library.getSnapshot().entries.find((e) => e.id === id)?.notebookId).toBe(top);
    await library.setCover(id, { color: "#2f9e8f", icon: "📘" });
    expect(library.getSnapshot().entries.find((e) => e.id === id)?.cover).toEqual({ color: "#2f9e8f", icon: "📘" });
  });
});

