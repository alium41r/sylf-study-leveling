"use client";
import { useEffect, useRef, useState } from "react";
import type { NotesLibrary, NoteSummary } from "@/lib/notes/library";
import { InkModel, INK_ADAPTER } from "@/lib/notes/ink";
import { InkRenderer } from "@/lib/notes/ink-renderer";
import s from "../Ink.module.css";
let thumbnails = Promise.resolve();
/** Visible-only, serialized previews. No persistent bitmap or second document store. */
export default function InkThumbnail({
  library,
  note,
  pageId,
  size = 96,
}: {
  library: NotesLibrary;
  note: NoteSummary;
  pageId: string;
  size?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [visible, setVisible] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { rootMargin: "100px" }
    );
    observer.observe(node);
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
      if (stream.adapter !== INK_ADAPTER)
        throw new Error("Use the typed page reader for this preview.");
      const loaded = await library.repository.loadStream(
        note.id,
        stream.streamId,
        stream.epoch,
        note.view.heads
      );
      let model: InkModel | undefined, renderer: InkRenderer | undefined;
      try {
        library.session.assert();
        if (cancelled) return;
        model = new InkModel(loaded.doc, () => false);
        setFailed(false);
        renderer = new InkRenderer(
          node,
          document.createElement("canvas"),
          page.width,
          page.height
        );
        renderer.resize(size, (size * page.height) / page.width);
        renderer.viewport = {
          zoom: size / page.width,
          x: 0,
          y: 0,
        };
        renderer.draw(model.strokes(), model.paper());
      } finally {
        renderer?.releaseCaches();
        model?.close();
        loaded.doc.destroy(); /* Keep only the small final bitmap; geometry is released. */
      }
    };
    thumbnails = thumbnails.then(task).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      node.width = node.height = 1;
    };
    // Immutable heads invalidate the derived bitmap; metadata references alone do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, note.id, pageId, heads, visible, size]);
  return (
    <span
      className={s.thumbnail}
      style={size !== 96 ? { width: size, height: size * 1.375 } : undefined}
    >
      <canvas ref={canvas} width={96} height={132} aria-hidden="true" />
      {failed && <small>Preview unavailable</small>}
    </span>
  );
}
