"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  PanelLeft,
  Search,
  PenLine,
  Highlighter,
  Eraser,
  LassoSelect,
  TextCursorInput,
  MessageSquare,
  MousePointer2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  MoreHorizontal,
  Bookmark,
  RotateCw,
  Plus,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  Underline,
  Strikethrough,
  Palette,
} from "lucide-react";
import type { NotesLibrary, NoteSummary } from "@/lib/notes/library";
import type { SaveState } from "@/lib/notes/engine";
import { PdfDocumentPool, inspectPdf, searchPdf } from "@/lib/notes/pdf-reader";
import {
  displayedPageSize,
  layoutPdfPages,
  pdfRotation,
  type PdfMark,
} from "@/lib/notes/pdf";
import type { InkTools } from "@/lib/notes/ink-controller";
import { exportAnnotatedPdf, wrapPdfText } from "@/lib/notes/pdf-export";
import { exportNotesRecovery } from "@/lib/notes/portable";
import { downloadNotesBytes } from "@/lib/notes/download";
import PdfThumbnail from "./PdfThumbnail";
import PdfPage, {
  type PdfTool,
  type PdfPageHandle,
  type PdfSelection,
} from "./PdfPage";
import NotesDialog from "./NotesDialog";
import PenPanel from "./PenPanel";
import type { PenPreset } from "@/lib/notes/note-style";
import s from "../Pdf.module.css";
import shared from "../Notes.module.css";
const buttons = [
  { tool: "read", label: "Select text", Icon: MousePointer2 },
  { tool: "pen", label: "Pen", Icon: PenLine },
  { tool: "highlighter", label: "Highlighter", Icon: Highlighter },
  { tool: "eraser", label: "Stroke eraser", Icon: Eraser },
  { tool: "lasso", label: "Lasso selection", Icon: LassoSelect },
  { tool: "text", label: "Text annotation", Icon: TextCursorInput },
  { tool: "comment", label: "Comment", Icon: MessageSquare },
] as const;
const statusText: Record<SaveState, string> = {
  ready: "Ready",
  saving: "Saving on device…",
  "local-durable": "Saved on device",
  pausing: "Annotations paused",
  failed: "Not saved — recovery available",
  closed: "Locked",
};
export default function PdfWorkspace({
  library,
  note,
  pageId,
  onBack,
  onError,
  onState,
  registerLeave,
  diagnostics = false,
}: {
  library: NotesLibrary;
  note: NoteSummary;
  pageId?: string;
  onBack: () => void;
  onError: (message: string) => void;
  onState: (state: SaveState) => void;
  registerLeave: (callback?: () => Promise<void>) => () => void;
  diagnostics?: boolean;
}) {
  const pages = useMemo(
      () => note.view.descriptor.pages.filter((p) => !p.extensions.archived),
      [note.view.descriptor.pages]
    ),
    removed = useMemo(
      () => note.view.descriptor.pages.filter((p) => p.extensions.archived),
      [note.view.descriptor.pages]
    ),
    [penStudio, setPenStudio] = useState(false),
    [pens, setPens] = useState(() => library.preferences().pens),
    [current, setCurrent] = useState(pageId || pages[0]?.pageId),
    [tool, setTool] = useState<PdfTool>("read"),
    [settings, setSettings] = useState<InkTools>({
      tool: "pen",
      color: "#242830",
      width: 2.8,
      finger: false,
    }),
    [zoomValue, setZoomValue] = useState<number | "fit">(
      note.resume?.pdfViewport?.zoom || "fit"
    ),
    [width, setWidth] = useState(700),
    [scroll, setScroll] = useState({ top: 0, height: 800 }),
    [rail, setRail] = useState(false),
    [tab, setTab] = useState<"pages" | "search" | "bookmarks" | "annotations">(
      "pages"
    ),
    [focus, setFocus] = useState(false),
    [showRemoved, setShowRemoved] = useState(false),
    [pageLimit, setPageLimit] = useState(50),
    [saveState, setSaveState] = useState<SaveState>("ready"),
    [busy, setBusy] = useState(""),
    [query, setQuery] = useState(""),
    [searchState, setSearchState] = useState(""),
    [hits, setHits] = useState<{ pageId: string; excerpt: string }[]>([]),
    [selection, setSelection] = useState<PdfSelection>(),
    [draft, setDraft] = useState<{
      pageId: string;
      x: number;
      y: number;
      mark?: PdfMark;
    }>(),
    [draftText, setDraftText] = useState(""),
    [undoMode, setUndoMode] = useState<"ink" | "markup">("ink"),
    [, refreshControls] = useState(0),
    [pageHandles, setPageHandles] = useState<Record<string, PdfPageHandle>>({}),
    [pinnedPages, setPinnedPages] = useState<Set<string>>(() => new Set());
  const viewport = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null),
    pendingPage = useRef<string | undefined>(undefined),
    brushes = useRef({
      pen: { color: "#242830", width: 2.8 },
      highlighter: { color: "#e4b930", width: 3.2 },
    }),
    fileInput = useRef<HTMLInputElement>(null),
    pageNumber = useRef<HTMLInputElement>(null),
    zoomTarget = useRef<number | undefined>(undefined),
    handles = useRef(new Map<string, PdfPageHandle>()),
    nav = useRef({ current, zoom: 1, offset: 0 }),
    searchAbort = useRef<AbortController | undefined>(undefined),
    firstPosition = useRef(false);
  const assetKey = JSON.stringify(note.view.descriptor.assets);
  const fullscreenOwned = useRef(false);
  useEffect(() => {
    const change = () => {
      if (!document.fullscreenElement && fullscreenOwned.current) {
        fullscreenOwned.current = false;
        setFocus(false);
      }
    };
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    if (!focus && fullscreenOwned.current && document.fullscreenElement) {
      fullscreenOwned.current = false;
      void document.exitFullscreen().catch(() => {});
    }
  }, [focus]);
  const toggleFullscreen = () => {
    const next = !focus;
    setFocus(next);
    if (next && document.documentElement.requestFullscreen) {
      fullscreenOwned.current = true;
      void document.documentElement.requestFullscreen().catch(() => {
        fullscreenOwned.current = false;
      });
    }
  };
  useEffect(() => {
    if (!focus) return;
    const exit = (event: globalThis.KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !(event.target as HTMLElement).closest("dialog[open], details[open]")
      )
        setFocus(false);
    };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [focus]);
  // Asset identity changes, not body revisions, replace the verified-source pool.
  const pool = useMemo(
    () => new PdfDocumentPool(library, JSON.parse(assetKey)),
    [library, assetKey]
  );
  useEffect(() => () => pool.close(), [pool]);
  const zoom =
    zoomValue === "fit"
      ? Math.max(
          0.25,
          Math.min(
            2,
            (width - 40) /
              Math.max(...pages.map((p) => displayedPageSize(p).width), 1)
          )
        )
      : zoomValue;
  const layout = useMemo(() => layoutPdfPages(pages, zoom), [pages, zoom]);
  const totalHeight = layout.length
      ? layout.at(-1)!.top + layout.at(-1)!.height + 24
      : 0,
    index = pages.findIndex((p) => p.pageId === current),
    activePage = pages[index],
    handle = pageHandles[current],
    locked = note.view.state !== "active",
    selected = handle?.input.selectionCount() || 0;
  useLayoutEffect(() => {
    if (pageNumber.current) pageNumber.current.value = String(index + 1 || 1);
  }, [index]);
  const windowPages = layout
    .filter(
      (item) =>
        item.top + item.height > scroll.top - 300 &&
        item.top < scroll.top + scroll.height + 300
    )
    .slice(0, 5);
  const visible = layout.filter(
    (item) =>
      windowPages.includes(item) ||
      pinnedPages.has(item.page.pageId) ||
      draft?.pageId === item.page.pageId
  );
  const position = layout.find((p) => p.page.pageId === current);
  useLayoutEffect(() => {
    nav.current = { current, zoom, offset: scroll.top - (position?.top || 0) };
    zoomTarget.current = zoom;
  }, [current, zoom, scroll.top, position?.top]);
  useEffect(() => {
    const target = viewport.current;
    if (!target) return;
    const observer = new ResizeObserver(() => {
      setWidth(target.clientWidth);
      setScroll({ top: target.scrollTop, height: target.clientHeight });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const pending = layout.find(
      (item) => item.page.pageId === pendingPage.current
    );
    if (pending && viewport.current) {
      pendingPage.current = undefined;
      viewport.current.scrollTop = pending.top - 20;
      setScroll({
        top: viewport.current.scrollTop,
        height: viewport.current.clientHeight,
      });
    }
  }, [layout, current]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      for (const details of root.current?.querySelectorAll<HTMLDetailsElement>(
        "details[open]"
      ) || [])
        if (!details.contains(event.target as Node)) details.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  const goto = async (id: string) => {
    await handles.current.get(nav.current.current)?.flush();
    const item = layout.find((p) => p.page.pageId === id);
    if (item && viewport.current) {
      viewport.current.scrollTo({ top: item.top - 20, behavior: "instant" });
      setScroll({
        top: viewport.current.scrollTop,
        height: viewport.current.clientHeight,
      });
      setCurrent(id);
      setSelection(undefined);
      if (matchMedia("(max-width:700px)").matches) setRail(false);
    }
  };
  useEffect(() => {
    if (firstPosition.current || !layout.length || !viewport.current) return;
    const item =
      layout.find((p) => p.page.pageId === (pageId || note.resume?.pageId)) ||
      layout[0];
    viewport.current.scrollTop =
      item.top + (note.resume?.pdfViewport?.offset || -20);
    setCurrent(item.page.pageId);
    setScroll({
      top: viewport.current.scrollTop,
      height: viewport.current.clientHeight,
    });
    firstPosition.current = true;
  }, [layout, pageId, note.resume]);
  useEffect(() => {
    if (!pageId || !firstPosition.current) return;
    const item = layout.find((p) => p.page.pageId === pageId);
    if (item && viewport.current) {
      viewport.current.scrollTop = item.top - 20;
      setCurrent(pageId);
      setScroll({
        top: viewport.current.scrollTop,
        height: viewport.current.clientHeight,
      });
    }
    // External page references can open the same mounted document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);
  useEffect(() => {
    const leave = async () => {
      await Promise.all([...handles.current.values()].map((h) => h.flush()));
      const n = nav.current;
      await library.saveResume(note.id, {
        version: 1,
        pageId: n.current,
        scrollRatio: 0,
        pdfViewport: {
          zoom: n.zoom,
          offset: Math.max(-1000000, Math.min(1000000, n.offset)),
        },
      });
    };
    const remove = library.registerBeforeClose(leave);
    const unregisterLeave = registerLeave(leave);
    return () => {
      remove();
      unregisterLeave();
    };
  }, [library, note.id, registerLeave]);
  useEffect(() => () => searchAbort.current?.abort(), []);
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const gotoNumber = (value: string) => {
    const p = pages[Number(value) - 1];
    if (p && p.pageId !== current)
      void run("Opening page…", async () => {
        try {
          await goto(p.pageId);
        } catch (e) {
          if (pageNumber.current) pageNumber.current.value = String(index + 1);
          throw e;
        }
      });
    else if (pageNumber.current)
      pageNumber.current.value = String(index + 1 || 1);
  };
  const act = (fn: () => void) => {
    try {
      if (locked)
        throw new Error("Resolve this document before changing annotations.");
      fn();
      refreshControls((n) => n + 1);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const state = (value: SaveState) => {
    setSaveState(value);
    onState(value);
  };
  const changeZoom = (factor: number) => {
    const root = viewport.current;
    if (!root) return;
    const old = zoom,
      next = Math.max(
        Math.min(
          0.6,
          Math.max(
            0.3,
            (width - 40) /
              Math.max(...pages.map((p) => displayedPageSize(p).width), 1)
          )
        ),
        Math.min(4, (zoomTarget.current ?? old) * factor)
      );
    zoomTarget.current = next;
    const top =
      ((root.scrollTop + root.clientHeight / 2) / old) * next -
      root.clientHeight / 2;
    setZoomValue(next);
    requestAnimationFrame(() => {
      root.scrollTop = top;
      setScroll({ top: root.scrollTop, height: root.clientHeight });
    });
  };
  const markSelection = (kind: "highlight" | "underline" | "strikeout") =>
    act(() => {
      if (!selection) return;
      const h = handles.current.get(selection.pageId);
      if (!h || !h.writable())
        throw new Error(
          "Wait for this page to unlock before marking selected text."
        );
      h.markup.put({
        kind,
        rects: selection.rects,
        text: selection.quote,
        color: kind === "highlight" ? "#e4b930" : settings.color,
        size: 16,
      });
      setUndoMode("markup");
      setSelection(undefined);
      window.getSelection()?.removeAllRanges();
    });
  const startEdit = (id: string, x: number, y: number, mark?: PdfMark) => {
    if (mark && !["text", "comment"].includes(mark.kind)) return;
    setDraft({ pageId: id, x, y, mark });
    setDraftText(mark?.text || "");
  };
  const saveDraft = async () => {
    if (!draft) return;
    const h = handles.current.get(draft.pageId),
      p = pages.find((p) => p.pageId === draft.pageId);
    if (!h || !p || !h.writable())
      throw new Error("This page must be unlocked before saving text.");
    const text = draftText.trim();
    if (!text) throw new Error("Enter annotation text.");
    const size = draft.mark?.size || 16,
      w = Math.min(240, p.width - 24),
      canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d")!;
    ctx.font = `${size}px Arial, sans-serif`;
    const height = wrapPdfText(ctx, text, w - 12).length * size * 1.25 + 12;
    if (height > p.height - 24)
      throw new Error(
        "Shorten this annotation so its complete text fits on the page."
      );
    const x = Math.max(12, Math.min(p.width - w - 12, draft.x)),
      y = Math.max(12, Math.min(p.height - height - 12, draft.y));
    h.markup.put({
      kind: draft.mark?.kind || (tool === "comment" ? "comment" : "text"),
      target: draft.mark?.target,
      rects: [{ x, y, width: w, height }],
      text,
      color: draft.mark?.color || settings.color,
      size,
    });
    setUndoMode("markup");
    await h.flush();
    setDraft(undefined);
  };
  const search = () => {
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    void run("Searching…", async () => {
      setHits([]);
      const results: { pageId: string; excerpt: string }[] = [];
      let partial = false;
      for (const id of new Set(
        pages.flatMap((p) => (p.originalAssetId ? [p.originalAssetId] : []))
      )) {
        const lease = await pool.acquire(id);
        try {
          const found = await searchPdf(
            lease.doc,
            query,
            AbortSignal.any([controller.signal, library.session.signal]),
            (p, t) => setSearchState(`Searching ${p} of ${t}…`)
          );
          for (const hit of found.hits)
            for (const page of pages.filter(
              (p) => p.originalAssetId === id && p.sourcePage === hit.sourcePage
            ))
              results.push({ pageId: page.pageId, excerpt: hit.excerpt });
          if (found.limited) partial = true;
        } finally {
          lease.release();
        }
      }
      if (!controller.signal.aborted) {
        setHits(results);
        setSearchState(
          `${results.length} matching pages${partial ? " · partial text coverage" : ""}`
        );
      }
    });
  };
  const pageList = showRemoved
    ? removed
    : tab === "bookmarks"
      ? pages.filter((p) => p.extensions.bookmarked)
      : pages;
  return (
    <section
      ref={root}
      className={`${shared.editorLayout} ${s.workspace}`}
      data-focus={focus}
      aria-label="PDF study document"
      aria-busy={!!busy}
      data-current-page-id={current}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        const command = event.ctrlKey || event.metaKey,
          key = event.key.toLowerCase();
        if (command && key === "s") {
          event.preventDefault();
          void run("Saving…", () => library.flushEditors());
        } else if (command && key === "f") {
          event.preventDefault();
          setRail(true);
          setTab("search");
          requestAnimationFrame(() =>
            root.current
              ?.querySelector<HTMLInputElement>(
                'input[aria-label="Find PDF text"]'
              )
              ?.focus()
          );
        } else if (key === "escape" && !draft) {
          for (const details of root.current?.querySelectorAll<HTMLDetailsElement>(
            "details[open]"
          ) || [])
            details.open = false;
          if (focus) setFocus(false);
        } else if (
          command &&
          ["z", "y"].includes(key) &&
          !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)
        ) {
          event.preventDefault();
          act(() => {
            const redo = key === "y" || event.shiftKey;
            if (undoMode === "ink") {
              if (redo) handle?.ink.redoEdit();
              else handle?.ink.undoEdit();
            } else {
              if (redo) handle?.markup.undo.redo();
              else handle?.markup.undo.undo();
            }
          });
        }
      }}
    >
      <header className={s.header}>
        <button aria-label="Back to notes" onClick={onBack}>
          <ArrowLeft size={19} />
        </button>
        <h2>{note.view.descriptor.title}</h2>
        {(diagnostics || busy || saveState === "failed") && (
          <span role="status">{busy || statusText[saveState]}</span>
        )}
        <button
          aria-label={focus ? "Exit focus writing" : "Focus document"}
          title={focus ? "Exit full screen" : "Full screen"}
          onClick={toggleFullscreen}
        >
          {focus ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </header>
      <div className={s.toolbar} role="toolbar" aria-label="PDF tools">
        <button
          aria-label="PDF pages and search"
          aria-expanded={rail}
          onClick={() => setRail(!rail)}
        >
          <PanelLeft size={18} />
        </button>
        <span className={s.divider} />
        {buttons.map(({ tool: id, label, Icon }) => (
          <button
            key={id}
            aria-label={label}
            aria-pressed={tool === id}
            disabled={
              busy !== "" ||
              locked ||
              ((saveState === "failed" || !!library.snapshot().memoryPending) &&
                id !== "read")
            }
            onClick={() => {
              for (const h of handles.current.values()) h.input.finish();
              setTool(id);
              setSelection(undefined);
              if (id !== "read" && id !== "text" && id !== "comment") {
                setSettings({
                  ...settings,
                  tool: id,
                  color:
                    id === "pen" || id === "highlighter"
                      ? brushes.current[id].color
                      : settings.color,
                  width:
                    id === "pen" || id === "highlighter"
                      ? brushes.current[id].width
                      : settings.width,
                });
                setUndoMode("ink");
              }
            }}
          >
            <Icon size={19} />
            <span>
              {label === "Select text"
                ? "Read"
                : id === "eraser"
                  ? "Erase"
                  : id === "lasso"
                    ? "Select"
                    : label}
            </span>
          </button>
        ))}
        <button
          aria-label="Annotation color and thickness"
          disabled={locked || !!busy}
          onClick={() =>
            void run("Opening pen studio…", async () => {
              await library.prepareCreativeTools(note.id);
              setPenStudio(true);
            })
          }
        >
          <Palette size={18} />
        </button>
        <button
          aria-label={undoMode === "ink" ? "Undo PDF ink" : "Undo PDF markup"}
          disabled={!handle || locked}
          onClick={() =>
            act(() => {
              if (undoMode === "ink") handle?.ink.undoEdit();
              else handle?.markup.undo.undo();
            })
          }
        >
          <Undo2 size={18} />
        </button>
        <button
          aria-label="Redo PDF annotation"
          disabled={!handle || locked}
          onClick={() =>
            act(() => {
              if (undoMode === "ink") handle?.ink.redoEdit();
              else handle?.markup.undo.redo();
            })
          }
        >
          <Redo2 size={18} />
        </button>
        <span className={s.spacer} />
        <button aria-label="Zoom PDF out" onClick={() => changeZoom(0.8)}>
          <ZoomOut size={18} />
        </button>
        <button
          className={s.zoom}
          aria-label="Fit PDF width"
          onClick={() => {
            if (viewport.current) viewport.current.scrollLeft = 0;
            setZoomValue(
              Math.max(
                0.25,
                Math.min(
                  4,
                  (width - 40) /
                    (activePage ? displayedPageSize(activePage).width : 600)
                )
              )
            );
          }}
        >
          <MoveHorizontal size={13} />
          {Math.round(zoom * 100)}%
        </button>
        <button aria-label="Zoom PDF in" onClick={() => changeZoom(1.25)}>
          <ZoomIn size={18} />
        </button>
      </div>
      <div className={s.pageBar}>
        {focus && (
          <button
            aria-label="Exit focus writing"
            onClick={() => setFocus(false)}
          >
            <Minimize2 size={17} />
          </button>
        )}
        <button
          aria-label="Previous PDF page"
          disabled={index <= 0 || !!busy}
          onClick={() =>
            void run("Opening page…", () => goto(pages[index - 1].pageId))
          }
        >
          <ChevronLeft size={16} />
        </button>
        <label>
          Page{" "}
          <input
            aria-label="PDF page number"
            type="number"
            min="1"
            max={pages.length}
            ref={pageNumber}
            defaultValue={index + 1 || 1}
            onBlur={(e) => gotoNumber(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                gotoNumber(e.currentTarget.value);
              }
            }}
          />{" "}
          of {pages.length}
        </label>
        <button
          aria-label="Next PDF page"
          disabled={index >= pages.length - 1 || !!busy}
          onClick={() =>
            void run("Opening page…", () => goto(pages[index + 1].pageId))
          }
        >
          <ChevronRight size={16} />
        </button>
        <button
          className={s.bookmarkShortcut}
          aria-label="Bookmark PDF page"
          aria-pressed={!!activePage?.extensions.bookmarked}
          disabled={!activePage || locked || !!busy}
          onClick={() =>
            void run("Saving bookmark…", () =>
              library.mutate(note.id, (d) => {
                const p = d.pages.find((p) => p.pageId === current)!;
                p.extensions.bookmarked = !p.extensions.bookmarked;
              })
            )
          }
        >
          <Bookmark size={17} />
        </button>
        <span className={s.spacer} />
        <button
          className={focus ? s.focusHidden : undefined}
          aria-label="Search PDF text"
          onClick={() => {
            setRail(true);
            setTab("search");
          }}
        >
          <Search size={17} />
        </button>
        <details className={s.options}>
          <summary aria-label="PDF page actions and export">
            <MoreHorizontal size={17} />
            <span>Pages & export</span>
          </summary>
          <div className={s.optionsPanel}>
            <button
              disabled={locked || !!busy}
              onClick={() =>
                void run("Saving bookmark…", () =>
                  library.mutate(note.id, (d) => {
                    const p = d.pages.find((p) => p.pageId === current)!;
                    p.extensions.bookmarked = !p.extensions.bookmarked;
                  })
                )
              }
            >
              <Bookmark size={17} />
              {activePage?.extensions.bookmarked
                ? "Remove page bookmark"
                : "Bookmark this page"}
            </button>
            <button
              disabled={locked || !!busy}
              onClick={() =>
                void run("Adding writing page…", async () => {
                  const id = await library.addPage(note.id, undefined, current);
                  pendingPage.current = id;
                  setCurrent(id);
                })
              }
            >
              <Plus size={17} />
              Insert blank writing page
            </button>
            <button
              disabled={locked || !!busy}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={17} />
              Insert another PDF
            </button>
            <button
              disabled={locked || !!busy}
              onClick={() =>
                void run("Duplicating page…", async () => {
                  const id = await library.addPage(note.id, current, current);
                  pendingPage.current = id;
                  setCurrent(id);
                })
              }
            >
              <Copy size={17} />
              Duplicate page
            </button>
            <button
              disabled={locked || index <= 0 || !!busy}
              onClick={() =>
                void run("Reordering page…", () =>
                  library.movePage(note.id, current, -1)
                )
              }
            >
              <ArrowUp size={17} />
              Move page earlier
            </button>
            <button
              disabled={locked || index >= pages.length - 1 || !!busy}
              onClick={() =>
                void run("Reordering page…", () =>
                  library.movePage(note.id, current, 1)
                )
              }
            >
              <ArrowDown size={17} />
              Move page later
            </button>
            <button
              disabled={locked || !!busy}
              onClick={() =>
                void run("Rotating page…", () =>
                  library.mutate(note.id, (d) => {
                    const p = d.pages.find((p) => p.pageId === current)!;
                    p.extensions.pdfRotation = (pdfRotation(p) + 90) % 360;
                  })
                )
              }
            >
              <RotateCw size={17} />
              Rotate page clockwise
            </button>
            <button
              disabled={locked || pages.length < 2 || !!busy}
              onClick={() =>
                void run("Removing page…", async () => {
                  const next = pages[index + 1] || pages[index - 1];
                  await library.archivePage(note.id, current, true);
                  if (next) setCurrent(next.pageId);
                })
              }
            >
              <Trash2 size={17} />
              Remove page, keep original
            </button>
            <button
              onClick={() => {
                setShowRemoved(true);
                setTab("pages");
                setRail(true);
              }}
            >
              <Trash2 size={17} />
              Removed pages ({removed.length})
            </button>
            <button
              disabled={locked || !!busy}
              onClick={() =>
                void run("Preparing PDF…", async () => {
                  const bytes = await exportAnnotatedPdf(
                    library,
                    note.id,
                    (p, t) => setBusy(`Exporting ${p} of ${t}…`)
                  );
                  library.session.assert();
                  downloadNotesBytes(
                    bytes,
                    `${note.view.descriptor.title} — annotated.pdf`
                  );
                })
              }
            >
              <Download size={17} />
              Export annotated PDF
            </button>
            <p>
              Exports a separate study copy. Ink stays vector; text boxes are
              flattened images. Forms, signatures and document links may lose
              interactivity. Keep the editable Sylf archive and original PDF.
            </p>
            <button
              disabled={!!busy}
              onClick={() =>
                void run("Exporting original…", async () => {
                  const asset = note.view.descriptor.assets.find(
                    (a) => a.assetId === activePage?.originalAssetId
                  );
                  if (!asset)
                    throw new Error(
                      "This is an inserted writing page. Open a source page to export its PDF."
                    );
                  const bytes = await library.repository.readContent(
                    asset.content
                  );
                  library.session.assert();
                  downloadNotesBytes(bytes, asset.name);
                })
              }
            >
              Download original PDF
            </button>
          </div>
        </details>
      </div>
      {selected > 0 && (
        <div className={s.contextBar}>
          <span>{selected} strokes selected</span>
          <button
            onClick={() =>
              act(() =>
                handle?.input.editSelection({
                  color: settings.color,
                  width: settings.width,
                })
              )
            }
          >
            Apply ink style
          </button>
          <button onClick={() => act(() => handle?.input.scaleSelection(1.1))}>
            Larger
          </button>
          <button onClick={() => act(() => handle?.input.scaleSelection(0.9))}>
            Smaller
          </button>
          <button
            onClick={() =>
              act(() => handle?.input.editSelection({ erase: true }))
            }
          >
            Erase selection
          </button>
        </div>
      )}
      {selection && (
        <div className={s.contextBar} aria-label="Selected PDF text">
          <span>Selected text</span>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => markSelection("highlight")}
          >
            <Highlighter size={16} />
            Highlight
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => markSelection("underline")}
          >
            <Underline size={16} />
            Underline
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => markSelection("strikeout")}
          >
            <Strikethrough size={16} />
            Strike through
          </button>
          <button
            aria-label="Dismiss text selection tools"
            onClick={() => setSelection(undefined)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {saveState === "failed" && (
        <div className={shared.notice}>
          <span>Unsaved changes are retained in this tab.</span>
          <button
            onClick={() =>
              void run("Retrying…", async () => {
                for (const h of handles.current.values()) await h.retry();
                onError("");
              })
            }
          >
            Retry saving
          </button>
          <button
            onClick={() =>
              void run("Exporting recovery…", async () => {
                const file = await exportNotesRecovery(
                  library.repository,
                  library.recoverySnapshots()
                );
                downloadNotesBytes(file, "PDF annotation recovery.sylfnote");
              })
            }
          >
            Export recovery
          </button>
        </div>
      )}
      <div className={s.body}>
        {rail && (
          <aside className={s.rail} aria-label="PDF navigation">
            <div className={s.railTabs}>
              <button
                aria-label="Page thumbnails"
                aria-pressed={tab === "pages"}
                onClick={() => {
                  setTab("pages");
                  setShowRemoved(false);
                }}
              >
                <PanelLeft size={17} />
              </button>
              <button
                aria-label="PDF bookmarks"
                aria-pressed={tab === "bookmarks"}
                onClick={() => setTab("bookmarks")}
              >
                <Bookmark size={17} />
              </button>
              <button
                aria-label="Find in PDF"
                aria-pressed={tab === "search"}
                onClick={() => setTab("search")}
              >
                <Search size={17} />
              </button>
              <button
                aria-label="Page annotations"
                aria-pressed={tab === "annotations"}
                onClick={() => setTab("annotations")}
              >
                <MessageSquare size={17} />
              </button>
              <button
                aria-label="Close PDF navigation"
                onClick={() => setRail(false)}
              >
                <X size={16} />
              </button>
            </div>
            {tab === "search" ? (
              <div className={s.search}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    search();
                  }}
                >
                  <label>
                    Search original PDF text
                    <input
                      aria-label="Find PDF text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      maxLength={200}
                    />
                  </label>
                  <button disabled={!query.trim() || !!busy}>Find</button>
                </form>
                <p role="status">{searchState}</p>
                {hits.map((hit) => (
                  <button
                    key={hit.pageId}
                    onClick={() =>
                      void run("Opening result…", () => goto(hit.pageId))
                    }
                  >
                    <strong>
                      Page {pages.findIndex((p) => p.pageId === hit.pageId) + 1}
                    </strong>
                    <span>{hit.excerpt}</span>
                  </button>
                ))}
              </div>
            ) : tab === "annotations" ? (
              <div className={s.search}>
                <h3>Page {index + 1} annotations</h3>
                {handle?.markup.marks().map((m) => (
                  <div className={s.annotationItem} key={m.target}>
                    <button
                      onClick={() =>
                        startEdit(current, m.rects[0].x, m.rects[0].y, m)
                      }
                    >
                      {m.kind}: {m.text.slice(0, 100) || "Markup"}
                    </button>
                    <button
                      aria-label="Remove PDF markup"
                      onClick={() =>
                        act(() => {
                          handle.markup.remove(m);
                          setUndoMode("markup");
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <p>Pen strokes are edited with Select or Erase.</p>
              </div>
            ) : (
              <>
                <h3>
                  {showRemoved
                    ? "Removed pages"
                    : tab === "bookmarks"
                      ? "Bookmarks"
                      : "Pages"}
                </h3>
                <div className={s.pageList}>
                  {pageList.slice(0, pageLimit).map((p) => (
                    <div className={s.thumbnailRow} key={p.pageId}>
                      <button
                        aria-current={p.pageId === current ? "page" : undefined}
                        onClick={() => {
                          if (!showRemoved)
                            void run("Opening page…", () => goto(p.pageId));
                        }}
                        disabled={showRemoved}
                      >
                        <PdfThumbnail
                          library={library}
                          note={note}
                          pageId={p.pageId}
                          pool={pool}
                        />
                        <span>
                          {showRemoved
                            ? "Removed page"
                            : `Page ${pages.findIndex((page) => page.pageId === p.pageId) + 1}`}
                          {p.extensions.bookmarked ? " · ★" : ""}
                        </span>
                      </button>
                      {showRemoved && (
                        <button
                          onClick={() =>
                            void run("Restoring page…", () =>
                              library.archivePage(note.id, p.pageId, false)
                            )
                          }
                        >
                          Restore page
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pageList.length > pageLimit && (
                  <button onClick={() => setPageLimit((n) => n + 50)}>
                    More pages
                  </button>
                )}
                {showRemoved && (
                  <p>
                    Sources and editable annotations are retained. Restore a
                    page to edit it.
                  </p>
                )}
              </>
            )}
          </aside>
        )}
        <div
          ref={viewport}
          className={s.viewport}
          tabIndex={0}
          aria-label="PDF reading area"
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              changeZoom(Math.exp(-e.deltaY * 0.005));
            }
          }}
          onScroll={(e) => {
            const root = e.currentTarget;
            setScroll({ top: root.scrollTop, height: root.clientHeight });
            const at = layout.find(
              (item) =>
                item.top + item.height >
                root.scrollTop + root.clientHeight * 0.25
            );
            if (at) setCurrent(at.page.pageId);
          }}
        >
          <div
            className={s.document}
            style={{
              height: totalHeight,
              minWidth: Math.max(width, ...layout.map((p) => p.width + 40)),
            }}
          >
            {visible.map((item) => (
              <div
                key={item.page.pageId}
                className={s.pagePosition}
                style={{
                  top: item.top,
                  left: Math.max(width, item.width + 40) / 2,
                  width: item.width,
                  height: item.height,
                }}
              >
                <PdfPage
                  library={library}
                  documentId={note.id}
                  page={item.page}
                  pool={pool}
                  zoom={zoom}
                  tool={tool}
                  settings={settings}
                  active={item.page.pageId === current}
                  onActive={() => {
                    setCurrent(item.page.pageId);
                    if (!["read", "text", "comment"].includes(tool))
                      setUndoMode("ink");
                  }}
                  onReady={(h) => {
                    if (h) handles.current.set(item.page.pageId, h);
                    else handles.current.delete(item.page.pageId);
                    setPageHandles(Object.fromEntries(handles.current));
                  }}
                  onState={state}
                  onControls={() => refreshControls((n) => n + 1)}
                  onDurability={(pinned) =>
                    setPinnedPages((previous) => {
                      const id = item.page.pageId;
                      if (previous.has(id) === pinned) return previous;
                      const next = new Set(previous);
                      if (pinned) next.add(id);
                      else next.delete(id);
                      return next;
                    })
                  }
                  onError={onError}
                  onSelection={setSelection}
                  onEdit={(p, m) => startEdit(item.page.pageId, p.x, p.y, m)}
                  onNavigate={(dx, dy, scale) => {
                    if (scale !== 1) changeZoom(scale);
                    else if (viewport.current)
                      viewport.current.scrollBy(-dx, -dy);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <footer className={s.footer}>
        <span>
          {pages.length} pages ·{" "}
          {tool === "read" ? "Select and copy text" : "Editable annotations"}
        </span>
        {diagnostics && (
          <span>Original PDF retained · {busy || statusText[saveState]}</span>
        )}
      </footer>
      <input
        ref={fileInput}
        className={shared.hidden}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Insert PDF file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          void run("Reading PDF…", async () => {
            if (file.size > 50 * 1024 * 1024)
              throw new Error("Choose a PDF up to 50 MiB.");
            const bytes = new Uint8Array(await file.arrayBuffer()),
              source = await inspectPdf(bytes, library.session.signal, (p, t) =>
                setBusy(`Reading ${p} of ${t}…`)
              );
            await library.importPdf(
              bytes,
              source,
              file.name,
              null,
              note.id,
              current
            );
          });
        }}
      />
      {draft && (
        <NotesDialog
          title={
            draft.mark
              ? "Edit annotation"
              : tool === "comment"
                ? "Add comment"
                : "Add text"
          }
          onClose={() => {
            if (!busy) setDraft(undefined);
          }}
        >
          <form
            className={s.annotationForm}
            onSubmit={(e) => {
              e.preventDefault();
              void run("Saving text…", saveDraft);
            }}
          >
            <label>
              Annotation
              <textarea
                aria-label="PDF annotation text"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                maxLength={2000}
                rows={6}
              />
            </label>
            <p className={shared.hint}>
              Full text is retained in the editable document. The PDF study copy
              flattens this box for portable appearance.
            </p>
            <button
              className={shared.primary}
              disabled={!!busy || !draftText.trim()}
            >
              Save annotation
            </button>
          </form>
        </NotesDialog>
      )}
      {penStudio && (
        <PenPanel
          settings={settings}
          previewColor={settings.color}
          paperColor="#ffffff"
          choose={(change) => {
            for (const h of handles.current.values()) h.input.finish();
            if (change.tool) {
              setTool(change.tool);
              setUndoMode("ink");
            }
            setSettings((previous) => ({ ...previous, ...change }));
          }}
          pens={pens}
          savePens={(value: PenPreset[]) => {
            void library
              .savePreferences({ ...library.preferences(), pens: value })
              .then(() => setPens(value))
              .catch((e) => onError(e.message));
          }}
          onClose={() => setPenStudio(false)}
        />
      )}
    </section>
  );
}
