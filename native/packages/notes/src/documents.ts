// Descriptor builders, shaped exactly as the web library builds them (lib/notes/library.ts `descriptor`, `create`, `importPdf`),
// so a document written here is one the web reader already understands. Native adds only `extensions.sylfNative`.
import * as Y from "yjs";
import { ink, notesPdf, noteStyle, type DocumentDescriptor, type InkPaper, type PdfSourcePage } from "@sylf/shared";
import type { NoteKind } from "./contracts";

export const RICH_TEXT_ADAPTER = "blocknote/0.56.0";
export const BOARD_SIZE = { width: 3200, height: 2200 };
type Stream = DocumentDescriptor["streams"][number];
type Page = DocumentDescriptor["pages"][number];

export const newId = () => crypto.randomUUID();
const stream = (streamId: string, adapter: string, root: string, type: "xml" | "map"): Stream => ({ streamId, epoch: 1, codec: "yjs13-update-v1", adapter, schemaVersion: 1, projection: { root, type } });

function base(libraryId: string, title: string, kind: DocumentDescriptor["kind"], folderId: string | null): DocumentDescriptor {
  return { format: "sylf-notes", formatVersion: 1, minimumReaderVersion: 1, libraryId, documentId: newId(), kind, title: title.trim().slice(0, 500) || "Untitled", schemaVersion: 1, folderId, subjectId: null, streams: [], pages: [], assets: [], requiredFeatures: [], extensions: {} };
}

/** An empty Yjs update for a rich-text stream. BlockNote writes the first block itself when the editor opens, from the chosen template. */
export function emptyRichTextUpdate() {
  const doc = new Y.Doc();
  try { doc.getXmlFragment("body"); return Y.encodeStateAsUpdate(doc); } finally { doc.destroy(); }
}

export interface Created { descriptor: DocumentDescriptor; updates: { streamId: string; bytes: Uint8Array }[] }

export function typedNote(libraryId: string, title: string, folderId: string | null, template: string): Created {
  const d = base(libraryId, title, "flow", folderId), id = newId();
  d.streams.push(stream(id, RICH_TEXT_ADAPTER, "body", "xml"));
  d.requiredFeatures = ["rich-text-v1", "creative-tools-v1"];
  d.extensions.noteStyle = noteStyle.DEFAULT_NOTE_STYLE;
  d.extensions.sylfNative = { surface: "note", template };
  return { descriptor: d, updates: [{ streamId: id, bytes: emptyRichTextUpdate() }] };
}

export function inkPage(paper: InkPaper, size = { width: noteStyle.DEFAULT_NOTE_STYLE.width, height: noteStyle.DEFAULT_NOTE_STYLE.height }) {
  const streamId = newId();
  const page: Page = { pageId: newId(), streamId, width: size.width, height: size.height, extensions: { noteStyle: { ...noteStyle.DEFAULT_NOTE_STYLE, paper, width: size.width, height: size.height } } };
  return { page, stream: stream(streamId, ink.INK_ADAPTER, "ink", "map"), bytes: ink.initialInkUpdate(paper) };
}

export function handwriting(libraryId: string, title: string, folderId: string | null, paper: InkPaper): Created {
  const d = base(libraryId, title, "notebook", folderId), first = inkPage(paper);
  d.streams.push(first.stream);
  d.pages.push(first.page);
  d.requiredFeatures = ["ink-v1", "paged-v1", "creative-tools-v1"];
  d.extensions.noteStyle = { ...noteStyle.DEFAULT_NOTE_STYLE, paper };
  d.extensions.sylfNative = { surface: "handwriting" };
  return { descriptor: d, updates: [{ streamId: first.stream.streamId, bytes: first.bytes }] };
}

export function board(libraryId: string, title: string, folderId: string | null, paper: InkPaper): Created {
  const d = base(libraryId, title, "notebook", folderId), only = inkPage(paper, BOARD_SIZE);
  d.streams.push(only.stream);
  d.pages.push(only.page);
  d.requiredFeatures = ["ink-v1", "paged-v1", "creative-tools-v1"];
  d.extensions.noteStyle = { ...noteStyle.DEFAULT_NOTE_STYLE, paper, ...BOARD_SIZE };
  d.extensions.sylfNative = { surface: "board" };
  return { descriptor: d, updates: [{ streamId: only.stream.streamId, bytes: only.bytes }] };
}

export interface PdfAsset { hash: string; size: number; name: string }

/** One sylf-pdf/1 stream per page, with the original kept as an asset whose identity is its SHA-256, as the web imports it. */
export function pdf(libraryId: string, title: string, folderId: string | null, asset: PdfAsset, pages: PdfSourcePage[], geometry: "pdfjs" | "native"): Created {
  const d = base(libraryId, title, "pdf", folderId), updates: Created["updates"] = [];
  d.assets.push({ assetId: asset.hash, mediaType: "application/pdf", name: asset.name.slice(0, 500), content: { hash: asset.hash, size: asset.size, parts: [{ hash: asset.hash, size: asset.size }] }, extensions: {} });
  pages.forEach((source, index) => {
    const streamId = newId();
    d.streams.push(stream(streamId, notesPdf.PDF_ADAPTER, "pdf", "map"));
    d.pages.push({ pageId: newId(), streamId, width: source.width, height: source.height, originalAssetId: asset.hash, sourcePage: index, extensions: { pdfTransform: source.transform, pdfSourceRotation: source.rotation, pdfRotation: 0 } });
    updates.push({ streamId, bytes: notesPdf.initialPdfUpdate() });
  });
  d.requiredFeatures = ["pdf-v1", "ink-v1", "attachments-v1", "paged-v1"];
  // Page units from a native renderer omit UserUnit and the crop offset of the transform (Phase 2 §5.5). Say so, so export can correct it.
  d.extensions.sylfNative = { surface: "pdf", geometry };
  return { descriptor: d, updates };
}

export function kindOf(descriptor: DocumentDescriptor): NoteKind {
  const surface = (descriptor.extensions.sylfNative as { surface?: string } | undefined)?.surface;
  if (descriptor.kind === "pdf") return "pdf";
  if (descriptor.kind === "flow") return "note";
  if (surface === "board") return "board";
  // A web notebook whose first page is typed text still opens as a note.
  return descriptor.streams.find((s) => s.streamId === descriptor.pages[0]?.streamId)?.adapter === RICH_TEXT_ADAPTER ? "note" : "handwriting";
}

export const templateOf = (descriptor: DocumentDescriptor) => (descriptor.extensions.sylfNative as { template?: string } | undefined)?.template ?? null;
