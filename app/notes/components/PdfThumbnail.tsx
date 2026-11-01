"use client";
import { useEffect, useRef, useState } from "react";
import type { NotesLibrary, NoteSummary } from "@/lib/notes/library";
import { InkModel } from "@/lib/notes/ink";
import { InkRenderer } from "@/lib/notes/ink-renderer";
import {
  PdfMarkup,
  pdfPageMaps,
  displayedPageSize,
  pageRotationMatrix,
  pdfRotation,
} from "@/lib/notes/pdf";
import { PdfDocumentPool } from "@/lib/notes/pdf-reader";
import { textAnnotationImage } from "@/lib/notes/pdf-export";
import s from "../Ink.module.css";
let queue = Promise.resolve();
/** Serialized, visible-only source/history previews. No editor, autosave or stored bitmap. */
export default function PdfThumbnail({
  library,
  note,
  pageId,
  size = 96,
  pool: suppliedPool,
}: {
  library: NotesLibrary;
  note: NoteSummary;
  pageId: string;
  size?: number;
  pool?: PdfDocumentPool;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [visible, setVisible] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => setVisible(e.isIntersecting),
      { rootMargin: "100px" }
    );
    if (canvas.current) observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  const heads = note.view.heads.join(":");
  useEffect(() => {
    const node = canvas.current;
    if (!node || !visible) return;
    let cancelled = false;
    const task = async () => {
      if (cancelled || library.session.signal.aborted) return;
      const page = note.view.descriptor.pages.find((p) => p.pageId === pageId),
        stream = note.view.descriptor.streams.find(
          (s) => s.streamId === page?.streamId
        );
      if (!page || !stream) return;
      const loaded = await library.repository.loadStream(
          note.id,
          stream.streamId,
          stream.epoch,
          note.view.heads
        ),
        pool =
          suppliedPool ||
          new PdfDocumentPool(library, note.view.descriptor.assets);
      let ink: InkModel | undefined,
        markup: PdfMarkup | undefined,
        renderer: InkRenderer | undefined,
        release: (() => void) | undefined;
      try {
        library.session.assert();
        if (cancelled) return;
        ink = new InkModel(
          loaded.doc,
          () => false,
          pdfPageMaps(loaded.doc).ink
        );
        markup = new PdfMarkup(loaded.doc, () => false);
        const displayed = displayedPageSize(page),
          scale = size / displayed.width;
        node.width = Math.ceil(size);
        node.height = Math.ceil(displayed.height * scale);
        node.style.width = `${size}px`;
        node.style.height = `${displayed.height * scale}px`;
        const ctx = node.getContext("2d")!;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, node.width, node.height);
        if (page.originalAssetId) {
          const lease = await pool.acquire(page.originalAssetId);
          release = lease.release;
          const source = await lease.doc.getPage(page.sourcePage! + 1);
          if (cancelled) return;
          await source.render({
            canvas: node,
            canvasContext: ctx,
            viewport: source.getViewport({
              scale,
              rotation: (source.rotate + pdfRotation(page)) % 360,
            }),
          }).promise;
        }
        if (cancelled) return;
        const overlay = document.createElement("canvas"),
          live = document.createElement("canvas");
        renderer = new InkRenderer(
          overlay,
          live,
          page.width,
          page.height,
          !!page.originalAssetId
        );
        renderer.resize(page.width * scale, page.height * scale);
        renderer.viewport = { zoom: scale, x: 0, y: 0 };
        renderer.draw(ink.strokes(), ink.paper());
        const m = pageRotationMatrix(
          page.width,
          page.height,
          pdfRotation(page)
        );
        ctx.save();
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4] * scale, m[5] * scale);
        ctx.drawImage(overlay, 0, 0, page.width * scale, page.height * scale);
        for (const mark of markup.marks()) {
          if (cancelled) return;
          ctx.fillStyle = mark.color;
          ctx.strokeStyle = mark.color;
          for (const r of mark.rects) {
            if (mark.kind === "highlight") {
              ctx.globalAlpha = 0.28;
              ctx.fillRect(
                r.x * scale,
                r.y * scale,
                r.width * scale,
                r.height * scale
              );
              ctx.globalAlpha = 1;
            } else if (mark.kind === "underline" || mark.kind === "strikeout") {
              ctx.beginPath();
              const y =
                mark.kind === "underline"
                  ? r.y + r.height
                  : r.y + r.height * 0.5;
              ctx.moveTo(r.x * scale, y * scale);
              ctx.lineTo((r.x + r.width) * scale, y * scale);
              ctx.stroke();
            } else {
              const bytes = await textAnnotationImage(mark),
                bitmap = await createImageBitmap(
                  new Blob([bytes.slice().buffer], { type: "image/png" })
                );
              if (cancelled) {
                bitmap.close();
                return;
              }
              ctx.drawImage(
                bitmap,
                r.x * scale,
                r.y * scale,
                r.width * scale,
                r.height * scale
              );
              bitmap.close();
            }
          }
        }
        ctx.restore();
        setFailed(false);
      } finally {
        release?.();
        if (!suppliedPool) pool.close();
        renderer?.close();
        ink?.close();
        markup?.close();
        loaded.doc.destroy();
      }
    };
    queue = queue.then(task).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      node.width = node.height = 1;
    };
    // Exact retained heads select source; preview state is disposable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, note.id, pageId, heads, visible, size, suppliedPool]);
  return (
    <span
      className={s.thumbnail}
      style={size !== 96 ? { width: size, height: size * 1.375 } : undefined}
    >
      <canvas
        ref={canvas}
        width={size}
        height={size * 1.375}
        aria-hidden="true"
      />
      {failed && <small>Preview unavailable</small>}
    </span>
  );
}
