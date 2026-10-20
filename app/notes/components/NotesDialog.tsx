"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import s from "../Notes.module.css";
export default function NotesDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null,
      dialog = ref.current;
    dialog?.showModal();
    // React's autoFocus runs before showModal; select the first field after the
    // native dialog opens instead of leaving initial focus on its close button.
    const firstField = dialog?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not(:disabled),textarea:not(:disabled),select:not(:disabled)"
    );
    firstField?.focus();
    return () => {
      dialog?.close();
      before?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <div className={s.dialogHeader}>
        <h2 id={id}>{title}</h2>
        <button
          className={s.iconButton}
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
