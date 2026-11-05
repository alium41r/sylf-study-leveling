// Android and iOS: SQLite in WAL mode (ADR 0001, qualified in Phase 2 §5.6). One transaction writes a document and its updates,
// and "saved" is shown only after it commits.
import type * as SQLite from "expo-sqlite";
import type { LibraryRecord, NotesStorage, StoredDocument } from "@sylf/notes";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, descriptor TEXT NOT NULL, meta TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS documents_owner ON documents (owner);
CREATE TABLE IF NOT EXISTS updates (seq INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT NOT NULL, stream_id TEXT NOT NULL, bytes BLOB NOT NULL);
CREATE INDEX IF NOT EXISTS updates_document ON updates (document_id, seq);
CREATE TABLE IF NOT EXISTS assets (owner TEXT NOT NULL, hash TEXT NOT NULL, media_type TEXT NOT NULL, name TEXT NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY (owner, hash));
CREATE TABLE IF NOT EXISTS libraries (owner TEXT PRIMARY KEY NOT NULL, record TEXT NOT NULL);
`;

type Row = { id: string; owner: string; descriptor: string; meta: string };

export const durableNotesStorage = true;
export function createPlatformNotesStorage(): NotesStorage {
  let database: Promise<SQLite.SQLiteDatabase> | undefined;
  // Loaded on first use, so a storage problem can only stop Notes, never the app's start.
  const db = () => (database ??= import("expo-sqlite").then((sqlite) => sqlite.openDatabaseAsync("sylf-notes.db")).then(async (d) => { await d.execAsync(SCHEMA); return d; }));
  const put = (d: SQLite.SQLiteDatabase, document: StoredDocument) => d.runAsync("INSERT OR REPLACE INTO documents (id, owner, descriptor, meta) VALUES (?, ?, ?, ?)", document.id, document.owner, JSON.stringify(document.descriptor), JSON.stringify(document.meta));
  return {
    async load(owner) {
      const d = await db();
      const rows = await d.getAllAsync<Row>("SELECT id, owner, descriptor, meta FROM documents WHERE owner = ?", owner);
      const library = await d.getFirstAsync<{ record: string }>("SELECT record FROM libraries WHERE owner = ?", owner);
      return { documents: rows.map((r) => ({ id: r.id, owner: r.owner, descriptor: JSON.parse(r.descriptor), meta: JSON.parse(r.meta) })), library: library ? (JSON.parse(library.record) as LibraryRecord) : null };
    },
    async putDocument(document) { await put(await db(), document); },
    async putLibrary(owner, library) { await (await db()).runAsync("INSERT OR REPLACE INTO libraries (owner, record) VALUES (?, ?)", owner, JSON.stringify(library)); },
    async appendUpdates(document, updates) {
      const d = await db();
      await d.withExclusiveTransactionAsync(async (t) => {
        await put(t, document);
        for (const u of updates) await t.runAsync("INSERT INTO updates (document_id, stream_id, bytes) VALUES (?, ?, ?)", document.id, u.streamId, u.bytes);
      });
    },
    async readUpdates(documentId) {
      const rows = await (await db()).getAllAsync<{ stream_id: string; bytes: Uint8Array }>("SELECT stream_id, bytes FROM updates WHERE document_id = ? ORDER BY seq", documentId);
      return rows.map((r) => ({ streamId: r.stream_id, bytes: new Uint8Array(r.bytes) }));
    },
    async compact(documentId, streamId, merged) {
      await (await db()).withExclusiveTransactionAsync(async (t) => {
        await t.runAsync("DELETE FROM updates WHERE document_id = ? AND stream_id = ?", documentId, streamId);
        await t.runAsync("INSERT INTO updates (document_id, stream_id, bytes) VALUES (?, ?, ?)", documentId, streamId, merged);
      });
    },
    async deleteDocument(documentId) {
      await (await db()).withExclusiveTransactionAsync(async (t) => {
        await t.runAsync("DELETE FROM updates WHERE document_id = ?", documentId);
        await t.runAsync("DELETE FROM documents WHERE id = ?", documentId);
      });
    },
    async putAsset(owner, asset) { await (await db()).runAsync("INSERT OR REPLACE INTO assets (owner, hash, media_type, name, bytes) VALUES (?, ?, ?, ?, ?)", owner, asset.hash, asset.mediaType, asset.name, asset.bytes); },
    async readAsset(owner, hash) {
      const row = await (await db()).getFirstAsync<{ hash: string; media_type: string; name: string; bytes: Uint8Array }>("SELECT hash, media_type, name, bytes FROM assets WHERE owner = ? AND hash = ?", owner, hash);
      return row ? { hash: row.hash, mediaType: row.media_type, name: row.name, bytes: new Uint8Array(row.bytes) } : null;
    },
    async deleteAsset(owner, hash) { await (await db()).runAsync("DELETE FROM assets WHERE owner = ? AND hash = ?", owner, hash); },
  };
}
