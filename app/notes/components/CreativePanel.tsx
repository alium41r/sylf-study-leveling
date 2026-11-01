"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import s from "../Creative.module.css";
export default function CreativePanel({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.panel}
      data-wide={wide}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
