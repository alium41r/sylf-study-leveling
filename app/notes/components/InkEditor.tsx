"use client";
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
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
  Maximize,
  PanelLeft,
  Plus,
  ChevronLeft,
  ChevronRight,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  Focus,
  RotateCcw,
  Download,
  Palette,
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
import type { SaveState } from "@/lib/notes/engine";
import { exportNotesRecovery } from "@/lib/notes/portable";
import { downloadNotesBytes } from "@/lib/notes/download";
import { notesResumeSchema } from "@/lib/resources";
import InkThumbnail from "./InkThumbnail";
import s from "../Ink.module.css";
import shared from "../Notes.module.css";
const tools: { id: InkTool; label: string; Icon: typeof PenLine }[] = [
  { id: "pen", label: "Pen", Icon: PenLine },
  { id: "highlighter", label: "Highlighter", Icon: Highlighter },
  { id: "eraser", label: "Stroke eraser", Icon: Eraser },
  { id: "lasso", label: "Lasso selection", Icon: LassoSelect },
  { id: "hand", label: "Pan", Icon: Hand },
];
const dismissOptions = (event: FocusEvent<HTMLDetailsElement>) => {
  if (!event.currentTarget.contains(event.relatedTarget as Node | null))
    event.currentTarget.open = false;
};
const optionsKey = (event: KeyboardEvent<HTMLDetailsElement>) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  }
};
const colors = [
  "#242830",
  "#345bc6",
  "#b83349",
  "#20705b",
  "#7954a0",
  "#e4b930",
];
const stateText: Record<SaveState, string> = {
  ready: "Ready",
  saving: "Saving on device…",
  pausing: "Writing paused",
  "local-durable": "Saved on device",
  failed: "Not saved — recovery available",
  closed: "Locked",
};
export default function InkEditor({
  library,
  note,
  pageId,
  onBack,
  onPage,
  onError,
  onState,
  registerLeave,
}: {
  library: NotesLibrary;
  note: NoteSummary;
  pageId?: string;
  onBack: () => void;
  onPage: (pageId: string) => void;
  onError: (message: string) => void;
  onState: (state: SaveState) => void;
  registerLeave: (callback?: () => Promise<void>) => void;
}) {
  const page = pageId
    ? note.view.descriptor.pages.find((p) => p.pageId === pageId)
    : note.view.descriptor.pages.find((p) => !p.extensions.archived);
  const host = useRef<HTMLDivElement>(null),
    base = useRef<HTMLCanvasElement>(null),
    live = useRef<HTMLCanvasElement>(null),
    status = useRef<HTMLSpanElement>(null);
  const controller = useRef<InkController | undefined>(undefined),
    model = useRef<InkModel | undefined>(undefined),
    opened = useRef<Awaited<ReturnType<NotesLibrary["open"]>> | undefined>(
      undefined
    );
  const [ready, setReady] = useState(false),
    [failure, setFailure] = useState(""),
    [settings, setSettings] = useState<InkTools>({
      tool: "pen",
      color: "#242830",
      width: 2.8,
      finger: false,
    }),
    [paper, setPaper] = useState<InkPaper>(DEFAULT_PAPER),
    [selection, setSelection] = useState(0),
    [count, setCount] = useState(0),
    [zoom, setZoom] = useState(100),
    [rail, setRail] = useState(false),
    [focus, setFocus] = useState(false),
    [removed, setRemoved] = useState(false),
    [pageLimit, setPageLimit] = useState(30),
    [busy, setBusy] = useState(false),
    [canUndo, setCanUndo] = useState(false),
    [canRedo, setCanRedo] = useState(false);
  const currentSettings = useRef(settings);
  const activePages = note.view.descriptor.pages.filter(
      (p) => !p.extensions.archived
    ),
    index = activePages.findIndex((p) => p.pageId === page?.pageId),
    archived = !!page?.extensions.archived;
  useEffect(() => {
    if (!page || archived) return;
    let cancelled = false,
      cleanup: (() => void) | undefined,
      statusTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const source = await library.open(note.id, page.pageId);
      if (cancelled) {
        source.release();
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
          setCount(ink.strokes().length);
          setSelection(input?.selectionCount() || 0);
          setPaper(ink.paper());
          setZoom(Math.round((input?.viewport().zoom || 1) * 100));
          setCanUndo(ink.undo.undoStack.length > 0);
          setCanRedo(ink.undo.redoStack.length > 0);
        } catch (e) {
          setFailure(String((e as Error).message));
        }
        const state = source.stream.status().state;
        if (status.current)
          status.current.textContent = writing ? "Writing…" : stateText[state];
        reportState(writing ? "saving" : state);
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
        page.width,
        page.height,
        writable,
        update,
        error,
        resume.success && resume.data.pageId === page.pageId
          ? resume.data.inkViewport
          : undefined
      );
      input.setTools(currentSettings.current);
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
            update();
          }, 200);
      });
      const history = () => {
        if (!cancelled) {
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
          await source.stream.flush();
          const view = input.viewport();
          await library.saveResume(note.id, {
            version: 1,
            pageId: page.pageId,
            scrollRatio: 0,
            inkViewport: view,
          });
        })().finally(() => {
          leaving = undefined;
        }));
      const removeLeave = library.registerBeforeClose(leave);
      registerLeave(leave);
      cleanup = () => {
        clearTimeout(statusTimer);
        changed();
        removeLeave();
        registerLeave(undefined);
        boundary();
        // Capture synchronously before releasing a stream; a failed flush retains its native capsule.
        input.close();
        ink.close();
        controller.current = undefined;
        model.current = undefined;
        void source.stream
          .flush()
          .catch((e) => onError((e as Error).message))
          .finally(() => source.release());
        opened.current = undefined;
      };
      if (cancelled) {
        cleanup();
        return;
      }
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
  useEffect(() => {
    currentSettings.current = settings;
    controller.current?.setTools(settings);
  }, [settings]);
  const brushColors = useRef({ pen: "#242830", highlighter: "#e4b930" });
  const choose = (change: Partial<InkTools>) => {
    if (
      change.color &&
      (settings.tool === "pen" || settings.tool === "highlighter")
    )
      brushColors.current[settings.tool] = change.color;
    const color =
      change.tool === "pen" || change.tool === "highlighter"
        ? brushColors.current[change.tool]
        : change.color || settings.color;
    setSettings({ ...settings, ...change, color });
  };
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      controller.current?.finish();
      await opened.current?.stream.flush();
      await fn();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
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
  const changePaper = (change: Partial<InkPaper>) =>
    inkAction(() => model.current?.setPaper({ ...paper, ...change }));
  const selectionAction = (fn: () => void) => {
    inkAction(fn);
    setSelection(controller.current?.selectionCount() || 0);
  };
  return (
    <section
      className={`${shared.editorLayout} ${s.editor}`}
      data-focus={focus}
      aria-label="Paper notebook editor"
    >
      <header className={s.header}>
        <button
          className={shared.iconButton}
          aria-label="Back to notes"
          onClick={onBack}
        >
          <ArrowLeft size={19} />
        </button>
        <h2>{note.view.descriptor.title}</h2>
        <span ref={status} role="status" className={s.saveStatus}>
          {ready ? "Ready" : "Opening paper…"}
        </span>
        <button
          className={shared.iconButton}
          aria-label="Focus writing"
          aria-pressed={focus}
          onClick={() => setFocus(!focus)}
        >
          <Focus size={18} />
        </button>
      </header>
      <div className={s.tools} role="toolbar" aria-label="Handwriting tools">
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
              {id === "lasso" ? "Select" : id === "eraser" ? "Erase" : label}
            </span>
          </button>
        ))}
        <i className={s.divider} />
        <details
          className={s.options}
          onBlur={dismissOptions}
          onKeyDown={optionsKey}
        >
          <summary
            aria-label="Ink color and thickness"
            title="Ink color and thickness"
          >
            <span
              className={s.currentColor}
              style={{ background: settings.color }}
            />
            <Palette size={15} />
          </summary>
          <div className={s.optionsPanel}>
            <div className={s.optionsHeading}>
              <strong>Ink</strong>
              <button
                aria-label="Close ink options"
                onClick={(event) => {
                  const details = event.currentTarget.closest("details");
                  if (details) {
                    details.open = false;
                    details.querySelector("summary")?.focus();
                  }
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className={s.swatches}>
              {colors.map((color) => (
                <button
                  key={color}
                  aria-label={`Ink ${color}`}
                  aria-pressed={settings.color === color}
                  style={{ background: color }}
                  onClick={() => choose({ color })}
                />
              ))}
            </div>
            <label>
              Custom color
              <input
                type="color"
                aria-label="Custom ink color"
                value={settings.color}
                onChange={(e) => choose({ color: e.target.value })}
              />
            </label>
            <label>
              Thickness <output>{settings.width.toFixed(1)}</output>
              <input
                aria-label="Pen thickness"
                type="range"
                min="0.5"
                max="8"
                step="0.1"
                value={settings.width}
                onChange={(e) => choose({ width: Number(e.target.value) })}
              />
            </label>
            <label className={s.check}>
              <input
                type="checkbox"
                checked={settings.finger}
                onChange={(e) => choose({ finger: e.target.checked })}
              />
              Write with a finger
            </label>
            <p>
              Touch pans by default. Two fingers pan and zoom. Pen input
              suppresses touch near writing.
            </p>
          </div>
        </details>
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
        <div className={s.spacer} />
        <button
          aria-label="Zoom out"
          onClick={() => controller.current?.zoom(0.8)}
        >
          <ZoomOut size={18} />
        </button>
        <button
          aria-label="Fit paper width"
          title="Fit width (Ctrl/⌘ 0)"
          className={s.zoom}
          onClick={() => controller.current?.fit()}
        >
          {zoom}% <Maximize size={14} />
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => controller.current?.zoom(1.25)}
        >
          <ZoomIn size={18} />
        </button>
      </div>
      {selection > 0 && (
        <div
          className={s.selectionBar}
          role="toolbar"
          aria-label="Selected strokes"
        >
          <strong>{selection} selected</strong>
          <button
            onClick={() =>
              selectionAction(() =>
                controller.current?.editSelection({
                  color: settings.color,
                  width: settings.width,
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
        <div className={s.spacer} />
        {focus && (
          <button
            aria-label="Exit focus writing"
            onClick={() => setFocus(false)}
          >
            <Focus size={18} />
          </button>
        )}
        <details
          className={`${s.options} ${s.paperOptions}`}
          onBlur={dismissOptions}
          onKeyDown={optionsKey}
        >
          <summary>Paper</summary>
          <div className={s.optionsPanel}>
            <div className={s.optionsHeading}>
              <strong>Paper appearance</strong>
              <button
                aria-label="Close paper options"
                onClick={(event) => {
                  const details = event.currentTarget.closest("details");
                  if (details) {
                    details.open = false;
                    details.querySelector("summary")?.focus();
                  }
                }}
              >
                <X size={16} />
              </button>
            </div>
            <label>
              Template
              <select
                aria-label="Paper template"
                value={paper.template}
                disabled={!ready || !!failure}
                onChange={(e) =>
                  changePaper({
                    template: e.target.value as InkPaper["template"],
                  })
                }
              >
                {["blank", "ruled", "grid", "dotted"].map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Paper color
              <input
                aria-label="Paper color"
                type="color"
                value={paper.color}
                onChange={(e) => changePaper({ color: e.target.value })}
              />
            </label>
            <label>
              Rule color
              <input
                aria-label="Paper rule color"
                type="color"
                value={paper.rule}
                onChange={(e) => changePaper({ rule: e.target.value })}
              />
            </label>
            <label>
              Spacing
              <select
                aria-label="Paper spacing"
                value={paper.spacing}
                onChange={(e) =>
                  changePaper({ spacing: Number(e.target.value) })
                }
              >
                {[20, 28, 36, 48].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <p>Paper and ink keep their authored colors across Sylf themes.</p>
          </div>
        </details>
      </div>
      <div className={s.body}>
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
          {page && !archived && (
            <div className={s.pageActions}>
              <button
                aria-label="Move paper page earlier"
                disabled={busy || index <= 0}
                onClick={() =>
                  void action(() => library.movePage(note.id, page.pageId, -1))
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
                      activePages.find((p) => p.pageId !== page.pageId)!.pageId
                    );
                  })
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          )}
        </aside>
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
            aria-label="Handwriting paper"
            aria-describedby="ink-help"
          >
            <canvas ref={base} aria-hidden="true" />
            <canvas ref={live} aria-hidden="true" />
            {!ready && (
              <p className={s.opening}>
                {failure
                  ? "This page needs recovery."
                  : "Preparing your paper…"}
              </p>
            )}
          </div>
        )}
      </div>
      <footer className={s.footer}>
        <span>
          {count.toLocaleString()} strokes ·{" "}
          {settings.finger ? "Finger writing on" : "Touch to navigate"}
        </span>
        <span id="ink-help">
          Space: pan · Ctrl/⌘ Z: undo · Ctrl/⌘ A: select · arrows: move
        </span>
      </footer>
    </section>
  );
}
