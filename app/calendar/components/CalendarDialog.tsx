"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "../Workspace.module.css";

/** Native modal supplies focus containment, Escape, background inertness, and
 * restoration to the invoking control, including on mobile. */
export default function CalendarDialog({
  children,
  onClose,
  labelledBy,
  wide = false,
  className = "",
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  wide?: boolean;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    node.showModal();
    node.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={labelledBy}
      className={`${styles.dialog} ${wide ? styles.wideDialog : ""} ${className}`}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const node = event.currentTarget;
        const controls = [
          ...node.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
          ),
        ].filter(
          (control) => control.getClientRects().length && control.tabIndex >= 0
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
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
      {children}
    </dialog>
  );
}
