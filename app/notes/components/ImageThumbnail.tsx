"use client";
import { useEffect, useRef, useState } from "react";
import type { NotesLibrary } from "@/lib/notes/library";
import s from "../Notes.module.css";

/** Authenticated, visible-only preview using the editor's existing asset resolver. */
export default function ImageThumbnail({
  library,
  documentId,
  assetId,
}: {
  library: NotesLibrary;
  documentId: string;
  assetId: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false),
    [url, setURL] = useState("");
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { rootMargin: "100px" }
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const resolver = library.imageResolver(documentId);
    void resolver
      .resolve(`sylf-asset:${assetId}`)
      .then((value) => {
        if (!cancelled) setURL(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      resolver.close();
    };
  }, [library, documentId, assetId, visible]);
  return (
    <span ref={host} className={s.imagePreview}>
      {/* Blob URLs belong to the authenticated resolver and cannot use the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" />}
    </span>
  );
}
