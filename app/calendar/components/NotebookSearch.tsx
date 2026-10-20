"use client";
import { useEffect, useState } from "react";
import { NotebookPen, Search, X } from "lucide-react";
import type { NoteSearchResult } from "@/lib/calendar/recognition-contracts";
import CalendarDialog from "./CalendarDialog";
import { calendarRequest } from "./useCalendarWorkspace";
import styles from "../Workspace.module.css";
import schedule from "../Scheduling.module.css";
export default function NotebookSearch({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (result: NoteSearchResult) => void;
}) {
  const [query, setQuery] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [recognizedOnly, setRecognizedOnly] = useState(false),
    [results, setResults] = useState<NoteSearchResult[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [page, setPage] = useState<{ cursor?: string; key: string }>({ key: "" });
  const searchKey = JSON.stringify({ query, start, end, recognizedOnly }),
    activePage = page.key === searchKey ? page.cursor : undefined;
  useEffect(() => {
    const c = new AbortController(),
      timer = setTimeout(() => {
        setLoading(true);
        setError("");
        const p = new URLSearchParams({
          query,
          recognizedOnly: String(recognizedOnly),
          ...(start ? { start } : {}),
          ...(end ? { end } : {}),
          ...(activePage ? { cursor: activePage } : {}),
        });
        void calendarRequest("/api/calendar/notebooks?" + p, {
          signal: c.signal,
        })
          .then(async (r) => {
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            if (!c.signal.aborted) {
              setResults((v) =>
                activePage ? [...v, ...data.notes] : data.notes
              );
              setCursor(data.nextCursor);
            }
          })
          .catch((e) => {
            if (!c.signal.aborted)
              setError(e.message || "Notebooks could not be searched.");
          })
          .finally(() => {
            if (!c.signal.aborted) setLoading(false);
          });
      }, 250);
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [query, start, end, recognizedOnly, activePage]);
  return (
    <CalendarDialog labelledBy="notebook-search-title" onClose={onClose}>
      <div className={styles.editor}>
        <header className={styles.dialogHeader}>
          <div className={styles.headingWithIcon}>
            <Search size={20} />
            <h2 id="notebook-search-title">Find in notebooks</h2>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            aria-label="Close notebook search"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <label className={styles.field}>
          Keywords
          <input
            data-autofocus
            aria-label="Search notebooks"
            placeholder="Electromagnetism, revision, an idea…"
            value={query}
            maxLength={160}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            From
            <input
              aria-label="Search from date"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            Through
            <input
              aria-label="Search through date"
              type="date"
              min={start || "2000-01-01"}
              max="2100-12-31"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <label className={schedule.check}>
          <input
            type="checkbox"
            checked={recognizedOnly}
            onChange={(e) => setRecognizedOnly(e.target.checked)}
          />{" "}
          Recognized handwriting only
        </label>
        <p className={schedule.hint}>
          Searches your private titles, typed text and saved, reviewed
          handwriting text. Ink that has not been recognized is not searched.
        </p>
        <div className={schedule.noteResults} aria-busy={loading}>
          {error && <p role="alert">{error}</p>}
          {loading && <p role="status">Searching your notebooks…</p>}
          {!loading && !error && !results.length && (
            <p>
              No matching notebooks. Try a shorter keyword or a wider date
              range.
            </p>
          )}
          {!loading &&
            !error &&
            results.map((result) => (
              <button
                type="button"
                key={result.id}
                className={schedule.noteResult}
                onClick={() => onOpen(result)}
              >
                <NotebookPen size={18} />
                <span>
                  <strong>{result.title || "Untitled notebook"}</strong>
                  <small>
                    {result.dateKey}
                    {result.recognized ? " · Recognized handwriting" : ""}
                  </small>
                  <span>{result.excerpt || "Open this notebook"}</span>
                </span>
              </button>
            ))}
        </div>
        {cursor && !loading && !error && (
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => setPage({ key: searchKey, cursor })}
          >
            More results
          </button>
        )}
        <footer className={styles.editorFooter}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </div>
    </CalendarDialog>
  );
}
