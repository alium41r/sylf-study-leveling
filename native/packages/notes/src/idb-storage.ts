// The browser and desktop store: IndexedDB, one database for every owner on this device. appendUpdates writes the document and its
// updates in one transaction, so a saved edit and the row that lists it cannot disagree after a crash.
import type { LibraryRecord, NotesStorage, StoredAsset, StoredDocument, StoredUpdate } from "./contracts";

const NAME = "sylf-native-notes";
const VERSION = 1;
type Store = "documents" | "updates" | "assets" | "libraries";

const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error("The save was interrupted.")); });
const result = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

export function createIndexedDbStorage(factory: IDBFactory = indexedDB): NotesStorage {
  let database: Promise<IDBDatabase> | undefined;
  const db = () => (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const d = request.result;
      d.createObjectStore("documents", { keyPath: "id" }).createIndex("owner", "owner");
      d.createObjectStore("updates", { autoIncrement: true }).createIndex("document", "documentId");
      d.createObjectStore("assets", { keyPath: "key" });
      d.createObjectStore("libraries", { keyPath: "owner" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("This browser cannot store notes."));
    request.onblocked = () => reject(new Error("Close other Sylf windows to finish updating the notes store."));
  }));
  const tx = async (stores: Store[], mode: IDBTransactionMode) => (await db()).transaction(stores, mode, { durability: "strict" } as IDBTransactionOptions);
  const removeUpdates = async (store: IDBObjectStore, documentId: string, streamId?: string) => {
    const cursor = store.index("document").openCursor(IDBKeyRange.only(documentId));
    await new Promise<void>((resolve, reject) => {
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        if (!streamId || (c.value as { streamId: string }).streamId === streamId) c.delete();
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
  };
  return {
    async load(owner) {
      const t = await tx(["documents", "libraries"], "readonly");
      const [documents, library] = await Promise.all([result(t.objectStore("documents").index("owner").getAll(IDBKeyRange.only(owner))), result(t.objectStore("libraries").get(owner))]);
      return { documents: documents as StoredDocument[], library: library ? ({ libraryId: library.libraryId, notebooks: library.notebooks, order: library.order } as LibraryRecord) : null };
    },
    async putDocument(document) { const t = await tx(["documents"], "readwrite"); t.objectStore("documents").put(document); await done(t); },
    async putLibrary(owner, library) { const t = await tx(["libraries"], "readwrite"); t.objectStore("libraries").put({ owner, ...library }); await done(t); },
    async appendUpdates(document, updates) {
      const t = await tx(["documents", "updates"], "readwrite");
      t.objectStore("documents").put(document);
      const store = t.objectStore("updates");
      for (const u of updates) store.add({ documentId: document.id, streamId: u.streamId, bytes: u.bytes });
      await done(t);
    },
    async readUpdates(documentId, streamId) {
      const t = await tx(["updates"], "readonly");
      const rows = (await result(t.objectStore("updates").index("document").getAll(IDBKeyRange.only(documentId)))) as (StoredUpdate & { documentId: string })[];
      return rows.filter((row) => !streamId || row.streamId === streamId).map((row) => ({ streamId: row.streamId, bytes: new Uint8Array(row.bytes) }));
    },
    async compact(documentId, streamId, merged) {
      const t = await tx(["updates"], "readwrite");
      const store = t.objectStore("updates");
      await removeUpdates(store, documentId, streamId);
      store.add({ documentId, streamId, bytes: merged });
      await done(t);
    },
    async deleteDocument(documentId) {
      const t = await tx(["documents", "updates"], "readwrite");
      t.objectStore("documents").delete(documentId);
      await removeUpdates(t.objectStore("updates"), documentId);
      await done(t);
    },
    async putAsset(owner, asset) { const t = await tx(["assets"], "readwrite"); t.objectStore("assets").put({ key: `${owner}:${asset.hash}`, ...asset }); await done(t); },
    async readAsset(owner, hash) {
      const t = await tx(["assets"], "readonly");
      const row = (await result(t.objectStore("assets").get(`${owner}:${hash}`))) as (StoredAsset & { key: string }) | undefined;
      return row ? { hash: row.hash, mediaType: row.mediaType, name: row.name, bytes: new Uint8Array(row.bytes) } : null;
    },
    async deleteAsset(owner, hash) { const t = await tx(["assets"], "readwrite"); t.objectStore("assets").delete(`${owner}:${hash}`); await done(t); },
  };
}
