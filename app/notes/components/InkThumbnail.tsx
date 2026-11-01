"use client";
import { useEffect, useRef, useState } from "react";
import type { NotesLibrary, NoteSummary } from "@/lib/notes/library";
import { renderNotesPagePreview } from "@/lib/notes/drive-pdf";
import { readNoteStyle } from "@/lib/notes/note-style";
import s from "../Ink.module.css";
let thumbnails = Promise.resolve();
/** Visible-only, serialized previews. No persistent bitmap or second document store. */
export default function InkThumbnail({
  library,
  note,
  pageId,
  size = 96,
  preview,
}: {
  library: NotesLibrary;
  note: NoteSummary;
  pageId: string;
  size?: number;
  preview?: string;
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
      const page = note.view.descriptor.pages.find((p) => p.pageId === pageId);
      if (!page) return;
      const style = readNoteStyle(page.extensions.noteStyle);
      const height = Math.min(page.height, style.height);
      node.width = size * 2;
      node.height = Math.ceil((size * height) / page.width) * 2;
      node.style.width = `${size}px`;
      node.style.height = `${(size * height) / page.width}px`;
      await renderNotesPagePreview(
        library.repository,
        note.id,
        pageId,
        node,
        note.view
      );
      if (!cancelled) setFailed(false);
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
      {preview && failed && <p className={s.thumbnailText}>{preview}</p>}
      {failed && <small>Preview unavailable</small>}
    </span>
  );
}
