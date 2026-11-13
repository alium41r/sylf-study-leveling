// Pages you write on: a handwritten notebook, or a PDF with its ink. Pages stack and scroll. Only pages in view get a writing surface,
// and each surface covers only the part of its page that is showing, so a long document or a deep zoom costs what one screen costs.
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { IconButton, Menu, Text, useTheme, type MenuItem , type ViewHandle } from "@sylf/design-system";
import { notesPdf, type DocumentDescriptor } from "@sylf/shared";
import { InkScene, PAPER_TEMPLATES, paperFor, type NotesLibrary, type OpenDocument } from "@sylf/notes";
import InkToolbar from "./InkToolbar";
import InkView from "./InkView";
import PdfPageImage from "./PdfPageImage";
import { DEFAULT_TOOL } from "./ink-types";
import { useInkTool } from "./ink-tool";
import { MAX_ZOOM, MIN_ZOOM, PinchStage, clampPageScroll, stackPages, usePagePinch } from "./page-pinch";

import { pageAt, pageOffset } from "./page-navigation";
import { watchScene } from "./scene-face";
import { ZoomBadge, type ZoomBadgeHandle } from "./ZoomBadge";

type Page = DocumentDescriptor["pages"][number];
const SNAP = 96, MARGIN = 160;
// How far a scroll moves before the pages are laid out again: well inside MARGIN, so ink is always drawn where it shows.
const SCROLL_STEP = 40;

function sceneFor(document: OpenDocument, page: Page, pdf: boolean) {
  const doc = document.stream(page.streamId);
  return new InkScene(doc, pdf ? { records: notesPdf.pdfPageMaps(doc).ink } : {});
}

export default function PagedInk({ library, document, pdf, editable, initialPage, onPage, leading, corner, compact, compactUndo }: { library: NotesLibrary; document: OpenDocument; pdf: boolean; editable: boolean; initialPage: number; onPage(page: number): void; leading?: ReactNode; corner?: ReactNode; compact?: boolean; compactUndo?: boolean }) {
  const { space, color, surface } = useTheme();
  const gap = space.md;
  const [descriptor, setDescriptor] = useState(document.descriptor());
  useEffect(() => document.subscribe(() => setDescriptor(document.descriptor())), [document]);
  const pages = descriptor.pages;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [tool, setTool, stylusKnown, penSeen] = useInkTool(pdf ? { ...DEFAULT_TOOL, tool: "highlighter", color: "#e4b930" } : DEFAULT_TOOL);
  const [selection, setSelection] = useState<{ page: string; ids: string[] } | null>(null);
  const [pageMenu, setPageMenu] = useState(false);
  const pageMenuAnchor = useRef<ViewHandle>(null);
  const vertical = useRef<ComponentRef<typeof ScrollView>>(null), horizontal = useRef<ComponentRef<typeof ScrollView>>(null);
  const restored = useRef(false);
  const [, bump] = useState(0);

  // One scene per page, made when a page first comes into view and closed with the document.
  const scenes = useRef(new Map<string, InkScene>());
  const scene = (page: Page) => {
    let found = scenes.current.get(page.pageId);
    if (!found) { found = sceneFor(document, page, pdf); scenes.current.set(page.pageId, found); watchScene(found, () => bump((n) => n + 1)); }
    return found;
  };
  useEffect(() => () => { for (const s of scenes.current.values()) s.close(); scenes.current.clear(); }, []);

  const shown = useMemo(() => pages.map((page) => (pdf ? notesPdf.displayedPageSize(page) : { width: page.width, height: page.height })), [pages, pdf]);
  const widest = Math.max(1, ...shown.map((p) => p.width));
  const fit = size.width ? Math.max(1, size.width - gap * 2) / widest : 0.5;
  const scaleAt = (z: number) => fit * z;
  const scale = scaleAt(zoom);
  // Gaps scale with the zoom, as in a note, so a pinch previews every page exactly.
  const layoutAt = (z: number) => stackPages(shown, scaleAt(z), size.width, gap * z);
  const stack = useMemo(() => stackPages(shown, scale, size.width, gap * zoom), [shown, scale, size.width, gap, zoom]);
  const layout = useMemo(() => stack.rows.map((row, i) => ({ ...row, page: pages[i] })), [stack]);
  const contentHeight = stack.height;
  const contentWidth = stack.width;
  const current = pageAt(layout, scroll.y, size.height);
  const offsetRef = useRef({ x: 0, y: 0 });
  useEffect(() => { if (restored.current) onPage(current); }, [current]);
  useEffect(() => {
    if (restored.current || !size.height || !layout.length) return;
    const row = layout[Math.max(0, Math.min(initialPage, layout.length - 1))];
    const y = pageOffset(row, gap * zoom, contentHeight, size.height);
    const frame = requestAnimationFrame(() => {
      restored.current = true;
      offsetRef.current.y = y;
      setScroll((at) => ({ ...at, y }));
      vertical.current?.scrollTo({ y, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [size.height, layout, contentHeight, gap, zoom]);
  const zoomBadge = useRef<ZoomBadgeHandle>(null);
  const preview = usePagePinch({ onZoom: (z) => zoomBadge.current?.show(z), zoom, layoutAt, view: size, content: stack, offset: offsetRef, vertical, horizontal, commit: (z, at) => { setZoom(z); setScroll(at); } });
  // As in a note: while a pinch can zoom out, the pages around the view are drawn too, and the scrolled content is as large as the
  // largest zoom so the landing scroll is never cut short.
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

  const active = layout[current]?.page;
  const activeScene = active ? scene(active) : null;
  const pageItems: MenuItem[] = pdf ? [] : [
    { key: "add", label: "Add page after this", icon: "pagePlus", onSelect: () => { document.addPage(current); requestAnimationFrame(() => vertical.current?.scrollTo({ y: (layout[current]?.top ?? 0) + (layout[current]?.height ?? 0), animated: true })); } },
    ...PAPER_TEMPLATES.map((t) => ({ key: `paper-${t.id}`, label: `Paper: ${t.label}`, selected: activeScene?.paper().template === t.id, onSelect: () => activeScene?.setPaper({ ...activeScene.paper(), template: t.id, spacing: paperFor(t.id).spacing }) })),
    ...(pages.length > 1 ? [{ key: "delete", label: "Delete this page", icon: "trash" as const, destructive: true, onSelect: () => active && document.removePage(active.pageId) }] : []),
  ];

  const selectionScene = selection ? scenes.current.get(selection.page) : null;
  const onSelectionAction = (action: "delete" | "done" | "bigger" | "smaller" | { color: string }) => {
    if (!selection || !selectionScene) return;
    if (action === "delete") selectionScene.remove(selection.ids);
    else if (action === "bigger") selectionScene.scale(selection.ids, 1.15);
    else if (action === "smaller") selectionScene.scale(selection.ids, 1 / 1.15);
    else if (typeof action === "object") selectionScene.recolor(selection.ids, action.color);
    if (action === "delete" || action === "done") setSelection(null);
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (preview.pinching) return;
    const { y } = clampPageScroll(event.nativeEvent.contentOffset, stack, size);
    offsetRef.current.y = y;
    const atEnd = y <= 0 || y >= contentHeight - size.height - 1;
    if (Math.abs(y - scroll.y) >= SCROLL_STEP || (atEnd && y !== scroll.y)) setScroll((s) => ({ ...s, y }));
  };

  return (
    <View style={{ flex: 1 }}>
      {editable ? (
        <InkToolbar tool={tool} onTool={setTool} stylusKnown={stylusKnown}
          canUndo={!!activeScene?.canUndo()} canRedo={!!activeScene?.canRedo()} onUndo={() => activeScene?.undo()} onRedo={() => activeScene?.redo()}
          selection={selection?.ids.length ?? 0} onSelectionAction={onSelectionAction} leading={leading} compact={compact} compactUndo={compactUndo}
          onClearPage={activeScene ? () => { const all = activeScene.strokes().map((stroke) => stroke.id); if (all.length) { setSelection(null); activeScene.remove(all); } } : undefined}
          trailing={
            <>
              <IconButton icon="minus" size="small" label="Zoom out" disabled={zoom <= MIN_ZOOM} onPress={() => preview.zoomBy(1 / 1.25)} />
              <Text variant="micro" tone="soft" style={{ minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</Text>
              <IconButton icon="plus" size="small" label="Zoom in" disabled={zoom >= MAX_ZOOM} onPress={() => preview.zoomBy(1.25)} />
              {pdf ? null : <View ref={pageMenuAnchor} collapsable={false}><IconButton icon="pagePlus" size="small" label="Pages and paper" onPress={() => setPageMenu(true)} /></View>}
            </>
          } end={corner} />
      ) : null}
      <View ref={preview.area} collapsable={false} {...({ dataSet: { ownsWheel: "all" } } as object)} style={{ flex: 1, backgroundColor: color.sunken, overflow: "hidden" }} onLayout={(e: LayoutChangeEvent) => { setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }); preview.onAreaLayout(); }}>
        <PinchStage stage={preview.stage} onPagePinch={preview.onPagePinch}>
        {size.width ? (
          <ScrollView keyboardShouldPersistTaps="handled" ref={horizontal} horizontal style={drawOutside} bounces={false} overScrollMode="never" scrollEnabled={contentWidth > size.width + 1} showsHorizontalScrollIndicator={contentWidth > size.width + 1} onScroll={(e) => {
            if (preview.pinching) return;
            const { x } = clampPageScroll(e.nativeEvent.contentOffset, stack, size);
            offsetRef.current.x = x;
            setScroll((s) => (Math.abs(x - s.x) >= SCROLL_STEP || x === 0 ? { ...s, x } : s));
          }} scrollEventThrottle={32} contentContainerStyle={{ width: spanWidth }}>
            <ScrollView keyboardShouldPersistTaps="handled" ref={vertical} bounces={false} overScrollMode="never" style={{ width: spanWidth, height: size.height, ...drawOutside }} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator contentContainerStyle={{ height: spanHeight }}>
              {layout.map((row) => {
                const left = row.left;
                const near = row.top + row.height > scroll.y - size.height * (1 + reach) && row.top < scroll.y + size.height * (2 + reach);
                if (!near) return <View key={row.page.pageId} style={{ position: "absolute", top: row.top, left, width: row.width, height: row.height, backgroundColor: "#ffffff", opacity: 0.6 }} />;
                // The visible part of this page, snapped so small scrolls do not move the surface.
                const x0 = Math.max(0, Math.floor((scroll.x - left - reachX) / SNAP) * SNAP), y0 = Math.max(0, Math.floor((scroll.y - row.top - reachY) / SNAP) * SNAP);
                const x1 = Math.min(row.width, Math.ceil((scroll.x + size.width - left + reachX) / SNAP) * SNAP), y1 = Math.min(row.height, Math.ceil((scroll.y + size.height - row.top + reachY) / SNAP) * SNAP);
                const s = scene(row.page);
                return (
                  <View key={row.page.pageId} style={{ position: "absolute", top: row.top, left, width: row.width, height: row.height, backgroundColor: "#ffffff", overflow: "hidden", boxShadow: "0 1px 3px rgba(20,24,40,0.12), 0 6px 18px rgba(20,24,40,0.08)" }} testID="ink-page">
                    {pdf && row.page.originalAssetId ? <PdfPageImage library={library} hash={row.page.originalAssetId} index={row.page.sourcePage ?? 0} width={row.width} height={row.height} /> : null}
                    {x1 > x0 && y1 > y0 ? (
                      <View style={{ position: "absolute", left: x0, top: y0 }}>
                        <InkView scene={s} pageWidth={row.page.width} pageHeight={row.page.height} camera={{ x: x0 / scale, y: y0 / scale, zoom: scale }} width={x1 - x0} height={y1 - y0}
                          tool={tool} drawPaper={!pdf} editable={editable} selection={selection?.page === row.page.pageId ? selection.ids : []}
                          onSelection={(ids) => { setSelection(ids.length ? { page: row.page.pageId, ids } : null); }}
                          onPan={pan} onPagePinch={preview.inkPinch} onPenSeen={penSeen} />
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
        {pages.length > 1 ? (
          <View pointerEvents="none" style={[surface("float", "sm"), { position: "absolute", right: space.md, bottom: space.md, paddingHorizontal: space.sm, paddingVertical: space.xs }]}>
            <Text variant="micro" tone="soft">{current + 1} / {pages.length}</Text>
          </View>
        ) : null}
      </View>
      <Menu open={pageMenu} anchor={pageMenuAnchor } onClose={() => setPageMenu(false)} items={pageItems} label="Pages" side="bottom" />
    </View>
  );
}
