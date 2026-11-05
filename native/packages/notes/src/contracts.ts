// What the Notes library shows and stores. A document is always a Sylf Notes descriptor (envelope v1) plus Yjs streams in the
// web's own adapters, so nothing here is a second format: the kinds below are how Native names the four descriptor shapes.
import type { DocumentDescriptor } from "@sylf/shared";

/** note: kind "flow", one blocknote/0.56.0 stream. handwriting: kind "notebook", one sylf-ink/1 stream per page.
 *  pdf: kind "pdf", one sylf-pdf/1 stream per page. board: a one-page notebook marked as a whiteboard. */
export type NoteKind = "note" | "handwriting" | "pdf" | "board";

export interface LibraryEntry {
  id: string;
  kind: NoteKind;
  title: string;
  notebookId: string | null;
  subjectId: string | null;
  created: number;
  updated: number;
  opened: number;
  pages: number;
  pinned: boolean;
  trashed: boolean;
  /** The first line of a typed note, kept small for the library. */
  preview: string;
  /** A typed note's text, up to 4,000 characters, for search and for a preview when its editor is not running. */
  text: string;
  /** The document this one is about: notes taken beside a PDF point at it. */
  linkedTo: string | null;
}

/** A folder of documents. The web library calls these folders. */
export interface Notebook { id: string; title: string; color: string; created: number }

export interface LibrarySnapshot {
  ready: boolean;
  entries: LibraryEntry[];
  notebooks: Notebook[];
  /** Says why the library could not open. Writing is refused while it is set. */
  failure: string | null;
}

/** `text` is the start of a typed note as plain text, for search. */
export interface DocumentMeta { created: number; updated: number; opened: number; pinned: boolean; trashed: boolean; preview: string; text: string }
export interface StoredDocument { id: string; owner: string; descriptor: DocumentDescriptor; meta: DocumentMeta }
export interface StoredUpdate { streamId: string; bytes: Uint8Array }
/** The descriptor libraryId every document of this owner carries, and the notebooks. */
export interface LibraryRecord { libraryId: string; notebooks: Notebook[] }
export interface StoredAsset { hash: string; mediaType: string; name: string; bytes: Uint8Array }

/** One device store, scoped by owner. Every method is atomic on its own, and appendUpdates writes the updates and the document together. */
export interface NotesStorage {
  load(owner: string): Promise<{ documents: StoredDocument[]; library: LibraryRecord | null }>;
  putDocument(document: StoredDocument): Promise<void>;
  putLibrary(owner: string, library: LibraryRecord): Promise<void>;
  appendUpdates(document: StoredDocument, updates: StoredUpdate[]): Promise<void>;
  readUpdates(documentId: string): Promise<StoredUpdate[]>;
  /** Replaces every stored update of one stream with a single merged one. */
  compact(documentId: string, streamId: string, merged: Uint8Array): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
  /** Assets are kept per owner, so one person removing a PDF never takes it from another. */
  putAsset(owner: string, asset: StoredAsset): Promise<void>;
  readAsset(owner: string, hash: string): Promise<StoredAsset | null>;
  deleteAsset(owner: string, hash: string): Promise<void>;
}
