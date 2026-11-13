// Descriptor builders, shaped exactly as the web library builds them (lib/notes/library.ts `descriptor`, `create`, `importPdf`),
// so a document written here is one the web reader already understands. Native adds only `extensions.sylfNative`.
import * as Y from "yjs";
import { ink, notesPdf, noteStyle, type DocumentDescriptor, type InkPaper, type PdfSourcePage } from "@sylf/shared";
import type { Cover, LibraryPage, NoteKind } from "./contracts";

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

/** Without a title of its own, a typed note is named by its first line until someone renames it. */
export function typedNote(libraryId: string, title: string | null, folderId: string | null, template: string): Created {
  const d = base(libraryId, title ?? "Untitled note", "flow", folderId), id = newId();
  d.streams.push(stream(id, RICH_TEXT_ADAPTER, "body", "xml"));
  d.requiredFeatures = ["rich-text-v1", "creative-tools-v1"];
  d.extensions.noteStyle = noteStyle.DEFAULT_NOTE_STYLE;
  d.extensions.sylfNative = { surface: "note", template, autoTitle: title === null };
  return { descriptor: d, updates: [{ streamId: id, bytes: emptyRichTextUpdate() }] };
}

export function inkPage(paper: InkPaper, size = { width: noteStyle.DEFAULT_NOTE_STYLE.width, height: noteStyle.DEFAULT_NOTE_STYLE.height }) {
  const streamId = newId();
  const page: Page = { pageId: newId(), streamId, width: size.width, height: size.height, extensions: { noteStyle: { ...noteStyle.DEFAULT_NOTE_STYLE, paper, width: size.width, height: size.height } } };
  return { page, stream: stream(streamId, ink.INK_ADAPTER, "ink", "map"), bytes: ink.initialInkUpdate(paper) };
}

/** One page of a note: a sylf-ink/1 layer and a blocknote/0.56.0 text layer, as the web's page-layers-v1 builds them. */
export function layeredPage(paper: InkPaper, size = { width: noteStyle.DEFAULT_NOTE_STYLE.width, height: noteStyle.DEFAULT_NOTE_STYLE.height }, source?: { asset: string; index: number; transform: number[]; rotation: number }) {
  const ink = inkPage(paper, size), textId = newId();
  ink.page.extensions.inkStreamId = ink.stream.streamId;
  ink.page.extensions.textStreamId = textId;
  if (source) {
    ink.page.originalAssetId = source.asset;
    ink.page.sourcePage = source.index;
    ink.page.extensions.pdfTransform = source.transform;
    ink.page.extensions.pdfSourceRotation = source.rotation;
    ink.page.extensions.pdfRotation = 0;
  }
  return { page: ink.page, streams: [ink.stream, stream(textId, RICH_TEXT_ADAPTER, "body", "xml")], updates: [{ streamId: ink.stream.streamId, bytes: ink.bytes }, { streamId: textId, bytes: emptyRichTextUpdate() }] };
}
export const LAYER_FEATURES = ["rich-text-v1", "ink-v1", "page-layers-v1", "paged-v1", "creative-tools-v1"];

/** The one note: pages you can type and write on, with PDF pages and pictures among them. */
export type PageFlow = "pages" | "endless";
/** Pages, or one endless page that grows as it is written on. Kept in the Native extension: the web reads an endless note as one tall page. */
export const flowOf = (descriptor: DocumentDescriptor): PageFlow => ((descriptor.extensions.sylfNative as { flow?: string } | undefined)?.flow === "endless" ? "endless" : "pages");

export function note(libraryId: string, title: string | null, folderId: string | null, paper: InkPaper, template: string, flow: PageFlow = "pages"): Created {
  const d = base(libraryId, title ?? "Untitled note", "notebook", folderId), first = layeredPage(paper);
  d.streams.push(...first.streams);
  d.pages.push(first.page);
  d.requiredFeatures = [...LAYER_FEATURES];
  d.extensions.noteStyle = { ...noteStyle.DEFAULT_NOTE_STYLE, paper };
  d.extensions.sylfNative = { surface: "note", template, autoTitle: title === null, ...(flow === "endless" ? { flow } : {}) };
  return { descriptor: d, updates: first.updates };
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
export function pdf(libraryId: string, title: string, folderId: string | null, asset: PdfAsset, pages: PdfSourcePage[], geometry: "pdfjs" | "native", subjectId: string | null = null): Created {
  const d = base(libraryId, title, "pdf", folderId), updates: Created["updates"] = [];
  d.subjectId = subjectId;
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
  // Every other notebook is a note: typed, handwritten or both, page by page.
  return "note";
}

export const templateOf = (descriptor: DocumentDescriptor) => (descriptor.extensions.sylfNative as { template?: string } | undefined)?.template ?? null;

/** Whether this document uses per-page text and ink layers (the one note), rather than a single typed flow. */
export const isLayeredNote = (descriptor: DocumentDescriptor) => descriptor.kind === "notebook" && (descriptor.extensions.sylfNative as { surface?: string } | undefined)?.surface !== "board";
function imageOf(descriptor: DocumentDescriptor, id: unknown): Cover["image"] {
  if (typeof id !== "string") return null;
  const asset = descriptor.assets.find((item) => item.assetId === id);
  return asset && /^(image\/png|image\/jpeg)$/.test(asset.mediaType) ? { hash: asset.assetId, mediaType: asset.mediaType } : null;
}

export function coverOf(descriptor: DocumentDescriptor): Cover {
  const cover = (descriptor.extensions.sylfNative as { cover?: { color?: string | null; icon?: string | null; imageAssetId?: string | null } } | undefined)?.cover;
  return { color: cover?.color ?? null, icon: cover?.icon ?? null, image: imageOf(descriptor, cover?.imageAssetId) };
}

export function firstPageOf(descriptor: DocumentDescriptor): LibraryPage | null {
  const page = descriptor.pages[0];
  if (!page) return null;
  const source = page.originalAssetId ? { hash: page.originalAssetId, index: page.sourcePage ?? 0 } : null;
  const size = descriptor.kind === "pdf" ? notesPdf.displayedPageSize(page) : page;
  const paper = (page.extensions.noteStyle as { paper?: InkPaper } | undefined)?.paper ?? ink.DEFAULT_PAPER;
  return { id: page.pageId, width: size.width, height: size.height, paper: source ? null : paper, source, picture: imageOf(descriptor, page.extensions.backgroundAssetId) };
}
