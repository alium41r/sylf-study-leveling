// The one owner of an owner's Notes on this device. Screens read its snapshot, and every change goes through it. Documents opened by
// several windows share one set of Yjs replicas, so two windows on one note are the same note. Writes are queued in order, an
// acknowledged save is in the store, and a failure stops writing and says so rather than losing the next edit quietly.
import * as Y from "yjs";
import type { DocumentDescriptor, InkPaper, PdfSourcePage } from "@sylf/shared";
import type { DocumentMeta, LibraryEntry, LibraryRecord, LibrarySnapshot, NoteKind, Notebook, NotesStorage, StoredDocument, StoredUpdate } from "./contracts";
import { board, handwriting, inkPage, kindOf, newId, pdf, typedNote, type Created } from "./documents";
import { boardPaper, paperFor, type PaperTemplate } from "./templates";

export const DEVICE_OWNER = "device";
export const ownerKey = (userId: number | null) => (userId ? `user:${userId}` : DEVICE_OWNER);
const SAVE_DELAY_MS = 250;
const COMPACT_AFTER = 48;
const PDF_BYTES = 50 * 1024 * 1024;
const NOTEBOOK_COLORS = ["#5b7cfa", "#2f9e8f", "#d9822b", "#c2547a", "#7a62d6", "#4f8a3a"];
const LOADED = Symbol("loaded");

export type SaveState = "saved" | "saving" | "failed";
/** `linkedTo` ties a note to the document it is about, so each can open the other beside it. */
export interface CreateOptions { kind: Exclude<NoteKind, "pdf">; title?: string; notebookId?: string | null; template?: string; paper?: PaperTemplate; linkedTo?: string; subjectId?: string | null }
export interface PdfImport { bytes: Uint8Array; name: string; pages: PdfSourcePage[]; geometry: "pdfjs" | "native"; notebookId?: string | null; subjectId?: string | null }

export interface OpenDocument {
  readonly id: string;
  descriptor(): DocumentDescriptor;
  kind(): NoteKind;
  /** The replica of one stream. Its updates are saved as they happen. */
  stream(streamId: string): Y.Doc;
  saveState(): SaveState;
  subscribe(listener: () => void): () => void;
  addPage(afterIndex?: number, paper?: PaperTemplate): string;
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
  createNotebook(title: string): Promise<string>;
  renameNotebook(id: string, title: string): Promise<void>;
  /** Its documents stay, outside any notebook. */
  deleteNotebook(id: string): Promise<void>;
  /** Moves every document of another owner on this device into this library. Close `from` afterwards: its snapshot is stale. */
  adopt(from: NotesLibrary): Promise<number>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export interface LibraryOptions { sha256(bytes: Uint8Array): Promise<string>; now?: () => number }

const plain = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

export function createNotesLibrary(storage: NotesStorage, owner: string, options: LibraryOptions): NotesLibrary {
  const now = options.now ?? Date.now;
  const documents = new Map<string, StoredDocument>();
  const open = new Map<string, { handle: OpenDocument; refs: number; dispose(): Promise<void> }>();
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
  });
  const emit = () => {
    snapshot = { ...snapshot, entries: [...documents.values()].map(entry).sort((a, b) => b.updated - a.updated), notebooks: [...record.notebooks] };
    listeners.forEach((listener) => listener());
  };
  const fail = (error: unknown) => {
    snapshot = { ...snapshot, failure: error instanceof Error ? error.message : "The library could not be saved." };
    emit();
  };
  /** Runs writes one after another. A failed write fails the library, and later writes are refused rather than reordered. */
  const write = <T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(() => {
      if (snapshot.failure) throw new Error(snapshot.failure);
      if (closed) throw new Error("The library is closed.");
      return task();
    });
    queue = next.catch(() => undefined);
    return next.catch((error: unknown) => { if (!snapshot.failure) fail(error); throw error; });
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
    if (!found) throw new Error("This document is no longer here.");
    return found;
  };
  const meta = (time: number): DocumentMeta => ({ created: time, updated: time, opened: time, pinned: false, trashed: false, preview: "", text: "" });
  const save = async (created: Created) => {
    await loaded;
    const time = now();
    const stored: StoredDocument = { id: created.descriptor.documentId, owner, descriptor: created.descriptor, meta: meta(time) };
    await write(() => storage.appendUpdates(stored, created.updates));
    documents.set(stored.id, stored);
    emit();
    return stored.id;
  };
  const change = async (id: string, edit: (d: StoredDocument) => void, touch = true) => {
    await loaded;
    const handle = open.get(id);
    const next = structuredCloneDocument(need(id));
    edit(next);
    if (touch) next.meta.updated = now();
    await write(() => storage.putDocument(next));
    documents.set(id, next);
    if (handle) (handle.handle as Handle).adopt(next);
    emit();
  };
  const putLibrary = (next: LibraryRecord) => write(async () => { await storage.putLibrary(owner, next); record = next; emit(); });

  type Handle = OpenDocument & { adopt(next: StoredDocument): void };

  async function openDocument(id: string): Promise<OpenDocument> {
    await loaded;
    let stored = need(id);
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

    const persist = () => {
      if (timer) { clearTimeout(timer); timer = undefined; }
      if (!pending.length && !descriptorDirty) return flushing;
      const batch = pending; pending = [];
      descriptorDirty = false;
      if (batch.length || touched) stored = { ...stored, meta: { ...stored.meta, updated: now() } };
      touched = false;
      const snapshotOf = stored;
      setState("saving");
      flushing = write(() => storage.appendUpdates(snapshotOf, batch)).then(() => {
        documents.set(id, snapshotOf);
        emit();
        if (!pending.length && !descriptorDirty) setState("saved");
      }, () => setState("failed"));
      return flushing;
    };
    const schedule = () => {
      setState("saving");
      if (!timer) timer = setTimeout(() => void persist(), SAVE_DELAY_MS);
    };
    const replica = (streamId: string) => {
      const existing = replicas.get(streamId);
      if (existing) return existing;
      if (!stored.descriptor.streams.some((s) => s.streamId === streamId)) throw new Error("This page is not part of the document.");
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
      const descriptor = structuredCloneDocument(stored).descriptor;
      const bytes = edit(descriptor);
      stored = { ...stored, descriptor };
      if (bytes && streamId) pending.push({ streamId, bytes });
      descriptorDirty = true;
      touched = true;
      schedule();
      emitDescriptor();
    };
    const emitDescriptor = () => { documents.set(id, stored); emit(); tell(); };

    const handle: Handle = {
      id,
      descriptor: () => stored.descriptor,
      kind: () => kindOf(stored.descriptor),
      stream: replica,
      saveState: () => state,
      subscribe(listener) { handleListeners.add(listener); return () => { handleListeners.delete(listener); }; },
      addPage(afterIndex, template) {
        const current = stored.descriptor.pages[Math.max(0, Math.min(afterIndex ?? stored.descriptor.pages.length - 1, stored.descriptor.pages.length - 1))];
        const paper = template ? paperFor(template) : ((current?.extensions.noteStyle as { paper?: InkPaper } | undefined)?.paper ?? paperFor("ruled"));
        const page = inkPage(paper, current ? { width: current.width, height: current.height } : undefined);
        mutate((d) => {
          d.streams.push(page.stream);
          d.pages.splice(afterIndex === undefined ? d.pages.length : afterIndex + 1, 0, page.page);
          return page.bytes;
        }, page.stream.streamId);
        return page.page.pageId;
      },
      removePage(pageId) {
        if (stored.descriptor.pages.length <= 1) return;
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
        const preview = plain(text, 140), body = plain(text, 4000);
        const native = stored.descriptor.extensions.sylfNative as { autoTitle?: boolean } | undefined;
        const first = plain(text.split("\n").find((line) => line.trim()) ?? "", 80);
        if (native?.autoTitle && first && first !== stored.descriptor.title) mutate((d) => { d.title = first; });
        if (preview === stored.meta.preview && body === stored.meta.text) return;
        stored = { ...stored, meta: { ...stored.meta, preview, text: body } };
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
      adopt(next) { stored = { ...next, meta: { ...next.meta, preview: stored.meta.preview, text: stored.meta.text } }; tell(); },
    };
    stored = { ...stored, meta: { ...stored.meta, opened: now() } };
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

  const library: NotesLibrary = {
    owner,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    ready: () => loaded,
    create(input) {
      const folder = input.notebookId ?? null;
      const created = input.kind === "note" ? typedNote(record.libraryId, input.title ?? null, folder, input.template ?? "blank")
        : input.kind === "board" ? board(record.libraryId, input.title ?? "Whiteboard", folder, boardPaper(input.paper ?? "dotted"))
        : handwriting(record.libraryId, input.title ?? "Handwritten note", folder, paperFor(input.paper ?? "ruled"));
      if (input.subjectId) created.descriptor.subjectId = input.subjectId.slice(0, 128);
      if (input.linkedTo && documents.has(input.linkedTo)) created.descriptor.extensions.sylfNative = { ...(created.descriptor.extensions.sylfNative as object), linkedTo: input.linkedTo };
      return save(created);
    },
    async importPdf(input) {
      if (input.bytes.length > PDF_BYTES) throw new Error("Choose a PDF up to 50 MB.");
      if (!input.pages.length) throw new Error("This PDF has no pages.");
      await loaded;
      const hash = await options.sha256(input.bytes);
      await write(() => storage.putAsset(owner, { hash, mediaType: "application/pdf", name: input.name, bytes: input.bytes }));
      return save(pdf(record.libraryId, input.name.replace(/\.pdf$/i, "") || "Imported PDF", input.notebookId ?? null, { hash, size: input.bytes.length, name: input.name }, input.pages, input.geometry, input.subjectId ?? null));
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
    rename: (id, title) => change(id, (d) => {
      const next = title.trim().slice(0, 500);
      if (!next) return;
      d.descriptor.title = next;
      if (d.descriptor.extensions.sylfNative) d.descriptor.extensions.sylfNative = { ...(d.descriptor.extensions.sylfNative as object), autoTitle: false };
    }),
    move: (id, notebookId) => change(id, (d) => { d.descriptor.folderId = notebookId; }),
    setSubject: (id, subjectId) => change(id, (d) => { d.descriptor.subjectId = subjectId; }),
    pin: (id, pinned) => change(id, (d) => { d.meta.pinned = pinned; }, false),
    trash: (id) => change(id, (d) => { d.meta.trashed = true; d.meta.pinned = false; }),
    restore: (id) => change(id, (d) => { d.meta.trashed = false; }),
    async remove(id) {
      await loaded;
      const found = need(id);
      if (!found.meta.trashed) throw new Error("Move it to the trash first.");
      const assets = found.descriptor.assets.map((a) => a.assetId).filter((hash) => ![...documents.values()].some((d) => d.id !== id && d.descriptor.assets.some((a) => a.assetId === hash)));
      await write(async () => { await storage.deleteDocument(id); for (const hash of assets) await storage.deleteAsset(owner, hash); });
      documents.delete(id);
      emit();
    },
    async duplicate(id) {
      await loaded;
      const found = need(id);
      const handle = open.get(id)?.handle;
      if (handle) await handle.flush();
      const updates = await storage.readUpdates(id);
      const descriptor = structuredCloneDocument(found).descriptor;
      descriptor.documentId = newId();
      descriptor.title = `${descriptor.title} copy`.slice(0, 500);
      const merged = new Map<string, Uint8Array[]>();
      for (const u of updates) merged.set(u.streamId, [...(merged.get(u.streamId) ?? []), u.bytes]);
      const id2 = await save({ descriptor, updates: [...merged].map(([streamId, list]) => ({ streamId, bytes: Y.mergeUpdates(list) })) });
      await change(id2, (d) => { d.meta.preview = found.meta.preview; d.meta.text = found.meta.text; }, false);
      return id2;
    },
    async asset(hash) { await loaded; return (await storage.readAsset(owner, hash))?.bytes ?? null; },
    async createNotebook(title) {
      await loaded;
      const notebook: Notebook = { id: newId(), title: title.trim().slice(0, 80) || "Notebook", color: NOTEBOOK_COLORS[record.notebooks.length % NOTEBOOK_COLORS.length], created: now() };
      await putLibrary({ ...record, notebooks: [...record.notebooks, notebook] });
      return notebook.id;
    },
    async renameNotebook(id, title) {
      await loaded;
      const next = title.trim().slice(0, 80);
      if (next) await putLibrary({ ...record, notebooks: record.notebooks.map((n) => (n.id === id ? { ...n, title: next } : n)) });
    },
    async deleteNotebook(id) {
      await loaded;
      for (const d of [...documents.values()]) if (d.descriptor.folderId === id) await change(d.id, (next) => { next.descriptor.folderId = null; }, false);
      await putLibrary({ ...record, notebooks: record.notebooks.filter((n) => n.id !== id) });
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
