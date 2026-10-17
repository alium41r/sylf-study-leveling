"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { lockPageScroll } from "@/lib/scroll-lock";
import styles from "./AppearanceHub.module.css";

export function AppearanceDialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    const unlock = lockPageScroll();
    return () => {
      dialog?.close();
      unlock();
      // React removes the native dialog before passive cleanup, so explicitly
      // restore the trigger when the browser can no longer do so on close().
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className={styles.dialogHeading}>
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={`Close ${title}`}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
