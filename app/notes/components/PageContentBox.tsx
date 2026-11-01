"use client";
import { useEffect, useRef, type ReactNode, type PointerEvent } from "react";
import { Grip, MoveDiagonal2, Trash2 } from "lucide-react";
import type { TextBox } from "@/lib/notes/text-boxes";
import { snapBox } from "@/lib/notes/content-layout";
import s from "../Ink.module.css";
export default function PageContentBox({
  box,
  selected,
  enabled,
  zoom,
  pageWidth,
  onSelect,
  onChange,
  children,
  peers,
  guides,
}: {
  box: TextBox;
  selected: boolean;
  enabled: boolean;
  zoom: () => number;
  pageWidth: number;
  onSelect: () => void;
  onChange: (box: TextBox) => void;
  children: ReactNode;
  peers: TextBox[];
  guides: (value: { axis: "x" | "y"; value: number }[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    drag = useRef<{
      pointer: number;
      x: number;
      y: number;
      resize: boolean;
      next: TextBox;
    }>(undefined);
  const apply = (value: TextBox) => {
    const node = ref.current;
    if (node) {
      node.style.left = `${value.x}px`;
      node.style.top = `${value.y}px`;
      node.style.width = `${value.width}px`;
      node.style.minHeight = `${value.height}px`;
      if (value.kind === "image") node.style.height = `${value.height}px`;
    }
  };
  useEffect(() => {
    apply(box);
  }, [box]);
  const start = (e: PointerEvent<HTMLButtonElement>, resize: boolean) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      resize,
      next: box,
    };
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = (e.clientX - d.x) / zoom(),
      dy = (e.clientY - d.y) / zoom();
    d.next = d.resize
      ? {
          ...box,
          width: Math.max(
            120,
            Math.min(pageWidth - box.x - 20, box.width + dx)
          ),
          height: Math.max(60, box.height + dy),
        }
      : {
          ...box,
          x: Math.max(20, Math.min(pageWidth - box.width - 20, box.x + dx)),
          y: Math.max(20, box.y + dy),
        };
    if (d.resize && box.kind === "image")
      d.next.height = Math.max(60, (box.height * d.next.width) / box.width);
    if (!d.resize && !e.altKey) {
      const snapped = snapBox(d.next, peers, pageWidth, 6 / zoom());
      d.next = snapped.box;
      guides(snapped.guides);
    } else guides([]);
    apply(d.next);
  };
  const end = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    e.stopPropagation();
    drag.current = undefined;
    guides([]);
    apply(box);
    onChange(d.next);
  };
  return (
    <div
      ref={ref}
      className={s.contentBox}
      data-kind={box.kind}
      data-notes-content={box.id}
      data-selected={selected && enabled}
      data-notes-text
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        minHeight: box.height,
        ...(box.kind === "image" ? { height: box.height } : {}),
      }}
      onPointerDownCapture={onSelect}
      onFocusCapture={onSelect}
    >
      {enabled && selected && (
        <div className={s.boxHandles} data-notes-box-control>
          <button
            aria-label={`Move ${box.kind} box`}
            title="Drag to move · arrow keys to nudge"
            onPointerDown={(e) => start(e, false)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
            onKeyDown={(e) => {
              if (
                !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                  e.key
                )
              )
                return;
              e.preventDefault();
              e.stopPropagation();
              const n = e.shiftKey ? 10 : 1;
              onChange({
                ...box,
                x: Math.max(
                  20,
                  Math.min(
                    pageWidth - box.width - 20,
                    box.x +
                      (e.key === "ArrowLeft"
                        ? -n
                        : e.key === "ArrowRight"
                          ? n
                          : 0)
                  )
                ),
                y: Math.max(
                  20,
                  box.y +
                    (e.key === "ArrowUp" ? -n : e.key === "ArrowDown" ? n : 0)
                ),
              });
            }}
          >
            <Grip size={15} />
            <span>
              {box.kind === "image"
                ? "Image"
                : box.id === "body"
                  ? "Page text"
                  : "Text box"}
            </span>
          </button>
          {box.id !== "body" && (
            <button
              aria-label={`Remove ${box.kind} box`}
              onClick={() => onChange({ ...box, removed: true })}
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            className={s.boxResize}
            aria-label={`Resize ${box.kind} box`}
            title="Drag to resize"
            onPointerDown={(e) => start(e, true)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
          >
            <MoveDiagonal2 size={16} />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
