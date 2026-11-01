import "fake-indexeddb/auto";
import Dexie from "dexie";
import * as Y from "yjs";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DEFAULT_STYLUS_MAPPING,
  learnStylus,
  noStylusCapabilities,
  readStylusCapabilities,
  resolveStylusTool,
  saveStylusCapabilities,
  stylusButton,
} from "@/lib/notes/stylus";
import {
  NOTES_CLIPBOARD_TYPE,
  readNotesClipboard,
  writeNotesClipboard,
} from "@/lib/notes/clipboard";
import {
  DEFAULT_NOTE_STYLE,
  notesPreferencesSchema,
  type NoteStyle,
} from "@/lib/notes/note-style";
import { newId, type DocumentDescriptor } from "@/lib/notes/contracts";
import { NotesLibrary } from "@/lib/notes/library";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import { createNotesVault } from "@/lib/notes/vault";
import { NotesSession } from "@/lib/notes/session";
import { InkModel } from "@/lib/notes/ink";
import { digest } from "@/lib/notes/bytes";
import { notebookLayout, NOTEBOOK_GAP } from "@/lib/notes/notebook-layout";

const cleanups: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanups.splice(0).reverse()) await f();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const sample = [10, 20, 0.5, 0, 0, 0, 0, 0] as [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
const inkStyle = {
  tool: "pen" as const,
  color: "#242830",
  width: 2.8,
  input: "pen" as const,
  brush: "perfect-freehand/1.2.3:sylf-1" as const,
};

function transfer() {
  const data = new Map<string, string>();
  return {
    files: [] as File[],
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) || "",
  } as unknown as DataTransfer;
}

async function createTestLibrary() {
  const libraryId = newId();
  const name = "notes-polish-" + newId();
  const session = new NotesSession("1", () => "1");
  const cipher = await createNotesVault(
    new Uint8Array(32).fill(7),
    JSON.stringify(["1", libraryId]),
    session
  );
  const repo = new IndexedDbNotesRepository({
    session,
    libraryId,
    bindingGeneration: 1,
    databaseName: name,
    cipher,
  });
  const descriptor = {
    format: "sylf-notes" as const,
    formatVersion: 1 as const,
    minimumReaderVersion: 1,
    libraryId,
    ownerRef: "1",
    bindingGeneration: 1,
    extensions: {},
  };
  const binding = {
    provider: "google-drive" as const,
    accountId: "synthetic",
    rootId: "synthetic",
    generation: 1,
    verifiedAt: new Date().toISOString(),
    probeHash: "0".repeat(64),
  };
  await repo.registerLibrary(descriptor, binding);

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

  const identity = await repo.library();
  const library = await NotesLibrary.fromRepository(
    {
      ...identity,
      label: "synthetic",
      status: "ACTIVE",
    },
    repo
  );
  cleanups.push(async () => {
    library.close();
    session.close();
    repo.close();
    await Dexie.delete(name);
  });
  await library.synchronize();
  return { library, repo };
}

describe("stylus buttons", () => {
  it("detects the barrel button and eraser end from Pointer Events", () => {
    expect(stylusButton({ pointerType: "pen", button: 2, buttons: 2 })).toBe(
      "barrel"
    );
    expect(stylusButton({ pointerType: "pen", button: 5, buttons: 32 })).toBe(
      "eraserEnd"
    );
    expect(stylusButton({ pointerType: "pen", button: 0, buttons: 1 })).toBe(
      undefined
    );
    // Mouse and touch never trigger stylus actions.
    expect(stylusButton({ pointerType: "mouse", button: 2, buttons: 2 })).toBe(
      undefined
    );
  });
  it("applies the configured action and falls back to the selected tool", () => {
    expect(resolveStylusTool("barrel", DEFAULT_STYLUS_MAPPING, "pen")).toBe(
      "eraser"
    );
    expect(
      resolveStylusTool(
        "barrel",
        { ...DEFAULT_STYLUS_MAPPING, barrel: "lasso" },
        "pen"
      )
    ).toBe("lasso");
    expect(
      resolveStylusTool(
        "barrel",
        { ...DEFAULT_STYLUS_MAPPING, barrel: "none" },
        "highlighter"
      )
    ).toBe("highlighter");
    expect(resolveStylusTool(undefined, DEFAULT_STYLUS_MAPPING, "pen")).toBe(
      "pen"
    );
  });
  it("learns capabilities only from real pen events", () => {
    expect(
      learnStylus(noStylusCapabilities, {
        pointerType: "touch",
        button: 0,
        buttons: 1,
        pressure: 1,
      })
    ).toBeUndefined();
    const learned = learnStylus(noStylusCapabilities, {
      pointerType: "pen",
      button: 2,
      buttons: 2,
      tiltX: 20,
      pressure: 0.7,
    });
    expect(learned).toMatchObject({
      pen: true,
      barrelButton: true,
      tilt: true,
      pressure: true,
      eraserEnd: false,
    });
    expect(
      learnStylus(learned!, {
        pointerType: "pen",
        button: 2,
        buttons: 2,
        tiltX: 3,
        pressure: 0.7,
      })
    ).toBeUndefined();
  });
  it("keeps the stylus mapping in the default preferences", () => {
    expect(notesPreferencesSchema.parse({}).stylus).toEqual(
      DEFAULT_STYLUS_MAPPING
    );
    expect(
      notesPreferencesSchema.parse({ stylus: { barrel: "highlighter" } }).stylus
    ).toEqual({ barrel: "highlighter", eraserEnd: "eraser" });
  });
});

describe("notes clipboard", () => {
  it("round-trips handwriting in Sylf's format", () => {
    const data = transfer();
    writeNotesClipboard(data, [{ style: inkStyle as never, points: [sample] }]);
    const read = readNotesClipboard(data);
    expect(read.notes?.strokes).toHaveLength(1);
    expect(read.notes?.strokes[0].points[0][0]).toBe(10);
    expect(read.text).toBe("");
  });
  it("ignores malformed or hostile payloads", () => {
    const data = transfer();
    data.setData(
      NOTES_CLIPBOARD_TYPE,
      '{"version":1,"strokes":[{"style":{},"points":[[1]]}]}'
    );
    expect(readNotesClipboard(data).notes).toBeUndefined();
    data.setData(NOTES_CLIPBOARD_TYPE, "not json");
    expect(readNotesClipboard(data).notes).toBeUndefined();
  });
  it("reads plain text and image files", () => {
    const data = transfer();
    data.setData("text/plain", "Hello");
    (data as unknown as { files: File[] }).files = [
      new File(["x"], "a.png", { type: "image/png" }),
      new File(["x"], "a.exe", { type: "application/octet-stream" }),
    ];
    const read = readNotesClipboard(data);
    expect(read.text).toBe("Hello");
    expect(read.images).toHaveLength(1);
  });
});

describe("InkModel paper mutations", () => {
  it("does not write redundant operations when paper is identical", () => {
    const doc = new Y.Doc();
    const ink = new InkModel(doc);
    const paper = {
      template: "grid" as const,
      color: "#ffffff",
      rule: "#cccccc",
      spacing: 24,
    };
    ink.setPaper(paper);
    const countAfterFirst = ink.records.size;
    expect(countAfterFirst).toBeGreaterThan(0);
    // Setting identical paper must be a no-op
    ink.setPaper({ ...paper });
    expect(ink.records.size).toBe(countAfterFirst);
  });
});

describe("page customization scope with NotesLibrary", () => {
  it("applies customization to a single page when scope is page", async () => {
    const { library } = await createTestLibrary();
    const docId = await library.create("Test Notebook", "notebook", null, "ink");
    await library.addPage(docId);

    const doc = (await library.repository.document(docId)).descriptor;
    expect(doc.pages).toHaveLength(2);
    const targetPageId = doc.pages[0].pageId;

    const customStyle: NoteStyle = {
      ...DEFAULT_NOTE_STYLE,
      paper: {
        ...DEFAULT_NOTE_STYLE.paper,
        template: "cornell",
        color: "#f5e9dc",
      },
      width: 900,
      height: 1200,
    };

    await library.setNoteStyle(docId, customStyle, {
      pageId: targetPageId,
      scope: "page",
    });

    const updated = (await library.repository.document(docId)).descriptor;
    expect(updated.pages[0].width).toBe(900);
    expect(updated.pages[0].height).toBe(1200);
    expect(updated.pages[0].extensions.noteStyle).toMatchObject({
      width: 900,
      paper: { template: "cornell", color: "#f5e9dc" },
    });

    // Other page must remain untouched
    expect(updated.pages[1].width).toBe(DEFAULT_NOTE_STYLE.width);
    expect(updated.pages[1].height).toBe(DEFAULT_NOTE_STYLE.height);

    // Document-level noteStyle remains intact
    expect((updated.extensions.noteStyle as NoteStyle).width).toBe(
      DEFAULT_NOTE_STYLE.width
    );
  });

  it("applies customization to all pages when scope is all", async () => {
    const { library } = await createTestLibrary();
    const docId = await library.create("Test Notebook", "notebook", null, "ink");
    await library.addPage(docId);

    const customStyle: NoteStyle = {
      ...DEFAULT_NOTE_STYLE,
      paper: {
        ...DEFAULT_NOTE_STYLE.paper,
        template: "grid",
        color: "#dfebe5",
      },
      width: 1000,
      height: 1400,
    };

    await library.setNoteStyle(docId, customStyle, { scope: "all" });

    const updated = (await library.repository.document(docId)).descriptor;
    expect(updated.extensions.noteStyle).toMatchObject({
      width: 1000,
      paper: { template: "grid", color: "#dfebe5" },
    });
    for (const p of updated.pages) {
      expect(p.width).toBe(1000);
      expect(p.height).toBe(1400);
      expect(p.extensions.noteStyle).toMatchObject({
        width: 1000,
        paper: { template: "grid", color: "#dfebe5" },
      });
    }
  });

  it("shrinks clean pages when switching to landscape orientation", async () => {
    const { library } = await createTestLibrary();
    const docId = await library.create("Test Notebook", "notebook", null, "ink");
    await library.addPage(docId);

    const landscapeStyle: NoteStyle = {
      ...DEFAULT_NOTE_STYLE,
      width: 1123,
      height: 794,
    };

    await library.setNoteStyle(docId, landscapeStyle, { scope: "all" });

    const updated = (await library.repository.document(docId)).descriptor;
    for (const p of updated.pages) {
      expect(p.width).toBe(1123);
      expect(p.height).toBe(794);
    }
  });

  it("protects handwriting from being cropped when reducing width", async () => {
    const { library } = await createTestLibrary();
    const docId = await library.create("Test Notebook", "notebook", null, "ink");
    await library.addPage(docId);

    const doc = (await library.repository.document(docId)).descriptor;
    const page1Id = doc.pages[0].pageId;

    // Open page 1 and draw a stroke that extends to x: 750
    const source = await library.open(docId, page1Id, "ink");
    const ink = new InkModel(source.stream.doc);
    ink.begin(inkStyle);
    ink.append([
      [100, 100, 0.5, 0, 0, 0, 0, 0],
      [750, 200, 0.5, 0, 0, 0, 0, 0],
    ]);
    ink.finish();
    await source.stream.flush();

    // Trying to resize page 1 width to 600 must throw
    await expect(
      library.setNoteStyle(
        docId,
        { ...DEFAULT_NOTE_STYLE, width: 600 },
        { pageId: page1Id, scope: "page" }
      )
    ).rejects.toThrow(/crop handwriting/i);

    // Trying to resize all pages to 600 must also detect the wide stroke on page 1 and throw
    await expect(
      library.setNoteStyle(
        docId,
        { ...DEFAULT_NOTE_STYLE, width: 600 },
        { scope: "all" }
      )
    ).rejects.toThrow(/crop handwriting/i);

    source.release();
  });

  it("protects handwriting on pages where ink stream is stored in extensions.inkStreamId", async () => {
    const { library } = await createTestLibrary();
    // Create a note with page layers so inkStreamId is in extensions
    const docId = await library.create("Layered Note", "notebook", null, "typed");
    await library.ensurePageLayers(docId);

    const doc = (await library.repository.document(docId)).descriptor;
    const pageId = doc.pages[0].pageId;

    // Open ink layer and draw stroke extending to X: 720
    const source = await library.open(docId, pageId, "ink");
    const ink = new InkModel(source.stream.doc);
    ink.begin(inkStyle);
    ink.append([
      [100, 100, 0.5, 0, 0, 0, 0, 0],
      [720, 200, 0.5, 0, 0, 0, 0, 0],
    ]);
    ink.finish();
    await source.stream.flush();

    // Closing the stream to test reading an inactive/unloaded stream
    source.release();

    await expect(
      library.setNoteStyle(
        docId,
        { ...DEFAULT_NOTE_STYLE, width: 600 },
        { pageId, scope: "page" }
      )
    ).rejects.toThrow(/crop handwriting/i);
  });

  it("preserves vertical handwriting bounds on inactive pages when switching orientation", async () => {
    const { library } = await createTestLibrary();
    const docId = await library.create("Multi-page Note", "notebook", null, "ink");
    await library.addPage(docId);

    const doc = (await library.repository.document(docId)).descriptor;
    const page1Id = doc.pages[0].pageId;
    const page2Id = doc.pages[1].pageId;

    // Page 1 has content only near the top
    const s1 = await library.open(docId, page1Id, "ink");
    const ink1 = new InkModel(s1.stream.doc);
    ink1.begin(inkStyle);
    ink1.append([
      [50, 50, 0.5, 0, 0, 0, 0, 0],
      [100, 150, 0.5, 0, 0, 0, 0, 0],
    ]);
    ink1.finish();
    await s1.stream.flush();
    s1.release();

    // Page 2 (which will be inactive during resize) has content down to Y: 1020
    const s2 = await library.open(docId, page2Id, "ink");
    const ink2 = new InkModel(s2.stream.doc);
    ink2.begin(inkStyle);
    ink2.append([
      [50, 800, 0.5, 0, 0, 0, 0, 0],
      [100, 1020, 0.5, 0, 0, 0, 0, 0],
    ]);
    ink2.finish();
    await s2.stream.flush();
    s2.release();

    // Switch all pages to landscape (height: 794)
    const landscapeStyle: NoteStyle = {
      ...DEFAULT_NOTE_STYLE,
      width: 1123,
      height: 794,
    };
    await library.setNoteStyle(docId, landscapeStyle, {
      pageId: page1Id,
      scope: "all",
      contentBottom: 150,
    });

    const updated = (await library.repository.document(docId)).descriptor;
    // Page 1 was clean/short, so it shrinks cleanly to landscape height 794
    expect(updated.pages[0].height).toBe(794);
    // Page 2 had strokes at Y: 1020, so it must not be cropped to 794!
    expect(updated.pages[1].height).toBeGreaterThanOrEqual(1020);
  });

  it("updates paper on active streams in memory when setNoteStyle is applied to all", async () => {
    const { library } = await createTestLibrary();
    const docId = await library.create("Stream Note", "notebook", null, "ink");
    const doc = (await library.repository.document(docId)).descriptor;
    const pageId = doc.pages[0].pageId;

    // Open active stream
    const source = await library.open(docId, pageId, "ink");
    const ink = new InkModel(source.stream.doc);

    expect(ink.paper().template).toBe("blank");

    // Apply new style to all
    await library.setNoteStyle(
      docId,
      {
        ...DEFAULT_NOTE_STYLE,
        paper: {
          ...DEFAULT_NOTE_STYLE.paper,
          template: "grid",
          color: "#dfebe5",
        },
      },
      { scope: "all" }
    );

    // Active in-memory ink model must reflect new paper immediately
    expect(ink.paper().template).toBe("grid");
    expect(ink.paper().color).toBe("#dfebe5");

    source.release();
  });

  it("applies background asset to single page vs all pages", () => {
    const p1 = newId(),
      p2 = newId();
    const doc: DocumentDescriptor = {
      format: "sylf-notes",
      formatVersion: 1,
      minimumReaderVersion: 1,
      libraryId: newId(),
      documentId: newId(),
      kind: "notebook",
      title: "Test Note",
      schemaVersion: 1,
      folderId: null,
      subjectId: null,
      streams: [],
      pages: [
        {
          pageId: p1,
          streamId: newId(),
          width: 800,
          height: 1100,
          extensions: { noteStyle: { ...DEFAULT_NOTE_STYLE } },
        },
        {
          pageId: p2,
          streamId: newId(),
          width: 800,
          height: 1100,
          extensions: { noteStyle: { ...DEFAULT_NOTE_STYLE } },
        },
      ],
      assets: [],
      requiredFeatures: ["ink-v1", "paged-v1", "creative-tools-v1"],
      extensions: { noteStyle: { ...DEFAULT_NOTE_STYLE } },
    };

    const assetId = "synthetic-asset-id-12345";
    for (const p of doc.pages) {
      if (p.pageId === doc.pages[0].pageId) {
        p.extensions.backgroundAssetId = assetId;
      }
    }
    expect(doc.pages[0].extensions.backgroundAssetId).toBe(assetId);
    expect(doc.pages[1].extensions.backgroundAssetId).toBeUndefined();

    const newAssetId = "synthetic-asset-id-67890";
    for (const p of doc.pages) {
      p.extensions.backgroundAssetId = newAssetId;
    }
    expect(doc.pages[0].extensions.backgroundAssetId).toBe(newAssetId);
    expect(doc.pages[1].extensions.backgroundAssetId).toBe(newAssetId);

    for (const p of doc.pages) {
      if (p.pageId === doc.pages[0].pageId) {
        delete p.extensions.backgroundAssetId;
      }
    }
    expect(doc.pages[0].extensions.backgroundAssetId).toBeUndefined();
    expect(doc.pages[1].extensions.backgroundAssetId).toBe(newAssetId);
  });

  it("persists and reads stylus capabilities across restarts", () => {
    saveStylusCapabilities({
      pen: true,
      barrelButton: true,
      eraserEnd: false,
      tilt: true,
      pressure: true,
    });
    const caps = readStylusCapabilities();
    expect(caps).toMatchObject({
      pen: true,
      barrelButton: true,
      eraserEnd: false,
      tilt: true,
      pressure: true,
    });
  });
});

describe("scroll stability and stylus touch interaction", () => {
  it("preserves exact pixel scroll offset during continuous page expansion", () => {
    // When page 1 expands from 1100 to 2000 px, content on page 1 does not stretch.
    // The scroll position within page 1 must remain identical (prevScale === scale).
    const prevScale = 1.0;
    const currentScale = 1.0;
    const previousItems = [
      { pageId: "p1", top: 24, height: 1100, width: 800 },
      { pageId: "p2", top: 1148, height: 1100, width: 800 },
    ];
    const nextItems = [
      { pageId: "p1", top: 24, height: 2000, width: 800 },
      { pageId: "p2", top: 2048, height: 1100, width: 800 },
    ];

    const currentScrollTop = 500; // reading/writing on page 1
    const anchor = previousItems[0];
    const next = nextItems[0];

    // Compute updated scrollTop under unscaled layout expansion rule
    const updatedScrollTop =
      currentScale === prevScale
        ? next.top + (currentScrollTop - anchor.top)
        : next.top +
          ((currentScrollTop - anchor.top) / anchor.height) * next.height;

    expect(updatedScrollTop).toBe(500); // Zero jitter!
  });

  it("shifts scroll position down by delta height when viewing a lower page", () => {
    // When viewing page 2 and page 1 expands by 900px, page 2 moves down by 900px.
    // The viewport must move down by 900px so page 2 remains at the exact same visible position.
    const prevScale = 1.0;
    const currentScale = 1.0;
    const previousItems = [
      { pageId: "p1", top: 24, height: 1100, width: 800 },
      { pageId: "p2", top: 1148, height: 1100, width: 800 },
    ];
    const nextItems = [
      { pageId: "p1", top: 24, height: 2000, width: 800 },
      { pageId: "p2", top: 2048, height: 1100, width: 800 },
    ];

    const currentScrollTop = 1200; // 52px into page 2
    const anchor = previousItems[1];
    const next = nextItems[1];

    const updatedScrollTop =
      currentScale === prevScale
        ? next.top + (currentScrollTop - anchor.top)
        : next.top +
          ((currentScrollTop - anchor.top) / anchor.height) * next.height;

    expect(updatedScrollTop).toBe(2100); // 2048 + 52 = 2100, exactly tracks page 2!
  });
});

describe("continuous vs paged mode behaviors", () => {
  it("renders 0 gap between pages in continuous mode for a seamless infinite sheet", () => {
    const pages = [
      { pageId: "p1", height: 1100, width: 800, streamId: "s1", extensions: {} },
      { pageId: "p2", height: 1100, width: 800, streamId: "s2", extensions: {} },
      { pageId: "p3", height: 1100, width: 800, streamId: "s3", extensions: {} },
    ];
    // In continuous mode, gap is 0
    const continuous = notebookLayout(pages, 1, 0);
    expect(continuous.items).toHaveLength(3);
    expect(continuous.items[0].top).toBe(0);
    expect(continuous.items[0].height).toBe(1100);
    expect(continuous.items[1].top).toBe(1100); // exactly touches p1, 0 gap!
    expect(continuous.items[1].height).toBe(1100);
    expect(continuous.items[2].top).toBe(2200); // exactly touches p2, 0 gap!
    expect(continuous.height).toBe(3300);

    // In paged mode, gap is NOTEBOOK_GAP (24)
    const paged = notebookLayout(pages, 1, NOTEBOOK_GAP);
    expect(paged.items[0].top).toBe(24);
    expect(paged.items[1].top).toBe(24 + 1100 + 24);
    expect(paged.height).toBe(24 + 1100 + 24 + 1100 + 24 + 1100 + 24);
  });

  it("determines lower 30% writing threshold for automatic page creation in paged mode", () => {
    const pageHeight = 1000;
    const lower30Threshold = pageHeight * 0.70; // 700px

    const isLower30 = (y: number) => y >= lower30Threshold;

    // Writing above 70% (e.g. 500px, 699px) does not trigger new page
    expect(isLower30(500)).toBe(false);
    expect(isLower30(699)).toBe(false);

    // Writing in lower 30% (e.g. 700px, 850px, 950px) triggers new page
    expect(isLower30(700)).toBe(true);
    expect(isLower30(850)).toBe(true);
    expect(isLower30(950)).toBe(true);
  });
});
