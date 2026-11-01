"use client";
import { useEffect, useState } from "react";
import type { NotesLibrary } from "@/lib/notes/library";
export default function PageImage({
  library,
  documentId,
  assetId,
  background = false,
}: {
  library: NotesLibrary;
  documentId: string;
  assetId: string;
  background?: boolean;
}) {
  const [url, setURL] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let stopped = false;
    const resolver = library.imageResolver(documentId);
    void resolver
      .resolve("sylf-asset:" + assetId)
      .then((url) => {
        if (!stopped) setURL(url);
      })
      .catch(() => {
        if (!stopped) setFailed(true);
      });
    return () => {
      stopped = true;
      resolver.close();
    };
  }, [library, documentId, assetId]);
  // Authenticated encrypted assets resolve to disposable object URLs; Next's public-image service cannot read them.
  /* eslint-disable @next/next/no-img-element -- Encrypted assets require disposable authenticated object URLs. */
  return url ? (
    <img
      src={url}
      alt={background ? "" : "Note image"}
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit: background ? "cover" : "contain",
        display: "block",
        pointerEvents: "none",
      }}
    />
  ) : failed ? (
    <small role="status">
      Image unavailable. Original attachment is retained.
    </small>
  ) : null;
}
