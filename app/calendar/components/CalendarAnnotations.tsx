"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Check, RefreshCw } from "lucide-react";
import {
  editableDocument,
  emptyInk,
  isAnnotation,
  projectStroke,
  type AnchorBox,
  type InkStroke,
} from "@/lib/calendar/ink";
import {
  noteAutosave,
  recoveries,
  type NoteAutosave,
} from "@/lib/calendar/note-autosave";
import type { CalendarNote } from "@/lib/calendar/contracts";
import InkSurface, { InkPaths } from "./InkSurface";
import InkToolbar, { defaultInkTools } from "./InkToolbar";
import styles from "../Notebook.module.css";
interface Geometry {
  width: number;
  height: number;
  anchors: Map<string, AnchorBox>;
}
export default function CalendarAnnotations({
  root,
  notes,
  owner,
  active,
  visible,
  onExit,
}: {
  root: RefObject<HTMLElement | null>;
  notes: CalendarNote[];
  owner: number;
  active: boolean;
  visible: boolean;
  onExit: () => void;
}) {
  const [geometry, setGeometry] = useState<Geometry>({
      width: 1,
      height: 1,
      anchors: new Map(),
    }),
    [tools, setTools] = useState(defaultInkTools),
    [history, setHistory] = useState<
      { job: NoteAutosave; before: InkStroke[]; after: InkStroke[] }[]
    >([]),
    [future, setFuture] = useState<typeof history>([]),
    [, render] = useState(0),
    [error, setError] = useState("");
  const [jobs] = useState(
    () =>
      new Map<string, NoteAutosave>(
        recoveries(owner)
          .filter((r) => isAnnotation(r.data.document))
          .map((r) => [r.key, noteAutosave(owner, r.data, undefined, r)])
      )
  );
  const subscriptions = useRef<(() => void)[]>([]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const outer = node.getBoundingClientRect(),
          anchors = new Map<string, AnchorBox>();
        node
          .querySelectorAll<HTMLElement>("[data-ink-anchor]")
          .forEach((element) => {
            const key = element.dataset.inkAnchor!,
              r = element.getBoundingClientRect();
            const viewport = element.closest<HTMLElement>(
              "[data-calendar-scroll]"
            );
            if (viewport) {
              const clip = viewport.getBoundingClientRect();
              const top =
                viewport
                  .querySelector("[data-calendar-time-header]")
                  ?.getBoundingClientRect().bottom || clip.top;
              if (
                r.top < top ||
                r.bottom > clip.bottom ||
                r.left < clip.left ||
                r.right > clip.right
              )
                return;
            }
            if (r.width && r.height && !anchors.has(key))
              anchors.set(key, {
                x: r.left - outer.left,
                y: r.top - outer.top,
                width: r.width,
                height: r.height,
              });
          });
        setGeometry({ width: outer.width, height: outer.height, anchors });
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    window.addEventListener("resize", measure);
    node.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      node.removeEventListener("scroll", measure, true);
    };
  }, [root, notes, active]);
  useEffect(() => {
    for (const job of jobs.values()) {
      job.connect();
      if (job.pending) void job.flush();
      subscriptions.current.push(job.subscribe(() => render((v) => v + 1)));
    }
    const flush = () => {
      for (const job of jobs.values()) {
        job.persist();
        void job.flush();
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      for (const job of jobs.values())
        if (job.pending && !job.persist()) event.preventDefault();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", unload);
      for (const unsubscribe of subscriptions.current) unsubscribe();
      subscriptions.current = [];
      for (const job of jobs.values()) job.release();
    };
  }, [jobs]);
  const jobFor = (date: string, noteId?: string) => {
    let job = [...jobs.values()].find((job) =>
      noteId ? job.record.id === noteId : job.record.data.dateKey === date
    );
    if (job) return job;
    const note = notes.find(
      (n) =>
        (noteId ? n.id === noteId : n.dateKey === date) &&
        isAnnotation(n.document)
    );
    const recovery = recoveries(owner).find(
      (r) => r.data.dateKey === date && isAnnotation(r.data.document)
    );
    const input = note
      ? { title: note.title, dateKey: note.dateKey, document: note.document }
      : {
          title: "Calendar annotations",
          dateKey: date,
          document: {
            version: 2 as const,
            text: "",
            mode: "annotation" as const,
            ink: emptyInk(),
          },
        };
    job = noteAutosave(owner, input, note, recovery, `annotation:${date}`);
    job.connect();
    jobs.set(job.record.id, job);
    subscriptions.current.push(job.subscribe(() => render((v) => v + 1)));
    return job;
  };
  const current = [
    ...notes
      .filter((n) => ![...jobs.values()].some((j) => j.record.id === n.id))
      .map((n) => ({ id: n.id, dateKey: n.dateKey, document: n.document })),
    ...[...jobs.values()].map((job) => ({
      id: job.record.id,
      dateKey: job.record.data.dateKey,
      document: job.record.data.document,
    })),
  ];
  const original = current.flatMap(
    (n) => editableDocument(n.document).ink.strokes
  );
  const projected = original
    .map((s) => projectStroke(s, geometry.anchors))
    .filter((s): s is InkStroke => !!s);
  const anchorAt = (x: number, y: number) => {
    const entries = [...geometry.anchors];
    const specific = entries.filter(
      ([key, box]) =>
        !key.endsWith("/day") &&
        x >= box.x - 8 &&
        x <= box.x + box.width + 8 &&
        y >= box.y - 8 &&
        y <= box.y + box.height + 8
    );
    const days = entries.filter(
      ([key, box]) =>
        key.endsWith("/day") &&
        x >= box.x &&
        x <= box.x + box.width &&
        y >= box.y &&
        y <= box.y + box.height
    );
    return specific[0] || days[0];
  };
  const update = (job: NoteAutosave, strokes: InkStroke[]) => {
    const data = job.record.data,
      doc = editableDocument(data.document);
    job.change({ ...data, document: { ...doc, ink: { ...doc.ink, strokes } } });
  };
  const commit = (stroke: InkStroke) => {
    const first = stroke.points[0],
      last = stroke.points[stroke.points.length - 1],
      anchor = anchorAt(first[0], first[1]);
    if (!anchor) {
      setError("Start your mark on a date or calendar item.");
      return;
    }
    const [key, box] = anchor,
      job = jobFor(key.slice(0, 10)),
      doc = editableDocument(job.record.data.document);
    const end = anchorAt(last[0], last[1]);
    const saved: InkStroke = {
      ...stroke,
      anchor: { key, width: box.width, height: box.height },
      points: stroke.points.map(([x, y, p]) => [x - box.x, y - box.y, p]),
    };
    if (end && end[0] !== key) {
      const [endKey, endBox] = end;
      saved.endAnchor = {
        key: endKey,
        width: endBox.width,
        height: endBox.height,
        point: [last[0] - endBox.x, last[1] - endBox.y, last[2]],
      };
    }
    const after = [...doc.ink.strokes, saved];
    setHistory((previous) => [
      ...previous.slice(-49),
      { job, before: doc.ink.strokes, after },
    ]);
    setFuture([]);
    update(job, after);
  };
  const erase = (remaining: InkStroke[]) => {
    const ids = new Set(remaining.map((s) => s.id));
    const removed = original.filter(
      (s) => !ids.has(s.id) && projectStroke(s, geometry.anchors)
    );
    for (const record of current) {
      const strokes = editableDocument(record.document).ink.strokes;
      if (!strokes.some((s) => removed.some((r) => r.id === s.id))) continue;
      const job = jobFor(record.dateKey, record.id),
        before = editableDocument(job.record.data.document).ink.strokes,
        after = before.filter((s) => !removed.some((r) => r.id === s.id));
      setHistory((previous) => [
        ...previous.slice(-49),
        { job, before, after },
      ]);
      setFuture([]);
      update(job, after);
    }
  };
  const pending = [...jobs.values()].filter((job) => job.pending),
    issue = pending.find((job) => job.error);
  if (!visible && !active) return null;
  return (
    <>
      {active && (
        <div className={styles.annotationBar}>
          <div className={styles.annotationHeading}>
            <span>Write on your calendar</span>
            <small>
              {pending.length
                ? "Saving your marks…"
                : "Marks follow their dates"}
            </small>
            <button
              type="button"
              onClick={() => {
                for (const job of jobs.values()) {
                  job.persist();
                  void job.flush();
                }
                onExit();
              }}
            >
              <Check size={15} />
              Done
            </button>
          </div>
          <InkToolbar
            value={tools}
            onChange={setTools}
            zoom={false}
            canUndo={!!history.length}
            canRedo={!!future.length}
            onUndo={() => {
              const value = history[history.length - 1];
              if (!value) return;
              update(value.job, value.before);
              setHistory(history.slice(0, -1));
              setFuture([value, ...future]);
            }}
            onRedo={() => {
              const value = future[0];
              if (!value) return;
              update(value.job, value.after);
              setFuture(future.slice(1));
              setHistory([...history, value]);
            }}
          />
          {(issue || error) && (
            <div className={styles.saveError} role="alert">
              <span>{issue?.error || error}</span>
              {issue && (
                <div>
                  <button type="button" onClick={() => void issue.flush()}>
                    <RefreshCw size={12} />
                    Retry
                  </button>
                  <button type="button" onClick={() => void issue.saveCopy()}>
                    Save a copy
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {active ? (
        <InkSurface
          className={styles.annotationCanvas}
          width={geometry.width}
          height={geometry.height}
          strokes={projected}
          tool={tools.tool}
          color={tools.color}
          thickness={tools.thickness}
          finger={tools.finger}
          onChange={erase}
          onStroke={commit}
          onLimit={setError}
        />
      ) : (
        <svg
          aria-label="Calendar handwriting"
          role="img"
          className={styles.annotationRead}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          preserveAspectRatio="none"
        >
          <InkPaths strokes={projected} />
        </svg>
      )}
    </>
  );
}
