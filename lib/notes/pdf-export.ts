import type { NotesLibrary } from "./library";
import { InkModel } from "./ink";
import { PdfMarkup, pdfPageMaps, PDF_LIMITS, type PdfMark } from "./pdf";
import type { PdfExportJob } from "./pdf-export-core";
import type { NotesRepository } from "./repository";
import type { SearchTextRun } from "./pdf-search-text";

export function textAnnotationImage(
  mark: PdfMark,
  text?: SearchTextRun[]
): Promise<Uint8Array> {
  const r = mark.rects[0],
    scale = Math.min(3, Math.sqrt(2000000 / (r.width * r.height))),
    canvas = document.createElement("canvas");
  canvas.width = Math.ceil(r.width * scale);
  canvas.height = Math.ceil(r.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  if (mark.kind === "comment") {
    ctx.fillStyle = "#fff1b8";
    ctx.fillRect(0, 0, r.width, r.height);
  }
  ctx.fillStyle = mark.color;
  ctx.font = `${mark.size}px Arial, sans-serif`;
  ctx.textBaseline = "top";
  const lines = wrapPdfText(ctx, mark.text, r.width - 12);
  if (lines.length * mark.size * 1.25 > r.height - 12)
    throw new Error(
      "A text annotation is too small to export its full text. Edit or shorten it; the source is retained."
    );
  lines.forEach((line, i) => ctx.fillText(line, 6, 6 + i * mark.size * 1.25));
  if (text)
    lines.forEach((line, i) =>
      text.push({
        text: line,
        x: r.x + 6,
        top: r.y + 6 + i * mark.size * 1.25,
        size: mark.size,
        width: ctx.measureText(line).width,
      })
    );
  return new Promise((resolve, reject) =>
    canvas.toBlob(async (blob) => {
      try {
        if (!blob) throw new Error("Text annotation rendering failed");
        resolve(new Uint8Array(await blob.arrayBuffer()));
      } catch (e) {
        reject(e);
      } finally {
        canvas.width = canvas.height = 1;
      }
    }, "image/png")
  );
}
export function wrapPdfText(
  ctx: Pick<CanvasRenderingContext2D, "measureText">,
  text: string,
  width: number
) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const token of paragraph.match(/\S+|\s+/gu) || []) {
      if (!token.trim()) {
        if (line) line += token;
        continue;
      }
      if (line && ctx.measureText(line + token).width > width) {
        lines.push(line.trimEnd());
        line = "";
      }
      for (const char of token) {
        if (line && ctx.measureText(line + char).width > width) {
          lines.push(line.trimEnd());
          line = "";
        }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
export async function exportAnnotatedPdf(
  library: NotesLibrary,
  documentId: string,
  progress?: (page: number, total: number) => void
) {
  await library.flushEditors();
  return renderPagedPdf(library.repository, documentId, progress);
}
/** Read only a durable snapshot; background publication never flushes or mounts an editor. */
export async function renderPagedPdf(
  repository: NotesRepository,
  documentId: string,
  progress?: (page: number, total: number) => void
) {
  repository.session.assert();
  const view = await repository.document(documentId);
  if (
    view.state !== "active" ||
    !["pdf", "notebook"].includes(view.descriptor.kind)
  )
    throw new Error(
      "Resolve or restore this document before exporting a study copy."
    );
  const d = view.descriptor,
    pages = d.pages.filter((p) => !p.extensions.archived),
    needed = new Set(
      pages.flatMap((p) => (p.originalAssetId ? [p.originalAssetId] : []))
    );
  const assets = d.assets.filter((a) => needed.has(a.assetId));
  if (
    assets.reduce((n, a) => n + a.content.size, 0) >
    PDF_LIMITS.exportSourceBytes
  )
    throw new Error(
      "PDF source budget exceeded. Export the editable Sylf archive."
    );
  const job: PdfExportJob = { title: d.title, assets: [], pages: [] };
  for (const asset of assets) {
    job.assets.push({
      id: asset.assetId,
      bytes: await repository.readContent(asset.content),
    });
    repository.session.assert();
  }
  let sampleBudget = 0,
    markBudget = 0,
    textPixelBudget = 0;
  for (const page of pages) {
    const definition = d.streams.find((s) => s.streamId === page.streamId)!;
    if (!["sylf-pdf/1", "sylf-ink/1"].includes(definition.adapter))
      throw new Error(
        "This page needs its original editor for a PDF copy. The editable archive is retained."
      );
    const loaded = await repository.loadStream(
      documentId,
      page.streamId,
      definition.epoch,
      view.heads
    );
    let ink: InkModel | undefined, markup: PdfMarkup | undefined;
    try {
      ink = new InkModel(
        loaded.doc,
        () => false,
        definition.adapter === "sylf-pdf/1"
          ? pdfPageMaps(loaded.doc).ink
          : undefined
      );
      if (definition.adapter === "sylf-pdf/1")
        markup = new PdfMarkup(loaded.doc, () => false);
      const marks = markup?.marks() || [],
        strokes = ink.strokes(),
        textImages = [];
      sampleBudget += strokes.reduce((n, s) => n + s.points.length, 0);
      markBudget += marks.length;
      for (const mark of marks)
        if (mark.kind === "text" || mark.kind === "comment") {
          const r = mark.rects[0];
          textPixelBudget += Math.min(2_000_000, r.width * r.height * 9);
        }
      if (
        sampleBudget > PDF_LIMITS.exportSamples ||
        markBudget > PDF_LIMITS.exportMarks ||
        textPixelBudget > PDF_LIMITS.exportTextPixels
      )
        throw new Error(
          "This PDF study copy exceeds its export annotation budget. Export the editable Sylf archive instead; original history is retained."
        );
      for (const m of marks)
        if (m.kind === "text" || m.kind === "comment") {
          const text: SearchTextRun[] = [];
          textImages.push({
            target: m.target,
            bytes: await textAnnotationImage(m, text),
            text,
          });
          repository.session.assert();
        }
      job.pages.push({
        page,
        strokes,
        paper: ink.paper(),
        marks,
        textImages,
      });
    } finally {
      ink?.close();
      markup?.close();
      loaded.doc.destroy();
    }
    repository.session.assert();
    await new Promise((r) => setTimeout(r, 0));
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    repository.session.assert();
    const worker = new Worker(
      new URL("./pdf-export.worker.ts", import.meta.url),
      { type: "module" }
    );
    const close = () => {
      worker.terminate();
      repository.session.signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      close();
      reject(new Error("Notes access ended. The PDF export was cancelled."));
    };
    repository.session.signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event) => {
      try {
        repository.session.assert();
        if (event.data.progress)
          progress?.(event.data.progress.page, event.data.progress.total);
        else if (event.data.error) {
          close();
          reject(new Error(event.data.error));
        } else {
          close();
          resolve(event.data.bytes);
        }
      } catch (e) {
        close();
        reject(e);
      }
    };
    worker.onerror = () => {
      close();
      reject(
        new Error(
          "PDF export could not finish. Your editable originals are retained."
        )
      );
    };
    worker.postMessage(job);
  });
}
