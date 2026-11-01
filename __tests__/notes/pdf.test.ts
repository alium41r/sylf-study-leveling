// @vitest-environment node
import "fake-indexeddb/auto";
import Dexie from "dexie";
import * as Y from "yjs";
import { readFileSync } from "node:fs";
import { afterEach, describe, it, expect, vi } from "vitest";
import { PDFDocument, PDFArray, PDFName, PDFString, PDFDict } from "pdf-lib";
import {
  PdfMarkup,
  pdfPageMaps,
  initialPdfUpdate,
  PDF_ADAPTER,
  PDF_LIMITS,
  pdfMarkSchema,
  inverseMatrix,
  transformPoint,
  pageRotationMatrix,
  displayedPageSize,
  type PdfSourcePage,
} from "@/lib/notes/pdf";
import { buildAnnotatedPdf } from "@/lib/notes/pdf-export-core";
import { exportAnnotatedPdf } from "@/lib/notes/pdf-export";
import { InkModel } from "@/lib/notes/ink";
import { NotesLibrary } from "@/lib/notes/library";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import { NotesSession } from "@/lib/notes/session";
import { createNotesVault } from "@/lib/notes/vault";
import { newId } from "@/lib/notes/contracts";
import { digest } from "@/lib/notes/bytes";
import {
  exportNotes,
  importNotes,
  exportNotesRecovery,
} from "@/lib/notes/portable";
const fixture = new Uint8Array(
  readFileSync("scripts/qa/notes-pdf/fixtures/lecture.pdf")
);
const pages: PdfSourcePage[] = [
  { width: 600, height: 800, rotation: 0, transform: [1, 0, 0, -1, 0, 800] },
  { width: 960, height: 640, rotation: 90, transform: [0, 2, 2, 0, -120, -80] },
  { width: 800, height: 400, rotation: 0, transform: [1, 0, 0, -1, 0, 400] },
];
const cleanups: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function setup(libraryId = newId()) {
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("navigator", { onLine: true });
  const session = new NotesSession("1", () => "1"),
    name = `pdf-test-${newId()}`,
    key = crypto.getRandomValues(new Uint8Array(32)),
    cipher = await createNotesVault(
      key,
      JSON.stringify(["1", libraryId]),
      session
    );
  let fault = "";
  const repo = new IndexedDbNotesRepository({
    session,
    libraryId,
    bindingGeneration: 1,
    databaseName: name,
    cipher,
    fault: (p) => {
      if (p === fault)
        throw new DOMException("Synthetic quota", "QuotaExceededError");
    },
  });
  await repo.registerLibrary(
    {
      format: "sylf-notes",
      formatVersion: 1,
      minimumReaderVersion: 1,
      libraryId,
      ownerRef: "1",
      bindingGeneration: 1,
      extensions: {},
    },
    {
      provider: "google-drive",
      accountId: "synthetic",
      rootId: "root",
      generation: 1,
      verifiedAt: new Date().toISOString(),
      probeHash: "0".repeat(64),
    }
  );
  cleanups.push(async () => {
    session.close();
    repo.close();
    await Dexie.delete(name);
  });
  const files = new Map<
    string,
    { id: string; hash: string; version: string; bytes: Uint8Array }
  >();
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input, "https://synthetic.test"),
      json = (v: unknown) =>
        new Response(JSON.stringify(v), {
          headers: { "content-type": "application/json" },
        });
    if (url.searchParams.get("action") === "upload") {
      const bytes = new Uint8Array(init.body as ArrayBuffer),
        f = { id: newId(), hash: await digest(bytes), version: "1", bytes };
      files.set(f.id, f);
      return json({ file: { id: f.id, hash: f.hash, version: f.version } });
    }
    const body = JSON.parse(init.body as string);
    if (body.action === "list")
      return json({
        files: [...files.values()].map(({ id, hash, version }) => ({
          id,
          hash,
          version,
        })),
      });
    if (body.action === "read")
      return new Response(files.get(body.fileId)!.bytes.slice().buffer);
    throw new Error("Unexpected fixture request");
  });
  const identity = await repo.library(),
    library = await NotesLibrary.fromRepository(
      { ...identity, label: "synthetic", status: "ACTIVE" },
      repo
    );
  cleanups.push(() => library.close());
  return {
    session,
    repo,
    library,
    setFault: (point: string) => {
      fault = point;
    },
  };
}
function pdfDoc() {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, initialPdfUpdate());
  return doc;
}
const mark = (text = "Remember the sign") => ({
  kind: "comment" as const,
  rects: [{ x: 100, y: 160, width: 220, height: 60 }],
  text,
  color: "#242830",
  size: 16,
});
function ink(model: InkModel) {
  model.begin({
    tool: "pen",
    color: "#345bc6",
    width: 3,
    input: "pen",
    brush: "perfect-freehand/1.2.3:sylf-1",
  });
  model.append([
    [80, 120, 0.2, 0, 10, 5, 25, 0],
    [100, 140, 0.8, 8, 15, 10, 45, 0],
  ]);
  model.finish();
}
describe("PDF coordinates and append-only markup", () => {
  it("never reseeds missing page roots or changes native identity on ordinary open", () => {
    const empty = new Y.Doc(),
      before = Y.encodeStateAsUpdate(empty);
    expect(() => new PdfMarkup(empty)).toThrow("initialization");
    expect(Y.encodeStateAsUpdate(empty)).toEqual(before);
    empty.destroy();
    const doc = pdfDoc(),
      native = Y.encodeStateAsUpdate(doc),
      ink = new InkModel(doc, () => false, pdfPageMaps(doc).ink),
      markup = new PdfMarkup(doc, () => false);
    expect(ink.paper().template).toBe("blank");
    expect(markup.marks()).toHaveLength(0);
    ink.close();
    markup.close();
    expect(Y.encodeStateAsUpdate(doc)).toEqual(native);
    doc.destroy();
  });

  it("roundtrips crop/UserUnit coordinates and every displayed rotation without rewriting source units", () => {
    const source = pages[1].transform,
      p = transformPoint(source, 100, 100);
    expect(p).toEqual({ x: 80, y: 120 });
    expect(transformPoint(inverseMatrix(source), p.x, p.y)).toEqual({
      x: 100,
      y: 100,
    });
    for (const r of [0, 90, 180, 270]) {
      const m = pageRotationMatrix(960, 640, r),
        q = transformPoint(m, p.x, p.y);
      expect(transformPoint(inverseMatrix(m), q.x, q.y)).toEqual(p);
    }
    expect(() => inverseMatrix([0, 0, 0, 0, 0, 0])).toThrow();
  });
  it("merges concurrent notes and preserves peer markup through local undo", () => {
    const a = pdfDoc(),
      b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const ma = new PdfMarkup(a),
      mb = new PdfMarkup(b);
    ma.put(mark("A"));
    mb.put(mark("B"));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(
      ma
        .marks()
        .map((m) => m.text)
        .sort()
    ).toEqual(["A", "B"]);
    ma.undo.undo();
    expect(ma.marks().map((m) => m.text)).toEqual(["B"]);
    ma.close();
    mb.close();
    a.destroy();
    b.destroy();
  });
  it("retains competing revisions of the same annotation and fails closed on malformed records", () => {
    const doc = pdfDoc(),
      m = new PdfMarkup(doc),
      target = m.put(mark());
    m.put({ ...mark("Updated"), target });
    expect(pdfPageMaps(doc).markup.size).toBe(2);
    expect(m.marks()[0].text).toBe("Updated");
    m.remove(m.marks()[0]);
    expect(m.marks()).toHaveLength(0);
    m.undo.undo();
    expect(m.marks()[0].text).toBe("Updated");
    pdfPageMaps(doc).markup.set(newId(), { kind: "unrecognized" });
    expect(() => m.marks()).toThrow("recovery");
    expect(pdfPageMaps(doc).markup.size).toBe(3);
    m.close();
    doc.destroy();
    expect(
      pdfMarkSchema.safeParse({
        ...mark(),
        id: newId(),
        target: newId(),
        clock: 1,
        rects: [],
      }).success
    ).toBe(false);
  });
});
describe("production PDF repository and page lifecycle", () => {
  it("stages immutable source, duplicates independent ink/markup, inserts blank pages and retains removed originals", async () => {
    const { library, repo } = await setup(),
      id = await library.importPdf(fixture, pages, "Lecture.pdf"),
      view = await repo.document(id),
      first = view.descriptor.pages[0],
      source = await library.open(id, first.pageId),
      m = new PdfMarkup(source.stream.doc),
      drawing = new InkModel(
        source.stream.doc,
        () => true,
        pdfPageMaps(source.stream.doc).ink
      );
    expect(view.descriptor.kind).toBe("pdf");
    expect(source.stream.adapterId).toBe(PDF_ADAPTER);
    ink(drawing);
    m.put(mark());
    await source.stream.flush();
    const duplicate = await library.addPage(id, first.pageId, first.pageId),
      blank = await library.addPage(id, undefined, first.pageId);
    const next = await repo.document(id);
    expect(next.descriptor.pages.slice(0, 3).map((p) => p.pageId)).toEqual([
      first.pageId,
      blank,
      duplicate,
    ]);
    const copy = next.descriptor.pages.find((p) => p.pageId === duplicate)!;
    expect(copy.originalAssetId).toBe(first.originalAssetId);
    expect(copy.sourcePage).toBe(0);
    expect(copy.streamId).not.toBe(first.streamId);
    const loaded = await repo.loadStream(id, copy.streamId, 1),
      copied = new PdfMarkup(loaded.doc),
      copiedInk = new InkModel(
        loaded.doc,
        () => true,
        pdfPageMaps(loaded.doc).ink
      );
    expect(copied.marks()[0].text).toBe("Remember the sign");
    expect(copiedInk.strokes()[0].points).toEqual(drawing.strokes()[0].points);
    copied.close();
    copiedInk.close();
    loaded.doc.destroy();
    await library.archivePage(id, duplicate, true);
    expect(
      (await repo.document(id)).descriptor.pages.find(
        (p) => p.pageId === duplicate
      )!.extensions.archived
    ).toBe(true);
    await expect(library.open(id, duplicate)).rejects.toThrow("Restore");
    await library.archivePage(id, duplicate, false);
    await library.movePage(id, duplicate, -1);
    expect((await repo.document(id)).descriptor.pages[1].pageId).toBe(
      duplicate
    );
    expect(await repo.readContent(next.descriptor.assets[0].content)).toEqual(
      fixture
    );
    m.close();
    drawing.close();
    source.release();
  });
  it("combines sources without changing content hashes or duplicating an identical original", async () => {
    const { library, repo } = await setup(),
      id = await library.importPdf(fixture, pages, "Lecture.pdf"),
      first = (await repo.document(id)).descriptor.pages[0];
    await library.importPdf(
      fixture,
      pages,
      "Lecture again.pdf",
      null,
      id,
      first.pageId
    );
    const d = (await repo.document(id)).descriptor;
    expect(d.pages).toHaveLength(6);
    expect(d.assets).toHaveLength(1);
    expect(new Set(d.pages.map((p) => p.pageId)).size).toBe(6);
    expect(new Set(d.streams.map((s) => s.streamId)).size).toBe(6);
    expect(d.assets[0].assetId).toBe(await digest(fixture));
  });
  it("portable export/import preserves source, coordinate frames, native identities, bookmarks and full history", async () => {
    const a = await setup(),
      id = await a.library.importPdf(fixture, pages, "Portable.pdf"),
      first = (await a.repo.document(id)).descriptor.pages[1],
      source = await a.library.open(id, first.pageId),
      marks = new PdfMarkup(source.stream.doc),
      drawing = new InkModel(
        source.stream.doc,
        () => true,
        pdfPageMaps(source.stream.doc).ink
      );
    ink(drawing);
    marks.put(mark("漢字 and Unicode are native source"));
    await source.stream.flush();
    await a.library.mutate(id, (d) => {
      d.pages[1].extensions.bookmarked = true;
      d.pages[1].extensions.pdfRotation = 270;
    });
    const prior = await a.repo.document(id),
      archive = await exportNotes(a.repo, [id]),
      b = await setup(a.repo.libraryId);
    await importNotes(b.repo, archive.bytes);
    const restored = await b.repo.document(id);
    expect(restored.heads).toEqual(prior.heads);
    expect(restored.descriptor).toEqual(prior.descriptor);
    expect(
      await b.repo.readContent(restored.descriptor.assets[0].content)
    ).toEqual(fixture);
    const loaded = await b.repo.loadStream(id, first.streamId, 1),
      rm = new PdfMarkup(loaded.doc),
      ri = new InkModel(loaded.doc, () => true, pdfPageMaps(loaded.doc).ink);
    expect(rm.marks()[0].text).toContain("漢字");
    expect(ri.strokes()[0].points).toEqual(drawing.strokes()[0].points);
    expect((await b.repo.listRevisions(id)).map((r) => r.id).sort()).toEqual(
      (await a.repo.listRevisions(id)).map((r) => r.id).sort()
    );
    rm.close();
    ri.close();
    loaded.doc.destroy();
    marks.close();
    drawing.close();
    source.release();
  });
  it("retains a staged original when document activation fails and never acknowledges quota-failed annotation writes", async () => {
    const ctx = await setup();
    ctx.setFault("after-journal");
    await expect(
      ctx.library.importPdf(fixture, pages, "Interrupted.pdf")
    ).rejects.toThrow();
    const staged = await ctx.repo.pendingAssets(),
      originalHash = await digest(fixture);
    expect(staged.some((a) => a.assetId === originalHash)).toBe(true);
    expect(await ctx.repo.readContent(staged[0].content)).toEqual(fixture);
    ctx.setFault("");
    const id = await ctx.library.importPdf(fixture, pages, "Recovered.pdf"),
      page = (await ctx.repo.document(id)).descriptor.pages[0],
      source = await ctx.library.open(id, page.pageId),
      m = new PdfMarkup(source.stream.doc);
    ctx.setFault("after-journal");
    m.put(mark("Unacknowledged"));
    await expect(source.stream.flush()).rejects.toThrow();
    expect(source.stream.status().state).toBe("failed");
    expect(source.stream.unsavedUpdates().length).toBeGreaterThan(0);
    const recovery = await exportNotesRecovery(
      ctx.repo,
      ctx.library.recoverySnapshots()
    );
    expect(recovery.length).toBeGreaterThan(fixture.length);
    ctx.setFault("");
    await source.stream.retry();
    expect(source.stream.status().pending).toBe(0);
    m.close();
    source.release();
  });
  it("exports reordered/rotated pages and vector ink without mutating source bytes", async () => {
    const ctx = await setup(),
      id = await ctx.library.importPdf(fixture, pages, "Export.pdf");
    await ctx.library.mutate(id, (d) => {
      d.pages[1].extensions.pdfRotation = 90;
      [d.pages[0], d.pages[1]] = [d.pages[1], d.pages[0]];
    });
    const d = (await ctx.repo.document(id)).descriptor,
      doc = new Y.Doc(),
      model = new InkModel(doc);
    ink(model);
    const bytes = await buildAnnotatedPdf({
      title: "Study copy",
      assets: [{ id: d.assets[0].assetId, bytes: fixture.slice() }],
      pages: d.pages.map((page) => ({
        page,
        strokes: model.strokes(),
        paper: model.paper(),
        marks: [],
        textImages: [],
      })),
    });
    const output = await PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(3);
    expect(output.getPage(0).getRotation().angle).toBe(180);
    expect(await ctx.repo.readContent(d.assets[0].content)).toEqual(fixture);
    expect(displayedPageSize(d.pages[0])).toEqual({ width: 640, height: 960 });
    model.close();
    doc.destroy();
  });
  it("retains an over-limit remote markup transaction and pauses its projection", () => {
    const doc = pdfDoc(),
      model = new PdfMarkup(doc),
      records = pdfPageMaps(doc).markup;
    doc.transact(() => {
      for (let i = 0; i <= PDF_LIMITS.marks; i++) {
        const id = newId();
        records.set(id, {
          ...mark("Remote retained comment"),
          id,
          target: id,
          clock: i + 1,
          deleted: false,
        });
      }
    }, "remote");
    expect(records.size).toBe(PDF_LIMITS.marks + 1);
    expect(() => model.marks()).toThrow("Merged markup exceeds");
    expect(() => model.put(mark())).toThrow("Merged markup exceeds");
    model.close();
    expect(() => new PdfMarkup(doc)).toThrow("too many markup records");
    expect(records.size).toBe(PDF_LIMITS.marks + 1);
    doc.destroy();
  });
  it("gives duplicated exported pages separate annotation streams while sharing original resources", async () => {
    const ctx = await setup(),
      id = await ctx.library.importPdf(fixture, pages, "Copies.pdf"),
      d = (await ctx.repo.document(id)).descriptor,
      doc = new Y.Doc(),
      drawing = new InkModel(doc);
    ink(drawing);
    const first = d.pages[0],
      copy = { ...first, pageId: newId(), streamId: newId() },
      result = await buildAnnotatedPdf({
        title: "Independent copies",
        assets: [{ id: d.assets[0].assetId, bytes: fixture.slice() }],
        pages: [
          {
            page: first,
            strokes: drawing.strokes(),
            marks: [],
            textImages: [],
            paper: drawing.paper(),
          },
          {
            page: copy,
            strokes: [],
            marks: [],
            textImages: [],
            paper: drawing.paper(),
          },
        ],
      }),
      pdf = await PDFDocument.load(result);
    const a = pdf.getPage(0).node.Contents(),
      b = pdf.getPage(1).node.Contents();
    expect(a).toBeInstanceOf(PDFArray);
    expect(b).toBeInstanceOf(PDFArray);
    expect((a as PDFArray).asArray().at(-1)!.toString()).not.toBe(
      (b as PDFArray).asArray().at(-1)!.toString()
    );
    drawing.close();
    doc.destroy();
  });
  it("removes copied page actions from study exports and retains the untouched original", async () => {
    const input = await PDFDocument.create(),
      page = input.addPage([600, 800]);
    page.node.set(
      PDFName.of("AA"),
      input.context.obj({
        O: {
          S: PDFName.of("JavaScript"),
          JS: PDFString.of("synthetic action, never executed"),
        },
      })
    );
    const original = await input.save(),
      ctx = await setup(),
      id = await ctx.library.importPdf(original, [pages[0]], "Actions.pdf"),
      d = (await ctx.repo.document(id)).descriptor,
      doc = pdfDoc(),
      model = new InkModel(doc, () => false, pdfPageMaps(doc).ink);
    const result = await buildAnnotatedPdf({
        title: "Safe study copy",
        assets: [{ id: d.assets[0].assetId, bytes: original }],
        pages: [
          {
            page: d.pages[0],
            strokes: [],
            marks: [],
            textImages: [],
            paper: model.paper(),
          },
        ],
      }),
      pdf = await PDFDocument.load(result);
    expect(pdf.getPage(0).node.has(PDFName.of("AA"))).toBe(false);
    expect(
      (await PDFDocument.load(original)).getPage(0).node.get(PDFName.of("AA"))
    ).toBeInstanceOf(PDFDict);
    expect(await ctx.repo.readContent(d.assets[0].content)).toEqual(original);
    model.close();
    doc.destroy();
  });
  it("rejects oversized or invalid frame imports before staging a replacement document", async () => {
    const ctx = await setup();
    await expect(
      ctx.library.importPdf(
        new Uint8Array(50 * 1024 * 1024 + 1),
        pages,
        "Oversize.pdf"
      )
    ).rejects.toMatchObject({ code: "LIMIT" });
    await expect(
      ctx.library.importPdf(
        fixture,
        [{ ...pages[0], transform: [0, 0, 0, 0, 0, 0] }],
        "Invalid frame.pdf"
      )
    ).rejects.toThrow();
    expect(await ctx.repo.pendingAssets()).toHaveLength(0);
  });
  it("rejects an excessive text export before allocating canvases or workers and retains committed content", async () => {
    const ctx = await setup(),
      id = await ctx.library.importPdf(fixture, pages, "Bounded export.pdf"),
      page = (await ctx.repo.document(id)).descriptor.pages[0],
      source = await ctx.library.open(id, page.pageId),
      markup = new PdfMarkup(source.stream.doc);
    for (let i = 0; i < 17; i++)
      markup.put({
        ...mark("Retained editable comment " + i),
        rects: [{ x: 20, y: 20, width: 500, height: 500 }],
      });
    await source.stream.flush();
    const prior = await ctx.repo.document(id),
      canvas = vi.fn(() => {
        throw new Error("Must reject before raster allocation");
      }),
      worker = vi.fn();
    vi.stubGlobal("document", { createElement: canvas });
    vi.stubGlobal("Worker", worker);
    await expect(exportAnnotatedPdf(ctx.library, id)).rejects.toThrow(
      "export annotation budget"
    );
    expect(canvas).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
    expect((await ctx.repo.document(id)).heads).toEqual(prior.heads);
    expect(
      await ctx.repo.readContent(prior.descriptor.assets[0].content)
    ).toEqual(fixture);
    expect(markup.marks()).toHaveLength(17);
    markup.close();
    source.release();
  });
});
