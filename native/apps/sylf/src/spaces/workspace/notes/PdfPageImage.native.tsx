// One PDF page as pixels on Android, rendered by PdfRenderer to a cached image at the size it is shown (capped), and again when a
// zoom settles. The previous image stays until the new one is ready, so zooming never flashes blank.
import { useEffect, useState } from "react";
import { Image, PixelRatio, View } from "react-native";
import type { NotesLibrary } from "@sylf/notes";
import { ensurePdf } from "./pdf-engine.native";

export interface PdfPageImageProps { library: NotesLibrary; hash: string; index: number; width: number; height: number }

export default function PdfPageImage({ library, hash, index, width, height }: PdfPageImageProps) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const pixels = Math.min(2400, Math.round(PixelRatio.getPixelSizeForLayoutSize(width) / 128) * 128 || 512);
    const timer = setTimeout(() => {
      void ensurePdf(hash, () => library.asset(hash)).then((pdf) => pdf.render(hash, index, pixels)).then((next) => { if (live) setUri(next); }, () => undefined);
    }, uri ? 160 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [hash, index, width, library]);
  return (
    <View style={{ position: "absolute", left: 0, top: 0, width, height, backgroundColor: "#ffffff" }} aria-hidden>
      {uri ? <Image source={{ uri }} style={{ width, height }} resizeMode="stretch" fadeDuration={0} /> : null}
    </View>
  );
}
