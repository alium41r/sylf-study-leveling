"use client";
import { useRef, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";
import type { CalendarEvent, EventInput } from "@/lib/calendar/contracts";
import { addDays } from "@/lib/calendar/dates";
import { moveEvent } from "@/lib/calendar/scheduling";
import styles from "../Scheduling.module.css";

export default function MonthEventHandle({
  event,
  date,
  busy,
  onMove,
  onError,
}: {
  event: CalendarEvent;
  date: string;
  busy: boolean;
  onMove: (event: CalendarEvent, data: EventInput) => void;
  onError: (message: string) => void;
}) {
  const active = useRef<{
    id: number;
    target: string;
    element: HTMLElement | null;
  } | null>(null);
  const clear = () => {
    active.current?.element?.removeAttribute("data-drop-target");
    active.current = null;
  };
  const apply = (target: string) => {
    if (target === date) return;
    const delta = Math.round(
      (Date.parse(target) - Date.parse(date)) / 86400000
    );
    try {
      onMove(
        event,
        moveEvent(event, addDays(event.startDate, delta), null, event.timezone)
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Choose another date.");
    }
  };
  const finish = (e: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const drag = active.current;
    if (!drag || e.pointerId !== drag.id) return;
    const target = drag.target;
    clear();
    if (!cancel) apply(target);
  };
  return (
    <button
      className={styles.monthHandle}
      aria-label={`Move ${event.title} to another date`}
      title="Drag to another date; arrow keys move by one day/week"
      disabled={busy}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = { id: e.pointerId, target: date, element: null };
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== active.current?.id) return;
        const cell = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>("[data-month-date]");
        if (cell?.dataset.monthDate) {
          active.current.element?.removeAttribute("data-drop-target");
          active.current.target = cell.dataset.monthDate;
          active.current.element = cell;
          cell.setAttribute("data-drop-target", "true");
        }
      }}
      onPointerUp={(e) => finish(e)}
      onPointerCancel={(e) => finish(e, true)}
      onLostPointerCapture={(e) => finish(e, true)}
      onKeyDown={(e) => {
        if (e.key === "Escape") clear();
        const delta = (
          { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<
            string,
            number
          >
        )[e.key];
        if (delta) {
          e.preventDefault();
          apply(addDays(date, delta));
        }
      }}
    >
      <GripVertical size={12} />
    </button>
  );
}
