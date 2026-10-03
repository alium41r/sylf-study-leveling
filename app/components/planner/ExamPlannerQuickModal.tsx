"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import s from "./ExamPlanner.module.css";
export default function ExamPlannerQuickModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="exam-quick-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="rounded-2xl border border-border-subtle bg-bg-panel text-text-primary backdrop:bg-black/70 w-[min(92vw,34rem)] p-0"
    >
      <div className={s.root}>
        <div className={s.eyebrow}>Sylf Planner</div>
        <h2 id="exam-quick-title">Prepare for an Exam</h2>
        <p>
          Confirm your scope and availability, generate a draft, then review it
          in the System planner before creating Quests.
        </p>
        <div className={s.actions}>
          <Link
            className={s.primary}
            href="/system?tab=planner"
            onClick={onClose}
          >
            Open Exam Planner
          </Link>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </dialog>
  );
}
