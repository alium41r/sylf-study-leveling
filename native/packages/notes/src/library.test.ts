import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { notesContracts } from "@sylf/shared";
import { createMemoryStorage, createNotesLibrary, InkScene, brushFor, kindOf, DEVICE_OWNER, ownerKey, type NotesStorage } from "./index";

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
    expect(entries.map((e) => e.kind).sort()).toEqual(["board", "handwriting", "note", "pdf"]);
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
});
