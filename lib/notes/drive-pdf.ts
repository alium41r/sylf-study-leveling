import type { SearchTextRun } from "./pdf-search-text";
import { PageBoxes } from "./text-boxes";
import { readNoteStyle, notebookPrintSize } from "./note-style";
import { inkStrokeSegments, inkOpacity } from "./ink-geometry";
import { pageTextOrigin } from "./page-layers";
import type { NotesRepository } from "./repository";
import type { DocumentView } from "./contracts";
import { isDarkColor } from "@/lib/color-utils";
import { NotesError } from "./errors";
import { InkModel, type InkPaper, type InkStroke } from "./ink";
import { drawPaper, inkOutline } from "./ink-renderer";

export const DRIVE_PDF_LIMITS = {
  characters: 200_000,
  pages: 200,
  rasterBytes: 64 * 1024 * 1024,
};
type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string;
};
type Block = {
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: Block[];
};
function fail(message: string): never {
  throw new NotesError(
    "UNSUPPORTED",
    message + " Editable originals and history are retained."
  );
}
const palette: Record<string, string> = {
  gray: "#666666",
  brown: "#795548",
  red: "#b42318",
  orange: "#a84500",
  yellow: "#786000",
  green: "#16703b",
  blue: "#175cd3",
  purple: "#6941c6",
  pink: "#b42378",
};
const printColor = (value: unknown) =>
  typeof value === "string"
    ? palette[value] || (/^#[0-9a-f]{6}$/i.test(value) ? value : "#17202a")
    : "#17202a";
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Browser-shaped visual pages plus aligned Unicode search/copy text. No external
 * requests or editor writes; native editable content remains the authority. */
export async function renderDrivePdf(
  repository: NotesRepository,
  documentId: string
) {
  repository.session.assert();
  if (typeof document === "undefined")
    fail("PDF copies need a supported browser.");
  const view = await repository.document(documentId);
  if (view.state !== "active")
    fail("Resolve or restore this note before creating its PDF copy.");
  if (
    view.descriptor.kind === "pdf" ||
    view.descriptor.streams.every((s) => s.adapter === "sylf-ink/1")
  )
    return (await import("./pdf-export")).renderPagedPdf(
      repository,
      documentId
    );
  if (
    !view.descriptor.streams.every((s) =>
      ["blocknote/0.56.0", "sylf-ink/1"].includes(s.adapter)
    )
  )
    fail("This note contains a format that cannot yet be rendered as PDF.");
  return renderRichTextPdf(repository, view);
}

const PREVIEW_DONE = Symbol("notes-preview-complete");
/** A bounded, visible-only derivative of the same page renderer used for print. */
export async function renderNotesPagePreview(
  repository: NotesRepository,
  documentId: string,
  pageId: string,
  canvas: HTMLCanvasElement,
  retainedView?: DocumentView
) {
  const view = retainedView || (await repository.document(documentId));
  try {
    await renderRichTextPdf(repository, view, { pageId, canvas });
  } catch (error) {
    if (error !== PREVIEW_DONE) throw error;
  }
}

async function renderRichTextPdf(
  repository: NotesRepository,
  view: DocumentView,
  preview?: { pageId: string; canvas: HTMLCanvasElement }
) {
  const [
    { BlockNoteEditor },
    { yDocToBlocks },
    { PDFDocument },
    { PdfSearchText },
  ] = await Promise.all([
    import("@blocknote/core"),
    import("@blocknote/core/yjs"),
    import("pdf-lib"),
    import("./pdf-search-text"),
  ]);
  await document.fonts?.ready;
  repository.session.assert();
  const output = await PDFDocument.create(),
    canvas = document.createElement("canvas");
  output.setTitle(view.descriptor.title);
  output.setCreator("Sylf Notes");
  output.setProducer("Sylf Notes readable study copy");
  output.setCreationDate(new Date("2000-01-01T00:00:00Z"));
  output.setModificationDate(new Date("2000-01-01T00:00:00Z"));
  const layered = view.descriptor.streams.some(
    (s) => s.adapter === "sylf-ink/1"
  );
  const searchText = preview ? undefined : new PdfSearchText(output);
  let searchRuns: SearchTextRun[] = [];
  let tileTop = 0,
    tileHeight = 1123;
  let pagePaper: InkPaper | undefined,
    pageStrokes: InkStroke[] = [];
  let width = 794,
    height = 1123,
    textTop = 56;
  let margin = layered ? 64 : 48;
  let scale = preview ? 0.5 : 2;
  let textWidth: number | undefined,
    sheetHeight: number | undefined,
    background: ImageBitmap | undefined;
  const fontFamily =
    getComputedStyle(document.body).fontFamily || "Arial, sans-serif";
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(
    (preview ? Math.min(height, sheetHeight || 1100) : height) * scale
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) fail("The browser could not allocate a PDF print page.");
  let y = margin,
    pageCount = 0,
    rasterBytes = 0,
    characters = 0,
    blocks = 0,
    dirty = false;
  const begin = () => {
    searchRuns = [];
    ctx.setTransform(scale, 0, 0, scale, 0, -tileTop * scale);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, tileTop, width, tileHeight);
    if (pagePaper) {
      ctx.fillStyle = pagePaper.color;
      ctx.fillRect(0, tileTop, width, tileHeight);
      drawPaper(
        ctx,
        pagePaper,
        width,
        preview ? Math.min(height, sheetHeight || 1100) : height
      );
    }
    if (background) {
      const ratio = Math.max(
        width / background.width,
        height / background.height
      );
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.drawImage(
        background,
        (width - background.width * ratio) / 2,
        (height - background.height * ratio) / 2,
        background.width * ratio,
        background.height * ratio
      );
      ctx.restore();
    }
    y = layered ? textTop : margin;
    dirty = false;
  };
  const savePage = async () => {
    repository.session.assert();
    let previewStroke = 0;
    for (const stroke of pageStrokes) {
      if (
        stroke.bounds.y + stroke.bounds.height < tileTop ||
        stroke.bounds.y > tileTop + tileHeight
      )
        continue;
      if (preview && ++previewStroke % 100 === 0) await pause();
      for (const segment of inkStrokeSegments(stroke)) {
        const outline = inkOutline(segment, stroke.style),
          path = new Path2D();
        if (!outline.length) continue;
        path.moveTo(outline[0][0], outline[0][1]);
        for (let i = 1; i < outline.length; i++) {
          const p = outline[i],
            n = outline[(i + 1) % outline.length];
          path.quadraticCurveTo(
            p[0],
            p[1],
            (p[0] + n[0]) / 2,
            (p[1] + n[1]) / 2
          );
        }
        path.closePath();
        ctx.fillStyle = stroke.style.color;
        ctx.globalAlpha = inkOpacity(stroke.style);
        ctx.fill(path);
      }
    }
    ctx.globalAlpha = 1;
    if (preview) {
      const target = preview.canvas,
        context = target.getContext("2d");
      if (!context) fail("Preview canvas is unavailable.");
      context.clearRect(0, 0, target.width, target.height);
      const visibleHeight = Math.min(height, sheetHeight || 1100);
      context.drawImage(
        canvas,
        0,
        0,
        canvas.width,
        visibleHeight * scale,
        0,
        0,
        target.width,
        target.height
      );
      throw PREVIEW_DONE;
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(
                new Error("PDF print page failed; originals are retained.")
              ),
        "image/png"
      )
    );
    rasterBytes += blob.size;
    if (rasterBytes > DRIVE_PDF_LIMITS.rasterBytes)
      fail("The PDF copy exceeds its image budget.");
    const image = await output.embedPng(await blob.arrayBuffer());
    if (++pageCount > DRIVE_PDF_LIMITS.pages)
      fail("The PDF copy exceeds its page budget.");
    const pdfPage = output.addPage(
      layered ? notebookPrintSize(width, tileHeight) : [595.28, 841.89]
    );
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: pdfPage.getWidth(),
      height: pdfPage.getHeight(),
    });
    searchText?.add(
      pdfPage,
      searchRuns,
      width,
      layered ? tileHeight : height,
      tileTop
    );
    repository.session.assert();
    begin();
    await pause();
  };
  const space = async (needed: number) => {
    if (needed > height - (layered ? textTop + 64 : margin * 2))
      fail("A table row is too tall for the PDF copy.");
    if (y + needed > height - (layered ? 0 : margin)) {
      if (layered)
        fail(
          "Text extends beyond the saved page. Finish saving the note before exporting."
        );
      else await savePage();
    }
  };
  const font = (run: Run, size: number) =>
    `${run.italic ? "italic " : ""}${run.bold ? "bold " : ""}${size}px ${run.code ? "monospace" : fontFamily}`;
  const runs = (content: unknown, base: Partial<Run> = {}): Run[] => {
    if (typeof content === "string") return [{ ...base, text: content }];
    if (content === undefined) return [];
    if (!Array.isArray(content))
      return fail("An inline element cannot yet be rendered as PDF.");
    return content.flatMap((entry: Record<string, unknown>) => {
      if (entry.type === "link")
        return runs(entry.content, {
          ...base,
          underline: true,
          color: "#175cd3",
        });
      if (entry.type !== "text" || typeof entry.text !== "string")
        return fail("An inline element cannot yet be rendered as PDF.");
      const s = (entry.styles || {}) as Record<string, unknown>;
      return [
        {
          ...base,
          text: entry.text,
          bold: !!s.bold || base.bold,
          italic: !!s.italic || base.italic,
          underline: !!s.underline || base.underline,
          strike: !!s.strike,
          code: !!s.code || base.code,
          color: printColor(s.textColor || base.color),
        },
      ];
    });
  };
  type Line = { run: Run; x: number; width: number }[];
  let lineCache: Line[][] = [],
    lineCursor = 0;
  const lines = (input: Run[], size: number, available: number) => {
    const key = lineCursor++;
    if (layered && lineCache[key]) return lineCache[key];
    const result: Line[] = [[]];
    let x = 0;
    for (const run of input) {
      characters += run.text.length;
      if (characters > DRIVE_PDF_LIMITS.characters)
        fail("The PDF copy exceeds its text budget.");
      ctx.font = font(run, size);
      for (const token of run.text.match(/\n|[^\S\n]+|[^\s]+/gu) || []) {
        if (token === "\n") {
          result.push([]);
          x = 0;
          continue;
        }
        const tw = ctx.measureText(token).width;
        if (x && x + tw > available) {
          result.push([]);
          x = 0;
        }
        if (tw <= available) {
          result.at(-1)!.push({ run: { ...run, text: token }, x, width: tw });
          x += tw;
        } else
          for (const char of token) {
            const cw = ctx.measureText(char).width;
            if (x && x + cw > available) {
              result.push([]);
              x = 0;
            }
            result.at(-1)!.push({ run: { ...run, text: char }, x, width: cw });
            x += cw;
          }
      }
    }
    if (layered) lineCache[key] = result;
    return result;
  };
  const draw = (line: Line, x: number, top: number, size: number) => {
    for (const item of line) {
      const run = item.run;
      ctx.font = font(run, size);
      ctx.fillStyle = run.color || "#17202a";
      ctx.textBaseline = "top";
      ctx.fillText(run.text, x + item.x, top);
      if (!preview)
        searchRuns.push({
          text: run.text,
          x: x + item.x,
          top,
          size,
          width: item.width,
        });
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      for (const offset of [
        run.underline ? size * 1.08 : 0,
        run.strike ? size * 0.55 : 0,
      ])
        if (offset) {
          ctx.beginPath();
          ctx.moveTo(x + item.x, top + offset);
          ctx.lineTo(x + item.x + item.width, top + offset);
          ctx.stroke();
        }
    }
    dirty = true;
  };
  const paragraph = async (
    input: Run[],
    size = 16,
    indent = 0,
    align: unknown = "left"
  ) => {
    const available =
      (textWidth ?? width - margin - (layered ? 64 : margin)) - indent;
    for (const line of lines(input, size, available)) {
      await space(size * 1.8);
      const used = line.reduce((n, item) => n + item.width, 0);
      draw(
        line,
        margin +
          indent +
          (align === "center"
            ? (available - used) / 2
            : align === "right"
              ? available - used
              : 0),
        y,
        size
      );
      y += size * 1.8;
    }
    y += 4;
  };
  const render = async (input: Block[], depth = 0) => {
    if (depth > 24) fail("The PDF copy exceeds its nesting budget.");
    let number = 0;
    for (const block of input) {
      if (preview && y > (sheetHeight || 1100)) return;
      repository.session.assert();
      if (!tileTop && ++blocks > 20_000)
        fail("The PDF copy exceeds its block budget.");
      const p = block.props || {},
        indent = depth * 20,
        base = {
          color:
            (!p.textColor || p.textColor === "default") &&
            pagePaper &&
            isDarkColor(pagePaper.color)
              ? "#f5f5f5"
              : printColor(p.textColor),
        };
      if (block.type !== "numberedListItem") number = 0;
      if (block.type === "image") {
        const asset = view.descriptor.assets.find(
          (a) => `sylf-asset:${a.assetId}` === p.url
        );
        if (!asset || !/^image\/(png|jpeg|webp)$/.test(asset.mediaType))
          fail(
            "An image needs recovery or a supported image format for its PDF copy."
          );
        const bytes = await repository.readContent(asset.content),
          bitmap = await createImageBitmap(
            new Blob([bytes.slice().buffer], { type: asset.mediaType })
          );
        try {
          if (bitmap.width * bitmap.height > 32_000_000)
            fail("An image exceeds the PDF copy's pixel budget.");
          const ratio = Math.min(
            Number(p.previewWidth || bitmap.width) / bitmap.width,
            ((textWidth ?? width - margin - (layered ? 64 : margin)) - indent) /
              bitmap.width,
            (height - (layered ? textTop + 64 : margin * 2) - 40) /
              bitmap.height
          );
          const w = bitmap.width * ratio,
            h = bitmap.height * ratio;
          await space(h + 8);
          ctx.drawImage(bitmap, margin + indent, y, w, h);
          y += h + 8;
          dirty = true;
        } finally {
          bitmap.close();
        }
        if (p.caption)
          await paragraph(
            [{ text: String(p.caption), italic: true }],
            14,
            indent
          );
      } else if (block.type === "table") {
        const table = block.content as { rows?: { cells: unknown[] }[] };
        if (
          !table?.rows ||
          table.rows.some(
            (r) =>
              !Array.isArray(r.cells) || !r.cells.length || r.cells.length > 20
          )
        )
          fail("This table cannot yet be rendered as PDF.");
        for (const row of table.rows) {
          const cellWidth =
            ((textWidth ?? width - margin - (layered ? 64 : margin)) - indent) /
            row.cells.length;
          const cells = row.cells.map((c) => {
            const cell = c as {
              type?: string;
              content?: unknown;
              props?: { colspan?: number; rowspan?: number };
            };
            if (
              (cell.props?.colspan || 1) !== 1 ||
              (cell.props?.rowspan || 1) !== 1
            )
              fail("Merged table cells need the editable original.");
            return lines(
              runs(cell.type === "tableCell" ? cell.content : c, base),
              14,
              cellWidth - 12
            );
          });
          const rowHeight = Math.max(...cells.map((c) => c.length)) * 21 + 12;
          await space(rowHeight);
          cells.forEach((cell, col) => {
            ctx.strokeStyle = "#9aa3af";
            ctx.lineWidth = 0.75;
            ctx.strokeRect(
              margin + indent + col * cellWidth,
              y,
              cellWidth,
              rowHeight
            );
            cell.forEach((line, i) =>
              draw(
                line,
                margin + indent + col * cellWidth + 6,
                y + 6 + i * 21,
                14
              )
            );
          });
          y += rowHeight;
        }
        y += 8;
      } else if (block.type === "divider") {
        await space(16);
        ctx.strokeStyle = "#9aa3af";
        ctx.beginPath();
        ctx.moveTo(margin + indent, y + 6);
        ctx.lineTo(width - margin, y + 6);
        ctx.stroke();
        y += 16;
        dirty = true;
      } else if (
        [
          "paragraph",
          "heading",
          "bulletListItem",
          "numberedListItem",
          "checkListItem",
          "codeBlock",
          "quote",
          "toggleListItem",
        ].includes(block.type)
      ) {
        const prefix =
          block.type === "bulletListItem"
            ? "• "
            : block.type === "numberedListItem"
              ? `${++number}. `
              : block.type === "checkListItem"
                ? p.checked
                  ? "☑ "
                  : "☐ "
                : block.type === "quote"
                  ? "│ "
                  : "";
        const content = runs(block.content, {
          ...base,
          bold: block.type === "heading",
          code: block.type === "codeBlock",
        });
        if (prefix) content.unshift({ text: prefix, ...base });
        await paragraph(
          content,
          block.type === "heading"
            ? Math.max(18, 30 - Number(p.level || 1) * 3)
            : 16,
          indent,
          p.textAlignment
        );
      } else if (["file", "audio", "video"].includes(block.type)) {
        await paragraph(
          [
            {
              text: `[${block.type}: ${String(p.name || p.url || "attachment")}]`,
              ...base,
            },
          ],
          16,
          indent
        );
        if (p.caption)
          await paragraph([{ text: String(p.caption), ...base }], 14, indent);
      } else fail(`The ${block.type} block cannot yet be rendered as PDF.`);
      if (block.children?.length) await render(block.children, depth + 1);
      if (blocks % 32 === 0) await pause();
    }
  };
  const bitmapFor = async (assetId: string) => {
    const asset = view.descriptor.assets.find((a) => a.assetId === assetId);
    if (!asset || !/^image\/(png|jpeg|webp|gif)$/.test(asset.mediaType))
      fail("A page image is unavailable.");
    const bytes = await repository.readContent(asset.content);
    const bitmap = await createImageBitmap(
      new Blob([bytes.slice().buffer], { type: asset.mediaType })
    );
    if (bitmap.width * bitmap.height > 32000000) {
      bitmap.close();
      fail("A page image exceeds its pixel budget.");
    }
    return bitmap;
  };
  const editor = BlockNoteEditor.create();
  try {
    begin();
    if (!layered)
      await paragraph([{ text: view.descriptor.title, bold: true }], 28);
    const entries = view.descriptor.pages.length
      ? view.descriptor.pages
          .filter(
            (p) =>
              !p.extensions.archived &&
              (!preview || p.pageId === preview.pageId)
          )
          .map((page) => ({
            page,
            text: view.descriptor.streams.find(
              (s) =>
                s.streamId ===
                  (page.extensions.textStreamId || page.streamId) &&
                s.adapter === "blocknote/0.56.0"
            ),
            ink: view.descriptor.streams.find(
              (s) =>
                s.streamId === (page.extensions.inkStreamId || page.streamId) &&
                s.adapter === "sylf-ink/1"
            ),
          }))
      : view.descriptor.streams
          .filter((s) => s.adapter === "blocknote/0.56.0")
          .map((text) => ({ page: undefined, text, ink: undefined }));
    for (const entry of entries) {
      if (layered && entry.page) {
        const page = entry.page;
        width = page.width;
        height = page.height;
        const style = readNoteStyle(
          page.extensions.noteStyle || view.descriptor.extensions.noteStyle
        );
        // Printed sheets stay bounded even when the authored notebook scrolls continuously.
        sheetHeight = style.height;
        textWidth = undefined;
        background?.close();
        background = undefined;
        const backgroundAsset = view.descriptor.assets.find(
          (a) => a.assetId === page.extensions.backgroundAssetId
        );
        if (backgroundAsset)
          background = await bitmapFor(backgroundAsset.assetId);
        const origin = pageTextOrigin(page);
        margin = origin.x;
        textTop = origin.y;
        scale = preview
          ? Math.min(
              0.5,
              Math.sqrt(4_000_000 / (width * Math.min(height, sheetHeight)))
            )
          : Math.min(2, Math.sqrt(32_000_000 / (width * sheetHeight)));
        const inkStream = entry.ink;
        pagePaper = undefined;
        pageStrokes = [];
        if (inkStream) {
          const inkSource = await repository.loadStream(
            view.descriptor.documentId,
            inkStream.streamId,
            inkStream.epoch,
            view.heads
          );
          const ink = new InkModel(inkSource.doc, () => false);
          try {
            pagePaper = ink.paper();
            pageStrokes = ink.strokes();
          } finally {
            ink.close();
            inkSource.doc.destroy();
          }
        }
      }
      const stream = entry.text;
      const textLoaded = stream
        ? await repository.loadStream(
            view.descriptor.documentId,
            stream.streamId,
            stream.epoch,
            view.heads
          )
        : undefined;
      let pageCharacters = characters,
        pageBlocks = blocks;
      lineCache = [];
      const projectedBlocks = new Map<string, Block[]>();
      const tiles = layered ? Math.ceil(height / (sheetHeight || height)) : 1;
      try {
        for (let tile = 0; tile < tiles; tile++) {
          tileTop = layered ? tile * (sheetHeight || height) : 0;
          tileHeight = layered ? sheetHeight || height : height;
          if (preview) tileHeight = Math.min(height, sheetHeight || 1100);
          canvas.width = Math.ceil(width * scale);
          canvas.height = Math.ceil(tileHeight * scale);
          characters = pageCharacters;
          blocks = pageBlocks;
          lineCursor = 0;
          begin();
          if (textLoaded) {
            const loaded = textLoaded;
            if (entry.page) {
              const regions = new PageBoxes(
                loaded.doc,
                entry.page,
                () => false
              );
              try {
                for (const box of regions.boxes()) {
                  if (
                    (preview && box.y > tileTop + tileHeight) ||
                    (box.kind === "image" && box.y + box.height < tileTop)
                  )
                    continue;
                  margin = box.x;
                  textWidth = box.width;
                  textTop = box.y;
                  y = box.y;
                  if (box.kind === "image" && box.assetId) {
                    const bitmap = await bitmapFor(box.assetId);
                    try {
                      ctx.drawImage(
                        bitmap,
                        box.x,
                        box.y,
                        box.width,
                        box.height
                      );
                      dirty = true;
                    } finally {
                      bitmap.close();
                    }
                  } else {
                    if (!projectedBlocks.has(box.id))
                      projectedBlocks.set(
                        box.id,
                        yDocToBlocks(
                          editor,
                          loaded.doc,
                          box.id
                        ) as unknown as Block[]
                      );
                    await render(projectedBlocks.get(box.id)!);
                  }
                }
              } finally {
                regions.close();
              }
            } else
              await render(
                yDocToBlocks(editor, loaded.doc, "body") as unknown as Block[]
              );
          }
          if (layered || dirty || !pageCount) await savePage();
          if (tile === 0) {
            pageCharacters = characters;
            pageBlocks = blocks;
          }
          if (preview) break;
        }
      } finally {
        textLoaded?.doc.destroy();
      }
    }
    repository.session.assert();
    searchText?.finish();
    return await output.save();
  } finally {
    editor._tiptapEditor.destroy();
    background?.close();
    canvas.width = canvas.height = 1;
  }
}
