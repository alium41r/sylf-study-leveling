import {
  PDFDocument,
  rgb,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  rectangle,
  clip,
  endPath,
  PDFPage,
  PDFArray,
  PDFDict,
  PDFName,
} from "pdf-lib";
import {
  inverseMatrix,
  pdfMatrix,
  pdfRotation,
  PDF_LIMITS,
  type NotesPage,
  type PdfMark,
} from "./pdf";
import { inkStrokeSegments, inkOpacity } from "./ink-geometry";
import {
  inkOutline,
  outlineSvg,
  paperGeometry,
  paperLabelColor,
} from "./ink-outline";
export { outlineSvg };
import type { InkStroke, InkPaper } from "./ink";
import { PdfSearchText, type SearchTextRun } from "./pdf-search-text";
export interface PdfExportPage {
  page: NotesPage;
  strokes: InkStroke[];
  paper: InkPaper;
  marks: PdfMark[];
  textImages: { target: string; bytes: Uint8Array; text?: SearchTextRun[] }[];
}
export interface PdfExportJob {
  title: string;
  assets: { id: string; bytes: Uint8Array }[];
  pages: PdfExportPage[];
}
const color = (hex: string) =>
  rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  );
/** New study copy only. Input assets are immutable; no encryption bypass or source overwrite. */
export async function buildAnnotatedPdf(
  job: PdfExportJob,
  progress?: (page: number, total: number) => void
) {
  if (
    !job.pages.length ||
    job.pages.length > PDF_LIMITS.documentPages ||
    job.assets.reduce((n, a) => n + a.bytes.length, 0) >
      PDF_LIMITS.exportSourceBytes
  )
    throw new Error(
      "PDF export exceeds its bounded source/page budget. Export the editable Sylf archive instead."
    );
  const output = await PDFDocument.create(),
    sources = new Map<string, PDFDocument>();
  const search = new PdfSearchText(output);
  output.setTitle(job.title);
  output.setProducer("Sylf Notes study copy");
  output.setCreator("Sylf Notes");
  output.setCreationDate(new Date("2000-01-01T00:00:00Z"));
  output.setModificationDate(new Date("2000-01-01T00:00:00Z"));
  for (const asset of job.assets)
    sources.set(
      asset.id,
      await PDFDocument.load(asset.bytes, { updateMetadata: false })
    );
  // Copy shared fonts/images once per source, then give each logical page its
  // own content array. Duplicate study pages must not share annotation writes.
  const templates = new Map<string, Map<number, PDFPage>>();
  for (const [id, source] of sources) {
    const indices = [
      ...new Set(
        job.pages
          .filter((p) => p.page.originalAssetId === id)
          .map((p) => p.page.sourcePage!)
      ),
    ];
    if (
      indices.some(
        (i) => !Number.isSafeInteger(i) || i < 0 || i >= source.getPageCount()
      )
    )
      throw new Error("An original page index is unavailable.");
    const copies = await output.copyPages(source, indices);
    templates.set(id, new Map(indices.map((n, i) => [n, copies[i]])));
  }
  for (let index = 0; index < job.pages.length; index++) {
    const entry = job.pages[index],
      p = entry.page;
    let page;
    if (p.originalAssetId) {
      const source = sources.get(p.originalAssetId);
      if (
        !source ||
        p.sourcePage === undefined ||
        p.sourcePage >= source.getPageCount()
      )
        throw new Error(
          "An original PDF page is unavailable. No replacement was exported."
        );
      const template = templates.get(p.originalAssetId)!.get(p.sourcePage)!;
      const node = template.node.clone(output.context),
        raw = node.get(PDFName.of("Contents")),
        resolved = raw ? output.context.lookup(raw) : undefined;
      node.set(
        PDFName.of("Contents"),
        output.context.obj(
          resolved instanceof PDFArray
            ? resolved.asArray().slice()
            : raw
              ? [raw]
              : []
        )
      );
      page = PDFPage.of(node, output.context.register(node), output);
      output.addPage(page);
      page.setRotation(degrees(page.getRotation().angle + pdfRotation(p)));
    } else {
      page = output.addPage([p.width, p.height]);
      page.setRotation(degrees(pdfRotation(p)));
    }
    // Preserve appearances but do not carry executable/link/file actions into
    // a newly generated study copy. The untouched original remains available.
    page.node.delete(PDFName.of("AA"));
    for (const ref of page.node.Annots()?.asArray() || []) {
      const annotation = output.context.lookup(ref);
      if (annotation instanceof PDFDict)
        for (const key of [
          "A",
          "AA",
          "FS",
          "RichMediaContent",
          "RichMediaSettings",
        ])
          annotation.delete(PDFName.of(key));
    }
    const m = inverseMatrix(pdfMatrix(p));
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(m[0], m[1], -m[2], -m[3], m[4], m[5]),
      rectangle(0, -p.height, p.width, p.height),
      clip(),
      endPath()
    );
    if (!p.originalAssetId) {
      page.drawRectangle({
        x: 0,
        y: -p.height,
        width: p.width,
        height: p.height,
        color: color(entry.paper.color),
      });
      const geometry = paperGeometry(entry.paper, p.width, p.height);
      for (const [x, y, x2, y2] of geometry.lines)
        page.drawLine({
          start: { x, y: -y },
          end: { x: x2, y: -y2 },
          thickness: 0.65,
          color: color(entry.paper.rule),
        });
      for (const [x, y] of geometry.dots)
        page.drawCircle({
          x,
          y: -y,
          size: 0.9,
          color: color(entry.paper.rule),
        });
      // Template labels are plain Latin; standard Helvetica avoids adding a paid font dependency.
      for (const [text, x, y] of geometry.labels)
        page.drawText(text, {
          x,
          y: -y,
          size: 13,
          color: color(paperLabelColor(entry.paper)),
        });
    }
    for (const stroke of entry.strokes)
      for (const segment of inkStrokeSegments(stroke)) {
        const path = outlineSvg(inkOutline(segment, stroke.style));
        if (path)
          page.drawSvgPath(path, {
            x: 0,
            y: 0,
            color: color(stroke.style.color),
            opacity: inkOpacity(stroke.style),
          });
      }
    for (const mark of entry.marks) {
      if (mark.kind === "text" || mark.kind === "comment") {
        const image = entry.textImages.find((i) => i.target === mark.target);
        if (!image)
          throw new Error(
            "A text annotation could not be rendered. Editable originals are retained."
          );
        const r = mark.rects[0],
          png = await output.embedPng(image.bytes);
        page.drawImage(png, {
          x: r.x,
          y: -r.y - r.height,
          width: r.width,
          height: r.height,
        });
      } else
        for (const r of mark.rects) {
          if (mark.kind === "highlight")
            page.drawRectangle({
              x: r.x,
              y: -r.y - r.height,
              width: r.width,
              height: r.height,
              color: color(mark.color),
              opacity: 0.28,
            });
          else {
            const y =
              mark.kind === "underline" ? r.y + r.height : r.y + r.height * 0.5;
            page.drawLine({
              start: { x: r.x, y: -y },
              end: { x: r.x + r.width, y: -y },
              thickness: Math.max(1, mark.size / 10),
              color: color(mark.color),
            });
          }
        }
    }
    page.pushOperators(popGraphicsState());
    search.add(
      page,
      entry.textImages.flatMap((i) => i.text || []),
      p.width,
      p.height,
      0,
      [m[0], m[1], -m[2], -m[3], m[4], m[5]]
    );
    progress?.(index + 1, job.pages.length);
  }
  search.finish();
  return output.save({ objectsPerTick: 30 });
}
