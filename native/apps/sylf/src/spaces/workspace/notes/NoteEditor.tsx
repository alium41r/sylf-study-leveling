// The one note: pages you write and type on. Each page has a background (its paper, a PDF page or a picture), an ink layer and a text
// layer, in the web's page-layers format. A Type and Write switch changes what the pen and fingers do, and the toolbar with it. Only
// the page being typed on runs an editor; every other page draws its text natively, so a long note costs what one page costs.
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Image, Platform, ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import * as Y from "yjs";
import { DOCUMENT_DEFAULTS, Divider, Icon, IconButton, Menu, Press, Text, useNotice, useTheme, type MenuItem, type ViewHandle } from "@sylf/design-system";
import type { DocumentDescriptor, InkPaper } from "@sylf/shared";
import { InkScene, flowOf, typedTemplate, templateOf, unionOf, type NotesLibrary, type OpenDocument } from "@sylf/notes";
import FormatBar, { NO_FORMAT, type Format } from "./FormatBar";
import InkToolbar from "./InkToolbar";
import InkView from "./InkView";
import PageSettings from "./PageSettings";
import PdfPageImage from "./PdfPageImage";
import RichTextDom, { type RichTextHandle, type RichTextLook } from "./RichTextDom";
import { StaticText, BODY, hasText, lineFor } from "./StaticText";
import { fromBase64, toBase64 } from "./base64";
import { DEFAULT_TOOL } from "./ink-types";
import { useInkTool } from "./ink-tool";
import { pickImage } from "./pick-image";
import { inspectPdf } from "./pdf-engine";
import { looksLikePdf } from "./pdf-import";
import * as DocumentPicker from "expo-document-picker";
import Animated from "react-native-reanimated";
import { usePagePinch } from "./page-pinch";

type Page = DocumentDescriptor["pages"][number];
export type NoteMode = "type" | "write";
const GAP = 20, SNAP = 96, MARGIN = 160;
// An endless page keeps this much empty paper below whatever is written on it, in page units: write into it and the page grows.
const ENDLESS_ROOM = 640;
// Below the last page of a paged note: pull (or, with a wheel, keep scrolling) through this to add a page. Its content sits high, clear
// of full screen's "Tools" handle along the bottom edge.
const PULL = 200, WHEEL_PULL = 320;
// The fastest release, in points per millisecond, that still counts as a pull rather than a fling.
const PULL_RELEASE_SPEED = 1.2;
const RULED = new Set(["ruled", "cornell", "journal"]);
// The system face on both sides: the WebView on Android has none of the app's fonts, and the native text must match it.
const FONT = '-apple-system, BlinkMacSystemFont, Roboto, "Segoe UI", system-ui, sans-serif';

/** Where typed text sits on a page, in page units: on the paper's rule when it is lined. */
export function textBox(page: Page, paper: InkPaper | null) {
  const ruled = paper && RULED.has(paper.template) && !page.originalAssetId;
  const line = lineFor(ruled ? paper.spacing : null);
  const left = paper?.template === "cornell" && !page.originalAssetId ? Math.round(page.width * 0.3) + 10 : 56;
  return { left, top: ruled ? paper.spacing * 2 - Math.round(line * 0.72) : 40, width: page.width - left - 48, line };
}

function hasInk(doc: Y.Doc) {
  for (const value of doc.getMap("ink").values()) if ((value as { kind?: string })?.kind === "part") return true;
  return false;
}

export default function NoteEditor({ library, document, editable, initialPage, onPage, mode, onMode, narrow, corner }: { library: NotesLibrary; document: OpenDocument; editable: boolean; initialPage: number; onPage(page: number): void; mode: NoteMode; onMode(mode: NoteMode): void; narrow: boolean; corner?: ReactNode }) {
  const theme = useTheme();
  const { space, color } = theme;
  const notice = useNotice();
  const [descriptor, setDescriptor] = useState(document.descriptor());
  useEffect(() => document.subscribe(() => setDescriptor(document.descriptor())), [document]);
  const pages = descriptor.pages;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [tool, setTool, stylusKnown, penSeen] = useInkTool(DEFAULT_TOOL, "page");
  const [selection, setSelection] = useState<{ page: string; ids: string[] } | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>(NO_FORMAT);
  const [settings, setSettings] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ url: string; name: string; width: number } | null>(null);
  const insertAnchor = useRef<ViewHandle>(null);
  const editor = useRef<RichTextHandle>(null);
  const vertical = useRef<ComponentRef<typeof ScrollView>>(null), horizontal = useRef<ComponentRef<typeof ScrollView>>(null);
  const restored = useRef(false);
  const [, bump] = useState(0);

  // One ink scene per page, made when the page first comes into view, closed with the note.
  const scenes = useRef(new Map<string, InkScene>());
  const scene = (page: Page) => {
    let found = scenes.current.get(page.pageId);
    if (!found) { found = new InkScene(document.stream(page.streamId)); scenes.current.set(page.pageId, found); found.subscribe(() => bump((n) => n + 1)); }
    return found;
  };
  useEffect(() => () => { for (const s of scenes.current.values()) s.close(); scenes.current.clear(); }, []);
  const textDoc = (page: Page) => (typeof page.extensions.textStreamId === "string" ? document.stream(page.extensions.textStreamId) : null);

  const widest = Math.max(1, ...pages.map((p) => p.width));
  const fit = size.width ? (size.width - GAP * 2) / widest : 0.5;
  const scale = Math.max(0.15, fit * zoom);
  const layout = useMemo(() => {
    let top = GAP;
    return pages.map((page) => { const row = { page, top, width: page.width * scale, height: page.height * scale }; top += row.height + GAP; return row; });
  }, [pages, scale]);
  const endless = flowOf(descriptor) === "endless";
  const pullable = editable && !endless && !!pages.length;
  const pagesHeight = (layout.at(-1)?.top ?? 0) + (layout.at(-1)?.height ?? 0) + GAP;
  const contentHeight = pagesHeight + (pullable ? PULL : 0);
  const contentWidth = Math.max(size.width, widest * scale + GAP * 2);
  const current = Math.max(0, layout.findIndex((row) => row.top + row.height > scroll.y + size.height / 3));
  useEffect(() => { onPage(current); }, [current]);
  useEffect(() => {
    if (restored.current || !size.height || !layout.length) return;
    restored.current = true;
    const row = layout[Math.min(initialPage, layout.length - 1)];
    if (row && initialPage > 0) requestAnimationFrame(() => vertical.current?.scrollTo({ y: row.top - GAP, animated: false }));
  }, [size.height, layout.length]);
  // Typing starts on the page in view; switching to Write leaves no editor running.
  useEffect(() => { if (mode === "write") setTyping(null); else if (!typing && pages[current]) setTyping(pages[current].pageId); }, [mode]);

  // Zoom about a point of the view (the middle for the buttons, between the fingers for a pinch): what is under it stays under it.
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const offsetRef = useRef({ x: 0, y: 0 });
  // A pinch sends many small steps a frame: they are gathered and applied once per frame, about the latest point between the fingers.
  const pinching = useRef<{ factor: number; vx: number; vy: number } | null>(null);
  const pinch = (factor: number, vx = size.width / 2, vy = size.height / 2) => {
    const pending = pinching.current;
    if (pending) { pending.factor *= factor; pending.vx = vx; pending.vy = vy; return; }
    pinching.current = { factor, vx, vy };
    requestAnimationFrame(() => {
      const step = pinching.current!;
      pinching.current = null;
      const before = zoomRef.current, next = Math.max(0.5, Math.min(3, before * step.factor));
      if (next === before) return;
      const ratio = Math.max(0.15, fit * next) / Math.max(0.15, fit * before);
      const at = offsetRef.current, target = { x: Math.max(0, (at.x + step.vx) * ratio - step.vx), y: Math.max(0, (at.y + step.vy) * ratio - step.vy) };
      zoomRef.current = next;
      offsetRef.current = target;
      setZoom(next);
      requestAnimationFrame(() => { vertical.current?.scrollTo({ y: target.y, animated: false }); horizontal.current?.scrollTo({ x: target.x, animated: false }); });
    });
  };

  const preview = usePagePinch({ zoom, setZoom: (z) => { zoomRef.current = z; setZoom(z); }, scaleAt: (z) => Math.max(0.15, fit * z), offset: offsetRef, vertical, horizontal });
  const pan = (dx: number, dy: number) => {
    const at = offsetRef.current, next = { x: contentWidth > size.width ? Math.max(0, at.x - dx) : at.x, y: Math.max(0, at.y - dy) };
    offsetRef.current = next;
    vertical.current?.scrollTo({ y: next.y, animated: false });
    if (contentWidth > size.width) horizontal.current?.scrollTo({ x: next.x, animated: false });
  };
  const activePage = layout[current]?.page;
  const activeScene = activePage ? scene(activePage) : null;
  const send = (command: object) => editor.current?.command(JSON.stringify(command));

  const onSelectionAction = (action: "delete" | "done" | "bigger" | "smaller" | { color: string }) => {
    const s = selection ? scenes.current.get(selection.page) : null;
    if (!selection || !s) return;
    if (action === "delete") s.remove(selection.ids);
    else if (action === "bigger") s.scale(selection.ids, 1.15);
    else if (action === "smaller") s.scale(selection.ids, 1 / 1.15);
    else if (typeof action === "object") s.recolor(selection.ids, action.color);
    if (action === "delete" || action === "done") setSelection(null);
  };

  // A PDF goes where the writing ends: after the last page with ink or text, replacing the empty pages after it. In a fresh note it
  // replaces everything, and the note takes the PDF's pages.
  const insertPdf = async () => {
    setInserting(false);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return;
      const bytes = new Uint8Array(await ((asset as { file?: Blob }).file ?? (await (await fetch(asset.uri)).blob())).arrayBuffer());
      if (!looksLikePdf(bytes)) throw new Error("That file is not a PDF.");
      const sources = await inspectPdf(bytes);
      const stored = await library.storeAsset(bytes, "application/pdf", asset.name || "PDF");
      const used = pages.map((page) => { const text = textDoc(page); return !!page.originalAssetId || !!page.extensions.backgroundAssetId || hasInk(document.stream(page.streamId)) || (!!text && hasText(text)); });
      const last = used.lastIndexOf(true);
      const replace = pages.slice(last + 1).filter((_, i) => !used[last + 1 + i]).map((p) => p.pageId);
      document.insertPdfPages(stored, sources, last + 1, replace);
      notice(`${sources.length} ${sources.length === 1 ? "page" : "pages"} added`);
      const target = layout[last + 1];
      if (target) requestAnimationFrame(() => vertical.current?.scrollTo({ y: target.top - GAP, animated: true }));
    } catch (error) { notice(error instanceof Error ? error.message : "That PDF could not be added."); }
  };
  const insertImage = async () => {
    setInserting(false);
    try {
      const image = await pickImage();
      if (!image) return;
      const width = Math.min(image.width, Math.round((activePage?.width ?? 800) - 120));
      if (mode !== "type") onMode("type");
      setTyping((t) => t ?? activePage?.pageId ?? null);
      setPendingImage({ url: image.url, name: image.name, width });
    } catch (error) { notice(error instanceof Error ? error.message : "That picture could not be added."); }
  };
  const insertItems: MenuItem[] = [
    { key: "image", label: "Picture", detail: "Into the text, where you are typing", icon: "image", onSelect: () => void insertImage() },
    { key: "pdf", label: "PDF", detail: "After your last written page", icon: "fileImport", onSelect: () => void insertPdf() },
    { key: "page", label: "Blank page", detail: "After this page", icon: "pagePlus", onSelect: () => { setInserting(false); document.addPage(current); } },
  ];

  const switcher = (
    <View style={{ flexDirection: "row", padding: 2, borderRadius: 10, backgroundColor: color.sunken, marginRight: space.xs }} role="radiogroup" aria-label="Type or write">
      {(["type", "write"] as const).map((value) => (
        <Press key={value} role="radio" checked={mode === value} label={value === "type" ? "Type" : "Write"} onPress={() => onMode(value)} feedback="none" testID={`note-mode-${value}`}
          bodyStyle={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 30, borderRadius: 8, backgroundColor: mode === value ? color.raised : "transparent" }}>
          <Icon name={value === "type" ? "modeType" : "pen"} size={15} color={mode === value ? color.ink : color.inkSoft} />
          {narrow ? null : <Text variant="label" tone={mode === value ? "ink" : "soft"}>{value === "type" ? "Type" : "Write"}</Text>}
        </Press>
      ))}
    </View>
  );
  const trailing: ReactNode = (
    <>
      <Divider vertical style={{ height: 18, marginHorizontal: 4 }} />
      <View ref={insertAnchor} collapsable={false}><IconButton icon="plus" size="small" label="Insert a picture, PDF or page" onPress={() => setInserting(true)} /></View>
      <IconButton icon="settings" size="small" label="Note settings" testID="note-page-settings" onPress={() => setSettings(true)} />
      <IconButton icon="minus" size="small" label="Zoom out" onPress={() => pinch(1 / 1.25)} />
      <Text variant="micro" tone="soft" style={{ minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</Text>
      <IconButton icon="plus" size="small" label="Zoom in" onPress={() => pinch(1.25)} />
    </>
  );

  // An endless note grows its last page to keep room below the lowest ink, as the text does through onHeight.
  const lastPage = pages.at(-1);
  const lastScene = endless && lastPage && !lastPage.originalAssetId ? scene(lastPage) : null;
  const inkBottom = lastScene && lastScene.strokes().length ? (() => { const box = unionOf(lastScene.strokes().map((st) => st.bounds)); return box.y + box.height; })() : 0;
  useEffect(() => { if (lastPage && inkBottom) document.growPage(lastPage.pageId, inkBottom + ENDLESS_ROOM); }, [lastPage?.pageId, inkBottom]);

  // Pull to add a page: on touch, release with the zone below the last page fully shown; with a wheel, keep scrolling at the end.
  const [wheelPull, setWheelPull] = useState(0);
  const adding = useRef(false);
  // On touch the zone springs back out of view after any scroll that drifts into it. A pull is a drag that starts at the end of the last
  // page and is released with the zone fully shown; a fling or a drag from further up only springs back. (Android hands a drag to the
  // native scroll view and JavaScript gets a cancel, so this reads the scroll view's own drag events, not touches.)
  const [armed, setArmed] = useState(false);
  const settleZone = (y: number) => {
    const hidden = pagesHeight - size.height;
    if (Platform.OS !== "web" && pullable && hidden >= 0 && y > hidden + 1) vertical.current?.scrollTo({ y: hidden, animated: true });
  };
  const addPageAtEnd = () => {
    if (adding.current || !pullable) return;
    adding.current = true;
    document.addPage(pages.length - 1);
    setWheelPull(0);
    requestAnimationFrame(() => { vertical.current?.scrollTo({ y: Math.max(0, pagesHeight - GAP), animated: true }); setTimeout(() => { adding.current = false; }, 500); });
  };
  const addLatest = useRef(addPageAtEnd);
  addLatest.current = addPageAtEnd;
  useEffect(() => {
    if (Platform.OS !== "web" || !pullable) return;
    const node = (vertical.current as unknown as { getScrollableNode?(): HTMLElement } | null)?.getScrollableNode?.();
    if (!node) return;
    // Momentum that carries a scroll to the end is not a pull: only scrolling that starts after a pause at the end counts.
    let pulled = 0, armed = false, last = 0, idle: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      const now = event.timeStamp, gap = now - last;
      last = now;
      const atEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
      if (!atEnd || event.deltaY <= 0) { armed = false; if (pulled) { pulled = 0; setWheelPull(0); } return; }
      if (!armed) { armed = gap > 220; if (!armed) return; }
      pulled += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      setWheelPull(Math.min(1, pulled / WHEEL_PULL));
      clearTimeout(idle);
      if (pulled >= WHEEL_PULL) { pulled = 0; addLatest.current(); return; }
      idle = setTimeout(() => { pulled = 0; armed = false; setWheelPull(0); }, 700);
    };
    node.addEventListener("wheel", onWheel, { passive: true });
    return () => { node.removeEventListener("wheel", onWheel); clearTimeout(idle); };
  }, [pullable, size.width > 0]);
  const revealed = Math.max(0, Math.min(1, (scroll.y + size.height - pagesHeight) / PULL));
  const pullProgress = Platform.OS === "web" ? wheelPull : armed ? revealed : 0;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    offsetRef.current.y = y;
    if (Math.abs(y - scroll.y) >= 8) setScroll((s) => ({ ...s, y }));
  };

  return (
    <View style={{ flex: 1 }}>
      {editable ? (mode === "type"
        ? <FormatBar format={format} send={send} narrow={narrow} leading={switcher} trailing={trailing} end={corner} onImage={() => void insertImage()} />
        : <InkToolbar tool={tool} onTool={setTool} stylusKnown={stylusKnown} canUndo={!!activeScene?.canUndo()} canRedo={!!activeScene?.canRedo()} onUndo={() => activeScene?.undo()} onRedo={() => activeScene?.redo()}
            selection={selection?.ids.length ?? 0} onSelectionAction={onSelectionAction} leading={switcher} trailing={trailing} end={corner} />) : null}
      <View ref={preview.area} collapsable={false} style={{ flex: 1, backgroundColor: color.sunken, overflow: "hidden" }} onLayout={(e: LayoutChangeEvent) => { setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }); preview.onAreaLayout(); }}>
        <Animated.View style={[{ flex: 1, transformOrigin: "0 0" } as object, preview.style]}>
        {size.width ? (
          <ScrollView ref={horizontal} horizontal keyboardShouldPersistTaps="handled" scrollEnabled={contentWidth > size.width + 1} showsHorizontalScrollIndicator={contentWidth > size.width + 1} onScroll={(e) => { offsetRef.current.x = e.nativeEvent.contentOffset.x; setScroll((s) => ({ ...s, x: e.nativeEvent.contentOffset.x })); }} scrollEventThrottle={32} contentContainerStyle={{ width: contentWidth }}>
            <ScrollView ref={vertical} keyboardShouldPersistTaps="handled" {...({ dataSet: { ownsWheel: "scroll" } } as object)} style={{ width: contentWidth, height: size.height }} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ height: contentHeight }}
              onScrollBeginDrag={(e) => setArmed(pullable && e.nativeEvent.contentOffset.y + size.height >= pagesHeight - 24)}
              onScrollEndDrag={(e) => {
                const y = e.nativeEvent.contentOffset.y, speed = Math.abs(e.nativeEvent.velocity?.y ?? 0);
                // A pull ends held, not flung: a flick at the end of the note is someone scrolling, not asking for a page.
                if (armed && y + size.height >= contentHeight - 16 && speed < PULL_RELEASE_SPEED) addPageAtEnd(); else settleZone(y);
                setArmed(false);
              }}
              onMomentumScrollEnd={(e) => settleZone(e.nativeEvent.contentOffset.y)}>
              {layout.map((row) => {
                const left = (contentWidth - row.width) / 2;
                const near = row.top + row.height > scroll.y - size.height && row.top < scroll.y + size.height * 2;
                if (!near) return <View key={row.page.pageId} style={{ position: "absolute", top: row.top, left, width: row.width, height: row.height, backgroundColor: "#ffffff", opacity: 0.6 }} />;
                const x0 = Math.max(0, Math.floor((scroll.x - left - MARGIN) / SNAP) * SNAP), y0 = Math.max(0, Math.floor((scroll.y - row.top - MARGIN) / SNAP) * SNAP);
                const x1 = Math.min(row.width, Math.ceil((scroll.x + size.width - left + MARGIN) / SNAP) * SNAP), y1 = Math.min(row.height, Math.ceil((scroll.y + size.height - row.top + MARGIN) / SNAP) * SNAP);
                const s = scene(row.page), paper = row.page.originalAssetId ? null : s.paper();
                const background = typeof row.page.extensions.backgroundAssetId === "string" ? row.page.extensions.backgroundAssetId : null;
                const text = textDoc(row.page), box = textBox(row.page, paper);
                const typingHere = mode === "type" && typing === row.page.pageId && editable && !!text;
                const look = { size: BODY, line: box.line, ink: DOCUMENT_DEFAULTS.ink, soft: "#5b6170", font: undefined };
                return (
                  <View key={row.page.pageId} style={{ position: "absolute", top: row.top, left, width: row.width, height: row.height, backgroundColor: paper?.color ?? "#ffffff", overflow: "hidden", boxShadow: "0 1px 3px rgba(20,24,40,0.12), 0 6px 18px rgba(20,24,40,0.08)" }} testID="ink-page">
                    {row.page.originalAssetId ? <PdfPageImage library={library} hash={row.page.originalAssetId} index={row.page.sourcePage ?? 0} width={row.width} height={row.height} /> : null}
                    {background ? <PictureBackground library={library} hash={background} width={row.width} height={row.height} /> : null}
                    {x1 > x0 && y1 > y0 && !row.page.originalAssetId && !background ? (
                      <View style={{ position: "absolute", left: x0, top: y0 }} pointerEvents="none">
                        <InkView scene={s} pageWidth={row.page.width} pageHeight={row.page.height} camera={{ x: x0 / scale, y: y0 / scale, zoom: scale }} width={x1 - x0} height={y1 - y0}
                          tool={tool} drawPaper paperOnly editable={false} selection={[]} onSelection={() => undefined} />
                      </View>
                    ) : null}
                    {text ? (
                      typingHere ? (
                        <View style={{ position: "absolute", left: box.left * scale, top: box.top * scale, width: box.width * scale, height: (row.page.height - box.top - 24) * scale }}>
                          <PageTextEditor key={row.page.pageId} handle={editor} doc={text} document={document} page={row.page} scale={scale} line={box.line} area={{ width: box.width, height: row.page.height - box.top - 24 }} template={row === layout[0] ? JSON.stringify(typedTemplate(templateOf(descriptor)).blocks) : "[]"}
                            onFormat={setFormat} pendingImage={pendingImage} onImageDone={() => setPendingImage(null)} onHeight={(h) => document.growPage(row.page.pageId, box.top + h + (endless ? ENDLESS_ROOM : 80))} />
                        </View>
                      ) : (
                        <Press label="Type on this page" feedback="none" onPress={() => { if (mode === "type" && editable) setTyping(row.page.pageId); }}
                          style={{ position: "absolute", left: box.left * scale, top: box.top * scale, width: box.width * scale, height: (row.page.height - box.top - 24) * scale }} pointerEvents={mode === "type" ? "auto" : "none"}>
                          <View style={{ width: box.width, transform: [{ scale }], transformOrigin: "0 0" } as object} pointerEvents="none"><StaticText doc={text} look={look} width={box.width} /></View>
                        </Press>
                      )
                    ) : null}
                    {/* Handwriting lies over the typed text and pictures, as ink on a printed page does. */}
                    {x1 > x0 && y1 > y0 ? (
                      <View style={{ position: "absolute", left: x0, top: y0 }} pointerEvents={mode === "write" ? "auto" : "none"}>
                        <InkView scene={s} pageWidth={row.page.width} pageHeight={row.page.height} camera={{ x: x0 / scale, y: y0 / scale, zoom: scale }} width={x1 - x0} height={y1 - y0}
                          tool={tool} drawPaper={false} editable={editable && mode === "write"} selection={selection?.page === row.page.pageId ? selection.ids : []}
                          onSelection={(ids) => setSelection(ids.length ? { page: row.page.pageId, ids } : null)} onPan={pan} onPinch={(factor, x, y) => pinch(factor, left + x0 - offsetRef.current.x + x, row.top + y0 - offsetRef.current.y + y)} onPagePinch={preview.onPagePinch} onPenSeen={penSeen} wheel="zoom" />
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {pullable ? (
                <View pointerEvents="none" style={{ position: "absolute", top: pagesHeight, left: 0, width: contentWidth, height: PULL, alignItems: "center", justifyContent: "flex-start", paddingTop: 18, gap: 8, opacity: 0.35 + Math.max(pullProgress, revealed * 0.4) * 0.65 }} testID="note-pull-zone">
                  <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: pullProgress >= 0.95 ? color.accent.fill : color.raised, transform: [{ scale: 0.85 + pullProgress * 0.15 }] }}>
                    <Icon name="pagePlus" size={20} color={pullProgress >= 0.95 ? color.accent.on : color.inkSoft} />
                  </View>
                  <View style={{ width: 96, height: 3, borderRadius: 2, backgroundColor: color.line, overflow: "hidden" }}><View style={{ width: 96 * pullProgress, height: 3, backgroundColor: color.accent.fill }} /></View>
                  <Text variant="caption" tone="soft">{pullProgress >= 0.95 ? "Release to add a page" : Platform.OS === "web" ? "Keep scrolling to add a page" : "Pull up to add a page"}</Text>
                </View>
              ) : null}
            </ScrollView>
          </ScrollView>
        ) : null}
        </Animated.View>
        {pages.length > 1 ? (
          <View pointerEvents="none" style={{ position: "absolute", right: space.md, bottom: space.md, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "rgba(20,24,40,0.55)" }}>
            <Text variant="micro" style={{ color: "#ffffff" }}>{current + 1} / {pages.length}</Text>
          </View>
        ) : null}
      </View>
      <Menu open={inserting} anchor={insertAnchor} onClose={() => setInserting(false)} items={insertItems} label="Insert" side="bottom" />
      <PageSettings open={settings} onClose={() => setSettings(false)} library={library} document={document} page={activePage ?? null} scenes={scenes.current} />
    </View>
  );
}

const pictureCache = new Map<string, string>();
function PictureBackground({ library, hash, width, height }: { library: NotesLibrary; hash: string; width: number; height: number }) {
  const [uri, setUri] = useState(pictureCache.get(hash) ?? null);
  useEffect(() => {
    if (uri) return;
    let live = true;
    void library.asset(hash).then((bytes) => {
      if (!bytes || !live) return;
      let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const head = bytes[0] === 0x89 ? "image/png" : "image/jpeg", url = `data:${head};base64,${btoa(s)}`;
      pictureCache.set(hash, url);
      setUri(url);
    });
    return () => { live = false; };
  }, [hash, library, uri]);
  return uri ? <Image source={{ uri }} style={{ position: "absolute", left: 0, top: 0, width, height }} resizeMode="cover" /> : null;
}

/** The editor for the page being typed on: BlockNote over the paper, at the page's zoom, on its rule. */
function PageTextEditor({ handle, doc, document, page, scale, line, area, template, onFormat, pendingImage, onImageDone, onHeight }: {
  handle: React.RefObject<RichTextHandle | null>; doc: Y.Doc; document: OpenDocument; page: Page; scale: number; line: number; area: { width: number; height: number }; template: string;
  onFormat(format: Format): void; pendingImage: { url: string; name: string; width: number } | null; onImageDone(): void; onHeight(height: number): void;
}) {
  const theme = useTheme();
  const origin = useMemo(() => ({}), []);
  const initial = useMemo(() => toBase64(Y.encodeStateAsUpdate(doc)), [doc]);
  const look = useMemo<RichTextLook>(() => ({ ink: DOCUMENT_DEFAULTS.ink, soft: "#4a4f5a", faint: "#9aa0ab", accent: theme.color.accent.fill, wash: "rgba(90,110,180,0.12)", paper: "transparent", line: "#d9dce3", font: FONT, menu: "#ffffff", menuInk: "#1a1a1a" }), [theme.color.accent.fill]);
  useEffect(() => {
    const forward = (update: Uint8Array, from: unknown) => { if (from !== origin) handle.current?.apply(toBase64(update)); };
    doc.on("update", forward);
    return () => doc.off("update", forward);
  }, [doc, origin]);
  useEffect(() => {
    if (!pendingImage) return;
    const timer = setTimeout(() => { handle.current?.command(JSON.stringify({ type: "image", url: pendingImage.url, name: pendingImage.name, width: pendingImage.width })); onImageDone(); }, 260);
    return () => clearTimeout(timer);
  }, [pendingImage]);
  return (
    <RichTextDom ref={handle} initial={initial} template={template} look={look} editable page={{ zoom: scale, lineHeight: line, focus: true, width: area.width, height: area.height }}
      onUpdate={async (update) => { Y.applyUpdate(doc, fromBase64(update), origin); }}
      onText={async (text) => { if (document.descriptor().pages[0]?.pageId === page.pageId) document.setText(text); }}
      onFormat={async (state) => onFormat(JSON.parse(state) as Format)}
      onHeight={async (height) => onHeight(height)}
      dom={{ style: { flex: 1, backgroundColor: "transparent" }, containerStyle: { flex: 1, backgroundColor: "transparent" }, scrollEnabled: false, matchContents: false } as never} />
  );
}
