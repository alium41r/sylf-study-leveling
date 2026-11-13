// The one owner of an owner's Notes on this device. Screens read its snapshot, and every change goes through it. Documents opened by
// several windows share one set of Yjs replicas, so two windows on one note are the same note. Writes are queued in order, an
// acknowledged save is in the store, and a failure stops writing and says so rather than losing the next edit quietly.
import * as Y from "yjs";
import { ink, notesPdf, type DocumentDescriptor, type InkPaper, type PdfSourcePage } from "@sylf/shared";
import type { Cover, DocumentMeta, LibraryEntry, LibraryRecord, LibrarySnapshot, NoteKind, Notebook, NotesStorage, StoredDocument, StoredUpdate } from "./contracts";
import { LAYER_FEATURES, RICH_TEXT_ADAPTER, board, coverOf, firstPageOf, inkPage, isLayeredNote, kindOf, layeredPage, newId, note, pdf, type Created, type PageFlow } from "./documents";
import { inkThumbnail } from "./ink-scene";
import { boardPaper, paperFor, type PaperTemplate } from "./templates";

export const DEVICE_OWNER = "device";
export const ownerKey = (userId: number | null) => (userId ? `user:${userId}` : DEVICE_OWNER);
const SAVE_DELAY_MS = 250;
const COMPACT_AFTER = 48;
const PDF_BYTES = 50 * 1024 * 1024;
const COVER_BYTES = 3 * 1024 * 1024;
// An endless page grows to this, about seventy A4 pages; the web's schema allows 100000.
const MAX_PAGE_HEIGHT = 60000;
const NOTEBOOK_COLORS = ["#5b7cfa", "#2f9e8f", "#d9822b", "#c2547a", "#7a62d6", "#4f8a3a"];
const LOADED = Symbol("loaded");

export type SaveState = "saved" | "saving" | "failed";
/** `linkedTo` ties a note to the document it is about, so each can open the other beside it. */
export interface CreateOptions { kind: Exclude<NoteKind, "pdf">; title?: string; notebookId?: string | null; template?: string; paper?: PaperTemplate; paperSpec?: InkPaper; linkedTo?: string; subjectId?: string | null; flow?: PageFlow }
export interface StoredAssetRef { hash: string; size: number; name: string; mediaType: string }
export interface PdfImport { bytes: Uint8Array; name: string; pages: PdfSourcePage[]; geometry: "pdfjs" | "native"; notebookId?: string | null; subjectId?: string | null }

export interface OpenDocument {
  readonly id: string;
  descriptor(): DocumentDescriptor;
  kind(): NoteKind;
  /** The replica of one stream. Its updates are saved as they happen. */
  stream(streamId: string): Y.Doc;
  saveState(): SaveState;
  subscribe(listener: () => void): () => void;
  addPage(afterIndex?: number, paper?: PaperTemplate | InkPaper): string;
  /** PDF pages into a note at `at`, dropping `replace` (empty pages after the content). The original must be stored first (storeAsset). */
  insertPdfPages(asset: StoredAssetRef, pages: PdfSourcePage[], at: number, replace: string[]): void;
  /** A picture under a page's ink and text, or none. */
  setBackground(pageId: string, asset: StoredAssetRef | null): void;
  /** The paper new pages start on. */
  setDefaultPaper(paper: InkPaper): void;
  /** Grows a paper page so its typed text fits. */
  growPage(pageId: string, height: number): void;
  /** Pages, or one endless page. Turning a paged note endless keeps its pages; new space then comes by growing the last one. */
  setFlow(flow: PageFlow): void;
  removePage(pageId: string): void;
  movePage(pageId: string, toIndex: number): void;
  /** The start of a typed note, for the library row and search. */
  setText(text: string): void;
  rename(title: string): void;
  flush(): Promise<void>;
  release(): void;
}

export interface NotesLibrary {
  readonly owner: string;
  getSnapshot(): LibrarySnapshot;
  subscribe(listener: () => void): () => void;
  ready(): Promise<void>;
  create(options: CreateOptions): Promise<string>;
  importPdf(input: PdfImport): Promise<string>;
  open(id: string): Promise<OpenDocument>;
  /** Read the first page for a gallery card without opening an editor or changing the document's history. */
  previewPage(id: string): Promise<LibraryPreview>;
  rename(id: string, title: string): Promise<void>;
  move(id: string, notebookId: string | null): Promise<void>;
  setSubject(id: string, subjectId: string | null): Promise<void>;
  pin(id: string, pinned: boolean): Promise<void>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  /** Permanent. Only from the trash. */
  remove(id: string): Promise<void>;
  duplicate(id: string): Promise<string>;
  asset(hash: string): Promise<Uint8Array | null>;
  /** Keeps a file's bytes under their SHA-256 for this owner, for a document to point at. */
  storeAsset(bytes: Uint8Array, mediaType: string, name: string): Promise<StoredAssetRef>;
  setCover(id: string, cover: Partial<Pick<Cover, "color" | "icon">> & { image?: { bytes: Uint8Array; mediaType: string; name: string } | null }): Promise<void>;
  /** Moves a folder or document just before or after a sibling, within its section. */
  reorder(id: string, neighborId: string, side: "before" | "after"): Promise<void>;
  createNotebook(title: string, parentId?: string | null): Promise<string>;
  renameNotebook(id: string, title: string): Promise<void>;
  updateNotebook(id: string, patch: Partial<Pick<Notebook, "title" | "color" | "icon" | "parentId">>): Promise<void>;
  /** Its documents and folders move up to its parent. */
  deleteNotebook(id: string): Promise<void>;
  /** Moves every document of another owner on this device into this library. Close `from` afterwards: its snapshot is stale. */
  adopt(from: NotesLibrary): Promise<number>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export interface LibraryOptions { sha256(bytes: Uint8Array): Promise<string>; now?: () => number }

interface LibraryPreview {
  paper: InkPaper | null;
  strokes: ReturnType<typeof inkThumbnail>["strokes"];
  text: string;
}

const PREVIEW_TEXT_LIMIT = 540;
const plain = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/** Applies manual positions to items that are already in their default order. */
export function inLibraryOrder<T extends { id: string }>(items: T[], order: readonly string[] | undefined): T[] {
  if (!order?.length) return items;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length));
}

// Stale actions in another window or invalid destinations must leave the library writable.
class LibraryActionError extends Error {}

export function createNotesLibrary(storage: NotesStorage, owner: string, options: LibraryOptions): NotesLibrary {
  const now = options.now ?? Date.now;
  const documents = new Map<string, StoredDocument>();
  const open = new Map<string, { handle: Handle; refs: number; dispose(): Promise<void> }>();
  const opening = new Map<string, Promise<OpenDocument>>();
  const listeners = new Set<() => void>();
  let record: LibraryRecord = { libraryId: newId(), notebooks: [] };
  let snapshot: LibrarySnapshot = { ready: false, entries: [], notebooks: [], failure: null };
  let queue: Promise<unknown> = Promise.resolve();
  let closed = false;

  const entry = (d: StoredDocument): LibraryEntry => ({
    id: d.id, kind: kindOf(d.descriptor), title: d.descriptor.title, notebookId: d.descriptor.folderId, subjectId: d.descriptor.subjectId,
    created: d.meta.created, updated: d.meta.updated, opened: d.meta.opened, pages: d.descriptor.pages.length, pinned: d.meta.pinned, trashed: d.meta.trashed, preview: d.meta.preview, text: d.meta.text ?? "",
    linkedTo: (d.descriptor.extensions.sylfNative as { linkedTo?: string } | undefined)?.linkedTo ?? null,
    cover: coverOf(d.descriptor),
    firstPage: firstPageOf(d.descriptor),
  });
  const emit = () => {
    snapshot = { ...snapshot, entries: [...documents.values()].map(entry).sort((a, b) => b.updated - a.updated), notebooks: [...record.notebooks], order: record.order };
    listeners.forEach((listener) => listener());
  };
  const fail = (error: unknown) => {
    snapshot = { ...snapshot, failure: error instanceof Error ? error.message : "The library could not be saved." };
    emit();
  };
  /** Runs writes one after another. A failed write fails the library, and later writes are refused rather than reordered. */
  const write = <T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(async () => {
      if (snapshot.failure) throw new Error(snapshot.failure);
      if (closed) throw new Error("The library is closed.");
      try { return await task(); }
      catch (error) {
        if (!(error instanceof LibraryActionError)) fail(error);
        throw error;
      }
    });
    queue = next.catch(() => undefined);
    return next;
  };

  const loaded = (async () => {
    try {
      const found = await storage.load(owner);
      if (found.library) record = found.library;
      else await storage.putLibrary(owner, record);
      for (const d of found.documents) documents.set(d.id, d);
      snapshot = { ...snapshot, ready: true };
      emit();
    } catch (error) {
      fail(error);
    }
  })();

  const need = (id: string) => {
    const found = documents.get(id);
    if (!found) throw new LibraryActionError("This document is no longer here.");
    return found;
  };
  const meta = (time: number): DocumentMeta => ({ created: time, updated: time, opened: time, pinned: false, trashed: false, preview: "", text: "" });
  const folderAt = (id: string | null) => {
    if (id === null) return null;
    const folder = record.notebooks.find((item) => item.id === id);
    if (!folder) throw new LibraryActionError("This folder is no longer here.");
    return folder;
  };
  const save = async (created: Created, summary?: Pick<DocumentMeta, "preview" | "text">) => {
    folderAt(created.descriptor.folderId);
    const time = now();
    const stored: StoredDocument = { id: created.descriptor.documentId, owner, descriptor: created.descriptor, meta: { ...meta(time), ...summary } };
    await storage.appendUpdates(stored, created.updates);
    documents.set(stored.id, stored);
    emit();
    return stored.id;
  };
  /** Called in the write queue. An open editor persists its pending streams with the new metadata. */
  const editDocument = async (id: string, edit: (d: StoredDocument) => void, touch: boolean) => {
    const next = structuredCloneDocument(need(id));
    edit(next);
    if (touch) next.meta.updated = now();
    const handle = open.get(id)?.handle;
    if (handle) await handle.commit(next);
    else {
      await storage.putDocument(next);
      documents.set(id, next);
      emit();
    }
  };
  const change = async (id: string, edit: (d: StoredDocument) => void, touch = true) => {
    await loaded;
    return write(() => editDocument(id, edit, touch));
  };
  const putLibrary = async (next: LibraryRecord) => {
    await storage.putLibrary(owner, next);
    record = next;
    emit();
  };

  type Handle = OpenDocument & { commit(next?: StoredDocument): Promise<StoredDocument | undefined> };

  async function openDocument(id: string): Promise<OpenDocument> {
    await loaded;
    // A prior window may have released its handle while its last save is still in the queue.
    await queue;
    need(id);
    const updates = await storage.readUpdates(id);
    const byStream = new Map<string, Uint8Array[]>();
    for (const u of updates) byStream.set(u.streamId, [...(byStream.get(u.streamId) ?? []), u.bytes]);
    // Long journals are merged once on open, so the next open reads one update per stream.
    for (const [streamId, list] of byStream) {
      if (list.length < COMPACT_AFTER) continue;
      const merged = Y.mergeUpdates(list);
      await write(() => storage.compact(id, streamId, merged));
      byStream.set(streamId, [merged]);
    }
    await queue;
    need(id);
    const replicas = new Map<string, Y.Doc>();
    const handleListeners = new Set<() => void>();
    let pending: StoredUpdate[] = [];
    let descriptorDirty = false;
    let touched = false;
    let state: SaveState = "saved";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let flushing: Promise<void> = Promise.resolve();
    const tell = () => handleListeners.forEach((listener) => listener());
    const setState = (next: SaveState) => { if (state !== next) { state = next; tell(); } };

    // Drain at execution time, so descriptor changes and their stream updates always travel together.
    const commit: Handle["commit"] = async (next) => {
      const current = next ?? documents.get(id);
      if (!current || (!next && !pending.length && !descriptorDirty)) return current;
      if (timer) { clearTimeout(timer); timer = undefined; }
      const batch = pending;
      pending = [];
      descriptorDirty = false;
      const stored = batch.length || touched ? { ...current, meta: { ...current.meta, updated: now() } } : current;
      touched = false;
      documents.set(id, stored);
      setState("saving");
      if (next) tell();
      try {
        await storage.appendUpdates(stored, batch);
        emit();
        if (!pending.length && !descriptorDirty) setState("saved");
        return stored;
      } catch (error) {
        setState("failed");
        throw error;
      }
    };
    const persist = () => {
      if (timer) { clearTimeout(timer); timer = undefined; }
      if (!pending.length && !descriptorDirty) return flushing;
      setState("saving");
      flushing = write(() => commit()).then(() => undefined, () => setState("failed"));
      return flushing;
    };
    const schedule = () => {
      setState("saving");
      if (!timer) timer = setTimeout(() => void persist(), SAVE_DELAY_MS);
    };
    const replica = (streamId: string) => {
      const existing = replicas.get(streamId);
      if (existing) return existing;
      if (!need(id).descriptor.streams.some((s) => s.streamId === streamId)) throw new Error("This page is not part of the document.");
      const doc = new Y.Doc();
      for (const bytes of byStream.get(streamId) ?? []) Y.applyUpdate(doc, bytes, LOADED);
      byStream.delete(streamId);
      doc.on("update", (bytes: Uint8Array, origin: unknown) => {
        if (origin === LOADED) return;
        pending.push({ streamId, bytes });
        schedule();
      });
      replicas.set(streamId, doc);
      return doc;
    };
    const mutate = (edit: (d: DocumentDescriptor) => Uint8Array | void, streamId?: string) => {
      const stored = need(id);
      const descriptor = structuredCloneDocument(stored).descriptor;
      const bytes = edit(descriptor);
      documents.set(id, { ...stored, descriptor });
      if (bytes && streamId) pending.push({ streamId, bytes });
      descriptorDirty = true;
      touched = true;
      schedule();
      emitDescriptor();
    };
    const mutateMany = (edit: (d: DocumentDescriptor) => void, updates: StoredUpdate[]) => {
      const stored = need(id);
      const descriptor = structuredCloneDocument(stored).descriptor;
      edit(descriptor);
      documents.set(id, { ...stored, descriptor });
      pending.push(...updates);
      descriptorDirty = true;
      touched = true;
      schedule();
      emitDescriptor();
    };
    const emitDescriptor = () => { emit(); tell(); };

    const handle: Handle = {
      id,
      descriptor: () => need(id).descriptor,
      kind: () => kindOf(need(id).descriptor),
      stream: replica,
      saveState: () => state,
      subscribe(listener) { handleListeners.add(listener); return () => { handleListeners.delete(listener); }; },
      addPage(afterIndex, template) {
        const stored = need(id);
        const pages = stored.descriptor.pages;
        const current = pages[Math.max(0, Math.min(afterIndex ?? pages.length - 1, pages.length - 1))];
        const defaultPaper = (stored.descriptor.extensions.noteStyle as { paper?: InkPaper } | undefined)?.paper;
        const paper = typeof template === "object" ? template : template ? paperFor(template) : (defaultPaper ?? (current?.extensions.noteStyle as { paper?: InkPaper } | undefined)?.paper ?? paperFor("ruled"));
        // A page after a PDF page takes the note's paper size, not the PDF's.
        const size = current && !current.originalAssetId ? { width: current.width, height: Math.min(current.height, 4000) } : undefined;
        const index = afterIndex === undefined ? pages.length : afterIndex + 1;
        if (isLayeredNote(stored.descriptor) && pages.some((p) => p.extensions.textStreamId)) {
          const page = layeredPage(paper, size ?? { width: (stored.descriptor.extensions.noteStyle as { width?: number } | undefined)?.width ?? 800, height: (stored.descriptor.extensions.noteStyle as { height?: number } | undefined)?.height ?? 1100 });
          mutateMany((d) => { d.streams.push(...page.streams); d.pages.splice(index, 0, page.page); }, page.updates);
          return page.page.pageId;
        }
        const page = inkPage(paper, size);
        mutate((d) => {
          d.streams.push(page.stream);
          d.pages.splice(index, 0, page.page);
          return page.bytes;
        }, page.stream.streamId);
        return page.page.pageId;
      },
      insertPdfPages(asset, sources, at, replace) {
        const paper = paperFor("blank");
        const made = sources.map((source, index) => layeredPage(paper, { width: source.width, height: source.height }, { asset: asset.hash, index, transform: source.transform, rotation: source.rotation }));
        mutateMany((d) => {
          if (!d.assets.some((a) => a.assetId === asset.hash)) d.assets.push({ assetId: asset.hash, mediaType: asset.mediaType, name: asset.name.slice(0, 500), content: { hash: asset.hash, size: asset.size, parts: [{ hash: asset.hash, size: asset.size }] }, extensions: {} });
          for (const m of made) d.streams.push(...m.streams);
          const kept = d.pages.filter((p) => !replace.includes(p.pageId));
          const position = Math.max(0, Math.min(at, kept.length));
          kept.splice(position, 0, ...made.map((m) => m.page));
          d.pages = kept;
          d.requiredFeatures = [...new Set([...d.requiredFeatures, ...LAYER_FEATURES, "pdf-v1", "attachments-v1"])];
        }, made.flatMap((m) => m.updates));
      },
      setBackground(pageId, asset) {
        mutate((d) => {
          const page = d.pages.find((p) => p.pageId === pageId);
          if (!page) return;
          if (!asset) { delete page.extensions.backgroundAssetId; return; }
          if (!d.assets.some((a) => a.assetId === asset.hash)) d.assets.push({ assetId: asset.hash, mediaType: asset.mediaType, name: asset.name.slice(0, 500), content: { hash: asset.hash, size: asset.size, parts: [{ hash: asset.hash, size: asset.size }] }, extensions: {} });
          page.extensions.backgroundAssetId = asset.hash;
          d.requiredFeatures = [...new Set([...d.requiredFeatures, "creative-tools-v1"])];
        });
      },
      setDefaultPaper(paper) {
        mutate((d) => { d.extensions.noteStyle = { ...(d.extensions.noteStyle as object), paper }; });
      },
      growPage(pageId, height) {
        const page = need(id).descriptor.pages.find((p) => p.pageId === pageId);
        if (!page || page.originalAssetId || height <= page.height) return;
        height = Math.min(height, MAX_PAGE_HEIGHT);
        if (height <= page.height) return;
        mutate((d) => { const found = d.pages.find((p) => p.pageId === pageId); if (found) found.height = Math.ceil(height); });
      },
      setFlow(flow) {
        mutate((d) => { const native = { ...(d.extensions.sylfNative as object) } as Record<string, unknown>; if (flow === "endless") native.flow = flow; else delete native.flow; d.extensions.sylfNative = native as never; });
      },
      removePage(pageId) {
        if (need(id).descriptor.pages.length <= 1) return;
        // The page's stream and its history stay in the descriptor, as the web's archive does; only the page entry goes.
        mutate((d) => { d.pages = d.pages.filter((p) => p.pageId !== pageId); });
      },
      movePage(pageId, toIndex) {
        mutate((d) => {
          const from = d.pages.findIndex((p) => p.pageId === pageId);
          if (from < 0) return;
          const [page] = d.pages.splice(from, 1);
          d.pages.splice(Math.max(0, Math.min(toIndex, d.pages.length)), 0, page);
        });
      },
      setText(text) {
        const stored = need(id);
        const preview = plain(text, 140), body = plain(text, 4000);
        const native = stored.descriptor.extensions.sylfNative as { autoTitle?: boolean } | undefined;
        const first = plain(text.split("\n").find((line) => line.trim()) ?? "", 80);
        if (native?.autoTitle && first && first !== stored.descriptor.title) mutate((d) => { d.title = first; });
        if (preview === stored.meta.preview && body === stored.meta.text) return;
        const current = need(id);
        documents.set(id, { ...current, meta: { ...current.meta, preview, text: body } });
        descriptorDirty = true;
        touched = true;
        schedule();
      },
      rename(title) {
        const next = title.trim().slice(0, 500);
        if (!next) return;
        mutate((d) => { d.title = next; if (d.extensions.sylfNative) d.extensions.sylfNative = { ...(d.extensions.sylfNative as object), autoTitle: false }; });
      },
      flush: () => persist(),
      release() {
        const entry = open.get(id);
        if (!entry) return;
        entry.refs -= 1;
        if (entry.refs <= 0) { open.delete(id); void entry.dispose(); }
      },
      commit,
    };
    const stored = need(id);
    documents.set(id, { ...stored, meta: { ...stored.meta, opened: now() } });
    descriptorDirty = true;
    void persist();
    open.set(id, {
      handle, refs: 1,
      async dispose() {
        await persist();
        for (const doc of replicas.values()) doc.destroy();
        replicas.clear();
        handleListeners.clear();
      },
    });
    return handle;
  }

  // The normal editor keeps an excerpt in metadata. Read old text layers on demand if the excerpt is missing.
  function excerpt(doc: Y.Doc) {
    let text = "";
    for (const node of doc.getXmlFragment("body").createTreeWalker((node) => node instanceof Y.XmlText)) {
      if (!(node instanceof Y.XmlText)) continue;
      for (const op of node.toDelta() as { insert: unknown }[]) {
        if (typeof op.insert === "string") text += op.insert.slice(0, PREVIEW_TEXT_LIMIT);
        if (text.length >= PREVIEW_TEXT_LIMIT) return plain(text, PREVIEW_TEXT_LIMIT);
      }
      if (text) text += " ";
    }
    return plain(text, PREVIEW_TEXT_LIMIT);
  }

  async function readReplica<T>(id: string, streamId: string, read: (doc: Y.Doc) => T) {
    const handle = open.get(id)?.handle;
    if (handle) return read(handle.stream(streamId));
    const doc = new Y.Doc();
    try {
      for (const update of await storage.readUpdates(id, streamId)) Y.applyUpdate(doc, update.bytes, LOADED);
      return read(doc);
    } finally { doc.destroy(); }
  }

  const library: NotesLibrary = {
    owner,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    ready: () => loaded,
    async create(input) {
      await loaded;
      const folder = input.notebookId ?? null;
      // Typed and handwritten notes are one kind now: pages with a text layer and an ink layer. "handwriting" only picks the paper.
      const created = input.kind === "board" ? board(record.libraryId, input.title ?? "Whiteboard", folder, boardPaper(input.paper ?? "dotted"))
        : note(record.libraryId, input.title ?? null, folder, input.paperSpec ?? paperFor(input.paper ?? "ruled"), input.template ?? "blank", input.flow);
      if (input.subjectId) created.descriptor.subjectId = input.subjectId.slice(0, 128);
      if (input.linkedTo && documents.has(input.linkedTo)) created.descriptor.extensions.sylfNative = { ...(created.descriptor.extensions.sylfNative as object), linkedTo: input.linkedTo };
      return write(() => save(created));
    },
    async importPdf(input) {
      if (input.bytes.length > PDF_BYTES) throw new Error("Choose a PDF up to 50 MB.");
      if (!input.pages.length) throw new Error("This PDF has no pages.");
      await loaded;
      const hash = await options.sha256(input.bytes);
      return write(async () => {
        const folder = input.notebookId ?? null;
        folderAt(folder);
        await storage.putAsset(owner, { hash, mediaType: "application/pdf", name: input.name, bytes: input.bytes });
        return save(pdf(record.libraryId, input.name.replace(/\.pdf$/i, "") || "Imported PDF", folder, { hash, size: input.bytes.length, name: input.name }, input.pages, input.geometry, input.subjectId ?? null));
      });
    },
    open(id) {
      const found = open.get(id);
      if (found) { found.refs += 1; return Promise.resolve(found.handle); }
      const pendingOpen = opening.get(id);
      if (pendingOpen) return pendingOpen.then((handle) => { const entry = open.get(id); if (entry) entry.refs += 1; return handle; });
      const task = openDocument(id).finally(() => opening.delete(id));
      opening.set(id, task);
      return task;
    },
    async previewPage(id) {
      await loaded;
      await queue;
      const { descriptor, meta } = need(id);
      const page = descriptor.pages[0];
      let text = (meta.text || meta.preview).slice(0, PREVIEW_TEXT_LIMIT);
      if (!text) {
        const textId = page?.extensions.textStreamId;
        const stream = descriptor.streams.find((item) => item.adapter === RICH_TEXT_ADAPTER && (page ? item.streamId === textId : descriptor.kind === "flow"));
        if (stream) text = await readReplica(id, stream.streamId, excerpt);
      }
      const stream = page && descriptor.streams.find((item) => item.streamId === page.streamId);
      if (!page || (stream?.adapter !== ink.INK_ADAPTER && stream?.adapter !== notesPdf.PDF_ADAPTER)) return { paper: null, strokes: [], text };
      const bounds = { x: 0, y: 0, width: page.width, height: Math.min(page.height, page.width * 1.5) };
      const thumbnail = await readReplica(id, page.streamId, (doc) => inkThumbnail(doc, bounds, stream.adapter === notesPdf.PDF_ADAPTER ? notesPdf.pdfPageMaps(doc).ink : undefined));
      return { ...thumbnail, text };
    },
    rename: (id, title) => change(id, (d) => {
      const next = title.trim().slice(0, 500);
      if (!next) return;
      d.descriptor.title = next;
      if (d.descriptor.extensions.sylfNative) d.descriptor.extensions.sylfNative = { ...(d.descriptor.extensions.sylfNative as object), autoTitle: false };
    }),
    move: (id, notebookId) => change(id, (d) => { folderAt(notebookId); d.descriptor.folderId = notebookId; }),
    setSubject: (id, subjectId) => change(id, (d) => { d.descriptor.subjectId = subjectId; }),
    pin: (id, pinned) => change(id, (d) => { d.meta.pinned = pinned; }, false),
    trash: (id) => change(id, (d) => { d.meta.trashed = true; d.meta.pinned = false; }),
    restore: (id) => change(id, (d) => { d.meta.trashed = false; }),
    async remove(id) {
      await loaded;
      await write(async () => {
        const found = need(id);
        if (!found.meta.trashed) throw new LibraryActionError("Move it to the trash first.");
        await storage.deleteDocument(id);
        documents.delete(id);
        emit();
        for (const { assetId } of found.descriptor.assets) {
          if (![...documents.values()].some((d) => d.descriptor.assets.some((a) => a.assetId === assetId))) await storage.deleteAsset(owner, assetId);
        }
      });
    },
    async duplicate(id) {
      await loaded;
      return write(async () => {
        const found = (await open.get(id)?.handle.commit()) ?? need(id);
        const updates = await storage.readUpdates(id);
        const descriptor = structuredCloneDocument(found).descriptor;
        descriptor.documentId = newId();
        descriptor.title = `${descriptor.title.slice(0, 495)} copy`;
        if (descriptor.extensions.sylfNative) descriptor.extensions.sylfNative = { ...(descriptor.extensions.sylfNative as object), autoTitle: false };
        const merged = new Map<string, Uint8Array[]>();
        for (const u of updates) merged.set(u.streamId, [...(merged.get(u.streamId) ?? []), u.bytes]);
        return save({ descriptor, updates: [...merged].map(([streamId, list]) => ({ streamId, bytes: Y.mergeUpdates(list) })) }, { preview: found.meta.preview, text: found.meta.text });
      });
    },
    async asset(hash) { await loaded; return (await storage.readAsset(owner, hash))?.bytes ?? null; },
    async storeAsset(bytes, mediaType, name) {
      await loaded;
      const hash = await options.sha256(bytes);
      await write(() => storage.putAsset(owner, { hash, mediaType, name, bytes }));
      return { hash, size: bytes.length, name, mediaType };
    },
    async setCover(id, cover) {
      await loaded;
      const image = cover.image;
      if (image && (!image.bytes.length || image.bytes.length > COVER_BYTES || !/^(image\/png|image\/jpeg)$/.test(image.mediaType))) {
        throw new LibraryActionError("Choose a PNG or JPEG cover up to 3 MB.");
      }
      const asset = image ? { ...image, hash: await options.sha256(image.bytes) } : null;
      await write(async () => {
        need(id);
        if (asset) await storage.putAsset(owner, asset);
        await editDocument(id, (d) => {
          const native = (d.descriptor.extensions.sylfNative as Record<string, unknown> | undefined) ?? {};
          const current = (native.cover as { color?: string | null; icon?: string | null; imageAssetId?: string | null } | undefined) ?? {};
          if (asset && !d.descriptor.assets.some((a) => a.assetId === asset.hash)) {
            const size = asset.bytes.length;
            d.descriptor.assets.push({ assetId: asset.hash, mediaType: asset.mediaType, name: asset.name.slice(0, 500), content: { hash: asset.hash, size, parts: [{ hash: asset.hash, size }] }, extensions: {} });
          }
          d.descriptor.extensions.sylfNative = { ...native, cover: {
            ...current,
            ...(cover.color !== undefined ? { color: cover.color } : {}),
            ...(cover.icon !== undefined ? { icon: cover.icon } : {}),
            ...(image !== undefined ? { imageAssetId: asset?.hash ?? null } : {}),
          } };
        }, false);
      });
    },
    async reorder(id, neighborId, side) {
      await loaded;
      if (id === neighborId) return;
      await write(async () => {
        const folder = record.notebooks.find((item) => item.id === id);
        const document = folder ? null : need(id);
        const parent = folder ? folder.parentId ?? null : document!.descriptor.folderId;
        const key = parent ?? "";
        const folders = record.notebooks.filter((item) => (item.parentId ?? null) === parent).sort((a, b) => a.title.localeCompare(b.title));
        const entries = [...documents.values()].filter((item) => !item.meta.trashed && item.descriptor.folderId === parent).sort((a, b) => b.meta.updated - a.meta.updated);
        const peer = folder ? folders.some((item) => item.id === neighborId)
          : !document!.meta.trashed && entries.some((item) => item.id === neighborId && item.meta.pinned === document!.meta.pinned);
        if (!peer) throw new LibraryActionError("The items must be in the same folder and section.");
        const ids = inLibraryOrder([...folders, ...entries], record.order?.[key]).map((item) => item.id);
        ids.splice(ids.indexOf(id), 1);
        const index = ids.indexOf(neighborId) + Number(side === "after");
        ids.splice(index, 0, id);
        await putLibrary({ ...record, order: { ...record.order, [key]: ids } });
      });
    },
    async createNotebook(title, parentId = null) {
      await loaded;
      return write(async () => {
        folderAt(parentId);
        const notebook: Notebook = { id: newId(), title: title.trim().slice(0, 80) || "Folder", color: NOTEBOOK_COLORS[record.notebooks.length % NOTEBOOK_COLORS.length], created: now(), parentId, icon: null };
        await putLibrary({ ...record, notebooks: [...record.notebooks, notebook] });
        return notebook.id;
      });
    },
    renameNotebook: (id, title) => library.updateNotebook(id, { title }),
    async updateNotebook(id, patch) {
      await loaded;
      await write(async () => {
        const folder = folderAt(id)!;
        const seen = new Set([id]);
        if (patch.parentId !== undefined) {
          for (let parent = folderAt(patch.parentId); parent; parent = folderAt(parent.parentId ?? null)) {
            if (seen.has(parent.id)) throw new LibraryActionError("A folder cannot go inside itself.");
            seen.add(parent.id);
          }
        }
        const next = { ...folder, ...patch, title: patch.title?.trim().slice(0, 80) || folder.title };
        await putLibrary({ ...record, notebooks: record.notebooks.map((item) => item.id === id ? next : item) });
      });
    },
    async deleteNotebook(id) {
      await loaded;
      await write(async () => {
        const folder = folderAt(id)!;
        const parentId = folder.parentId ?? null;
        // Keep the folder until every document has been moved, so a failed write can be retried.
        for (const d of documents.values()) {
          if (d.descriptor.folderId === id) await editDocument(d.id, (next) => { next.descriptor.folderId = parentId; }, false);
        }
        const order = { ...record.order };
        delete order[id];
        await putLibrary({ ...record, order, notebooks: record.notebooks.filter((n) => n.id !== id).map((n) => n.parentId === id ? { ...n, parentId } : n) });
      });
    },
    async adopt(from) {
      await loaded;
      await from.ready();
      await from.flush();
      const theirs = await storage.load(from.owner);
      let moved = 0;
      for (const d of theirs.documents) {
        if (documents.has(d.id)) continue;
        for (const asset of d.descriptor.assets) {
          const bytes = await storage.readAsset(from.owner, asset.assetId);
          if (bytes) await write(() => storage.putAsset(owner, bytes));
        }
        // Updates are keyed by document, so re-owning the document moves its whole history with it.
        const next: StoredDocument = { ...d, owner, descriptor: { ...d.descriptor, libraryId: record.libraryId, folderId: null } };
        await write(() => storage.putDocument(next));
        documents.set(next.id, next);
        moved += 1;
      }
      emit();
      return moved;
    },
    async flush() { await Promise.all([...open.values()].map((entry) => entry.handle.flush())); await queue; },
    async close() {
      await library.flush();
      for (const entry of open.values()) await entry.dispose();
      open.clear();
      closed = true;
      listeners.clear();
    },
  };
  return library;
}

function structuredCloneDocument(d: StoredDocument): StoredDocument {
  return { ...d, descriptor: JSON.parse(JSON.stringify(d.descriptor)) as DocumentDescriptor, meta: { ...d.meta } };
}
