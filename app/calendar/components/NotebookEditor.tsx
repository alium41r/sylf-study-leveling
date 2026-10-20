"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  Check,
  CloudOff,
  Maximize2,
  Minimize2,
  NotebookPen,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { editableDocument, type InkStroke } from "@/lib/calendar/ink";
import { noteAutosave, type NoteRecovery } from "@/lib/calendar/note-autosave";
import { calendarRequest } from "./useCalendarWorkspace";
import { invalidateClientCache } from "@/lib/client-data-cache";
import CalendarDialog from "./CalendarDialog";
import InkSurface from "./InkSurface";
import NotebookRecognition from "./NotebookRecognition";
import InkToolbar, { defaultInkTools } from "./InkToolbar";
import type { EditorSelection } from "./CalendarEditor";
import styles from "../Notebook.module.css";
export default function NotebookEditor({
  selection,
  onClose,
  onSaved,
}: {
  selection: Extract<EditorSelection, { kind: "note" }> & {
    recovery?: NoteRecovery;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const instance = useId();
  const [job] = useState(() =>
    noteAutosave(
      user!.id,
      selection.item
        ? {
            dateKey: selection.item.dateKey,
            title: selection.item.title,
            document: selection.item.document,
          }
        : {
            dateKey: selection.date,
            title: "",
            document: {
              version: 2,
              text: "",
              mode: "note",
              ink: { width: 1000, height: 1400, strokes: [] },
            },
          },
      selection.item,
      selection.recovery,
      instance
    )
  );
  useSyncExternalStore(job.subscribe, job.snapshot, job.snapshot);
  const value = job.record.data,
    doc = editableDocument(value.document);
  const [tools, setTools] = useState(defaultInkTools),
    [expanded, setExpanded] = useState(false),
    [confirm, setConfirm] = useState<"delete" | "close" | null>(null),
    [deleting, setDeleting] = useState(false),
    [error, setError] = useState("");
  const [recognitionRisk, setRecognitionRisk] = useState(false);
  const [selectedInk, setSelectedInk] = useState<string[]>([]);
  const [history, setHistory] = useState<InkStroke[][]>([]),
    [future, setFuture] = useState<InkStroke[][]>([]);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    job.connect();
    if (job.pending) void job.flush();
    return () => job.release();
  }, [job]);
  useEffect(() => {
    const flush = () => {
      job.persist();
      void job.flush();
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (job.pending) {
        job.persist();
        e.preventDefault();
      }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", unload);
    };
  }, [job]);
  const zoomTo = (zoom: number, center?: { x: number; y: number }) => {
    const view = viewport.current,
      surface = view?.querySelector("svg");
    const before = surface?.getBoundingClientRect(),
      box = view?.getBoundingClientRect();
    const origin = center || {
      x: box ? box.left + box.width / 2 : 0,
      y: box ? box.top + box.height / 2 : 0,
    };
    const x = before ? (origin.x - before.left) / before.width : 0,
      y = before ? (origin.y - before.top) / before.height : 0;
    setTools((current) => ({
      ...current,
      zoom: Math.min(3, Math.max(0.75, zoom)),
    }));
    requestAnimationFrame(() => {
      const after = surface?.getBoundingClientRect();
      if (view && before && after) {
        view.scrollLeft += after.left + x * after.width - origin.x;
        view.scrollTop += after.top + y * after.height - origin.y;
      }
    });
  };
  const change = (patch: Partial<typeof value>) =>
    job.change({ ...value, ...patch });
  const inkChange = (strokes: InkStroke[]) => {
    setHistory((previous) => [...previous.slice(-49), doc.ink.strokes]);
    setFuture([]);
    change({ document: { ...doc, ink: { ...doc.ink, strokes } } });
  };
  const undo = () => {
    if (!history.length) return;
    setFuture((next) => [doc.ink.strokes, ...next]);
    const prior = history[history.length - 1];
    setHistory(history.slice(0, -1));
    change({ document: { ...doc, ink: { ...doc.ink, strokes: prior } } });
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((previous) => [...previous, doc.ink.strokes]);
    const next = future[0];
    setFuture(future.slice(1));
    change({ document: { ...doc, ink: { ...doc.ink, strokes: next } } });
  };
  const close = async () => {
    if (deleting) return;
    if (recognitionRisk) {
      setError(
        "Device recovery is unavailable. Save, copy or discard your recognition review before closing this notebook."
      );
      return;
    }
    job.persist();
    if (job.pending && !job.durable) {
      setConfirm("close");
      return;
    }
    onClose();
    if (!job.pending && job.record.exists) onSaved();
  };
  async function remove() {
    setDeleting(true);
    setError("");
    await job.flush();
    if (job.pending && job.record.exists) {
      setError(
        "Your changes have not reached the server. Save a copy or retry before deleting."
      );
      setDeleting(false);
      return;
    }
    try {
      if (job.record.exists) {
        const res = await calendarRequest("/api/calendar/personal", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "note",
            id: job.record.id,
            revision: job.record.revision,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Could not delete note.");
        }
      }
      try {
        localStorage.removeItem(
          `sylf_calendar_recognition_draft:${job.record.owner}:${job.record.id}`
        );
      } catch {
        /* Owner-scoped logout cleanup also clears recognition drafts. */
      }
      job.discard();
      invalidateClientCache("/api/calendar/personal");
      window.dispatchEvent(new Event("calendar-content-updated"));
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setDeleting(false);
    }
  }
  const status =
    job.status === "saved"
      ? job.record.exists
        ? "Saved"
        : "New page"
      : job.status === "saving"
        ? "Saving…"
        : job.status === "unsaved"
          ? "Saving soon…"
          : job.status === "conflict"
            ? "Version conflict"
            : job.durable
              ? "Saved on this device"
              : "Not saved";
  return (
    <CalendarDialog
      labelledBy="notebook-title"
      onClose={() => void close()}
      className={`${styles.notebookDialog} ${expanded ? styles.expanded : ""}`}
    >
      <div
        inert={deleting || undefined}
        aria-busy={deleting}
        className={styles.notebook}
        onKeyDown={(e) => {
          if (
            (e.metaKey || e.ctrlKey) &&
            e.key.toLowerCase() === "z" &&
            !(e.target instanceof HTMLInputElement) &&
            !(e.target instanceof HTMLTextAreaElement)
          ) {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
          }
        }}
      >
        <header className={styles.header}>
          <div className={styles.bookTitle}>
            <NotebookPen size={21} />
            <h2 id="notebook-title">Daily notebook</h2>
            <span role="status" className={styles.saveStatus}>
              {job.status === "saved" ? (
                <Check size={13} />
              ) : job.status === "offline" ? (
                <CloudOff size={13} />
              ) : null}
              {status}
            </span>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              aria-label={expanded ? "Exit expanded writing" : "Expand writing"}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button
              type="button"
              aria-label="Close notebook"
              onClick={() => void close()}
            >
              <X size={19} />
            </button>
          </div>
        </header>
        <div className={styles.meta}>
          <input
            data-autofocus
            aria-label="Note title"
            placeholder="Untitled reflection"
            maxLength={180}
            value={value.title}
            onChange={(e) => change({ title: e.target.value })}
          />
          <input
            aria-label="Note date"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={value.dateKey}
            onChange={(e) => {
              if (e.target.value) change({ dateKey: e.target.value });
            }}
          />
        </div>
        <InkToolbar
          value={tools}
          onChange={(next) => {
            if (next.zoom !== tools.zoom) zoomTo(next.zoom);
            else setTools(next);
          }}
          onUndo={undo}
          onRedo={redo}
          canUndo={!!history.length}
          canRedo={!!future.length}
        />
        <NotebookRecognition
          onRecoveryRiskChange={setRecognitionRisk}
          key={job.record.id}
          job={job}
          selected={selectedInk}
          onSelect={() => setTools((v) => ({ ...v, tool: "select" }))}
          onAppend={(text) => {
            if (doc.text.length + text.length + 2 > 50000) {
              setError(
                "This typed note is full. Copy the result into another note."
              );
              return;
            }
            change({
              document: {
                ...doc,
                text: [doc.text, text].filter(Boolean).join("\n\n"),
              },
            });
          }}
        />
        {tools.tool === "select" && (
          <p className={styles.selectionHint}>
            Drag around the handwriting you want to recognize. Pen and mouse
            select; fingers still pan. {selectedInk.length} strokes selected.{" "}
            <button
              type="button"
              onClick={() => {
                setSelectedInk([]);
                setTools((v) => ({ ...v, tool: "pen" }));
              }}
            >
              Return to writing
            </button>
          </p>
        )}
        {(job.error || error) && (
          <div className={styles.saveError} role="alert">
            <span>{error || job.error}</span>
            <div>
              <button type="button" onClick={() => void job.flush()}>
                <RefreshCw size={13} />
                Retry
              </button>
              {job.pending && (
                <button type="button" onClick={() => void job.saveCopy()}>
                  Save a copy
                </button>
              )}
            </div>
          </div>
        )}
        <div className={styles.viewport} data-ink-viewport ref={viewport}>
          <div
            className={styles.page}
            style={
              {
                width: `${tools.zoom * 100}%`,
                "--ink-zoom": tools.zoom,
              } as CSSProperties
            }
          >
            <label className={styles.textLabel}>
              Your thoughts
              <textarea
                aria-label="Typed note"
                placeholder="Start with a thought, then make room for ink…"
                value={doc.text}
                maxLength={50000}
                onChange={(e) =>
                  change({ document: { ...doc, text: e.target.value } })
                }
                onBlur={() => job.persist()}
              />
            </label>
            <div className={styles.paper}>
              {!doc.ink.strokes.length && (
                <p className={styles.paperHint}>
                  A little room to think on paper.
                  <span>Write, sketch, or work through an idea.</span>
                </p>
              )}
              <InkSurface
                strokes={doc.ink.strokes}
                tool={tools.tool}
                color={tools.color}
                thickness={tools.thickness}
                finger={tools.finger}
                onChange={inkChange}
                onSelection={setSelectedInk}
                selected={selectedInk}
                onZoom={(factor, center) => zoomTo(tools.zoom * factor, center)}
                onLimit={setError}
              />
            </div>
          </div>
        </div>
        <footer className={styles.footer}>
          <span>
            {tools.finger
              ? "Finger drawing is on. Two fingers pan and zoom."
              : "Pen & mouse write · fingers pan and zoom"}
          </span>
          <div>
            <button
              type="button"
              aria-label="Delete note"
              onClick={() => setConfirm("delete")}
              disabled={deleting}
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              className={styles.done}
              onClick={() => void close()}
            >
              Done
            </button>
          </div>
        </footer>
        {confirm && (
          <div className={styles.confirm} role="alert">
            <p>
              {confirm === "delete"
                ? "Delete this note and its handwriting? This cannot be undone."
                : "Device recovery is unavailable. Wait for saving or discard this unsaved draft."}
            </p>
            <div>
              <button type="button" onClick={() => setConfirm(null)}>
                Keep writing
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  if (confirm === "delete") void remove();
                  else {
                    job.discard();
                    onClose();
                  }
                }}
              >
                {deleting
                  ? "Deleting…"
                  : confirm === "delete"
                    ? "Delete"
                    : "Discard draft"}
              </button>
            </div>
          </div>
        )}
      </div>
    </CalendarDialog>
  );
}
