// @vitest-environment node
import "fake-indexeddb/auto";
import Dexie from "dexie";
import * as Y from "yjs";
import { afterEach, describe, it, expect, vi } from "vitest";
import { NotesLibrary } from "@/lib/notes/library";
import { digest } from "@/lib/notes/bytes";
import {
  InkModel,
  INK_ADAPTER,
  DEFAULT_PAPER,
  inkRecordSchema,
  type InkBrush,
  type InkSample,
} from "@/lib/notes/ink";
import {
  inkOutline,
  InkSpatialIndex,
  hitInk,
  insidePolygon,
  lassoInk,
} from "@/lib/notes/ink-renderer";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import { NotesSession } from "@/lib/notes/session";
import {
  NotesStream,
  retainedNotesRecovery,
  recoverUnacknowledged,
} from "@/lib/notes/engine";
import { createNotesVault } from "@/lib/notes/vault";
import {
  exportNotes,
  exportNotesRecovery,
  importNotes,
  inspectNotesArchive,
} from "@/lib/notes/portable";
import { newId, type DocumentDescriptor } from "@/lib/notes/contracts";
const cleanups: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
});
const pen: InkBrush = {
  tool: "pen",
  color: "#242830",
  width: 3,
  input: "pen",
  brush: "perfect-freehand/1.2.3:sylf-1",
};
const points = (count = 100): InkSample[] =>
  Array.from({ length: count }, (_, i) => [
    40 + i,
    120 + Math.sin(i / 9) * 20,
    0.1 + (i % 10) / 12,
    i * 4,
    15,
    -20,
    45,
    0,
  ]);
function model(doc = new Y.Doc()) {
  const ink = new InkModel(doc);
  cleanups.push(() => {
    ink.close();
    doc.destroy();
  });
  return ink;
}
function draw(ink: InkModel, samples = points()) {
  const id = ink.begin(pen);
  ink.append(samples);
  ink.finish();
  return id;
}
async function setup(libraryId = newId(), fault?: (p: string) => void) {
  const session = new NotesSession("1", () => "1"),
    name = `notes-phase4-${newId()}`;
  const key = crypto.getRandomValues(new Uint8Array(32));
  const cipher = await createNotesVault(
    key.slice(),
    JSON.stringify(["1", libraryId]),
    session
  );
  const repo = new IndexedDbNotesRepository({
    session,
    libraryId,
    bindingGeneration: 1,
    databaseName: name,
    cipher,
    fault,
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
  return { repo, session, name, key };
}
async function seed(repo: IndexedDbNotesRepository) {
  const descriptor: DocumentDescriptor = {
    format: "sylf-notes",
    formatVersion: 1,
    minimumReaderVersion: 1,
    libraryId: repo.libraryId,
    documentId: newId(),
    kind: "notebook",
    title: "Vector lecture",
    schemaVersion: 1,
    folderId: null,
    subjectId: null,
    streams: [
      {
        streamId: newId(),
        epoch: 1,
        codec: "yjs13-update-v1",
        adapter: INK_ADAPTER,
        schemaVersion: 1,
        projection: { root: "ink", type: "map" },
      },
    ],
    pages: [],
    assets: [],
    requiredFeatures: ["ink-v1", "paged-v1"],
    extensions: {},
  };
  descriptor.pages = [
    {
      pageId: newId(),
      streamId: descriptor.streams[0].streamId,
      width: 800,
      height: 1100,
      extensions: {},
    },
  ];
  await repo.save({
    operationId: newId(),
    documentId: descriptor.documentId,
    parents: [],
    descriptor,
    kind: "create",
  });
  return descriptor;
}
async function open(repo: IndexedDbNotesRepository, d: DocumentDescriptor) {
  const stream = await NotesStream.open(
      repo,
      d.documentId,
      d.streams[0].streamId,
      1
    ),
    ink = new InkModel(
      stream.doc,
      () => !["failed", "closed", "pausing"].includes(stream.status().state)
    );
  const remove = stream.registerInputBoundary(() => ink.finish("interrupted"));
  cleanups.push(() => {
    remove();
    ink.close();
    stream.close();
  });
  return { stream, ink };
}
describe("Sylf vector ink operations", () => {
  it("retains exact pressure/time/tilt samples in bounded chunks and an explicit end record", () => {
    const ink = model(),
      original = points(256),
      id = draw(ink, original);
    expect(ink.strokes()[0].points).toEqual(original);
    expect(ink.strokes()[0].id).toBe(id);
    const records = [...ink.records.values()].map((r) =>
      inkRecordSchema.parse(r)
    );
    expect(records.filter((r) => r.kind === "part")).toHaveLength(4);
    expect(records.find((r) => r.kind === "end")).toMatchObject({
      reason: "complete",
      stroke: id,
    });
  });
  it("uses actual pressure for pen geometry and finite outlines for taps/highlighters", () => {
    const a = points(64),
      b = a.map((p) => [p[0], p[1], 1, ...p.slice(3)] as InkSample);
    expect(inkOutline(a, pen)).not.toEqual(inkOutline(b, pen));
    for (const outline of [
      inkOutline([a[0]], pen),
      inkOutline(a, { ...pen, tool: "highlighter" }),
      inkOutline(a, { ...pen, input: "mouse" }),
    ]) {
      expect(outline.length).toBeGreaterThan(2);
      expect(outline.flat().every(Number.isFinite)).toBe(true);
    }
  });
  it("moves/restyles/erases through explicit operations, preserves originals and supports undo/redo", () => {
    const ink = model(),
      original = points(32),
      id = draw(ink, original);
    ink.edit({
      targets: [id],
      color: "#3344bb",
      transform: { dx: 10, dy: 20, scale: 1, cx: 0, cy: 0 },
    });
    expect(ink.strokes()[0].points[0].slice(0, 2)).toEqual([50, 140]);
    expect(ink.strokes()[0].style.color).toBe("#3344bb");
    expect(
      [...ink.records.values()].find(
        (r) => inkRecordSchema.parse(r).kind === "part"
      )
    ).toMatchObject({ points: original });
    ink.edit({ targets: [id], erase: true });
    expect(ink.strokes()).toHaveLength(0);
    ink.undoEdit();
    expect(ink.strokes()).toHaveLength(1);
    ink.undoEdit();
    expect(ink.strokes()[0].points).toEqual(original);
    ink.redoEdit();
    expect(ink.strokes()[0].points[0][0]).toBe(50);
  });

  it("changes the scene version when the last stroke is erased, so cached views drop it", () => {
    const ink = model(),
      id = draw(ink, points(8));
    const before = ink.sceneVersion();
    ink.edit({ targets: [id], erase: true });
    expect(ink.strokes()).toHaveLength(0);
    expect(ink.sceneVersion()).not.toBe(before);
  });
  it("merges concurrent strokes/transforms and keeps a peer's work when undoing locally", () => {
    const a = model(),
      b = model();
    const id = draw(a, points(20));
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    a.edit({
      targets: [id],
      transform: { dx: 8, dy: 0, scale: 1, cx: 0, cy: 0 },
    });
    b.edit({
      targets: [id],
      transform: { dx: 0, dy: 9, scale: 1, cx: 0, cy: 0 },
    });
    const second = draw(b, points(4));
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    expect(a.strokes().map((s) => ({ ...s, version: 0 }))).toEqual(
      b.strokes().map((s) => ({ ...s, version: 0 }))
    );
    expect(
      a
        .strokes()
        .find((s) => s.id === id)!
        .points[0].slice(0, 2)
    ).toEqual([48, 129]);
    a.undoEdit();
    expect(a.strokes().map((s) => s.id)).toContain(second);
    expect(
      a
        .strokes()
        .find((s) => s.id === id)!
        .points[0].slice(0, 2)
    ).toEqual([40, 129]);
  });
  it("stores authored paper independently, merges settings deterministically, and undoes locally", () => {
    const a = model(),
      b = model();
    a.setPaper({ ...DEFAULT_PAPER, template: "grid", color: "#faead4" });
    b.setPaper({ ...DEFAULT_PAPER, template: "dotted" });
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    expect(a.paper()).toEqual(b.paper());
    a.undoEdit();
    expect(a.paper().template).toBe("dotted");
  });
  it("fails closed for corrupt, incomplete, or unsupported records without deleting source", () => {
    const ink = model(),
      id = newId();
    ink.records.set(id, { id, kind: "future" });
    expect(() => ink.strokes()).toThrow(/damaged/);
    expect(ink.records.has(id)).toBe(true);
    const other = model(),
      key = newId();
    other.records.set(key, {
      id: key,
      clock: 1,
      kind: "part",
      stroke: newId(),
      part: 1,
      style: pen,
      points: points(1),
    });
    expect(() => other.strokes()).toThrow(/lineage/);
  });
  it("uses spatial culling and segment-aware eraser hits rather than only sampled vertices", () => {
    const ink = model();
    draw(ink, [
      [0, 0, 0.5, 0, 0, 0, 0, 0],
      [100, 0, 0.5, 10, 0, 0, 0, 0],
    ]);
    const s = ink.strokes()[0],
      index = new InkSpatialIndex();
    index.sync([s]);
    expect(index.query({ x: 48, y: 0, width: 4, height: 4 }).has(s.id)).toBe(
      true
    );
    expect(index.query({ x: 900, y: 900, width: 4, height: 4 }).has(s.id)).toBe(
      false
    );
    expect(hitInk(s, 50, 2, 3)).toBe(true);
    expect(hitInk(s, 50, 80, 3)).toBe(false);
    expect(
      lassoInk(s, [
        { x: 45, y: -5 },
        { x: 55, y: -5 },
        { x: 55, y: 5 },
        { x: 45, y: 5 },
      ])
    ).toBe(true);
    expect(
      lassoInk(s, [
        { x: 45, y: 50 },
        { x: 55, y: 50 },
        { x: 55, y: 60 },
        { x: 45, y: 60 },
      ])
    ).toBe(false);
    expect(
      insidePolygon(5, 5, [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ])
    ).toBe(true);
    index.sync([]);
    expect(index.query({ x: 0, y: 0, width: 100, height: 100 }).size).toBe(0);
  });
});
describe("ink through the encrypted production foundation", () => {
  it("captures a short live stroke on flush/pause and reconstructs editable vectors after reload", async () => {
    const { repo } = await setup(),
      d = await seed(repo),
      { stream, ink } = await open(repo, d);
    ink.begin(pen);
    ink.append(points(3));
    expect(stream.status().pending).toBe(0);
    await stream.flush();
    expect(stream.status().state).toBe("local-durable");
    const loaded = await repo.loadStream(
      d.documentId,
      d.streams[0].streamId,
      1
    );
    expect(model(loaded.doc).strokes()[0].points).toEqual(points(3));
    ink.begin(pen);
    ink.append(points(5));
    stream.pause();
    await stream.flush();
    expect(ink.strokes()).toHaveLength(2);
  });
  it("retains the buffered tail on session revocation and replays the original scope", async () => {
    const { repo, session, name, key } = await setup(),
      d = await seed(repo),
      { stream, ink } = await open(repo, d);
    ink.begin(pen);
    ink.append(points(7));
    session.close();
    expect(stream.status().state).toBe("closed");
    const resumed = new NotesSession("1", () => "1"),
      cipher = await createNotesVault(
        key.slice(),
        JSON.stringify(["1", repo.libraryId]),
        resumed
      );
    const reopened = new IndexedDbNotesRepository({
      session: resumed,
      libraryId: repo.libraryId,
      bindingGeneration: 1,
      databaseName: name,
      cipher,
    });
    cleanups.push(() => {
      resumed.close();
      reopened.close();
    });
    expect(
      retainedNotesRecovery(reopened).some((r) => r.documentId === d.documentId)
    ).toBe(true);
    await recoverUnacknowledged(reopened);
    const source = await reopened.loadStream(
      d.documentId,
      d.streams[0].streamId,
      1
    );
    expect(model(source.doc).strokes()[0].points).toEqual(points(7));
  });
  it("never acknowledges an injected quota failure; emergency export retains all vector samples", async () => {
    let fail = false;
    const { repo } = await setup(undefined, (p) => {
      if (fail && p === "before-commit")
        throw new DOMException("quota", "QuotaExceededError");
    });
    const d = await seed(repo),
      { stream, ink } = await open(repo, d);
    draw(ink, points(32));
    await stream.flush();
    fail = true;
    ink.begin(pen);
    ink.append(points(75));
    await expect(stream.flush()).rejects.toMatchObject({ code: "QUOTA" });
    expect(stream.status().state).toBe("failed");
    expect(() => ink.begin(pen)).toThrow(/paused/);
    const bytes = await exportNotesRecovery(repo, stream.recoverySnapshot());
    const inspected = await inspectNotesArchive(bytes);
    expect(inspected.state).toBe("supported");
    fail = false;
    await stream.retry();
    expect(ink.strokes()).toHaveLength(2);
    expect(ink.strokes()[1].points).toEqual(points(75));
  });
  it("exports/imports byte-identical source records, revisions, paper and stable page identities", async () => {
    const a = await setup(),
      d = await seed(a.repo),
      { stream, ink } = await open(a.repo, d);
    const id = draw(ink, points(140));
    ink.setPaper({ ...DEFAULT_PAPER, template: "dotted", color: "#f8efdd" });
    ink.edit({
      targets: [id],
      transform: { dx: 22, dy: 4, scale: 1.25, cx: 0, cy: 0 },
    });
    await stream.flush();
    const before = await a.repo.listRevisions(d.documentId),
      archive = await exportNotes(a.repo, [d.documentId]);
    const b = await setup(a.repo.libraryId);
    await importNotes(b.repo, archive.bytes);
    expect((await b.repo.document(d.documentId)).descriptor.pages).toEqual(
      d.pages
    );
    expect(
      (await b.repo.listRevisions(d.documentId)).map((r) => r.id).sort()
    ).toEqual(before.map((r) => r.id).sort());
    const copy = await b.repo.loadStream(
        d.documentId,
        d.streams[0].streamId,
        1
      ),
      loaded = model(copy.doc);
    expect(loaded.records.toJSON()).toEqual(ink.records.toJSON());
    expect(loaded.strokes().map((s) => ({ ...s, version: 0 }))).toEqual(
      ink.strokes().map((s) => ({ ...s, version: 0 }))
    );
    expect(loaded.paper()).toEqual(ink.paper());
  });
  it("recovers a failed closed ink stream without replacing its merge identities", async () => {
    let fail = false;
    const a = await setup(undefined, (p) => {
        if (fail && p === "before-commit") throw new Error("interruption");
      }),
      d = await seed(a.repo),
      { stream, ink } = await open(a.repo, d);
    draw(ink, points(12));
    fail = true;
    await expect(stream.flush()).rejects.toThrow();
    const id = ink.strokes()[0].id;
    stream.close();
    fail = false;
    await recoverUnacknowledged(a.repo);
    const source = await a.repo.loadStream(
      d.documentId,
      d.streams[0].streamId,
      1
    );
    expect(model(source.doc).strokes()[0].id).toBe(id);
  });
});

async function paperLibrary() {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", { onLine: true });
  const files = new Map<
    string,
    { id: string; hash: string; version: string; bytes: Uint8Array }
  >();
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input, "https://synthetic.test");
    const json = (value: unknown) =>
      new Response(JSON.stringify(value), {
        headers: { "content-type": "application/json" },
      });
    if (url.searchParams.get("action") === "upload") {
      const bytes = new Uint8Array(init.body as ArrayBuffer),
        file = { id: newId(), hash: await digest(bytes), version: "1", bytes };
      files.set(file.id, file);
      return json({
        file: { id: file.id, hash: file.hash, version: file.version },
      });
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
    throw new Error("Unexpected synthetic operation");
  });
  const ctx = await setup(),
    identity = await ctx.repo.library();
  const library = await NotesLibrary.fromRepository(
    { ...identity, label: "synthetic", status: "ACTIVE" },
    ctx.repo
  );
  cleanups.push(() => library.close());
  return { ...ctx, library };
}
describe("production paper page management", () => {
  it("drains sustained ink revisions in bounded passes without replacing source", async () => {
    const { library, repo } = await paperLibrary(),
      id = await library.create("Sustained ink", "notebook", null, "ink"),
      source = await library.open(id),
      ink = new InkModel(source.stream.doc);
    try {
      for (let i = 0; i < 310; i++) {
        draw(ink, points(4));
        await source.stream.flush();
      }
      const replays = vi.spyOn(repo, "loadStream");
      cleanups.push(() => replays.mockRestore());
      const before = (await repo.jobs()).filter(
        (j) => j.state !== "verified"
      ).length;
      expect(before).toBeGreaterThan(300);
      await library.synchronize();
      const remaining = (await repo.jobs()).filter(
        (j) => j.state !== "verified"
      ).length;
      expect(before - remaining).toBeGreaterThanOrEqual(100);
      for (let pass = 0; pass < 4; pass++) {
        if (!(await repo.jobs()).some((j) => j.state !== "verified")) break;
        await library.synchronize();
      }
      expect(
        (await repo.jobs()).filter((j) => j.state !== "verified")
      ).toHaveLength(0);
      expect(ink.strokes()).toHaveLength(310);
      expect((await repo.listRevisions(id)).length).toBeGreaterThan(310);
      expect(
        replays.mock.calls.filter(([documentId]) => documentId === id)
      ).toHaveLength(0);
    } finally {
      ink.close();
      source.release();
    }
  }, 60000);
  it("duplicates vectors into independent page streams, reorders active pages, and retains removed originals", async () => {
    const { library, repo } = await paperLibrary(),
      id = await library.create("Paper", "notebook", null, "ink");
    const first = (await repo.document(id)).descriptor.pages[0],
      source = await library.open(id, first.pageId),
      ink = new InkModel(source.stream.doc);
    draw(ink, points(12));
    await source.stream.flush();
    const secondId = await library.addPage(id),
      copyId = await library.addPage(id, first.pageId);
    const copied = await library.open(id, copyId),
      copy = new InkModel(copied.stream.doc);
    expect(copy.strokes()[0].points).toEqual(ink.strokes()[0].points);
    expect(copied.stream.streamId).not.toBe(source.stream.streamId);
    copy.close();
    copied.release();
    ink.close();
    source.release();
    await library.archivePage(id, secondId, true);
    await library.movePage(id, copyId, -1);
    let view = await repo.document(id);
    expect(
      view.descriptor.pages
        .filter((p) => !p.extensions.archived)
        .map((p) => p.pageId)
    ).toEqual([copyId, first.pageId]);
    expect(view.descriptor.streams).toHaveLength(3);
    await expect(library.open(id, secondId)).rejects.toThrow(/Restore/);
    await library.archivePage(id, first.pageId, true);
    await expect(library.archivePage(id, copyId, true)).rejects.toThrow(
      /one active page/
    );
    await library.archivePage(id, first.pageId, false);
    view = await repo.document(id);
    expect(view.descriptor.pages).toHaveLength(3);
    expect(
      view.descriptor.pages.find((p) => p.pageId === first.pageId)?.extensions
        .archived
    ).toBe(false);
  });
  it("refuses to add pages across unresolved metadata branches instead of implicitly choosing one", async () => {
    const { library, repo } = await paperLibrary(),
      id = await library.create("Paper", "notebook", null, "ink"),
      view = await repo.document(id);
    for (const title of ["Version A", "Version B"])
      await repo.save({
        operationId: newId(),
        documentId: id,
        parents: view.heads,
        descriptor: { ...view.descriptor, title },
      });
    const conflicted = await repo.document(id);
    expect(conflicted.state).toBe("conflict");
    await expect(library.open(id)).rejects.toThrow(/conflict review/);
    await expect(library.addPage(id)).rejects.toThrow(/resolve/);
    expect((await repo.document(id)).heads).toEqual(conflicted.heads);
  });
});

describe("exclusive native validation cache", () => {
  it("cannot use tentative state from a rolled-back save to accept dependent updates", async () => {
    let fail = false;
    const { repo } = await setup(undefined, (p) => {
      if (fail && p === "before-commit")
        throw new Error("interrupted transaction");
    });
    const d = await seed(repo),
      { stream, ink } = await open(repo, d);
    draw(ink, points(6));
    await stream.flush();
    const valid = await repo.document(d.documentId);
    draw(ink, points(7));
    fail = true;
    await expect(stream.flush()).rejects.toThrow();
    const tentativeVector = Y.encodeStateVector(stream.doc);
    // A deliberately untrusted producer sends only a later dependent update.
    const untrusted = new InkModel(stream.doc);
    draw(untrusted, points(8));
    untrusted.close();
    const dependent = Y.encodeStateAsUpdate(stream.doc, tentativeVector);
    fail = false;
    await expect(
      repo.save({
        operationId: newId(),
        documentId: d.documentId,
        parents: valid.heads,
        descriptor: valid.descriptorRef,
        updates: [
          { streamId: d.streams[0].streamId, epoch: 1, bytes: dependent },
        ],
      })
    ).rejects.toMatchObject({ code: "CORRUPT" });
    expect((await repo.document(d.documentId)).heads).toEqual(valid.heads);
    await stream.retry();
    const reloaded = await repo.loadStream(
      d.documentId,
      d.streams[0].streamId,
      1
    );
    expect(model(reloaded.doc).strokes()).toHaveLength(3);
  });
});

async function textSeed() {
  const adapter = await import("@/lib/notes/blocknote-adapter");
  const doc = new Y.Doc();
  const bytes = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  const mock = vi
    .spyOn(adapter, "initialRichTextUpdate")
    .mockResolvedValue(bytes);
  cleanups.push(() => mock.mockRestore());
}

describe("unified text and handwriting page layers", () => {
  it.each(["flow", "notebook"] as const)(
    "adds layers to legacy %s notes without replacing original text, and deduplicates simultaneous opening",
    async (kind) => {
      await textSeed();
      const { library, repo } = await paperLibrary();
      const id = await library.create("Original text", kind);
      const source = await library.open(id);
      const xml = new Y.XmlText();
      xml.insert(0, "Original lecture text");
      source.stream.doc.getXmlFragment("body").insert(0, [xml]);
      await source.stream.flush();
      const originalId = source.stream.streamId;
      source.release();
      const [a, b] = await Promise.all([
        library.ensurePageLayers(id),
        library.ensurePageLayers(id),
      ]);
      expect(a.page.pageId).toBe(b.page.pageId);
      expect(a.text.streamId).toBe(originalId);
      expect((await repo.document(id)).descriptor.streams).toHaveLength(2);
      const text = await library.open(id, a.page.pageId, "text");
      expect(text.stream.doc.getXmlFragment("body").toString()).toContain(
        "Original lecture text"
      );
      text.release();
      const ink = await library.open(id, a.page.pageId, "ink");
      const model = new InkModel(ink.stream.doc);
      draw(model, points(10));
      await ink.stream.flush();
      model.close();
      ink.release();
      const revisions = (await repo.listRevisions(id)).map((r) => r.id);
      await library.ensurePageLayers(id, a.page.pageId);
      expect((await repo.listRevisions(id)).map((r) => r.id)).toEqual(
        revisions
      );
      const archive = await exportNotes(repo, [id]);
      const restored = await setup(repo.libraryId);
      await importNotes(restored.repo, archive.bytes);
      const copy = await restored.repo.loadStream(id, a.ink.streamId, 1);
      const copyInk = new InkModel(copy.doc);
      expect(copyInk.strokes()).toHaveLength(1);
      copyInk.close();
      copy.doc.destroy();
      expect((await restored.repo.document(id)).descriptor.pages).toEqual(
        (await repo.document(id)).descriptor.pages
      );
    }
  );
  it("duplicates both layers independently and retains authored text placement", async () => {
    await textSeed();
    const { library, repo } = await paperLibrary();
    const id = await library.create("Original ink", "notebook", null, "ink");
    const layers = await library.ensurePageLayers(id);
    const source = await library.open(id, layers.page.pageId, "ink");
    const ink = new InkModel(source.stream.doc);
    draw(ink, points(6));
    await source.stream.flush();
    const text = await library.open(id, layers.page.pageId, "text");
    const xml = new Y.XmlText();
    xml.insert(0, "Caption alongside handwriting");
    text.stream.doc.getXmlFragment("body").insert(0, [xml]);
    await text.stream.flush();
    await library.mutate(id, (d) => {
      d.pages[0].extensions.textOrigin = { x: 180, y: 340 };
    });
    const copied = await library.addPage(id, layers.page.pageId);
    const next = await library.ensurePageLayers(id, copied);
    expect(next.text.streamId).not.toBe(layers.text.streamId);
    expect(next.ink.streamId).not.toBe(layers.ink.streamId);
    expect(next.page.extensions.textOrigin).toEqual({ x: 180, y: 340 });
    const copyText = await library.open(id, copied, "text");
    expect(copyText.stream.doc.getXmlFragment("body").toString()).toContain(
      "Caption alongside handwriting"
    );
    const copyInk = await library.open(id, copied, "ink");
    const model = new InkModel(copyInk.stream.doc);
    expect(model.strokes()).toHaveLength(1);
    draw(model, points(8));
    await copyInk.stream.flush();
    expect(ink.strokes()).toHaveLength(1);
    model.close();
    ink.close();
    copyInk.release();
    source.release();
    text.release();
    copyText.release();
    const duplicateId = await library.duplicate(id);
    const duplicatedLayers = await library.ensurePageLayers(duplicateId);
    const duplicateText = await library.open(
      duplicateId,
      duplicatedLayers.page.pageId,
      "text"
    );
    expect(
      duplicateText.stream.doc.getXmlFragment("body").toString()
    ).toContain("Caption alongside handwriting");
    duplicateText.release();
    expect((await repo.document(duplicateId)).descriptor.streams).toHaveLength(
      4
    );
    expect((await repo.document(id)).descriptor.pages).toHaveLength(2);
  });
  it("retains the complete legacy document when adding a layer fails and safely retries", async () => {
    await textSeed();
    const { library, repo } = await paperLibrary();
    const id = await library.create(
      "Retained original",
      "notebook",
      null,
      "ink"
    );
    const before = await repo.document(id);
    const save = vi
      .spyOn(repo, "save")
      .mockRejectedValueOnce(new Error("Synthetic interrupted commit"));
    await expect(library.ensurePageLayers(id)).rejects.toThrow(
      "Synthetic interrupted commit"
    );
    expect(await repo.document(id)).toEqual(before);
    save.mockRestore();
    await library.ensurePageLayers(id);
    expect((await repo.document(id)).descriptor.streams).toHaveLength(2);
  });
  it("serializes concurrent metadata changes without pausing another write's adoption", async () => {
    await textSeed();
    const { library, repo } = await paperLibrary();
    const id = await library.create("Concurrent page", "notebook", null, "ink");
    const layers = await library.ensurePageLayers(id);
    const ink = await library.open(id, layers.page.pageId, "ink"),
      text = await library.open(id, layers.page.pageId, "text");
    await Promise.all([
      library.mutate(id, (d) => {
        d.title = "Renamed safely";
      }),
      library.mutate(id, (d) => {
        d.pages[0].extensions.textOrigin = { x: 200, y: 240 };
      }),
      library.addPage(id, layers.page.pageId),
    ]);
    expect((await repo.document(id)).descriptor).toMatchObject({
      title: "Renamed safely",
      pages: [
        { extensions: { textOrigin: { x: 200, y: 240 } } },
        { extensions: { textOrigin: { x: 200, y: 240 } } },
      ],
    });
    expect(ink.stream.status().state).not.toBe("failed");
    expect(text.stream.status().state).not.toBe("failed");
    ink.release();
    text.release();
  });
});

describe("saved creative preferences and mixed-content copies", () => {
  it("keeps metadata holds independent of UI pauses and defers viewport release/open until adoption finishes", async () => {
    await textSeed();
    const { library, repo } = await paperLibrary();
    const id = await library.create("Viewport race", "notebook", null, "ink"),
      layers = await library.ensurePageLayers(id);
    const source = await library.open(id, layers.page.pageId, "ink");
    const first = source.stream.hold(),
      second = source.stream.hold();
    source.stream.pause();
    source.stream.resume();
    expect(source.stream.status().state).toBe("pausing");
    first();
    first();
    expect(source.stream.status().state).toBe("pausing");
    second();
    expect(source.stream.status().state).toBe("local-durable");
    let enter!: () => void, finish!: () => void;
    const entered = new Promise<void>((resolve) => {
        enter = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
    const save = repo.save.bind(repo);
    const mock = vi.spyOn(repo, "save").mockImplementation(async (request) => {
      enter();
      await gate;
      return save(request);
    });
    const mutation = library.mutate(id, (d) => {
      d.title = "Adopted safely";
    });
    await entered;
    source.release();
    source.stream.resume();
    expect(source.stream.status().state).toBe("pausing");
    let didOpen = false;
    const opening = library
      .open(id, layers.page.pageId, "ink")
      .then((opened) => {
        didOpen = true;
        return opened;
      });
    await Promise.resolve();
    expect(didOpen).toBe(false);
    finish();
    await mutation;
    const next = await opening;
    expect(source.stream.status().state).toBe("closed");
    expect(next.stream.status().state).not.toBe("failed");
    expect((await repo.document(id)).descriptor.title).toBe("Adopted safely");
    mock.mockRestore();
    next.release();
  });
  it("publishes cross-page mixed moves atomically, adopts mounted streams, and retains both pages on a failed revision", async () => {
    await textSeed();
    const { library, repo } = await paperLibrary();
    const id = await library.create(
      "Atomic arrangement",
      "notebook",
      null,
      "ink"
    );
    const a = await library.ensurePageLayers(id),
      next = await library.addPage(id);
    await library.ensurePageLayers(id, next);
    const source = await library.open(id, a.page.pageId, "text"),
      sourceInk = await library.open(id, a.page.pageId, "ink");
    const target = await library.open(id, next, "text"),
      targetInk = await library.open(id, next, "ink");
    const { PageBoxes } = await import("@/lib/notes/text-boxes");
    const regions = new PageBoxes(source.stream.doc, a.page, () => true);
    const box = regions.add(220, 300),
      text = new Y.XmlText();
    text.insert(0, "Never lost in a move");
    source.stream.doc.getXmlFragment(box).insert(0, [text]);
    const ink = new InkModel(sourceInk.stream.doc),
      stroke = draw(ink, points(20));
    await source.stream.flush();
    await sourceInk.stream.flush();
    const selection = [
      { pageId: a.page.pageId, boxes: [box], strokes: [stroke] },
    ];
    const before = await repo.document(id);
    const save = vi
      .spyOn(repo, "save")
      .mockRejectedValueOnce(new Error("Synthetic atomic commit failure"));
    await expect(
      library.editContent(id, selection, { type: "move", targetPageId: next })
    ).rejects.toThrow("Synthetic atomic commit failure");
    expect(await repo.document(id)).toEqual(before);
    expect(ink.strokes()).toHaveLength(1);
    expect(regions.boxes().find((b) => b.id === box)).toBeDefined();
    save.mockRestore();
    await library.editContent(id, selection, {
      type: "move",
      targetPageId: next,
    });
    expect(ink.strokes()).toHaveLength(0);
    expect(regions.boxes().find((b) => b.id === box)).toBeUndefined();
    const movedInk = new InkModel(targetInk.stream.doc);
    expect(movedInk.strokes()).toHaveLength(1);
    const p = (await repo.document(id)).descriptor.pages.find(
      (p) => p.pageId === next
    )!;
    const moved = new PageBoxes(target.stream.doc, p, () => true);
    const extra = moved.boxes().find((b) => b.id !== "body")!;
    expect(target.stream.doc.getXmlFragment(extra.id).toString()).toContain(
      "Never lost in a move"
    );
    for (const opened of [source, sourceInk, target, targetInk])
      expect(opened.stream.status().state).not.toBe("pausing");
    const archive = await exportNotes(repo, [id]),
      restored = await setup(repo.libraryId);
    await importNotes(restored.repo, archive.bytes);
    const view = await restored.repo.document(id),
      stream = view.descriptor.streams.find(
        (s) => s.streamId === p.extensions.textStreamId
      )!;
    const loaded = await restored.repo.loadStream(
      id,
      stream.streamId,
      stream.epoch
    );
    expect(loaded.doc.getXmlFragment(extra.id).toString()).toContain(
      "Never lost in a move"
    );
    loaded.doc.destroy();
    moved.close();
    movedInk.close();
    ink.close();
    regions.close();
    for (const opened of [source, sourceInk, target, targetInk])
      opened.release();
  });
  it("keeps defaults in the encrypted synchronized catalog and seeds new pages without reseeding existing ink", async () => {
    await textSeed();
    const { library, repo } = await paperLibrary();
    const preferences = library.preferences();
    preferences.style = {
      ...preferences.style,
      width: 794,
      height: 1123,
      layout: "paged",
      paper: {
        ...preferences.style.paper,
        template: "cornell",
        color: "#f8e4e7",
      },
    };
    await library.savePreferences(preferences);
    const id = await library.create("Styled", "notebook", null, "ink");
    const layers = await library.ensurePageLayers(id);
    await library.prepareCreativeTools(id);
    expect((await repo.document(id)).descriptor.requiredFeatures).toContain(
      "creative-tools-v1"
    );
    expect(layers.page.width).toBe(794);
    const source = await library.open(id, layers.page.pageId, "ink"),
      ink = new InkModel(source.stream.doc);
    expect(ink.paper()).toEqual(preferences.style.paper);
    draw(ink, points(10));
    await source.stream.flush();
    const { PageBoxes } = await import("@/lib/notes/text-boxes");
    const text = await library.open(id, layers.page.pageId, "text");
    const boxes = new PageBoxes(text.stream.doc, layers.page, () => true);
    const box = boxes.add(300, 400);
    const xml = new Y.XmlText();
    xml.insert(0, "Floating text retained");
    text.stream.doc.getXmlFragment(box).insert(0, [xml]);
    await text.stream.flush();
    const copied = await library.addPage(id, layers.page.pageId);
    const copy = await library.open(id, copied, "text");
    expect(copy.stream.doc.getXmlFragment(box).toString()).toContain(
      "Floating text retained"
    );
    const next = new PageBoxes(
      copy.stream.doc,
      { ...layers.page, pageId: copied },
      () => true
    );
    next.set({ ...next.boxes()[1], x: 100 });
    expect(boxes.boxes()[1].x).toBe(300);
    await copy.stream.flush();
    await library.indexSearch();
    expect(
      library.snapshot().notes.find((n) => n.id === id)?.searchText
    ).toContain("floating text retained");
    const archive = await exportNotes(repo, [id]),
      restored = await setup(repo.libraryId);
    await importNotes(restored.repo, archive.bytes);
    const restoredView = await restored.repo.document(id);
    const stream = restoredView.descriptor.streams.find(
      (s) => s.streamId === layers.text.streamId
    )!;
    const loaded = await restored.repo.loadStream(
      id,
      stream.streamId,
      stream.epoch
    );
    expect(loaded.doc.getXmlFragment(box).toString()).toContain(
      "Floating text retained"
    );
    loaded.doc.destroy();
    next.close();
    boxes.close();
    ink.close();
    source.release();
    text.release();
    copy.release();
  });
});
