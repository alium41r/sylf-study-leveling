"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, ScanText, SquareDashedMousePointer, X } from "lucide-react";
import { editableDocument } from "@/lib/calendar/ink";
import { inkHash } from "@/lib/calendar/recognition-geometry";
import {
  recognizeInk,
  type RecognitionRun,
} from "@/lib/calendar/recognition-client";
import {
  RECOGNITION_ENGINE,
  recognitionWriteSchema,
  type RecognitionResult,
} from "@/lib/calendar/recognition-contracts";
import type { NoteAutosave } from "@/lib/calendar/note-autosave";
import { getClientSessionEpoch } from "@/lib/client-data-cache";
import { calendarRequest } from "./useCalendarWorkspace";
import styles from "../Notebook.module.css";
type Review = RecognitionResult & { saved: boolean };
export default function NotebookRecognition({
  job,
  selected,
  onSelect,
  onAppend,
  onRecoveryRiskChange,
}: {
  job: NoteAutosave;
  selected: string[];
  onSelect: () => void;
  onAppend: (text: string) => void;
  onRecoveryRiskChange: (unsafe: boolean) => void;
}) {
  const owner = job.record.owner,
    noteId = job.record.id,
    key = `sylf_calendar_recognition_draft:${owner}:${noteId}`;
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [recognizing, setRecognizing] = useState(false),
    [status, setStatus] = useState(""),
    [records, setRecords] = useState<RecognitionResult[]>([]),
    [review, setReview] = useState<Review | null>(() => {
      if (typeof window === "undefined") return null;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const v = JSON.parse(raw);
        const parsed = recognitionWriteSchema.safeParse({
          id: v.id,
          revision: v.revision,
          noteId: v.noteId,
          strokeIds: v.strokeIds,
          sourceHash: v.sourceHash,
          text: v.text,
          engine: v.engine,
          noteRevision: job.record.revision,
        });
        if (!parsed.success || parsed.data.noteId !== noteId) return null;
        return {
          id: v.id,
          revision: v.revision,
          noteId: v.noteId,
          strokeIds: v.strokeIds,
          sourceHash: v.sourceHash,
          text: v.text,
          engine: v.engine,
          saved: false,
        };
      } catch {
        return null;
      }
    }),
    [durable, setDurable] = useState(true);
  const run = useRef<RecognitionRun | null>(null),
    live = useRef(true),
    loaded = useRef(false);
  const doc = editableDocument(job.record.data.document),
    existing = records.filter((r) =>
      r.strokeIds.every((id) => doc.ink.strokes.some((s) => s.id === id))
    );
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      run.current?.cancel();
    };
  }, []);
  useEffect(() => {
    if (!open || loaded.current) return;
    const controller = new AbortController();
    if (job.record.exists)
      void calendarRequest(`/api/calendar/notebooks?noteId=${noteId}`, {
        signal: controller.signal,
      })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          if (!controller.signal.aborted) {
            loaded.current = true;
            setRecords(data.recognitions);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setStatus(
              "Saved recognized text could not load. Your ink is unchanged."
            );
        });
    return () => controller.abort();
  }, [open, key, noteId, job]);
  const updateReview = (value: Review | null) => {
    try {
      if (!value || value.saved) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      setDurable(true);
      onRecoveryRiskChange(false);
    } catch {
      setDurable(false);
      onRecoveryRiskChange(!!value && !value.saved);
    }
    setReview(value);
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (review && !review.saved && !durable) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [review, durable]);
  useEffect(() => {
    if (!selected.length) return;
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [selected]);
  const recognize = async () => {
    if (
      review &&
      !review.saved &&
      !window.confirm(
        "Replace your unsaved recognition review? Save or copy it first if you want to keep it."
      )
    )
      return;
    setBusy(true);
    setStatus("Saving your original ink…");
    const epoch = getClientSessionEpoch();
    try {
      await job.flush();
      if (job.pending || !job.record.exists)
        throw new Error(
          "Save the notebook before recognizing its handwriting. Your ink and draft are kept."
        );
      const read = await calendarRequest(
        `/api/calendar/notebooks?noteId=${noteId}`,
        { cache: "no-store" }
      );
      const latest = await read.json();
      if (!read.ok)
        throw new Error(
          latest.error || "Saved recognition could not load. Try again."
        );
      const currentRecords = latest.recognitions as RecognitionResult[];
      setRecords(currentRecords);
      const current = editableDocument(job.record.data.document),
        ids = selected.length
          ? selected
          : current.ink.strokes
              .filter((s) => s.tool === "pen")
              .map((s) => s.id);
      if (!ids.length || ids.length > 1000)
        throw new Error("Select a smaller area of pen handwriting.");
      const strokes = current.ink.strokes.filter((s) => ids.includes(s.id)),
        sourceHash = await inkHash(current.ink.strokes, ids);
      run.current = recognizeInk(strokes, (message) => {
        if (live.current) setStatus(message);
      });
      setRecognizing(true);
      setStatus("Preparing local recognition…");
      const text = await run.current.result;
      if (!live.current || epoch !== getClientSessionEpoch()) return;
      const prior = currentRecords.find(
        (r) =>
          r.strokeIds.length === ids.length &&
          r.strokeIds.every((id) => ids.includes(id))
      );
      updateReview({
        id: prior?.id || crypto.randomUUID(),
        revision: prior?.revision || 0,
        noteId,
        strokeIds: ids,
        sourceHash,
        text,
        engine: RECOGNITION_ENGINE,
        saved: false,
      });
      setStatus("Review and correct this text before saving it for search.");
    } catch (e) {
      if (live.current)
        setStatus(
          e instanceof Error ? e.message : "Recognition could not complete."
        );
    } finally {
      run.current = null;
      if (live.current) {
        setBusy(false);
        setRecognizing(false);
      }
    }
  };
  const save = async () => {
    if (!review) return;
    setBusy(true);
    setStatus("Saving reviewed text…");
    const epoch = getClientSessionEpoch();
    try {
      await job.flush();
      if (job.pending) throw new Error("Save your current notebook first.");
      const response = await calendarRequest("/api/calendar/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...review,
          saved: undefined,
          noteRevision: job.record.revision,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Recognized text could not save.");
      if (!live.current || epoch !== getClientSessionEpoch()) return;
      updateReview({ ...data.recognition, saved: true });
      setRecords((items) => [
        data.recognition,
        ...items.filter((r) => r.id !== data.recognition.id),
      ]);
      setStatus(
        "Reviewed text saved and searchable. Your original handwriting is unchanged."
      );
    } catch (e) {
      if (live.current)
        setStatus(
          e instanceof Error
            ? e.message
            : "Could not save. Your review is kept."
        );
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const remove = async (record: RecognitionResult) => {
    setBusy(true);
    try {
      const response = await calendarRequest("/api/calendar/notebooks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, revision: record.revision }),
      });
      if (!response.ok)
        throw new Error(
          "Could not remove this result. Reload before retrying."
        );
      setRecords((items) => items.filter((r) => r.id !== record.id));
      if (review?.id === record.id) {
        updateReview(null);
        try {
          localStorage.removeItem(key);
        } catch {
          /* Removal succeeded on server. */
        }
      }
      setStatus("Recognized text removed. Original handwriting is kept.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not remove result.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.recognition}>
      <button
        type="button"
        className={styles.recognitionDisclosure}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ScanText size={16} /> Handwriting to text
      </button>
      {open && (
        <div className={styles.recognitionBody}>
          <p>
            Optional local recognition for English handwriting. First use
            downloads about 80 MB of model data; your ink is not uploaded.
            Select up to six horizontal text lines. Equations, diagrams and
            other languages are not supported.
          </p>
          <div className={styles.recognitionActions}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onSelect();
                setOpen(false);
              }}
            >
              <SquareDashedMousePointer size={15} /> Select ink
            </button>
            <button
              type="button"
              disabled={busy || !doc.ink.strokes.length}
              onClick={() => void recognize()}
            >
              {selected.length
                ? `Recognize selection (${selected.length})`
                : "Recognize handwriting"}
            </button>
            {recognizing && (
              <button type="button" onClick={() => run.current?.cancel()}>
                Cancel recognition
              </button>
            )}
          </div>
          {status && <p role="status">{status}</p>}
          {review && (
            <div className={styles.recognitionReview}>
              <label>
                Recognized text
                <textarea
                  aria-label="Recognized text"
                  maxLength={4000}
                  rows={4}
                  value={review.text}
                  disabled={busy}
                  onChange={(e) =>
                    updateReview({
                      ...review,
                      text: e.target.value,
                      saved: false,
                    })
                  }
                />
              </label>
              <div className={styles.recognitionActions}>
                <button
                  type="button"
                  disabled={busy || !review.text.trim() || review.saved}
                  onClick={() => void save()}
                >
                  Save reviewed text
                </button>
                <button
                  type="button"
                  disabled={!review.text.trim()}
                  onClick={() => {
                    if (!navigator.clipboard) {
                      setStatus(
                        "Select the recognized text and copy it manually."
                      );
                      return;
                    }
                    void navigator.clipboard
                      ?.writeText(review.text)
                      .then(() => setStatus("Recognized text copied."))
                      .catch(() =>
                        setStatus(
                          "Select the recognized text and copy it manually."
                        )
                      );
                  }}
                >
                  <Copy size={14} /> Copy
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAppend(review.text)}
                >
                  Add to typed note
                </button>
                {!review.saved && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Discard this recognition review? Your original handwriting is kept."
                        )
                      )
                        updateReview(null);
                    }}
                  >
                    Discard review
                  </button>
                )}
              </div>
              <small>
                {review.saved
                  ? "Searchable reviewed result."
                  : durable
                    ? "Review draft kept on this device; save it to make it searchable."
                    : "Recovery storage is unavailable. Keep this editor open or copy your correction."}
              </small>
            </div>
          )}
          {!!existing.length && (
            <details>
              <summary>Saved recognition ({existing.length})</summary>
              {existing.map((r) => (
                <div className={styles.recognitionSaved} key={r.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        review &&
                        !review.saved &&
                        !window.confirm(
                          "Replace your unsaved recognition review?"
                        )
                      )
                        return;
                      updateReview({ ...r, saved: true });
                    }}
                  >
                    {r.text.slice(0, 100)}
                  </button>
                  <button
                    type="button"
                    aria-label="Remove recognized text result"
                    disabled={busy}
                    onClick={() => void remove(r)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
