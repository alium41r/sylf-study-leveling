"use client";
import {
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useId,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { NotebookSurface } from "./NotebookWorkspace";
import DocumentArrange from "./DocumentArrange";
import {
  ArrowLeft,
  PenLine,
  Highlighter,
  Eraser,
  LassoSelect,
  Hand,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  RectangleVertical,
  ClipboardPaste,
  Scissors,
  PanelLeft,
  Plus,
  ChevronLeft,
  ChevronRight,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  RotateCcw,
  Download,
  Palette,
  Move,
  Keyboard,
  MoreHorizontal,
  History,
  AlignVerticalJustifyStart,
  TextCursorInput,
  Layers3,
  ImagePlus,
  Star,
} from "lucide-react";
import {
  InkModel,
  INK_ADAPTER,
  DEFAULT_PAPER,
  type InkPaper,
} from "@/lib/notes/ink";
import {
  InkController,
  type InkTool,
  type InkTools,
} from "@/lib/notes/ink-controller";
import type { NotesLibrary, NoteSummary } from "@/lib/notes/library";
import type { NotesStream, SaveState } from "@/lib/notes/engine";
import { exportNotesRecovery } from "@/lib/notes/portable";
import { downloadNotesBytes } from "@/lib/notes/download";
import { notesResumeSchema } from "@/lib/resources";
import { drawPaper } from "@/lib/notes/ink-renderer";
import * as Y from "yjs";
import { initialRichTextUpdate } from "@/lib/notes/blocknote-adapter";
import { isDarkColor } from "@/lib/color-utils";
import InkThumbnail from "./InkThumbnail";
import PenPanel from "./PenPanel";
import PaperPanel from "./PaperPanel";
import PageContentBox from "./PageContentBox";
import PageImage from "./PageImage";
import {
  snapBox,
  contentGroups,
  contentBounds,
} from "@/lib/notes/content-layout";
import { PageBoxes, type TextBox } from "@/lib/notes/text-boxes";
import {
  readNoteStyle,
  displayPaper,
  displayInkColor,
  type NoteStyle,
  type PenPreset,
} from "@/lib/notes/note-style";
import StylusPanel from "./StylusPanel";
import {
  learnStylus,
  readStylusCapabilities,
  saveStylusCapabilities,
  type StylusCapabilities,
} from "@/lib/notes/stylus";
import {
  lastNotesCopy,
  readNotesClipboard,
  writeNotesClipboard,
  type PastedContent,
} from "@/lib/notes/clipboard";
import NotesEditor from "./NotesEditor";
import s from "../Ink.module.css";
import shared from "../Notes.module.css";
const tools: { id: InkTool; label: string; Icon: typeof PenLine }[] = [
  { id: "pen", label: "Pen", Icon: PenLine },
  { id: "highlighter", label: "Highlighter", Icon: Highlighter },
  { id: "eraser", label: "Stroke eraser", Icon: Eraser },
  { id: "lasso", label: "Lasso selection", Icon: LassoSelect },
  { id: "hand", label: "Pan", Icon: Hand },
];
/** Continuous pages keep this much blank paper below the lowest ink, so writing never hits an edge. */
const GROW_MARGIN = 400;
const GROW_BY = 900;
/** Browser full screen is owned by whichever editor requested it. */
let fullscreenOwned = false;
const COPY_MARKER = "Sylf handwriting selection";
const stateText: Record<SaveState, string> = {
  ready: "Ready",
  saving: "Saving on device…",
  pausing: "Writing paused",
  "local-durable": "Saved on device",
  failed: "Not saved — recovery available",
  closed: "Locked",
};
function Chrome({
  workspace,
  children,
}: {
  workspace?: NotebookSurface;
  children: ReactNode;
}) {
  return workspace
    ? workspace.active && workspace.chrome
      ? createPortal(children, workspace.chrome)
      : null
    : children;
}
export default function InkEditor({
  library,
  note,
  pageId,
  onBack,
  onPage,
  onError,
  onState,
  registerLeave,
  diagnostics = false,
  onDetails,
  onHistory,
  workspace,
}: {
  library: NotesLibrary;
  note: NoteSummary;
  pageId?: string;
  onBack: () => void;
  onPage: (pageId: string) => void;
  onError: (message: string) => void;
  onState: (state: SaveState) => void;
  registerLeave: (callback?: () => Promise<void>) => () => void;
  diagnostics?: boolean;
  onDetails?: () => void;
  onHistory?: () => void;
  workspace?: NotebookSurface;
}) {
  const helpId = useId();
  const page = pageId
    ? note.view.descriptor.pages.find((p) => p.pageId === pageId)
    : note.view.descriptor.pages.find((p) => !p.extensions.archived);
  const host = useRef<HTMLDivElement>(null),
    paperCanvas = useRef<HTMLCanvasElement>(null),
    base = useRef<HTMLCanvasElement>(null),
    live = useRef<HTMLCanvasElement>(null),
    status = useRef<HTMLSpanElement>(null);
  const guideLayer = useRef<HTMLDivElement>(null);
  const showGuides = (guides: { axis: "x" | "y"; value: number }[]) => {
    const layer = guideLayer.current;
    if (!layer) return;
    layer.replaceChildren(
      ...guides.map((guide) => {
        const line = document.createElement("i");
        line.dataset.axis = guide.axis;
        line.style[guide.axis === "x" ? "left" : "top"] = `${guide.value}px`;
        return line;
      })
    );
  };
  const textLayer = useRef<HTMLDivElement>(null);
  const paperFrame = useRef("");
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  const [textToolbar, setTextToolbar] = useState<HTMLDivElement | null>(null);
  const [localTyping, setLocalTyping] = useState(
    () => note.view.descriptor.streams[0]?.adapter !== INK_ADAPTER
  );
  const typing = workspace?.typing ?? localTyping;
  const setTyping = workspace?.setTyping || setLocalTyping;
  const workspaceNow = useRef(workspace);
  useEffect(() => {
    workspaceNow.current = workspace;
  }, [workspace]);
  const [placingText, setPlacingText] = useState<false | "move" | "new">(false);
  const [panel, setPanel] = useState<
    "pen" | "paper" | "content" | "stylus" | undefined
  >();
  const [paperScope, setPaperScope] = useState<"page" | "all">("page");
  const [noteStyle, setNoteStyle] = useState(() =>
    readNoteStyle(
      page?.extensions.noteStyle || note.view.descriptor.extensions.noteStyle
    )
  );
  const styleNow = useRef(noteStyle);
  useEffect(() => {
    styleNow.current = noteStyle;
  }, [noteStyle]);
  const pens = library.preferences().pens;
  const boxesModel = useRef<PageBoxes | undefined>(undefined);
  const [boxes, setBoxes] = useState<TextBox[]>([]);
  const [canArrangeUndo, setCanArrangeUndo] = useState(false);
  const [canArrangeRedo, setCanArrangeRedo] = useState(false);
  const [selectedBox, setSelectedBox] = useState("body");
  const imageFile = useRef<HTMLInputElement>(null);
  const [darkMode, setDarkMode] = useState(false);
  const adaptNow = useRef(false);
  const [localDock, setLocalDock] = useState<"top" | "bottom">("top");
  const dock = workspace?.dock ?? localDock;
  const setDock = workspace?.setDock || setLocalDock;
  const typingNow = useRef(typing);
  useEffect(() => {
    typingNow.current = typing;
  }, [typing]);
  const controller = useRef<InkController | undefined>(undefined),
    model = useRef<InkModel | undefined>(undefined),
    textViewportKey = useRef(""),
    opened = useRef<Awaited<ReturnType<NotesLibrary["open"]>> | undefined>(
      undefined
    );
  const [ready, setReady] = useState(false),
    [textStream, setTextStream] = useState<NotesStream | undefined>(undefined),
    [showOpening, setShowOpening] = useState(false),
    [failure, setFailure] = useState(""),
    [localSettings, setLocalSettings] = useState<InkTools>({
      tool: "pen",
      color: "#242830",
      width: 2.8,
      finger: false,
      nib: "ballpoint",
      opacity: 1,
      pressure: 1,
      smoothing: 0.65,
      lineStyle: "solid",
      straighten: false,
      eraserMode: "stroke",
      eraserSize: 12,
    }),
    [paper, setPaper] = useState<InkPaper>(DEFAULT_PAPER),
    [selection, setSelection] = useState(0),
    [count, setCount] = useState(0),
    [zoom, setZoom] = useState(100),
    [rail, setRail] = useState(false),
    [localFocus, setLocalFocus] = useState(false),
    [removed, setRemoved] = useState(false),
    [pageLimit, setPageLimit] = useState(30),
    [busy, setBusy] = useState(false),
    [canUndo, setCanUndo] = useState(false),
    [canRedo, setCanRedo] = useState(false);
  const descriptorStyle = readNoteStyle(
    page?.extensions.noteStyle || note.view.descriptor.extensions.noteStyle
  );
  const [prevStyle, setPrevStyle] = useState(descriptorStyle);
  if (
    prevStyle.paper.template !== descriptorStyle.paper.template ||
    prevStyle.paper.color !== descriptorStyle.paper.color ||
    prevStyle.paper.rule !== descriptorStyle.paper.rule ||
    prevStyle.paper.spacing !== descriptorStyle.paper.spacing ||
    prevStyle.width !== descriptorStyle.width ||
    prevStyle.height !== descriptorStyle.height ||
    prevStyle.layout !== descriptorStyle.layout ||
    prevStyle.adaptDark !== descriptorStyle.adaptDark
  ) {
    setPrevStyle(descriptorStyle);
    setNoteStyle(descriptorStyle);
    setPaper(descriptorStyle.paper);
  }
  useEffect(() => {
    if (model.current) {
      model.current.setPaper(descriptorStyle.paper);
      setPaper(descriptorStyle.paper);
      paperFrame.current = "";
      controller.current?.renderer.releaseCaches();
      controller.current?.zoom(1);
    }
  }, [descriptorStyle.paper]);
  const focus = workspace?.focus ?? localFocus;
  const setFocus = workspace?.setFocus || setLocalFocus;
  const settings = workspace?.settings ?? localSettings;
  const setSettings = (update: (previous: InkTools) => InkTools) => {
    const next = update(settings);
    setLocalSettings(next);
    workspace?.setSettings(next);
  };
  useEffect(() => {
    workspaceNow.current?.retain(busy);
  }, [busy]);
  const adaptDark =
    darkMode && noteStyle.adaptDark && !isDarkColor(paper.color);

  useEffect(() => {
    const update = () =>
      setDarkMode(document.documentElement.dataset.mode === "dark");
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    adaptNow.current = adaptDark;
    const input = controller.current;
    if (!input) return;
    input.renderer.adaptDark = adaptDark;
    input.renderer.releaseCaches();
    paperFrame.current = "";
    input.zoom(1);
  }, [adaptDark, ready]);
  const pendingActions = useRef(new Set<Promise<void>>());
  const textLeaves = useRef(new Set<() => Promise<void>>());
  const registerTextLeave = useCallback((callback?: () => Promise<void>) => {
    if (callback) textLeaves.current.add(callback);
    return () => {
      if (callback) textLeaves.current.delete(callback);
    };
  }, []);
  const action = (fn: () => Promise<unknown>) => {
    setBusy(true);
    const task = (async () => {
      try {
        controller.current?.finish();
        await opened.current?.stream.flush();
        await fn();
      } catch (error) {
        onError((error as Error).message);
      }
    })();
    pendingActions.current.add(task);
    void task.finally(() => {
      pendingActions.current.delete(task);
      setBusy(pendingActions.current.size > 0);
    });
    return task;
  };
  const currentSettings = useRef(settings);
  const activePages = note.view.descriptor.pages.filter(
      (p) => !p.extensions.archived
    ),
    index = activePages.findIndex((p) => p.pageId === page?.pageId),
    archived = !!page?.extensions.archived;
  const grown = useRef(0),
    persisted = useRef(0),
    needNextPage = useRef(false),
    creatingPage = useRef(false),
    pasteCount = useRef(0),
    penKnown = useRef<StylusCapabilities | undefined>(undefined),
    extendNow = useRef<(y: number) => void>(undefined),
    settleNow = useRef<() => void>(undefined);
  useEffect(() => {
    // Continuous pages grow ahead of the pen; paged notebooks continue on a new page.
    extendNow.current = (y) => {
      const input = controller.current;
      if (!input || !page || archived) return;
      const style = styleNow.current,
        height = input.renderer.pageHeight;
      if (style.layout === "continuous") {
        if (y <= height - GROW_MARGIN || height >= 99000) return;
        const next = Math.min(100000, Math.ceil((y + GROW_BY) / 100) * 100);
        grown.current = next;
        input.renderer.pageHeight = next;
        if (textLayer.current) textLayer.current.style.minHeight = `${next}px`;
        workspaceNow.current?.resize(next);
        input.zoom(1);
      } else if (
        index === activePages.length - 1 &&
        y >= height * 0.70
      )
        needNextPage.current = true;
    };
    // Structural saves wait for the pen to lift so a stroke is never interrupted.
    settleNow.current = () => {
      const input = controller.current;
      if (!input || input.isActive() || !page || archived) return;
      const height = grown.current;
      if (height > Math.max(page.height, persisted.current)) {
        persisted.current = height;
        void action(() =>
          library.mutate(note.id, (d) => {
            const p = d.pages.find((p) => p.pageId === page.pageId);
            if (p) p.height = Math.max(p.height, height);
          })
        );
      }
      if (
        needNextPage.current &&
        !creatingPage.current &&
        styleNow.current.layout !== "continuous"
      ) {
        needNextPage.current = false;
        creatingPage.current = true;
        void action(async () => {
          try {
            const pages = (
              await library.repository.document(note.id)
            ).descriptor.pages.filter((p) => !p.extensions.archived);
            // Another tab/editor may already have continued this notebook.
            if (pages.at(-1)?.pageId === page.pageId)
              await library.addPage(note.id, undefined, page.pageId);
          } finally {
            creatingPage.current = false;
          }
        });
      }
    };
  });
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setShowOpening(true), 180);
    return () => clearTimeout(timer);
  }, [ready]);
  useEffect(() => {
    if (archived) return;
    let cancelled = false,
      cleanup: (() => void) | undefined,
      statusTimer: ReturnType<typeof setTimeout> | undefined;
    const flushAndRelease = (
      leased: Awaited<ReturnType<NotesLibrary["open"]>>
    ) => {
      void leased.stream
        .flush()
        .catch((e) =>
          onError(e instanceof Error ? e.message : "Keep your recovery copy.")
        )
        .finally(() => leased.release());
    };
    void (async () => {
      const layers = await library.ensurePageLayers(note.id, page?.pageId);
      const currentPage = layers.page;
      await library.prepareCreativeTools(note.id);
      const source = await library.open(note.id, currentPage.pageId, "ink");
      if (cancelled) {
        flushAndRelease(source);
        return;
      }
      opened.current = source;
      if (source.stream.adapterId !== INK_ADAPTER)
        throw new Error(
          "This page requires a different editor. Reopen it from the library; its originals were retained."
        );
      const writable = () =>
        !["failed", "closed", "pausing"].includes(
          source.stream.status().state
        ) && !library.session.signal.aborted;
      const ink = new InkModel(source.stream.doc, writable);
      model.current = ink;
      const targetPaper = descriptorStyle.paper;
      const currentPaper = ink.paper();
      if (
        currentPaper.template !== targetPaper.template ||
        currentPaper.color !== targetPaper.color ||
        currentPaper.rule !== targetPaper.rule ||
        currentPaper.spacing !== targetPaper.spacing
      ) {
        ink.setPaper(targetPaper);
      }
      const textSource = await library.open(
        note.id,
        currentPage.pageId,
        "text"
      );
      if (cancelled) {
        ink.close();
        flushAndRelease(textSource);
        flushAndRelease(source);
        opened.current = undefined;
        return;
      }
      const regions = new PageBoxes(
        textSource.stream.doc,
        currentPage,
        () =>
          !["failed", "closed", "pausing"].includes(
            textSource.stream.status().state
          )
      );
      boxesModel.current = regions;
      const updateBoxes = () => {
        try {
          if (!cancelled) setBoxes(regions.boxes());
        } catch (e) {
          setFailure((e as Error).message);
        }
      };
      updateBoxes();
      const arrangementHistory = () => {
        if (!cancelled) {
          setCanArrangeUndo(regions.undo.undoStack.length > 0);
          setCanArrangeRedo(regions.undo.redoStack.length > 0);
        }
      };
      regions.undo.on("stack-item-added", arrangementHistory);
      regions.undo.on("stack-item-popped", arrangementHistory);
      regions.undo.on("stack-cleared", arrangementHistory);
      regions.map.observe(updateBoxes);
      let announced: SaveState | undefined;
      const reportState = (state: SaveState) => {
        if (state !== announced) {
          announced = state;
          onState(state);
        }
      };
      const update = () => {
        if (cancelled) return;
        const input = controller.current,
          writing = input?.isActive();
        try {
          setCount(ink.strokeCount());
          setSelection(input?.selectionCount() || 0);
          setPaper(ink.paper());
          setZoom(Math.round((input?.viewport().zoom || 1) * 100));
          if (input && textLayer.current) {
            const v = input.viewport(),
              tvKey = `${v.x}:${v.y}:${v.zoom}`;
            if (textViewportKey.current !== tvKey) {
              textViewportKey.current = tvKey;
              textLayer.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
            }
          }
          setCanUndo(ink.undo.undoStack.length > 0);
          setCanRedo(ink.undo.redoStack.length > 0);
        } catch (e) {
          setFailure(String((e as Error).message));
        }
        const state = source.stream.status().state;
        if (status.current)
          status.current.textContent = writing ? "Writing…" : stateText[state];
        reportState(writing ? "saving" : state);
        settleNow.current?.();
      };
      const error = (message: string) => {
        if (!cancelled) {
          setFailure(message);
          onError(message);
        }
      };
      const resume = notesResumeSchema.safeParse(note.resume);
      const input = new InkController(
        host.current!,
        base.current!,
        live.current!,
        ink,
        currentPage.width,
        currentPage.height,
        writable,
        update,
        error,
        resume.success && resume.data.pageId === currentPage.pageId
          ? resume.data.inkViewport
          : undefined,
        {
          ignoreInput: (event) =>
            !!(event.target as HTMLElement).closest(
              "[data-notes-box-control]"
            ) ||
            (typingNow.current &&
              (event.pointerType !== "touch" ||
                !!(event.target as HTMLElement).closest("[contenteditable]")) &&
              !!(event.target as HTMLElement).closest("[data-notes-text]")),
          moveSelection: (ids, dx, dy) => {
            const regions = boxesModel.current;
            const groups = regions
              ? contentGroups(regions.doc).filter((g) =>
                  g.strokes.some((id) => ids.includes(id))
                )
              : [];
            if (!groups.length || !page) return false;
            const boxIds = [...new Set(groups.flatMap((g) => g.boxes))];
            const strokeIds = [
              ...new Set([...ids, ...groups.flatMap((g) => g.strokes)]),
            ];
            const bounds = contentBounds([
              ...(regions?.boxes().filter((b) => boxIds.includes(b.id)) || []),
              ...(model.current
                ?.strokes()
                .filter((stroke) => strokeIds.includes(stroke.id))
                .map((stroke) => stroke.bounds) || []),
            ]);
            if (bounds)
              void action(() =>
                library.editContent(
                  note.id,
                  [
                    {
                      pageId: currentPage.pageId,
                      boxes: boxIds,
                      strokes: strokeIds,
                    },
                  ],
                  {
                    type: "position",
                    x: Math.max(0, bounds.x + dx),
                    y: Math.max(0, bounds.y + dy),
                  }
                )
              );
            return true;
          },
          snap: (bounds, dx, dy, disabled) => {
            const peers = boxesModel.current?.boxes() || [];
            if (disabled) {
              showGuides([]);
              return { dx, dy };
            }
            const result = snapBox(
              {
                ...bounds,
                x: bounds.x + dx,
                y: bounds.y + dy,
                id: "body",
                kind: "text",
              },
              peers.map((b) => ({ ...b, id: "peer-" + b.id })),
              input.renderer.pageWidth,
              6 / input.viewport().zoom
            );
            showGuides(result.guides);
            return { dx: result.box.x - bounds.x, dy: result.box.y - bounds.y };
          },
          transparent: true,
          ...(workspaceNow.current
            ? {
                fixed: true,
                fixedZoom: workspaceNow.current.viewport.zoom,
                viewport: workspaceNow.current.viewport,
                navigate: (
                  dx: number,
                  dy: number,
                  scale: number,
                  focal?: { x: number; y: number },
                  phase?: "live" | "end"
                ) => workspaceNow.current?.navigate(dx, dy, scale, focal, phase),
                reveal: (rect: {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                }) => {
                  const bounds = host.current?.getBoundingClientRect();
                  if (bounds)
                    workspaceNow.current?.reveal({
                      ...rect,
                      x: rect.x + bounds.left,
                      y: rect.y + bounds.top,
                    });
                },
                fit: (whole?: boolean) => workspaceNow.current?.fit(whole),
              }
            : {}),
          extend: (y: number) => extendNow.current?.(y),
          onPen: (event: PointerEvent) => {
            // Learn real hardware capabilities from actual pen events.
            penKnown.current ??= readStylusCapabilities();
            const next = learnStylus(penKnown.current, event);
            if (next) {
              penKnown.current = next;
              saveStylusCapabilities(next);
            }
          },
          onActiveChange: (active: boolean) => {
            if (status.current)
              status.current.textContent = active
                ? "Writing…"
                : stateText[source.stream.status().state];
            if (active) reportState("saving");
          },
          onViewport: (v) => {
            if (textLayer.current) {
              const tvKey = `${v.x}:${v.y}:${v.zoom}`;
              if (textViewportKey.current !== tvKey) {
                textViewportKey.current = tvKey;
                textLayer.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
                textLayer.current.style.setProperty(
                  "--notes-page-zoom",
                  String(v.zoom)
                );
              }
            }
            const canvas = paperCanvas.current,
              layer = base.current;
            if (!canvas || !layer || !host.current) return;
            const rawPaper = ink.paper();
            const signature = `${v.zoom}:${v.x}:${v.y}:${rawPaper.template}:${rawPaper.color}:${rawPaper.rule}:${rawPaper.spacing}:${adaptNow.current}:${styleNow.current.layout}:${styleNow.current.height}:${layer.width}:${layer.height}:${input.renderer.pageHeight}`;
            if (paperFrame.current === signature) return;
            paperFrame.current = signature;
            const appearance = displayPaper(rawPaper, adaptNow.current);
            const pageBox = host.current.closest<HTMLElement>(
              "[data-notebook-page]"
            );
            if (pageBox && pageBox.style.backgroundColor !== appearance.color)
              pageBox.style.backgroundColor = appearance.color;
            if (canvas.width !== layer.width) canvas.width = layer.width;
            if (canvas.height !== layer.height) canvas.height = layer.height;
            if (canvas.style.width !== layer.style.width)
              canvas.style.width = layer.style.width;
            if (canvas.style.height !== layer.style.height)
              canvas.style.height = layer.style.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const dpr = canvas.width / Math.max(1, host.current.clientWidth);
            ctx.setTransform(
              dpr * v.zoom,
              0,
              0,
              dpr * v.zoom,
              dpr * v.x,
              dpr * v.y
            );
            drawPaper(
              ctx,
              appearance,
              input.renderer.pageWidth,
              input.renderer.pageHeight +
                (styleNow.current.layout === "continuous" ? 2 / v.zoom : 0)
            );
            if (styleNow.current.layout === "paged") {
              ctx.strokeStyle = appearance.rule;
              ctx.lineWidth = 2;
              ctx.setLineDash([10, 8]);
              for (
                let y = styleNow.current.height;
                y < input.renderer.pageHeight;
                y += styleNow.current.height
              ) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(input.renderer.pageWidth, y);
                ctx.stroke();
              }
              ctx.setLineDash([]);
            }
          },
        }
      );
      input.setTools({
        ...currentSettings.current,
        stylus: library.preferences().stylus,
      });
      controller.current = input;
      const boundary = source.stream.registerInputBoundary(() =>
        input.finish("interrupted")
      );
      const changed = source.stream.subscribe((state) => {
        if (state === "saving" || source.stream.status().pending) {
          reportState(state === "failed" ? "failed" : "saving");
          if (status.current)
            status.current.textContent = input.isActive()
              ? "Writing…"
              : stateText[state];
        }
        if (state === "closed" || state === "failed") reportState(state);
        if (state === "failed" || state === "closed" || state === "pausing")
          input.finish("interrupted");
        if (state === "failed")
          error(
            "Writing paused to protect your changes. Retry saving or export recovery before leaving."
          );
        if (!statusTimer)
          statusTimer = setTimeout(() => {
            statusTimer = undefined;
            if (!input.isActive()) update();
          }, 200);
      });
      const history = () => {
        if (!cancelled && !input.isActive()) {
          setCanUndo(ink.undo.undoStack.length > 0);
          setCanRedo(ink.undo.redoStack.length > 0);
        }
      };
      ink.undo.on("stack-item-added", history);
      ink.undo.on("stack-item-popped", history);
      let leaving: Promise<void> | undefined;
      const leave = () =>
        leaving ||
        (leaving = (async () => {
          input.finish();
          await Promise.all([...pendingActions.current]);
          for (const leave of textLeaves.current) await leave();
          await textSource.stream.flush();
          await source.stream.flush();
          const view = input.viewport();
          if (!workspaceNow.current)
            await library.saveResume(note.id, {
              version: 1,
              pageId: currentPage.pageId,
              scrollRatio: 0,
              inkViewport: view,
            });
          const height = input.renderer.pageHeight;
          const latestPage = (
            await library.repository.document(note.id)
          ).descriptor.pages.find((p) => p.pageId === currentPage.pageId);
          if (height > (latestPage?.height || currentPage.height))
            await library.mutate(note.id, (d) => {
              const p = d.pages.find((p) => p.pageId === currentPage.pageId);
              if (p) p.height = Math.max(p.height, height);
            });
        })().finally(() => {
          leaving = undefined;
        }));
      const removeLeave = library.registerBeforeClose(leave);
      const unregisterLeave = registerLeave(leave);
      cleanup = () => {
        clearTimeout(statusTimer);
        changed();
        removeLeave();
        unregisterLeave();
        boundary();
        // Capture synchronously before releasing a stream; a failed flush retains its native capsule.
        input.close();
        ink.close();
        regions.map.unobserve(updateBoxes);
        regions.close();
        boxesModel.current = undefined;
        controller.current = undefined;
        model.current = undefined;
        opened.current = undefined;
        queueMicrotask(() => {
          flushAndRelease(textSource);
          flushAndRelease(source);
        });
      };
      if (cancelled) {
        cleanup();
        return;
      }
      setTextStream(textSource.stream);
      setShowOpening(false);
      setReady(true);
      update();
    })().catch((error) => {
      opened.current?.release();
      opened.current = undefined;
      if (!cancelled) {
        setFailure(error.message);
        onState("failed");
      }
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
    // A stable document/page owns the native stream. Metadata updates do not reseed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, note.id, page?.pageId, archived]);
  const stylus = library.preferences().stylus,
    stylusKey = JSON.stringify(stylus);
  useEffect(() => {
    currentSettings.current = settings;
    controller.current?.setTools({
      ...settings,
      stylus: JSON.parse(stylusKey),
    });
  }, [settings, stylusKey]);
  useEffect(() => {
    const change = () => {
      if (!document.fullscreenElement && fullscreenOwned) {
        fullscreenOwned = false;
        setFocus(false);
      }
    };
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, [setFocus]);
  useEffect(() => {
    if (!focus && fullscreenOwned && document.fullscreenElement) {
      fullscreenOwned = false;
      void document.exitFullscreen().catch(() => {});
    }
  }, [focus]);
  const toggleFullscreen = () => {
    const next = !focus;
    setFocus(next);
    // Where the browser supports it, writing also takes the whole screen.
    if (next && document.documentElement.requestFullscreen) {
      fullscreenOwned = true;
      void document.documentElement.requestFullscreen().catch(() => {
        fullscreenOwned = false;
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
  }, [focus, setFocus]);
  useEffect(() => {
    const element = textLayer.current;
    if (!element || !ready) return;
    const resize = new ResizeObserver(() => {
      const input = controller.current;
      if (!input) return;
      const content = Array.from(
        element.querySelectorAll<HTMLElement>("[data-notes-text]")
      );
      for (const node of content) {
        const editor = node.querySelector<HTMLElement>(".bn-editor");
        if (node.dataset.notesContent && editor)
          boxesModel.current?.measure(
            node.dataset.notesContent,
            (editor.getBoundingClientRect().bottom -
              node.getBoundingClientRect().top) /
              input.viewport().zoom
          );
      }
      input.renderer.pageHeight = Math.max(
        page?.height || 1100,
        grown.current,
        ...content.map((node) => node.offsetTop + node.scrollHeight + 40)
      );
      element.style.minHeight = `${input.renderer.pageHeight}px`;
      workspaceNow.current?.resize(input.renderer.pageHeight);
      input.zoom(1);
    });
    resize.observe(element);
    for (const node of element.querySelectorAll("[data-notes-text]"))
      resize.observe(node);
    return () => resize.disconnect();
  }, [ready, page?.height, boxes]);
  useEffect(() => {
    const input = controller.current;
    if (!input || !page) return;
    input.renderer.pageWidth = page.width;
    input.renderer.pageHeight = Math.max(page.height, grown.current);
    if (boxesModel.current) boxesModel.current.page = page;
    input.renderer.releaseCaches();
    paperFrame.current = "";
    input.zoom(1);
  }, [page, noteStyle, ready]);
  const viewZoom = workspace?.viewport.zoom,
    viewY = workspace?.viewport.y,
    viewHeight = workspace?.height;
  useLayoutEffect(() => {
    // Primitive dependencies: scrolling within a painted bucket repaints nothing;
    // synchronous layout paint prevents any multi-frame tearing on zoom/slice commits.
    if (workspaceNow.current && ready) {
      textViewportKey.current = "";
      controller.current?.setNotebookViewport(workspaceNow.current.viewport);
    }
  }, [viewZoom, viewY, viewHeight, ready]);
  const revealText = useCallback(() => {
    if (!typingNow.current || !host.current) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !host.current.contains(selection.anchorNode))
      return;
    const rect = selection.getRangeAt(0).getBoundingClientRect(),
      area = host.current.getBoundingClientRect();
    if (rect.height)
      controller.current?.reveal({
        x: rect.left - area.left,
        y: rect.top - area.top,
        width: rect.width,
        height: rect.height,
      });
  }, []);
  const choose = (change: Partial<InkTools>) => {
    setSettings((previous) => ({
      ...previous,
      ...change,
      ...(change.tool === "highlighter" && previous.tool !== "highlighter"
        ? { color: "#e4b930", opacity: 0.28, ...change }
        : {}),
      ...(change.tool === "pen" && previous.tool === "highlighter"
        ? { color: "#242830", opacity: 1, ...change }
        : {}),
    }));
  };
  const inkAction = (fn: () => void) => {
    try {
      fn();
      setCount(model.current?.strokes().length || 0);
      setPaper(model.current?.paper() || DEFAULT_PAPER);
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const changeStyle = (style: NoteStyle, scope: "page" | "all" = "page") => {
    if (!page) return;
    void action(async () => {
      const contentBottom = Math.max(
        0,
        ...(model.current
          ?.strokes()
          .map((stroke) => stroke.bounds.y + stroke.bounds.height) || []),
        ...Array.from(
          textLayer.current?.querySelectorAll<HTMLElement>(
            "[data-notes-text]"
          ) || []
        ).map((node) => node.offsetTop + node.scrollHeight + 40)
      );
      await library.setNoteStyle(note.id, style, {
        pageId: page.pageId,
        scope,
        contentBottom,
      });
      const regions = boxesModel.current;
      for (const box of regions?.boxes() || [])
        if (box.x + box.width > style.width - 20)
          regions?.set({
            ...box,
            x: 20,
            width: Math.max(120, style.width - 40),
          });
      model.current?.setPaper(style.paper);
      setPaper(style.paper);
      setNoteStyle(style);
    });
  };
  const updateBox = (box: TextBox) => {
    const regions = boxesModel.current;
    const old = regions?.boxes().find((b) => b.id === box.id);
    const group =
      regions &&
      contentGroups(regions.doc).find((g) => g.boxes.includes(box.id));
    if (group && old && (box.x !== old.x || box.y !== old.y) && page) {
      const bounds = contentBounds([
        ...regions!.boxes().filter((b) => group.boxes.includes(b.id)),
        ...(model.current
          ?.strokes()
          .filter((stroke) => group.strokes.includes(stroke.id))
          .map((stroke) => stroke.bounds) || []),
      ]);
      if (bounds)
        void action(() =>
          library.editContent(
            note.id,
            [
              {
                pageId: page.pageId,
                boxes: group.boxes,
                strokes: group.strokes,
              },
            ],
            {
              type: "position",
              x: bounds.x + box.x - old.x,
              y: bounds.y + box.y - old.y,
            }
          )
        );
    } else inkAction(() => regions?.set(box));
  };
  const savePens = (value: PenPreset[]) => {
    void library
      .savePreferences({ ...library.preferences(), pens: value })
      .catch((e) => onError(e.message));
  };
  const setBackground = (file?: File, scope: "page" | "all" = "page") => {
    if (!page) return;
    void action(async () => {
      if (file) {
        const bitmap = await createImageBitmap(file);
        const pixels = bitmap.width * bitmap.height;
        bitmap.close();
        if (pixels > 32000000)
          throw new Error("Choose a background under 32 megapixels.");
      }
      const url = file ? await library.uploadImage(note.id, file) : undefined;
      await library.mutate(note.id, (d) => {
        const assetId = url ? url.replace("sylf-asset:", "") : undefined;
        for (const p of d.pages) {
          if (scope === "all" || p.pageId === page.pageId) {
            if (assetId)
              p.extensions.backgroundAssetId = assetId;
            else delete p.extensions.backgroundAssetId;
          }
        }
      });
    });
  };
  const [arrangeStrokes, setArrangeStrokes] = useState<string[]>([]);
  const openArrange = () => {
    setArrangeStrokes(controller.current?.selectionIds() || []);
    setPanel("content");
  };
  const selectionAction = (fn: () => void) => {
    inkAction(fn);
    setSelection(controller.current?.selectionCount() || 0);
  };
  const contentBottom = () =>
    Math.max(
      80,
      ...(boxesModel.current
        ?.boxes()
        .map(
          (box) =>
            box.y +
            Math.max(
              box.height,
              textLayer.current?.querySelector<HTMLElement>(
                `[data-notes-content="${box.id}"]`
              )?.scrollHeight || 0
            ) +
            24
        ) || [])
    );
  const placeImage = (file: File) => {
    void action(async () => {
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width,
        height = bitmap.height;
      bitmap.close();
      if (width * height > 32000000)
        throw new Error("Choose an image under 32 megapixels.");
      const url = await library.uploadImage(note.id, file);
      const regions = boxesModel.current;
      const bottom = Math.max(
        80,
        ...(regions
          ?.boxes()
          .map(
            (box) =>
              box.y +
              Math.max(
                box.height,
                textLayer.current?.querySelector<HTMLElement>(
                  `[data-notes-content="${box.id}"]`
                )?.scrollHeight || 0
              ) +
              24
          ) || [])
      );
      const placedHeight = height * Math.min(1, 600 / width);
      const id = regions?.add(
        Math.max(20, ((page?.width || 800) - Math.min(width, 600)) / 2),
        bottom,
        {
          assetId: url.replace("sylf-asset:", ""),
          width: Math.min(width, 600),
          height: placedHeight,
        }
      );
      extendNow.current?.(bottom + placedHeight);
      settleNow.current?.();
      if (id) {
        setSelectedBox(id);
        requestAnimationFrame(() => {
          const node = textLayer.current?.querySelector<HTMLElement>(
              `[data-notes-content="${id}"]`
            ),
            area = host.current?.getBoundingClientRect(),
            r = node?.getBoundingClientRect();
          if (r && area)
            controller.current?.reveal({
              x: r.x - area.x,
              y: r.y - area.y,
              width: r.width,
              height: r.height,
            });
        });
      }
    });
  };
  const placeText = (text: string) => {
    const regions = boxesModel.current;
    if (!regions || !page) return;
    void action(async () => {
      const id = "box-" + crypto.randomUUID();
      const bytes = await initialRichTextUpdate(text, undefined, id);
      const bottom = contentBottom();
      regions.doc.transact(() => {
        Y.applyUpdate(regions.doc, bytes);
        regions.add(40, bottom, undefined, id);
      });
      extendNow.current?.(bottom + 120);
      settleNow.current?.();
      setSelectedBox(id);
    });
  };
  const pasteContent = (content: PastedContent) => {
    const input = controller.current;
    if (content.notes?.strokes.length && input) {
      const offset = 24 + (pasteCount.current++ % 5) * 12;
      input.pasteStrokes(content.notes.strokes, offset, offset);
      setCount(model.current?.strokes().length || 0);
      const maxY = Math.max(
        ...content.notes.strokes.flatMap((s) =>
          s.points.map((p) => p[1] + offset)
        )
      );
      extendNow.current?.(maxY);
      settleNow.current?.();
      return;
    }
    if (content.images.length) {
      for (const file of content.images.slice(0, 4)) placeImage(file);
      return;
    }
    if (content.text.trim()) placeText(content.text.slice(0, 20000));
  };
  const copySelected = (event?: ClipboardEvent | unknown, cut = false) => {
    const input = controller.current;
    if (!input?.selectionCount()) return;
    const strokes = input.copyStrokes(),
      data = event instanceof ClipboardEvent ? event.clipboardData : null;
    writeNotesClipboard(data, strokes, data ? "" : COPY_MARKER);
    // A button copy has no event data; the marker lets Paste know this notebook's copy is current.
    if (!data) void navigator.clipboard?.writeText(COPY_MARKER).catch(() => {});
    if (cut) selectionAction(() => input.editSelection({ erase: true }));
  };
  const pasteFromButton = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) =>
          /^image\/(png|jpeg|webp|gif)$/.test(t)
        );
        if (type) {
          const blob = await item.getType(type);
          pasteContent({
            images: [
              new File([blob], `pasted.${type.split("/")[1]}`, { type }),
            ],
            text: "",
          });
          return;
        }
      }
      const text = await navigator.clipboard.readText(),
        own = lastNotesCopy();
      if (text === COPY_MARKER && own)
        return pasteContent({ notes: own, images: [], text: "" });
      if (text.trim()) return pasteContent({ images: [], text });
    } catch {
      /* The browser may withhold clipboard reads; fall back to this notebook's own copy. */
    }
    const own = lastNotesCopy();
    if (own) pasteContent({ notes: own, images: [], text: "" });
    else onError("Nothing to paste yet. Copy handwriting, or press Ctrl/⌘ V.");
  };
  const clipboardNow = useRef({ copySelected, pasteContent });
  useEffect(() => {
    clipboardNow.current = { copySelected, pasteContent };
  });
  const clipboardActive = !workspace || workspace.active;
  useEffect(() => {
    if (!clipboardActive || archived) return;
    const editable = (target: EventTarget | null) =>
      !!(target as HTMLElement | null)?.closest?.(
        "input, textarea, select, [contenteditable='true']"
      );
    const blocked = (event: ClipboardEvent) =>
      !!document.querySelector("dialog[open]") ||
      !host.current?.isConnected ||
      (editable(event.target) && event.type !== "paste");
    const copy = (event: ClipboardEvent) => {
      if (blocked(event) || !controller.current?.selectionCount()) return;
      event.preventDefault();
      clipboardNow.current.copySelected(event, event.type === "cut");
    };
    const paste = (event: ClipboardEvent) => {
      if (blocked(event)) return;
      const content = readNotesClipboard(event.clipboardData);
      // Typed text keeps its native paste; image-only pastes still become page images.
      if (editable(event.target) && (!content.images.length || content.text))
        return;
      if (
        content.notes ||
        content.images.length ||
        (!editable(event.target) && content.text.trim())
      ) {
        event.preventDefault();
        clipboardNow.current.pasteContent(content);
      }
    };
    document.addEventListener("copy", copy);
    document.addEventListener("cut", copy);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", copy);
      document.removeEventListener("paste", paste);
    };
  }, [clipboardActive, archived]);
  return (
    <section
      className={`${shared.editorLayout} ${s.editor}`}
      data-notebook-surface={!!workspace}
      data-notebook-active={workspace?.active}
      onPointerDownCapture={(event) => workspace?.activate(event.target)}
      onFocusCapture={(event) => workspace?.activate(event.target)}
      data-focus={focus}
      data-dock={dock}
      data-typing={typing}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setFocus(false);
          setPlacingText(false);
        }
        if (
          ["Delete", "Backspace"].includes(event.key) &&
          (event.target as HTMLElement).closest("[data-notes-box-control]") &&
          selectedBox !== "body"
        ) {
          const box = boxesModel.current
            ?.boxes()
            .find((box) => box.id === selectedBox);
          if (box) {
            event.preventDefault();
            updateBox({ ...box, removed: true });
            setSelectedBox("body");
          }
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          (event.target as HTMLElement).closest("[data-notes-box-control]") &&
          ["z", "y"].includes(event.key.toLowerCase())
        ) {
          event.preventDefault();
          if (event.key.toLowerCase() === "y" || event.shiftKey)
            boxesModel.current?.undo.redo();
          else boxesModel.current?.undo.undo();
        }
      }}
      aria-label="Paper notebook editor"
    >
      <Chrome workspace={workspace}>
        <header className={s.header}>
          <button
            className={shared.iconButton}
            aria-label="Back to notes"
            disabled={busy}
            onClick={onBack}
          >
            <ArrowLeft size={19} />
          </button>
          <div ref={setHeaderSlot} className={s.titleSlot} />
          <button
            className={shared.iconButton}
            aria-label="Document version history"
            onClick={onHistory}
          >
            <History size={18} />
          </button>
          <button
            className={shared.iconButton}
            aria-label="Document details"
            onClick={onDetails}
          >
            <MoreHorizontal size={20} />
          </button>
          <span
            ref={status}
            role="status"
            className={s.saveStatus}
            hidden={!diagnostics}
          >
            {ready ? "Ready" : "Opening paper…"}
          </span>
          <button
            className={shared.iconButton}
            aria-label={focus ? "Exit full screen" : "Full screen writing"}
            title={focus ? "Exit full screen (Esc)" : "Full screen writing"}
            aria-pressed={focus}
            onClick={toggleFullscreen}
          >
            {focus ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </header>
        <div className={s.tools} role="toolbar" aria-label="Handwriting tools">
          <div className={s.modeSwitch} aria-label="Writing mode">
            <button
              aria-label="Text mode"
              aria-pressed={typing}
              onClick={() => {
                controller.current?.finish();
                setTyping(true);
              }}
            >
              <Keyboard size={20} />
              <span>Type</span>
            </button>
            <button
              aria-label="Handwriting mode"
              aria-pressed={!typing}
              onClick={() => {
                (document.activeElement as HTMLElement)?.blur();
                void library
                  .whenDocumentIdle(note.id)
                  .then(() => setTyping(false))
                  .catch((error) => onError(error.message));
              }}
            >
              <PenLine size={20} />
              <span>Write</span>
            </button>
          </div>
          {typing && (
            <button
              aria-label="Position text on page"
              aria-pressed={!!placingText}
              title="Tap the page to position its text"
              onClick={() => setPlacingText(placingText ? false : "move")}
            >
              <Move size={18} />
            </button>
          )}
          {typing && (
            <>
              <button
                aria-label="Add text box"
                aria-pressed={placingText === "new"}
                onClick={() => setPlacingText(placingText ? false : "new")}
              >
                <TextCursorInput size={19} />
              </button>
              <button
                aria-label="Place image"
                onClick={() => imageFile.current?.click()}
              >
                <ImagePlus size={19} />
              </button>
              <button
                aria-label="Undo content arrangement"
                disabled={!canArrangeUndo}
                onClick={() => {
                  boxesModel.current?.undo.undo();
                }}
              >
                <Undo2 size={18} />
              </button>
            </>
          )}
          {typing && (
            <button
              aria-label="Redo content arrangement"
              disabled={!canArrangeRedo}
              onClick={() => boxesModel.current?.undo.redo()}
            >
              <Redo2 size={18} />
            </button>
          )}
          {typing && (
            <button aria-label="Page content layers" onClick={openArrange}>
              <Layers3 size={18} />
            </button>
          )}
          <div ref={setTextToolbar} className={s.textTools} hidden={!typing} />
          <div className={s.penTools} hidden={typing}>
            {tools.map(({ id, label, Icon }) => (
              <button
                key={id}
                disabled={!ready || !!failure || archived}
                aria-label={label}
                aria-pressed={settings.tool === id}
                title={label}
                onClick={() => choose({ tool: id })}
              >
                <Icon size={20} />
                <span>
                  {id === "lasso"
                    ? "Select"
                    : id === "eraser"
                      ? "Erase"
                      : label}
                </span>
              </button>
            ))}
            <i className={s.divider} />
            <button
              aria-label={
                settings.tool === "eraser"
                  ? "Eraser options"
                  : "Ink color and thickness"
              }
              title="Pen studio"
              onClick={() => setPanel("pen")}
            >
              <span
                className={s.currentColor}
                style={{ background: settings.color }}
              />
              <Palette size={16} />
            </button>
            <div className={s.favoritePens} aria-label="Favorite pens">
              {pens.slice(0, 4).map((pen) => (
                <button
                  key={pen.id}
                  aria-label={`Use favorite ${pen.name}`}
                  title={pen.name}
                  onClick={() => choose(pen)}
                >
                  <span style={{ background: pen.color }} />
                  <Star size={9} />
                </button>
              ))}
            </div>
            <button
              aria-label="Undo handwriting"
              disabled={!ready || !canUndo || !!failure}
              onClick={() => inkAction(() => model.current?.undoEdit())}
            >
              <Undo2 size={19} />
            </button>
            <button
              aria-label="Redo handwriting"
              disabled={!ready || !canRedo || !!failure}
              onClick={() => inkAction(() => model.current?.redoEdit())}
            >
              <Redo2 size={19} />
            </button>
          </div>
          <div className={s.spacer} />
          <button
            aria-label="Paste"
            title="Paste handwriting, text or an image (Ctrl/⌘ V)"
            disabled={!ready || !!failure}
            onClick={() => void pasteFromButton()}
          >
            <ClipboardPaste size={18} />
          </button>
          <button
            aria-label="Move toolbar"
            title="Move toolbar to top or bottom"
            onClick={() => setDock(dock === "top" ? "bottom" : "top")}
          >
            <AlignVerticalJustifyStart size={18} />
          </button>
          <div className={s.zoomGroup} role="group" aria-label="Zoom">
            <button
              aria-label="Zoom out"
              title="Zoom out (Ctrl/⌘ −)"
              onClick={() => controller.current?.zoom(0.8)}
            >
              <ZoomOut size={18} />
            </button>
            <button
              aria-label="Fit paper width"
              title="Fit page width (Ctrl/⌘ 0)"
              className={s.zoom}
              onClick={() => controller.current?.fit()}
            >
              <MoveHorizontal size={15} />
              <span data-notes-zoom-value>{`${
                workspace ? Math.round(workspace.viewport.zoom * 100) : zoom
              }%`}</span>
            </button>
            <button
              aria-label="Zoom in"
              title="Zoom in (Ctrl/⌘ +)"
              onClick={() => controller.current?.zoom(1.25)}
            >
              <ZoomIn size={18} />
            </button>
            <button
              aria-label="Fit whole page"
              title="Fit whole page on screen"
              onClick={() => controller.current?.fitPage()}
            >
              <RectangleVertical size={17} />
            </button>
          </div>
        </div>
        {selection > 0 && (
          <div
            className={s.selectionBar}
            role="toolbar"
            aria-label="Selected strokes"
          >
            <strong>{selection} selected</strong>
            <button aria-label="Copy selected strokes" onClick={copySelected}>
              <Copy size={15} /> Copy
            </button>
            <button
              aria-label="Cut selected strokes"
              onClick={() => copySelected(undefined, true)}
            >
              <Scissors size={15} /> Cut
            </button>
            <button onClick={openArrange}>Arrange / move to page</button>
            <button
              onClick={() =>
                selectionAction(() =>
                  controller.current?.editSelection({
                    color: settings.color,
                    width:
                      settings.tool === "highlighter"
                        ? Math.max(10, settings.width * 5)
                        : settings.width,
                    nib: settings.nib,
                    opacity: settings.opacity,
                    pressure: settings.pressure,
                    smoothing: settings.smoothing,
                    lineStyle: settings.lineStyle,
                  })
                )
              }
            >
              Apply ink style
            </button>
            <button
              aria-label="Shrink selected strokes"
              onClick={() =>
                selectionAction(() => controller.current?.scaleSelection(0.8))
              }
            >
              Smaller
            </button>
            <button
              aria-label="Enlarge selected strokes"
              onClick={() =>
                selectionAction(() => controller.current?.scaleSelection(1.25))
              }
            >
              Larger
            </button>
            <button
              aria-label="Erase selected strokes"
              onClick={() =>
                selectionAction(() =>
                  controller.current?.editSelection({ erase: true })
                )
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
        {failure && (
          <div role="alert" className={shared.editorError}>
            <span>{failure}</span>
            <button
              className={shared.secondary}
              onClick={() => {
                controller.current?.finish();
                void opened.current?.stream
                  .retry()
                  .then(() => {
                    model.current?.assertHealthy();
                    setFailure("");
                    onError("");
                  })
                  .catch((e) => onError(e.message));
              }}
            >
              <RotateCcw size={15} />
              Retry save
            </button>
            <button
              className={shared.secondary}
              onClick={() => {
                controller.current?.finish();
                void (async () => {
                  const snapshots = library.recoverySnapshots();
                  const bytes = await exportNotesRecovery(
                    library.repository,
                    snapshots
                  );
                  downloadNotesBytes(
                    bytes,
                    `${note.view.descriptor.title} recovery.sylfnote`
                  );
                })().catch((e) => onError(e.message));
              }}
            >
              <Download size={15} />
              Export recovery
            </button>
          </div>
        )}
        <div className={s.pageControls}>
          {noteStyle.layout !== "continuous" ? (
            <>
              <button
                aria-label="Show notebook pages"
                aria-expanded={rail}
                aria-controls="ink-page-rail"
                onClick={() => setRail(!rail)}
              >
                <PanelLeft size={17} />
                <span>Pages</span>
              </button>
              <button
                aria-label="Previous paper page"
                disabled={index <= 0 || busy}
                onClick={() => onPage(activePages[index - 1].pageId)}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                {archived
                  ? "Removed page"
                  : `Page ${index + 1} of ${activePages.length}`}
              </span>
              <button
                aria-label="Next paper page"
                disabled={index < 0 || index >= activePages.length - 1 || busy}
                onClick={() => onPage(activePages[index + 1].pageId)}
              >
                <ChevronRight size={17} />
              </button>
              <button
                aria-label="Add paper page"
                disabled={busy}
                onClick={() =>
                  void action(async () => onPage(await library.addPage(note.id)))
                }
              >
                <Plus size={18} />
              </button>
            </>
          ) : (
            <span className={s.infiniteBadge}>
              Infinite paper
            </span>
          )}
          <div className={s.spacer} />
          {focus && (
            <button
              aria-label="Exit focus writing"
              title="Exit full screen"
              onClick={() => setFocus(false)}
            >
              <Minimize2 size={18} />
            </button>
          )}
          <button
            aria-label="Paper"
            disabled={!ready || !!failure}
            onClick={() => setPanel("paper")}
          >
            Paper
          </button>
        </div>
      </Chrome>
      <div className={s.body}>
        <Chrome workspace={workspace}>
          {rail && (
            <button
              className={s.railDismiss}
              aria-label="Close notebook pages"
              onClick={() => setRail(false)}
            />
          )}
          <aside
            id="ink-page-rail"
            className={s.pageRail}
            data-open={rail}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setRail(false);
              }
            }}
            aria-label="Paper pages"
          >
            <div className={s.railHeader}>
              <strong>{removed ? "Removed pages" : "Notebook"}</strong>
              <button
                aria-label="Close page sidebar"
                onClick={() => setRail(false)}
              >
                <X size={17} />
              </button>
            </div>
            <button
              className={s.removedToggle}
              aria-pressed={removed}
              onClick={() => setRemoved(!removed)}
            >
              {removed
                ? "Active pages"
                : `Removed pages (${note.view.descriptor.pages.length - activePages.length})`}
            </button>
            <div className={s.pageList}>
              {note.view.descriptor.pages
                .filter((p) => !!p.extensions.archived === removed)
                .slice(0, pageLimit)
                .map((p) => (
                  <div key={p.pageId} className={s.pageItem}>
                    <button
                      className={s.pageOpen}
                      aria-label={`Open paper page ${(removed ? note.view.descriptor.pages : activePages).indexOf(p) + 1}`}
                      aria-current={
                        p.pageId === page?.pageId ? "page" : undefined
                      }
                      onClick={() => {
                        onPage(p.pageId);
                        setRail(false);
                      }}
                    >
                      <InkThumbnail
                        library={library}
                        note={note}
                        pageId={p.pageId}
                      />
                      <span>
                        Page{" "}
                        {(removed
                          ? note.view.descriptor.pages
                          : activePages
                        ).indexOf(p) + 1}
                      </span>
                    </button>
                    {removed && (
                      <button
                        className={s.restore}
                        onClick={() =>
                          void action(() =>
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
            {note.view.descriptor.pages.filter(
              (p) => !!p.extensions.archived === removed
            ).length > pageLimit && (
              <button onClick={() => setPageLimit((n) => n + 30)}>
                Show more pages
              </button>
            )}
            {page && !archived && noteStyle.layout !== "continuous" && (
              <div className={s.pageActions}>
                <button
                  aria-label="Move paper page earlier"
                  disabled={busy || index <= 0}
                  onClick={() =>
                    void action(() =>
                      library.movePage(note.id, page.pageId, -1)
                    )
                  }
                >
                  <ArrowUp size={17} />
                </button>
                <button
                  aria-label="Move paper page later"
                  disabled={busy || index >= activePages.length - 1}
                  onClick={() =>
                    void action(() => library.movePage(note.id, page.pageId, 1))
                  }
                >
                  <ArrowDown size={17} />
                </button>
                <button
                  aria-label="Duplicate paper page"
                  disabled={busy}
                  onClick={() =>
                    void action(async () =>
                      onPage(await library.addPage(note.id, page.pageId))
                    )
                  }
                >
                  <Copy size={17} />
                </button>
                <button
                  aria-label="Remove paper page"
                  disabled={busy || activePages.length < 2}
                  onClick={() =>
                    void action(async () => {
                      await library.archivePage(note.id, page.pageId, true);
                      onPage(
                        activePages.find((p) => p.pageId !== page.pageId)!
                          .pageId
                      );
                    })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            )}
          </aside>
        </Chrome>
        {archived ? (
          <div className={s.archived}>
            <h3>This page is safely retained.</h3>
            <p>Restore it to write here again.</p>
            <button
              className={shared.secondary}
              onClick={() =>
                void action(() =>
                  library.archivePage(note.id, page!.pageId, false)
                )
              }
            >
              <RotateCcw size={16} />
              Restore page
            </button>
          </div>
        ) : (
          <div
            ref={host}
            className={s.canvasHost}
            tabIndex={0}
            role="region"
            onKeyDown={(event) => {
              if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "s"
              ) {
                event.preventDefault();
                void opened.current?.stream
                  .flush()
                  .catch((error) => onError(error.message));
              }
            }}
            onPointerDownCapture={(event) => {
              if (!placingText || !page || !controller.current) return;
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              const point = controller.current.renderer.pagePoint(
                event.clientX - rect.left,
                event.clientY - rect.top
              );
              const x = Math.round(
                  Math.max(20, Math.min(page.width - 220, point.x))
                ),
                y = Math.round(Math.max(20, point.y));
              const regions = boxesModel.current;
              try {
                if (placingText === "new" && regions) {
                  void action(async () => {
                    const id = "box-" + crypto.randomUUID();
                    const bytes = await initialRichTextUpdate(
                      "",
                      undefined,
                      id
                    );
                    regions.doc.transact(() => {
                      Y.applyUpdate(regions.doc, bytes);
                      regions.add(x, y, undefined, id);
                    });
                    setSelectedBox(id);
                  });
                } else {
                  const box = regions
                    ?.boxes()
                    .find((box) => box.id === selectedBox);
                  if (box)
                    regions?.set({
                      ...box,
                      x: Math.min(x, page.width - box.width - 20),
                      y,
                    });
                }
              } catch (error) {
                onError((error as Error).message);
              }
              setPlacingText(false);
            }}
            data-placing-text={placingText}
            onDragOver={(event) => {
              const types = Array.from(event.dataTransfer?.types || []);
              if (
                types.includes("Files") ||
                types.includes("text/plain") ||
                types.includes("application/x-sylf-notes+json")
              ) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }
            }}
            onDrop={(event) => {
              const content = readNotesClipboard(event.dataTransfer);
              if (
                content.images.length ||
                content.notes ||
                content.text.trim()
              ) {
                event.preventDefault();
                pasteContent(content);
              }
            }}
            aria-label="Handwriting paper"
            aria-describedby={helpId}
          >
            <canvas
              ref={paperCanvas}
              className={s.paperCanvas}
              aria-hidden="true"
            />
            <canvas ref={base} className={s.inkCanvas} aria-hidden="true" />
            {ready && page && (
              <div
                ref={textLayer}
                className={s.textLayer}
                data-notes-text
                style={{
                  width: page.width,
                  minHeight: page.height,
                  color:
                    adaptDark || isDarkColor(paper.color)
                      ? "#f5f5f5"
                      : "#242830",
                }}
              >
                {typeof page.extensions.backgroundAssetId === "string" && (
                  <div className={s.pageBackground}>
                    <PageImage
                      library={library}
                      documentId={note.id}
                      assetId={page.extensions.backgroundAssetId}
                      background
                    />
                  </div>
                )}
                <div
                  ref={guideLayer}
                  className={s.alignmentGuides}
                  aria-hidden="true"
                />
                {boxes.map((box) => (
                  <PageContentBox
                    key={box.id}
                    box={box}
                    selected={selectedBox === box.id}
                    enabled={typing && (!workspace || workspace.active)}
                    zoom={() => controller.current?.viewport().zoom || 1}
                    pageWidth={page.width}
                    peers={boxes}
                    guides={showGuides}
                    onSelect={() => setSelectedBox(box.id)}
                    onChange={updateBox}
                  >
                    {box.kind === "image" && box.assetId ? (
                      <PageImage
                        library={library}
                        documentId={note.id}
                        assetId={box.assetId}
                      />
                    ) : (
                      <NotesEditor
                        library={library}
                        note={note}
                        pageId={page.pageId}
                        fragment={box.id}
                        onBack={onBack}
                        onError={onError}
                        onState={onState}
                        registerLeave={registerTextLeave}
                        diagnostics={diagnostics}
                        embedded={{
                          header: box.id === "body" ? headerSlot : null,
                          toolbar: selectedBox === box.id ? textToolbar : null,
                          enabled: typing,
                          stream: textStream,
                          focusOnOpen:
                            selectedBox === box.id && box.id !== "body",
                          reveal: revealText,
                        }}
                      />
                    )}
                  </PageContentBox>
                ))}
              </div>
            )}
            <canvas ref={live} aria-hidden="true" />
            {placingText && (
              <p className={s.placeHint}>
                Tap the page to place{" "}
                {placingText === "new" ? "a new text box" : "the selected box"}.
                Esc to cancel.
              </p>
            )}
            {!ready && (failure || showOpening) && (
              <p className={s.opening}>
                {failure
                  ? "This page needs recovery."
                  : "Preparing your paper…"}
              </p>
            )}
          </div>
        )}
      </div>
      {panel === "content" && (!workspace || workspace.active) && page && (
        <DocumentArrange
          library={library}
          note={note}
          pageId={page.pageId}
          onError={onError}
          onClose={() => setPanel(undefined)}
          selectedStrokes={arrangeStrokes}
          selectedBox={selectedBox}
          onComplete={() => controller.current?.selectIds([])}
        />
      )}
      {panel === "pen" && (!workspace || workspace.active) && (
        <PenPanel
          settings={settings}
          previewColor={displayInkColor(settings.color, adaptDark)}
          paperColor={displayPaper(paper, adaptDark).color}
          choose={choose}
          pens={pens}
          savePens={savePens}
          onClose={() => setPanel(undefined)}
          onStylus={() => setPanel("stylus")}
        />
      )}
      {panel === "stylus" && (!workspace || workspace.active) && (
        <StylusPanel
          mapping={stylus}
          capabilities={readStylusCapabilities()}
          onClose={() => setPanel("pen")}
          save={(mapping) =>
            library
              .savePreferences({ ...library.preferences(), stylus: mapping })
              .catch((e) => onError(e.message))
          }
        />
      )}
      {panel === "paper" && (!workspace || workspace.active) && (
        <PaperPanel
          templates={library.preferences().templates}
          saveTemplates={async (templates) => {
            try {
              await library.savePreferences({
                ...library.preferences(),
                templates,
              });
            } catch (error) {
              onError((error as Error).message);
            }
          }}
          style={{ ...noteStyle, paper }}
          busy={busy}
          change={changeStyle}
          onClose={() => setPanel(undefined)}
          background={typeof page?.extensions.backgroundAssetId === "string"}
          setBackground={setBackground}
          saveDefault={async () => {
            try {
              await library.savePreferences({
                ...library.preferences(),
                style: { ...noteStyle, paper },
              });
            } catch (e) {
              onError((e as Error).message);
              throw e;
            }
          }}
          initialScope={paperScope}
          onScopeChange={setPaperScope}
        />
      )}
      {(!workspace || workspace.active) && (
        <input
          ref={imageFile}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label="Choose positioned image"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            placeImage(file);
          }}
        />
      )}
      <footer className={s.footer} hidden={!diagnostics}>
        <span>
          {count.toLocaleString()} strokes ·{" "}
          {settings.finger ? "Finger writing on" : "Touch to navigate"}
        </span>
        <span id={helpId}>
          Space: pan · Ctrl/⌘ Z: undo · Ctrl/⌘ A: select · arrows: move
        </span>
      </footer>
    </section>
  );
}
