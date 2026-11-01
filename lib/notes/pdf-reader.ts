import type { PDFDocumentProxy } from "pdfjs-dist";
import { PDF_LIMITS, pdfSourcePageSchema, type PdfSourcePage } from "./pdf";
import { NotesError } from "./errors";
export type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
export async function pdfRuntime() {
  const pdf = await import("pdfjs-dist");
  pdf.GlobalWorkerOptions.workerSrc = "/notes-pdf/6.4.299/pdf.worker.min.mjs";
  return pdf;
}
export async function openPdf(bytes: Uint8Array, signal?: AbortSignal) {
  if (
    bytes.length > PDF_LIMITS.fileBytes ||
    !new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-")
  )
    throw new NotesError("LIMIT", "Choose a valid PDF up to 50 MiB.");
  const pdf = await pdfRuntime();
  if (signal?.aborted) throw signal.reason;
  const task = pdf.getDocument({
    data: bytes.slice(),
    enableXfa: false,
    stopAtErrors: true,
    cMapUrl: "/notes-pdf/6.4.299/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/notes-pdf/6.4.299/standard_fonts/",
    wasmUrl: "/notes-pdf/6.4.299/wasm/",
    iccUrl: "/notes-pdf/6.4.299/iccs/",
    useSystemFonts: false,
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener("abort", abort);
    await task.destroy();
  };
  const abort = () => {
    void close();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const doc = await task.promise;
    if (signal?.aborted) throw signal.reason;
    return { doc, close };
  } catch (e) {
    await close();
    if ((e as Error).name === "PasswordException")
      throw new NotesError(
        "UNSUPPORTED",
        "Password-protected PDFs need an unlocked copy. The original was not changed."
      );
    throw e;
  }
}
export async function inspectPdf(
  bytes: Uint8Array,
  signal?: AbortSignal,
  progress?: (page: number, total: number) => void
) {
  const opened = await openPdf(bytes, signal);
  try {
    if ((await opened.doc.getPermissions()) !== null)
      throw new NotesError(
        "UNSUPPORTED",
        "Protected PDFs need an unlocked copy for editable study documents. The original was not changed."
      );
    if (opened.doc.numPages > PDF_LIMITS.importedPages)
      throw new NotesError(
        "LIMIT",
        "Import a PDF with at most 500 pages. Its original has not been changed."
      );
    const pages: PdfSourcePage[] = [];
    for (let i = 1; i <= opened.doc.numPages; i++) {
      if (signal?.aborted) throw signal.reason;
      const page = await opened.doc.getPage(i),
        v = page.getViewport({ scale: 1 });
      pages.push(
        pdfSourcePageSchema.parse({
          width: v.width,
          height: v.height,
          transform: v.transform,
          rotation: ((page.rotate % 360) + 360) % 360,
        })
      );
      page.cleanup();
      progress?.(i, opened.doc.numPages);
      if (i % 16 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return pages;
  } finally {
    await opened.close();
  }
}
export async function searchPdf(
  doc: PDFDocumentProxy,
  query: string,
  signal: AbortSignal,
  progress?: (page: number, total: number) => void
) {
  const needle = query.trim().toLocaleLowerCase(),
    hits: { sourcePage: number; excerpt: string }[] = [];
  let characters = 0,
    limited = false;
  if (!needle) return { hits, limited };
  for (let i = 1; i <= doc.numPages; i++) {
    if (signal.aborted) throw signal.reason;
    const page = await doc.getPage(i),
      content = await page.getTextContent(),
      text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
    page.cleanup();
    characters += text.length;
    if (characters > PDF_LIMITS.searchCharacters) {
      limited = true;
      break;
    }
    const at = text.toLocaleLowerCase().indexOf(needle);
    if (at >= 0)
      hits.push({
        sourcePage: i - 1,
        excerpt: text.slice(Math.max(0, at - 35), at + needle.length + 75),
      });
    progress?.(i, doc.numPages);
    await new Promise((r) => setTimeout(r, 0));
  }
  return { hits, limited };
}

/** View-scoped verified source leases; idle documents are evicted, never their repository assets. */
export class PdfDocumentPool {
  private closed = false;
  private readonly abort = () => this.close();
  private readonly entries = new Map<
    string,
    { refs: number; task: ReturnType<typeof openPdf> }
  >();
  constructor(
    private readonly library: import("./library").NotesLibrary,
    private readonly assets: import("./contracts").AssetDescriptor[]
  ) {
    library.session.signal.addEventListener("abort", this.abort, {
      once: true,
    });
  }
  async acquire(id: string) {
    if (this.closed) throw new Error("PDF reader is closed.");
    this.library.session.assert();
    let entry = this.entries.get(id);
    if (!entry) {
      const asset = this.assets.find(
        (a) => a.assetId === id && a.mediaType === "application/pdf"
      );
      if (!asset)
        throw new NotesError(
          "CORRUPT",
          "The original PDF asset is unavailable. Keep the document for recovery."
        );
      entry = {
        refs: 0,
        task: (async () => {
          const bytes = await this.library.repository.readContent(
            asset.content
          );
          this.library.session.assert();
          return openPdf(bytes, this.library.session.signal);
        })(),
      };
      this.entries.set(id, entry);
    }
    entry.refs++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      entry!.refs--;
      this.trim();
    };
    try {
      const opened = await entry.task;
      if (this.closed) throw new Error("PDF reader is closed.");
      this.library.session.assert();
      return { doc: opened.doc, release };
    } catch (e) {
      release();
      if (this.entries.get(id) === entry) this.entries.delete(id);
      throw e;
    }
  }
  private trim() {
    for (const [id, entry] of this.entries) {
      if (this.entries.size <= 2) break;
      if (!entry.refs) {
        this.entries.delete(id);
        void entry.task.then((o) => o.close()).catch(() => {});
      }
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.library.session.signal.removeEventListener("abort", this.abort);
    for (const entry of this.entries.values())
      void entry.task.then((o) => o.close()).catch(() => {});
    this.entries.clear();
  }
}
