"use client";
import { useEffect, useState } from "react";
import { calendarRequest } from "./useCalendarWorkspace";
import CalendarDialog from "./CalendarDialog";
import styles from "../Workspace.module.css";
import type { CalendarEvent, CalendarNote } from "@/lib/calendar/contracts";
import type { NoteRecovery } from "@/lib/calendar/note-autosave";
import NotebookEditor from "./NotebookEditor";
import EventEditor from "./EventEditor";

export type EditorSelection =
  | {
      kind: "event";
      date: string;
      item?: CalendarEvent;
      initial?: import("@/lib/calendar/contracts").EventInput;
      hints?: string[];
      operation?: import("@/lib/calendar/event-operations").EventOperation;
    }
  | {
      kind: "note";
      date: string;
      item?: CalendarNote;
      recovery?: NoteRecovery;
    };
export default function CalendarEditor(props: {
  selection: EditorSelection;
  timezone: string;
  detailed?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  return props.selection.kind === "note" ? (
    <NotebookLoader
      key={
        props.selection.item?.id ||
        props.selection.recovery?.id ||
        props.selection.date
      }
      selection={props.selection}
      onClose={props.onClose}
      onSaved={props.onSaved}
    />
  ) : (
    <EventEditor {...props} selection={props.selection} />
  );
}

function NotebookLoader({
  selection,
  onClose,
  onSaved,
}: {
  selection: Extract<EditorSelection, { kind: "note" }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [item, setItem] = useState<CalendarNote | undefined>(() =>
      selection.item?.preview ? undefined : selection.item
    ),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!selection.item?.preview) return;
    const controller = new AbortController();
    void calendarRequest(`/api/calendar/personal?id=${selection.item.id}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Notebook could not load.");
        if (!controller.signal.aborted) setItem(data.note);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.message || "Notebook could not load.");
      });
    return () => controller.abort();
  }, [selection.item, retry]);
  if (selection.item?.preview && !item)
    return (
      <CalendarDialog labelledBy="notebook-loading" onClose={onClose}>
        <div className={styles.editor}>
          <h2 id="notebook-loading">Daily notebook</h2>
          <p role={error ? "alert" : "status"}>
            {error || "Opening your page…"}
          </p>
          {error && (
            <button
              className={styles.secondaryButton}
              onClick={() => {
                setError("");
                setRetry((v) => v + 1);
              }}
            >
              Retry
            </button>
          )}
          <button className={styles.textButton} onClick={onClose}>
            Close
          </button>
        </div>
      </CalendarDialog>
    );
  return (
    <NotebookEditor
      selection={{ ...selection, item }}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
