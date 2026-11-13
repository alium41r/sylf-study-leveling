// PDF.js on the web and desktop, pinned to the web app's 6.4.299 with the same local worker and resources (ADR 0001). Page units are
// pdf.js's scale-1 viewport, exactly as the web imports them. Open documents are shared by asset and closed when no page needs them.
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfSourcePage } from "@sylf/shared";

const BASE = "/notes-pdf/6.4.299/";
export const PDF_GEOMETRY = "pdfjs" as const;
let runtime: Promise<typeof import("pdfjs-dist")> | undefined;
const pdfjs = () => (runtime ??= import("pdfjs-dist").then((pdf) => { pdf.GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.min.mjs`; return pdf; }));

async function open(bytes: Uint8Array): Promise<{ doc: PDFDocumentProxy; close(): Promise<void> }> {
  const pdf = await pdfjs();
  const task = pdf.getDocument({ data: bytes.slice(), enableXfa: false, cMapUrl: `${BASE}cmaps/`, cMapPacked: true, standardFontDataUrl: `${BASE}standard_fonts/`, wasmUrl: `${BASE}wasm/`, iccUrl: `${BASE}iccs/`, useSystemFonts: false });
  try { return { doc: await task.promise, close: () => task.destroy() }; } catch (error) {
    void task.destroy();
    if ((error as Error).name === "PasswordException") throw new Error("This PDF is password protected. Add an unlocked copy.");
    throw new Error("This file could not be read as a PDF.");
  }
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfSourcePage[]> {
  const { doc, close } = await open(bytes);
  try {
    if (doc.numPages > 500) throw new Error("Choose a PDF with at most 500 pages.");
    const pages: PdfSourcePage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), v = page.getViewport({ scale: 1 });
      pages.push({ width: v.width, height: v.height, transform: v.transform as PdfSourcePage["transform"], rotation: (((page.rotate % 360) + 360) % 360) as PdfSourcePage["rotation"] });
      page.cleanup();
    }
    return pages;
  } finally { await close(); }
}

const pool = new Map<string, { refs: number; doc: Promise<{ doc: PDFDocumentProxy; close(): Promise<void> }> }>();
export interface PdfSource { render(index: number, canvas: HTMLCanvasElement, pixelWidth: number): Promise<void>; release(): void }

export function openPdfSource(hash: string, load: () => Promise<Uint8Array | null>): PdfSource {
  let entry = pool.get(hash);
  if (!entry) {
    entry = { refs: 0, doc: load().then((bytes) => { if (!bytes) throw new Error("The original PDF is missing."); return open(bytes); }) };
    pool.set(hash, entry);
  }
  entry.refs += 1;
  const held = entry;
  let released = false;
  return {
    async render(index, canvas, pixelWidth) {
      const { doc } = await held.doc;
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, pixelWidth / base.width) });
      const scratch = document.createElement("canvas");
      scratch.width = Math.ceil(viewport.width); scratch.height = Math.ceil(viewport.height);
      await page.render({ canvas: scratch, viewport, background: "#ffffff" } as Parameters<typeof page.render>[0]).promise;
      page.cleanup();
      // Swap in one step, so a re-render at a new zoom never flashes blank.
      canvas.width = scratch.width; canvas.height = scratch.height;
      canvas.getContext("2d")?.drawImage(scratch, 0, 0);
    },
    release() {
      if (released) return;
      released = true;
      held.refs -= 1;
      if (held.refs <= 0) { pool.delete(hash); void held.doc.then((d) => d.close(), () => undefined); }
    },
  };
}

/** A gallery raster at a bounded size. Release the parser as soon as the thumbnail is ready. */
export async function renderPdfThumbnail(hash: string, load: () => Promise<Uint8Array | null>, index: number, pixels: number): Promise<string> {
  const source = openPdfSource(hash, load);
  try {
    const canvas = document.createElement("canvas");
    await source.render(index, canvas, pixels);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally { source.release(); }
}
