// The one note: pages you write and type on. Each page has a background (its paper, a PDF page or a picture), an ink layer and a text
// layer, in the web's page-layers format. A Type and Write switch changes what the pen and fingers do, and the toolbar with it. Only
// the page being typed on runs an editor; every other page draws its text natively, so a long note costs what one page costs.
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { FlatList, Image, Platform, ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import * as Y from "yjs";
import { DOCUMENT_DEFAULTS, Icon, IconButton, ListRow, Menu, Popover, Press, Text, Tooltip, useControlHeight, useInputFormat, useNotice, useTheme, type MenuItem, type ViewHandle } from "@sylf/design-system";
import { inkOutline, type DocumentDescriptor, type InkPaper } from "@sylf/shared";
import { InkScene, flowOf, typedTemplate, templateOf, unionOf, type NotesLibrary, type OpenDocument } from "@sylf/notes";
import DocumentActions, { type DocumentActionsProps } from "./DocumentActions";
import FormatBar, { NO_FORMAT, ToolbarRow, type Format } from "./FormatBar";
import InkToolbar from "./InkToolbar";
import InkView from "./InkView";
import PageSettings from "./PageSettings";
import { paperInk } from "./PaperArt";
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
import { MAX_ZOOM, MIN_ZOOM, PinchStage, clampPageScroll, stackPages, usePagePinch } from "./page-pinch";
import { pageAt, pageOffset } from "./page-navigation";
import { watchScene } from "./scene-face";
import { ZoomBadge, type ZoomBadgeHandle } from "./ZoomBadge";

type Page = DocumentDescriptor["pages"][number];
export type NoteMode = "type" | "write";
const SNAP = 96, MARGIN = 160, MAX_FIT_WIDTH = 880;
// How far a scroll moves before the pages are laid out again. Well inside MARGIN, so ink is always drawn where it shows.
const SCROLL_STEP = 40;
// An endless page keeps this much empty paper below whatever is written on it, in page units: write into it and the page grows.
const ENDLESS_ROOM = 640;
// Native scroll reserves this much room only during a pull. Desktop wheel progress never changes the document extent.
const PULL = 120, WHEEL_PULL = 320;
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

export default function NoteEditor({ library, document, editable, initialPage, onPage, mode, onMode, width, navigation, actions }: { library: NotesLibrary; document: OpenDocument; editable: boolean; initialPage: number; onPage(page: number): void; mode: NoteMode; onMode(mode: NoteMode): void; width: number; navigation?: ReactNode; actions: DocumentActionsProps }) {
  const theme = useTheme();
  const { space, color, shape } = theme;
  const control = Math.round(useControlHeight() * 0.82);
  const input = useInputFormat();
  const gap = space.md;
  const rowHeight = theme.density.row[input];
  const notice = useNotice();
  const [descriptor, setDescriptor] = useState(document.descriptor());
  useEffect(() => document.subscribe(() => setDescriptor(document.descriptor())), [document]);
  const pages = descriptor.pages;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const [tool, setTool, stylusKnown, penSeen] = useInkTool(DEFAULT_TOOL, "page");
  const [selection, setSelection] = useState<{ page: string; ids: string[] } | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>(NO_FORMAT);
  const [settings, setSettings] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [pagePicker, setPagePicker] = useState(false);
  const [pageTarget, setPageTarget] = useState<string | null>(() => pages[Math.max(0, Math.min(initialPage, pages.length - 1))]?.pageId ?? null);
  const [heldPage, setHeldPage] = useState<{ id: string; y: number } | null>(null);
  const [pendingImage, setPendingImage] = useState<{ url: string; name: string; width: number } | null>(null);
  const insertAnchor = useRef<ViewHandle>(null);
  const zoomAnchor = useRef<ViewHandle>(null);
  const [zooming, setZooming] = useState(false);
  const pageAnchor = useRef<ViewHandle>(null);
  const editor = useRef<RichTextHandle>(null);
  const vertical = useRef<ComponentRef<typeof ScrollView>>(null), horizontal = useRef<ComponentRef<typeof ScrollView>>(null);
  const [, bump] = useState(0);

  // One ink scene per page, made when the page first comes into view, closed with the note.
  const scenes = useRef(new Map<string, InkScene>());
  const scene = (page: Page) => {
    let found = scenes.current.get(page.pageId);
    if (!found) { found = new InkScene(document.stream(page.streamId)); scenes.current.set(page.pageId, found); watchScene(found, () => bump((n) => n + 1)); }
    return found;
  };
  useEffect(() => () => { for (const s of scenes.current.values()) s.close(); scenes.current.clear(); }, []);
  const textDoc = (page: Page) => (typeof page.extensions.textStreamId === "string" ? document.stream(page.extensions.textStreamId) : null);

  const widest = Math.max(1, ...pages.map((p) => p.width));
  const fit = size.width ? Math.max(1, Math.min(size.width - gap * 2, MAX_FIT_WIDTH)) / widest : 0.5;
  const scaleAt = (z: number) => fit * z;
  const scale = scaleAt(zoom);
  // The gaps between pages scale with the zoom as the pages do, so a pinch previews every page on screen exactly, not only the one under the fingers.
  const stack = useMemo(() => stackPages(pages, scale, size.width, gap * zoom), [pages, scale, size.width, gap, zoom]);
  const layout = useMemo(() => stack.rows.map((row, i) => ({ ...row, page: pages[i] })), [stack, pages]);
  const endless = flowOf(descriptor) === "endless";
  const pullable = editable && !endless && !!pages.length;
  const pagesHeight = stack.height;
  const contentHeight = pagesHeight + (armed && pullable ? PULL : 0);
  const contentWidth = stack.width;
  const layoutAt = (z: number) => stackPages(pages, scaleAt(z), size.width, gap * z);
  const selected = pages.findIndex((page) => page.pageId === (pageTarget ?? heldPage?.id));
  const current = selected >= 0 ? selected : pageAt(layout, scroll.y, size.height);
  const measured = size.width > 0 && size.height > 0;
  const offsetRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (measured && pageTarget === null && pages.length) onPage(current);
  }, [current, measured, pageTarget]);
  useEffect(() => {
    if (!pageTarget || !measured) return;
    const row = layout.find((candidate) => candidate.page.pageId === pageTarget);
    if (!row) { setPageTarget(null); return; }
    const y = pageOffset(row, gap * zoom, pagesHeight, size.height);
    const frame = requestAnimationFrame(() => {
      offsetRef.current.y = y;
      setHeldPage({ id: pageTarget, y });
      setScroll((at) => ({ ...at, y }));
      vertical.current?.scrollTo({ y, animated: false });
      setPageTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pageTarget, measured, layout, pagesHeight, size.height, gap, zoom]);
  const goToPage = (id: string) => {
    setPagePicker(false);
    setSelection(null);
    setPageTarget(id);
    if (mode === "type") {
      setFormat(NO_FORMAT);
      setTyping(id);
    }
  };
  const addPage = () => goToPage(document.addPage(current));
  // Typing starts on the page in view. Writing leaves no text editor running.
  useEffect(() => {
    if (mode === "write") {
      setTyping(null);
    } else {
      setSelection(null);
      if (!typing && pages[current]) setTyping(pages[current].pageId);
    }
  }, [mode]);

  const zoomBadge = useRef<ZoomBadgeHandle>(null);
  const preview = usePagePinch({
    onZoom: (z) => zoomBadge.current?.show(z),
    zoom, layoutAt, view: size, content: { width: contentWidth, height: contentHeight }, offset: offsetRef, vertical, horizontal,
    commit: (z, at) => {
      armedRef.current = false;
      setArmed(false);
      setHeldPage(null);
      setZoom(z);
      setScroll(at);
    },
  });
  // While a pinch can zoom out, the pages around the view are drawn as well, so shrinking shows them rather than an edge. The scrolled
  // content is as large as the largest zoom, so the scroll that lands the pinch is never cut short (see page-pinch).
  const reach = preview.pinching ? Math.min(2, zoom / MIN_ZOOM - 1) : 0;
  const reachX = MARGIN + reach * size.width, reachY = MARGIN + reach * size.height;
  const largest = preview.pinching ? layoutAt(MAX_ZOOM) : null;
  const spanWidth = Math.max(contentWidth, largest?.width ?? 0), spanHeight = Math.max(contentHeight, largest?.height ?? 0);
  const drawOutside = preview.pinching ? { overflow: "visible" as const } : null;
  const pan = (dx: number, dy: number) => {
    const at = offsetRef.current;
    const next = clampPageScroll({ x: at.x - dx, y: at.y - dy }, stack, size);
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
      const existing = document.descriptor().pages;
      const used = existing.map((page) => { const text = textDoc(page); return !!page.originalAssetId || !!page.extensions.backgroundAssetId || hasInk(document.stream(page.streamId)) || (!!text && hasText(text)); });
      const last = used.lastIndexOf(true);
      const replace = existing.slice(last + 1).map((p) => p.pageId);
      document.insertPdfPages(stored, sources, last + 1, replace);
      notice(`${sources.length} ${sources.length === 1 ? "page" : "pages"} added`);
      const target = document.descriptor().pages[last + 1];
      if (target) goToPage(target.pageId);
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
    { key: "page", label: "Blank page", detail: "After this page", icon: "pagePlus", onSelect: addPage },
  ];

  const roomy = width >= control * 17 + 240;
  const compact = width < control * 11 + 92;
  const compactInk = width < control * 16 + 100;
  const showPageCount = width >= control * 7 + 80 || pages.length < 100;
  const directPageActions = roomy || (mode === "type" && width >= control * 13 + 135);
  const leading = (
    <>
      {navigation}
      {editable ? (
        <View role="radiogroup" aria-label="Type or write" style={{ flexDirection: "row", borderRadius: shape.radius.md, backgroundColor: color.sunken }}>
          {(["type", "write"] as const).map((value) => {
            const active = mode === value;
            const label = value === "type" ? "Type" : "Write";
            const icon = value === "type" ? "modeType" : "pen";
            return (
              <Tooltip key={value} text={label}>
                {(tooltip) => (
                  <Press {...tooltip} role="radio" checked={active} label={label} onPress={() => onMode(value)} height={control} testID={`note-mode-${value}`}
                    bodyStyle={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, minWidth: input === "touch" ? 44 : control, paddingHorizontal: roomy ? space.sm : 0, backgroundColor: active ? color.selected : "transparent" }}>
                    <Icon name={icon} size={16} active={active} color={active ? color.ink : color.inkSoft} />
                    {roomy ? <Text variant="label" tone={active ? "ink" : "soft"} numberOfLines={1}>{label}</Text> : null}
                  </Press>
                )}
              </Tooltip>
            );
          })}
        </View>
      ) : null}
    </>
  );
  const settingsItem: MenuItem = { key: "paper", label: "Page settings", icon: "settings", onSelect: () => setSettings(true) };
  const percent = `${Math.round(zoom * 100)}%`;
  const zoomItems: MenuItem[] = [
    { key: "zoom-in", label: "Zoom in", icon: "plus", disabled: zoom >= MAX_ZOOM, onSelect: () => preview.zoomBy(1.25) },
    { key: "zoom-out", label: "Zoom out", icon: "minus", disabled: zoom <= MIN_ZOOM, onSelect: () => preview.zoomBy(1 / 1.25) },
    { key: "zoom-reset", label: "Fit width", detail: "100%", icon: "fit", selected: zoom === 1, onSelect: () => preview.zoomBy(1 / zoom) },
    ...[1.5, 2].map((level) => ({ key: `zoom-${level}`, label: `${level * 100}%`, selected: Math.abs(zoom - level) < 0.005, onSelect: () => preview.zoomBy(level / zoom) })),
  ];
  const options: MenuItem[] = [
    ...(editable && !directPageActions ? [...insertItems, settingsItem] : []),
    ...(roomy ? [] : zoomItems.slice(0, 3).map((item) => (item.key === "zoom-reset" ? { ...item, label: "Reset zoom", detail: `${percent} · fit width at 100%`, selected: undefined, disabled: zoom === 1 } : item))),
    ...actions.items,
  ];
  const end = (
    <>
      {pages.length ? (
        <View ref={pageAnchor} collapsable={false}>
          <Tooltip text={endless ? "Pages · Endless note" : "Go to page"}>
            {(tooltip) => (
              <Press {...tooltip} label={`Pages, page ${current + 1} of ${pages.length}`} expanded={pagePicker} onPress={() => setPagePicker(true)} height={control} testID="note-pages"
                bodyStyle={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, paddingHorizontal: space.xs }}>
                {roomy || !showPageCount ? <Icon name="layers" size={16} color={color.inkSoft} /> : null}
                {showPageCount ? <Text variant="micro" tone="soft" numberOfLines={1}>{current + 1} / {pages.length}</Text> : null}
                {roomy ? <Icon name="chevronDown" size={12} color={color.inkFaint} /> : null}
              </Press>
            )}
          </Tooltip>
        </View>
      ) : null}
      {editable && directPageActions ? (
        <>
          <View ref={insertAnchor} collapsable={false}>
            <Tooltip text="Insert">
              {(tooltip) => <IconButton {...tooltip} icon="plus" size="small" label="Insert a picture, PDF or page" expanded={inserting} onPress={() => setInserting(true)} />}
            </Tooltip>
          </View>
          <Tooltip text="Page settings">
            {(tooltip) => <IconButton {...tooltip} icon="settings" size="small" label="Page settings" testID="note-page-settings" onPress={() => setSettings(true)} />}
          </Tooltip>
        </>
      ) : null}
      {roomy ? (
        <View ref={zoomAnchor} collapsable={false}>
          <Tooltip text="Zoom">
            {(tooltip) => (
              <Press {...tooltip} label={`Zoom, ${percent}`} expanded={zooming} onPress={() => setZooming(true)} height={control} testID="note-zoom"
                bodyStyle={{ minWidth: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xs }}>
                <Text variant="label" tone="soft" style={{ fontVariant: ["tabular-nums"] }}>{percent}</Text>
              </Press>
            )}
          </Tooltip>
        </View>
      ) : null}
      <DocumentActions {...actions} items={options} compact={compact} showStatus={roomy && !actions.fullScreen?.active} />
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
  const settleZone = (y: number) => {
    const bottom = Math.max(0, pagesHeight - size.height);
    if (y > bottom) {
      offsetRef.current.y = bottom;
      setScroll((at) => ({ ...at, y: bottom }));
      vertical.current?.scrollTo({ y: bottom, animated: false });
    }
  };
  const addPageAtEnd = () => {
    if (adding.current || !pullable) return;
    adding.current = true;
    goToPage(document.addPage(pages.length - 1));
    setWheelPull(0);
    setTimeout(() => { adding.current = false; }, 500);
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
      if (pulled >= WHEEL_PULL) { pulled = 0; armed = false; addLatest.current(); return; }
      idle = setTimeout(() => { pulled = 0; armed = false; setWheelPull(0); }, 700);
    };
    node.addEventListener("wheel", onWheel, { passive: true });
    return () => { node.removeEventListener("wheel", onWheel); clearTimeout(idle); };
  }, [pullable, size.width > 0]);
  const revealed = Math.max(0, Math.min(1, (scroll.y - Math.max(0, pagesHeight - size.height)) / PULL));
  const pullProgress = Platform.OS === "web" ? wheelPull : armed ? revealed : 0;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (preview.pinching) return;
    const { y } = clampPageScroll(event.nativeEvent.contentOffset, { width: contentWidth, height: contentHeight }, size);
    offsetRef.current.y = y;
    if (heldPage && Math.abs(y - heldPage.y) >= 8) setHeldPage(null);
    // The ink windows reach MARGIN past the view, so the layout follows the scroll in steps; a pull shows its progress finely.
    const atEnd = y <= 0 || y >= contentHeight - size.height - 1;
    if (Math.abs(y - scroll.y) >= (armedRef.current ? 8 : SCROLL_STEP) || (atEnd && y !== scroll.y)) setScroll((s) => ({ ...s, y }));
  };

  return (
    <View style={{ flex: 1 }}>
      {editable ? (mode === "type"
        ? <FormatBar format={format} send={send} compact={compact} leading={leading} end={end} />
        : <InkToolbar tool={tool} onTool={setTool} stylusKnown={stylusKnown} canUndo={!!activeScene?.canUndo()} canRedo={!!activeScene?.canRedo()} onUndo={() => activeScene?.undo()} onRedo={() => activeScene?.redo()}
            selection={selection?.ids.length ?? 0} onSelectionAction={onSelectionAction} leading={leading} end={end} compact={compactInk} compactUndo={!compact}
            onClearPage={activeScene ? () => { const all = activeScene.strokes().map((stroke) => stroke.id); if (all.length) { setSelection(null); activeScene.remove(all); } } : undefined} />) : <ToolbarRow start={leading} end={end} />}
      <View ref={preview.area} collapsable={false} {...({ dataSet: { ownsWheel: "all" } } as object)} style={{ flex: 1, backgroundColor: color.sunken, overflow: "hidden" }} onLayout={(e: LayoutChangeEvent) => { setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }); preview.onAreaLayout(); }}>
        <PinchStage stage={preview.stage} onPagePinch={preview.onPagePinch}>
        {size.width ? (
          <ScrollView ref={horizontal} horizontal style={drawOutside} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled" scrollEnabled={contentWidth > size.width + 1} showsHorizontalScrollIndicator={contentWidth > size.width + 1} onScroll={(e) => {
            if (preview.pinching) return;
            const { x } = clampPageScroll(e.nativeEvent.contentOffset, stack, size);
            offsetRef.current.x = x;
            setScroll((s) => (Math.abs(x - s.x) >= SCROLL_STEP || x === 0 ? { ...s, x } : s));
          }} scrollEventThrottle={32} contentContainerStyle={{ width: spanWidth }}>
            <ScrollView ref={vertical} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled" style={{ width: spanWidth, height: size.height, ...drawOutside }} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ height: spanHeight }}
              onScrollBeginDrag={(e) => {
                armedRef.current = Platform.OS !== "web" && pullable && e.nativeEvent.contentOffset.y + size.height >= pagesHeight - 24;
                setArmed(armedRef.current);
              }}
              onScrollEndDrag={(e) => {
                const y = e.nativeEvent.contentOffset.y, speed = Math.abs(e.nativeEvent.velocity?.y ?? 0);
                if (armedRef.current && y - Math.max(0, pagesHeight - size.height) >= PULL - 16 && speed < PULL_RELEASE_SPEED) addPageAtEnd();
                else settleZone(y);
                armedRef.current = false;
                setArmed(false);
              }}
              onMomentumScrollEnd={(e) => { if (!armedRef.current) settleZone(e.nativeEvent.contentOffset.y); }}>
              {layout.map((row) => {
                const left = row.left;
                const near = row.top + row.height > scroll.y - size.height * (1 + reach) && row.top < scroll.y + size.height * (2 + reach);
                if (!near) return <View key={row.page.pageId} style={{ position: "absolute", top: row.top, left, width: row.width, height: row.height, backgroundColor: DOCUMENT_DEFAULTS.paper, opacity: 0.6 }} />;
                const x0 = Math.max(0, Math.floor((scroll.x - left - reachX) / SNAP) * SNAP), y0 = Math.max(0, Math.floor((scroll.y - row.top - reachY) / SNAP) * SNAP);
                const x1 = Math.min(row.width, Math.ceil((scroll.x + size.width - left + reachX) / SNAP) * SNAP), y1 = Math.min(row.height, Math.ceil((scroll.y + size.height - row.top + reachY) / SNAP) * SNAP);
                const s = scene(row.page), paper = row.page.originalAssetId ? null : s.paper();
                const background = typeof row.page.extensions.backgroundAssetId === "string" ? row.page.extensions.backgroundAssetId : null;
                const text = textDoc(row.page), box = textBox(row.page, paper);
                const typingHere = mode === "type" && typing === row.page.pageId && editable && !!text;
                const look = { size: BODY, line: box.line, ink: paper ? paperInk(paper.color) : DOCUMENT_DEFAULTS.ink, soft: paper ? inkOutline.paperLabelColor(paper) : "#5b6170", font: undefined };
                return (
                  <View key={row.page.pageId} style={{ position: "absolute", top: row.top, left, width: row.width, height: row.height, backgroundColor: paper?.color ?? DOCUMENT_DEFAULTS.paper, overflow: "hidden", boxShadow: theme.surface("raised").boxShadow }} testID="ink-page">
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
                          <PageTextEditor key={row.page.pageId} handle={editor} doc={text} document={document} page={row.page} paper={paper} scale={scale} line={box.line} area={{ width: box.width, height: row.page.height - box.top - 24 }} template={row === layout[0] ? JSON.stringify(typedTemplate(templateOf(descriptor)).blocks) : "[]"}
                            onFormat={setFormat} pendingImage={pendingImage} onImageDone={() => setPendingImage(null)} onHeight={(h) => document.growPage(row.page.pageId, box.top + h + (endless ? ENDLESS_ROOM : 80))} />
                        </View>
                      ) : (
                        <Press label="Type on this page" feedback="none" onPress={() => { if (mode === "type" && editable) { setHeldPage({ id: row.page.pageId, y: offsetRef.current.y }); setTyping(row.page.pageId); setFormat(NO_FORMAT); } }}
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
                          onSelection={(ids) => setSelection(ids.length ? { page: row.page.pageId, ids } : null)} onPan={pan} onPagePinch={preview.inkPinch} onPenSeen={penSeen} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </ScrollView>
        ) : null}
        </PinchStage>
        <ZoomBadge ref={zoomBadge} />
        {pullable && pullProgress > 0 ? (
          <View pointerEvents="none" testID="note-pull-zone" style={[theme.surface("raised", "md"), { position: "absolute", bottom: space.air, alignSelf: "center", padding: space.sm, gap: space.xs, alignItems: "center" }]}>
            <Text variant="caption">{Platform.OS === "web" ? "Scroll to add a page" : pullProgress >= 0.9 ? "Release to add a page" : "Pull to add a page"}</Text>
            <View style={{ width: space.sky, height: space.hair, borderRadius: shape.radius.xs, backgroundColor: color.line, overflow: "hidden" }}>
              <View style={{ width: space.sky * pullProgress, height: space.hair, backgroundColor: color.accent.fill }} />
            </View>
          </View>
        ) : null}
      </View>
      <Popover open={pagePicker} anchor={pageAnchor} onClose={() => setPagePicker(false)} label="Pages" width={248}>
        <View style={{ padding: space.xs }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.md, paddingVertical: space.sm }}>
            <Text variant="label">Pages</Text>
            <Text variant="micro" tone="soft">{endless ? "Endless" : pages.length}</Text>
          </View>
          <FlatList data={pages} keyExtractor={(page) => page.pageId} initialScrollIndex={current}
            getItemLayout={(_, index) => ({ index, length: rowHeight, offset: rowHeight * index })}
            style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => <ListRow icon={item.originalAssetId ? "pdf" : "notes"} title={`Page ${index + 1}`} selected={index === current} onPress={() => goToPage(item.pageId)} />} />
          {editable ? <ListRow icon="pagePlus" title="Add page" onPress={addPage} /> : null}
        </View>
      </Popover>
      <Menu open={inserting} anchor={insertAnchor} onClose={() => setInserting(false)} items={insertItems} label="Insert" side="bottom" />
      <Menu open={zooming} anchor={zoomAnchor} onClose={() => setZooming(false)} items={zoomItems} label="Zoom" side="bottom" />
      <PageSettings open={settings} onClose={() => setSettings(false)} onAddPage={() => { setSettings(false); addPage(); }} library={library} document={document} page={activePage ?? null} scenes={scenes.current} />
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
function PageTextEditor({ handle, doc, document, page, paper, scale, line, area, template, onFormat, pendingImage, onImageDone, onHeight }: {
  handle: React.RefObject<RichTextHandle | null>; doc: Y.Doc; document: OpenDocument; page: Page; paper: InkPaper | null; scale: number; line: number; area: { width: number; height: number }; template: string;
  onFormat(format: Format): void; pendingImage: { url: string; name: string; width: number } | null; onImageDone(): void; onHeight(height: number): void;
}) {
  const theme = useTheme();
  const origin = useMemo(() => ({}), []);
  const initial = useMemo(() => toBase64(Y.encodeStateAsUpdate(doc)), [doc]);
  const { color } = theme;
  const textInk = paper ? paperInk(paper.color) : DOCUMENT_DEFAULTS.ink;
  const soft = paper ? inkOutline.paperLabelColor(paper) : "#5b6170";
  const rule = paper?.rule ?? "#d9dce3";
  const look = useMemo<RichTextLook>(() => ({
    ink: textInk, soft, faint: soft, line: rule, accent: color.accent.ink, wash: color.accent.wash,
    paper: "transparent", font: FONT, menu: color.float, menuInk: color.ink,
  }), [textInk, soft, rule, color]);
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
