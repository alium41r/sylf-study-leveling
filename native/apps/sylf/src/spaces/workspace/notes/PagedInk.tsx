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

type Page = DocumentDescriptor["pages"][number];
const GAP = 20, SNAP = 96, MARGIN = 160;

function sceneFor(document: OpenDocument, page: Page, pdf: boolean) {
  const doc = document.stream(page.streamId);
  return new InkScene(doc, pdf ? { records: notesPdf.pdfPageMaps(doc).ink } : {});
}

export default function PagedInk({ library, document, pdf, editable, initialPage, onPage, header }: { library: NotesLibrary; document: OpenDocument; pdf: boolean; editable: boolean; initialPage: number; onPage(page: number): void; header?: ReactNode }) {
  const { space, color } = useTheme();
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
    if (!found) { found = sceneFor(document, page, pdf); scenes.current.set(page.pageId, found); found.subscribe(() => bump((n) => n + 1)); }
    return found;
  };
  useEffect(() => () => { for (const s of scenes.current.values()) s.close(); scenes.current.clear(); }, []);

  const widest = Math.max(1, ...pages.map((p) => (pdf ? notesPdf.displayedPageSize(p).width : p.width)));
  const fit = size.width ? (size.width - GAP * 2) / widest : 0.5;
  const scale = Math.max(0.15, fit * zoom);
  const layout = useMemo(() => {
    let top = GAP;
    return pages.map((page) => {
      const shown = pdf ? notesPdf.displayedPageSize(page) : { width: page.width, height: page.height };
      const row = { page, top, width: shown.width * scale, height: shown.height * scale };
      top += row.height + GAP;
      return row;
    });
  }, [pages, scale, pdf]);
  const contentHeight = (layout.at(-1)?.top ?? 0) + (layout.at(-1)?.height ?? 0) + GAP;
  const contentWidth = Math.max(size.width, widest * scale + GAP * 2);
  const current = Math.max(0, layout.findIndex((row) => row.top + row.height > scroll.y + size.height / 3));

  useEffect(() => { onPage(current); }, [current]);
  useEffect(() => {
    if (restored.current || !size.height || !layout.length) return;
    restored.current = true;
    const row = layout[Math.min(initialPage, layout.length - 1)];
    if (row && initialPage > 0) requestAnimationFrame(() => vertical.current?.scrollTo({ y: row.top - GAP, animated: false }));
  }, [size.height, layout.length]);

  // Two fingers zoom around a point; keep that point still.
  const pinch = (factor: number) => setZoom((z) => Math.max(0.5, Math.min(3, z * factor)));
  const pan = (dx: number, dy: number) => {
    vertical.current?.scrollTo({ y: Math.max(0, scroll.y - dy), animated: false });
    if (contentWidth > size.width) horizontal.current?.scrollTo({ x: Math.max(0, scroll.x - dx), animated: false });
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
    const y = event.nativeEvent.contentOffset.y;
    if (Math.abs(y - scroll.y) >= 8) setScroll((s) => ({ ...s, y }));
  };

  return (
    <View style={{ flex: 1 }}>
      {editable ? (
        <InkToolbar tool={tool} onTool={setTool} stylusKnown={stylusKnown}
          canUndo={!!activeScene?.canUndo()} canRedo={!!activeScene?.canRedo()} onUndo={() => activeScene?.undo()} onRedo={() => activeScene?.redo()}
          selection={selection?.ids.length ?? 0} onSelectionAction={onSelectionAction}
          trailing={
            <>
              <IconButton icon="minus" size="small" label="Zoom out" onPress={() => pinch(1 / 1.25)} />
              <Text variant="micro" tone="soft" style={{ minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</Text>
              <IconButton icon="plus" size="small" label="Zoom in" onPress={() => pinch(1.25)} />
              {pdf ? null : <View ref={pageMenuAnchor} collapsable={false}><IconButton icon="pagePlus" size="small" label="Pages and paper" onPress={() => setPageMenu(true)} /></View>}
            </>
          } />
      ) : null}
      {header}
      <View style={{ flex: 1, backgroundColor: color.sunken }} onLayout={(e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {size.width ? (
          <ScrollView keyboardShouldPersistTaps="handled" ref={horizontal} horizontal scrollEnabled={contentWidth > size.width + 1} showsHorizontalScrollIndicator={contentWidth > size.width + 1} onScroll={(e) => setScroll((s) => ({ ...s, x: e.nativeEvent.contentOffset.x }))} scrollEventThrottle={32} contentContainerStyle={{ width: contentWidth }}>
            <ScrollView keyboardShouldPersistTaps="handled" ref={vertical} style={{ width: contentWidth, height: size.height }} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator contentContainerStyle={{ height: contentHeight }}>
              {layout.map((row) => {
                const left = (contentWidth - row.width) / 2;
                const near = row.top + row.height > scroll.y - size.height && row.top < scroll.y + size.height * 2;
                if (!near) return <View key={row.page.pageId} style={{ position: "absolute", top: row.top, left, width: row.width, height: row.height, backgroundColor: "#ffffff", opacity: 0.6 }} />;
                // The visible part of this page, snapped so small scrolls do not move the surface.
                const x0 = Math.max(0, Math.floor((scroll.x - left - MARGIN) / SNAP) * SNAP), y0 = Math.max(0, Math.floor((scroll.y - row.top - MARGIN) / SNAP) * SNAP);
                const x1 = Math.min(row.width, Math.ceil((scroll.x + size.width - left + MARGIN) / SNAP) * SNAP), y1 = Math.min(row.height, Math.ceil((scroll.y + size.height - row.top + MARGIN) / SNAP) * SNAP);
                const s = scene(row.page);
                return (
                  <View key={row.page.pageId} style={{ position: "absolute", top: row.top, left, width: row.width, height: row.height, backgroundColor: "#ffffff", overflow: "hidden", boxShadow: "0 1px 3px rgba(20,24,40,0.12), 0 6px 18px rgba(20,24,40,0.08)" }} testID="ink-page">
                    {pdf && row.page.originalAssetId ? <PdfPageImage library={library} hash={row.page.originalAssetId} index={row.page.sourcePage ?? 0} width={row.width} height={row.height} /> : null}
                    {x1 > x0 && y1 > y0 ? (
                      <View style={{ position: "absolute", left: x0, top: y0 }}>
                        <InkView scene={s} pageWidth={row.page.width} pageHeight={row.page.height} camera={{ x: x0 / scale, y: y0 / scale, zoom: scale }} width={x1 - x0} height={y1 - y0}
                          tool={tool} drawPaper={!pdf} editable={editable} selection={selection?.page === row.page.pageId ? selection.ids : []}
                          onSelection={(ids) => { setSelection(ids.length ? { page: row.page.pageId, ids } : null); }}
                          onPan={pan} onPinch={(factor) => pinch(factor)} onPenSeen={penSeen} wheel="zoom" />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </ScrollView>
        ) : null}
        {pages.length > 1 ? (
          <View pointerEvents="none" style={{ position: "absolute", right: space.md, bottom: space.md, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "rgba(20,24,40,0.55)" }}>
            <Text variant="micro" style={{ color: "#ffffff" }}>{current + 1} / {pages.length}</Text>
          </View>
        ) : null}
      </View>
      <Menu open={pageMenu} anchor={pageMenuAnchor } onClose={() => setPageMenu(false)} items={pageItems} label="Pages" side="bottom" />
    </View>
  );
}
