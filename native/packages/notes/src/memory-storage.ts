// The in-memory store: tests, and the fallback when a device has no durable store. It copies bytes in and out, as a real store does.
import type { LibraryRecord, NotesStorage, StoredAsset, StoredDocument, StoredUpdate } from "./contracts";

const copy = (bytes: Uint8Array) => bytes.slice();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createMemoryStorage(): NotesStorage & { size(): { documents: number; updates: number; assets: number } } {
  const documents = new Map<string, StoredDocument>();
  const updates = new Map<string, StoredUpdate[]>();
  const assets = new Map<string, StoredAsset>();
  const libraries = new Map<string, LibraryRecord>();
  return {
    async load(owner) { return { documents: [...documents.values()].filter((d) => d.owner === owner).map(clone), library: libraries.has(owner) ? clone(libraries.get(owner)!) : null }; },
    async putDocument(document) { documents.set(document.id, clone(document)); },
    async putLibrary(owner, library) { libraries.set(owner, clone(library)); },
    async appendUpdates(document, list) { documents.set(document.id, clone(document)); updates.set(document.id, [...(updates.get(document.id) ?? []), ...list.map((u) => ({ streamId: u.streamId, bytes: copy(u.bytes) }))]); },
    async readUpdates(id, streamId) { return (updates.get(id) ?? []).filter((u) => !streamId || u.streamId === streamId).map((u) => ({ streamId: u.streamId, bytes: copy(u.bytes) })); },
    async compact(id, streamId, merged) { updates.set(id, [...(updates.get(id) ?? []).filter((u) => u.streamId !== streamId), { streamId, bytes: copy(merged) }]); },
    async deleteDocument(id) { documents.delete(id); updates.delete(id); },
    async putAsset(owner, asset) { assets.set(`${owner}:${asset.hash}`, { ...asset, bytes: copy(asset.bytes) }); },
    async readAsset(owner, hash) { const found = assets.get(`${owner}:${hash}`); return found ? { ...found, bytes: copy(found.bytes) } : null; },
    async deleteAsset(owner, hash) { assets.delete(`${owner}:${hash}`); },
    size: () => ({ documents: documents.size, updates: [...updates.values()].reduce((n, list) => n + list.length, 0), assets: assets.size }),
  };
}
