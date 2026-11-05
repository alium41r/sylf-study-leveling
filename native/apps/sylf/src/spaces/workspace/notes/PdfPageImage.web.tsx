// One PDF page as pixels, under its ink. Rendered by pdf.js at the size it is shown (capped), and again after zoom settles.
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { NotesLibrary } from "@sylf/notes";
import { openPdfSource, type PdfSource } from "./pdf-engine.web";

export interface PdfPageImageProps { library: NotesLibrary; hash: string; index: number; width: number; height: number }

export default function PdfPageImage({ library, hash, index, width, height }: PdfPageImageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<PdfSource | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const opened = openPdfSource(hash, () => library.asset(hash));
    setSource(opened);
    return () => opened.release();
  }, [hash, library]);
  useEffect(() => {
    if (!source || !canvas.current) return;
    const pixels = Math.min(2400, Math.round(width * Math.min(2, window.devicePixelRatio || 1)));
    let live = true;
    const timer = setTimeout(() => { void source.render(index, canvas.current!, pixels).then(() => { if (live) setFailed(false); }, () => { if (live) setFailed(true); }); }, canvas.current.width ? 140 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [source, index, width]);
  return (
    <View style={{ position: "absolute", left: 0, top: 0, width, height, backgroundColor: "#ffffff" }} aria-hidden>
      <canvas ref={canvas} style={{ width, height, display: failed ? "none" : "block" }} />
    </View>
  );
}
