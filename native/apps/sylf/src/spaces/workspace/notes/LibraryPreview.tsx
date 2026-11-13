// Gallery previews are read-only and scoped to the library. Opening the explorer does not open document handles.
import { memo, useEffect, useState } from "react";
import { Image, StyleSheet, Text as NativeText, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { DOCUMENT_DEFAULTS } from "@sylf/design-system";
import { paperFor, type Cover, type LibraryEntry, type NotesLibrary } from "@sylf/notes";
import { PaperArt, paperInk } from "./PaperArt";
import { renderPdfThumbnail } from "./pdf-engine";
import { toBase64 } from "./base64";

type Preview = Awaited<ReturnType<NotesLibrary["previewPage"]>>;
const cache = new WeakMap<NotesLibrary, Map<string, { key: string; result: Promise<Preview> }>>();
const PREVIEW_LIMIT = 32;
const rasters = new WeakMap<NotesLibrary, Map<string, string>>();
const workers = [Promise.resolve(), Promise.resolve()];
let nextWorker = 0;

// Let fast scrolling discard queued cards and keep large PDF decodes from piling up.
function queuePreview(run: () => Promise<void>) {
  const slot = nextWorker;
  nextWorker = (nextWorker + 1) % workers.length;
  workers[slot] = workers[slot].then(run).catch(() => undefined);
}

async function pdfPoster(library: NotesLibrary, source: { hash: string; index: number }, pixels: number) {
  let items = rasters.get(library);
  if (!items) { items = new Map(); rasters.set(library, items); }
  const key = `${source.hash}:${source.index}:${pixels}`;
  const uri = items.get(key) ?? await renderPdfThumbnail(source.hash, () => library.asset(source.hash), source.index, pixels);
  items.delete(key);
  items.set(key, uri);
  if (items.size > PREVIEW_LIMIT) items.delete(items.keys().next().value!);
  return uri;
}
const BLANK = paperFor("blank");

function previewFor(library: NotesLibrary, id: string, key: string) {
  let entries = cache.get(library);
  if (!entries) { entries = new Map(); cache.set(library, entries); }
  const previous = entries.get(id);
  entries.delete(id);
  const record = previous?.key === key ? previous : { key, result: library.previewPage(id) };
  entries.set(id, record);
  if (entries.size > PREVIEW_LIMIT) entries.delete(entries.keys().next().value!);
  return record.result;
}

export function CoverImage({ library, image, uri, stretch = false }: { library: NotesLibrary; image?: Cover["image"]; uri?: string; stretch?: boolean }) {
  const [loaded, setLoaded] = useState<{ library: NotesLibrary; hash: string; uri: string } | null>(null);
  const hash = image?.hash, mediaType = image?.mediaType;
  useEffect(() => {
    if (!hash || !mediaType || uri) return;
    let live = true;
    void library.asset(hash).then((bytes) => {
      if (live && bytes) setLoaded({ library, hash, uri: `data:${mediaType};base64,${toBase64(bytes)}` });
    }, () => undefined);
    return () => { live = false; };
  }, [library, hash, mediaType, uri]);
  const source = uri ?? (loaded && loaded.library === library && loaded.hash === hash ? loaded.uri : null);
  return source ? <Image accessible={false} testID={stretch ? "library-page-picture" : "library-cover-image"} source={{ uri: source }}
    resizeMode={stretch ? "stretch" : "cover"} style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]} /> : null;
}

export const LibraryPreview = memo(function LibraryPreview({ library, entry, width, height, visible }: { library: NotesLibrary; entry: LibraryEntry; width: number; height: number; visible: boolean }) {
  const page = entry.firstPage;
  const key = `${page?.id ?? ""}:${entry.updated}`;
  const [loaded, setLoaded] = useState<{ key: string; library: NotesLibrary; result: Preview | null; poster: string | null } | null>(null);
  const cover = entry.cover.image;
  const excerpt = entry.text || entry.preview;
  const needsExcerpt = entry.kind === "note" && !excerpt;
  const pixelWidth = Math.min(448, Math.ceil(width / 64) * 128);
  const pixels = page && page.height > page.width ? Math.min(pixelWidth, Math.floor(640 * page.width / page.height)) : pixelWidth;
  const source = page?.source;
  const hash = source?.hash;
  const index = source?.index;
  useEffect(() => {
    if (!visible || cover || (!page?.id && !needsExcerpt)) return;
    let live = true;
    const timer = setTimeout(() => queuePreview(async () => {
      if (!live) return;
      const result = await previewFor(library, entry.id, key).catch(() => null);
      if (!live) return;
      const poster = hash && index !== undefined && pixels >= 64 ? await pdfPoster(library, { hash, index }, pixels).catch(() => null) : null;
      if (live) setLoaded({ key, library, result, poster });
    }), 80);
    return () => { live = false; clearTimeout(timer); };
  }, [library, entry.id, key, page?.id, visible, cover?.hash, hash, index, pixels, needsExcerpt]);
  const ready = loaded?.key === key && loaded.library === library ? loaded : null;
  const preview = ready?.result;
  const paper = page?.source ? null : preview?.paper ?? page?.paper ?? BLANK;
  const pageWidth = page?.width ?? 800, pageHeight = page?.height ?? 1100;
  const scale = width / pageWidth;
  const crop = Math.min(pageHeight, height / scale);
  const ink = paper ? paperInk(paper.color) : DOCUMENT_DEFAULTS.ink;
  const font = Math.max(6, 21 * scale);
  const summary = excerpt.slice(0, 540) || preview?.text;

  return (
    <View pointerEvents="none" aria-hidden style={{ width, height, overflow: "hidden", backgroundColor: paper?.color ?? DOCUMENT_DEFAULTS.paper }} testID="library-page-preview">
      {paper && !page?.picture ? <View style={{ height: crop * scale }}><PaperArt paper={paper} width={pageWidth} height={pageHeight} crop={crop} /></View> : null}
      {!cover && ready?.poster ? <Image source={{ uri: ready.poster }} resizeMode="stretch" accessible={false} testID="library-preview-pdf"
        style={{ position: "absolute", top: 0, left: 0, width, height: pageHeight * scale }} /> : null}
      {visible && !cover && page?.picture ? <View style={{ position: "absolute", top: 0, left: 0, width, height: pageHeight * scale }}>
        <CoverImage library={library} image={page.picture} stretch />
      </View> : null}
      {summary && !cover ? <NativeText numberOfLines={Math.max(1, Math.floor((height - 24) / (font * 1.4)))} allowFontScaling={false}
        style={{ position: "absolute", left: width * 0.08, right: width * 0.08, top: width * 0.10, color: ink, fontSize: font, lineHeight: font * 1.4 }}>{summary}</NativeText> : null}
      {visible && !cover && preview?.strokes.length ? (
        <View style={StyleSheet.absoluteFill} testID="library-preview-ink">
          <Svg width={width} height={crop * scale} viewBox={`0 0 ${pageWidth} ${crop}`}>
            {preview.strokes.map((stroke) => <Path key={stroke.id} d={stroke.d} fill={stroke.color} opacity={stroke.opacity} />)}
          </Svg>
        </View>
      ) : null}
      {visible && cover ? <CoverImage library={library} image={cover} /> : null}
    </View>
  );
});
