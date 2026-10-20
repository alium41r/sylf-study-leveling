"use client";
import {
  memo,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from "react";
import {
  inkColor,
  strokePath,
  hitStroke,
  simplifyInkPoints,
  type InkStroke,
  type InkPoint,
  type InkTool,
} from "@/lib/calendar/ink";
import { inkBounds, selectedInk } from "@/lib/calendar/recognition-geometry";
import styles from "../Notebook.module.css";

const InkStrokePath = memo(function InkStrokePath({
  stroke,
}: {
  stroke: InkStroke;
}) {
  return (
    <path
      d={strokePath(stroke)}
      fill={inkColor(stroke.color)}
      opacity={stroke.tool === "highlighter" ? 0.28 : 1}
    />
  );
});
export const InkPaths = memo(function InkPaths({
  strokes,
}: {
  strokes: InkStroke[];
}) {
  return (
    <>
      {strokes.map((stroke) => (
        <InkStrokePath key={stroke.id} stroke={stroke} />
      ))}
    </>
  );
});
export function InkPreview({ strokes }: { strokes: InkStroke[] }) {
  const bounds = useMemo(() => {
    const b = inkBounds(strokes);
    return b ? `${b.x - 20} ${b.y - 20} ${Math.max(80,b.width) + 40} ${Math.max(80,b.height) + 40}` : "0 0 1000 1400";
  }, [strokes]);
  if (!strokes.length) return null;
  return (
    <svg
      viewBox={bounds}
      className={styles.preview}
      aria-label="Handwritten content preview"
      role="img"
      preserveAspectRatio="xMinYMin meet"
    >
      <InkPaths strokes={strokes} />
    </svg>
  );
}
export interface InkSurfaceProps {
  strokes: InkStroke[];
  tool: InkTool;
  color: InkStroke["color"];
  thickness: number;
  finger: boolean;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  onChange: (strokes: InkStroke[]) => void;
  onZoom?: (factor: number, center?: { x: number; y: number }) => void;
  onStroke?: (stroke: InkStroke) => void;
  onLimit?: (message: string) => void;
  onSelection?: (ids: string[]) => void;
  selected?: string[];
}
/** Pointer sampling and the active ribbon are imperative. React updates once at
 * stroke boundaries, not once per stylus sample. Persisted geometry stays vector. */
export default function InkSurface({
  strokes,
  tool,
  color,
  thickness,
  finger,
  width = 1000,
  height = 1400,
  className = "",
  style,
  onChange,
  onZoom,
  onStroke,
  onLimit,
  onSelection,
  selected = [],
}: InkSurfaceProps) {
  const selection = useRef<{ id: number; x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null),
    live = useRef<SVGPathElement>(null);
  const active = useRef<{
    id: number;
    stroke: InkStroke;
    eraser: boolean;
    removed: Set<string>;
  } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; distance: number } | null>(
    null
  );
  const penUntil = useRef(0);
  const frame = useRef(0);
  const latest = useRef({ strokes, onChange, onStroke });
  useEffect(() => {
    latest.current = { strokes, onChange, onStroke };
  }, [strokes, onChange, onStroke]);
  useEffect(() => {
    const commit = () => {
      cancelAnimationFrame(frame.current);
      const value = active.current;
      active.current = null;
      if (value && !value.eraser) {
        const stroke = {
          ...value.stroke,
          points: simplifyInkPoints(value.stroke.points),
        };
        if (latest.current.onStroke) latest.current.onStroke(stroke);
        else latest.current.onChange([...latest.current.strokes, stroke]);
      }
    };
    window.addEventListener("pagehide", commit);
    return () => {
      window.removeEventListener("pagehide", commit);
      commit();
    };
  }, []);
  const point = (
    e: globalThis.PointerEvent | ReactPointerEvent<SVGSVGElement>
  ): InkPoint => {
    const r = svg.current!.getBoundingClientRect();
    return [
      Math.round(((e.clientX - r.left) / r.width) * width * 100) / 100,
      Math.round(((e.clientY - r.top) / r.height) * height * 100) / 100,
      Math.round(
        (e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5) * 100
      ) / 100,
    ];
  };
  const paint = useCallback(() => {
    frame.current = 0;
    const value = active.current;
    if (value && !value.eraser && live.current) {
      live.current.setAttribute("d", strokePath(value.stroke));
      live.current.style.fill = `${inkColor(value.stroke.color)}`;
      live.current.style.opacity =
        value.stroke.tool === "highlighter" ? ".28" : "1";
    }
  }, []);
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  };
  const finish = (cancel = false) => {
    const value = active.current;
    if (!value) return;
    active.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    live.current?.setAttribute("d", "");
    if (cancel) {
      svg.current
        ?.querySelectorAll<SVGPathElement>("g[data-ink-saved] > path")
        .forEach((path) => {
          path.style.visibility = "";
        });
      return;
    }
    value.stroke = {
      ...value.stroke,
      points: simplifyInkPoints(value.stroke.points),
    };
    if (value.eraser) {
      if (value.removed.size)
        latest.current.onChange(
          latest.current.strokes.filter((s) => !value.removed.has(s.id))
        );
    } else if (
      latest.current.strokes.reduce((n, s) => n + s.points.length, 0) +
        value.stroke.points.length >
      50000
    )
      onLimit?.("This page is full. Start another note to keep writing.");
    else if (latest.current.onStroke) latest.current.onStroke(value.stroke);
    else latest.current.onChange([...latest.current.strokes, value.stroke]);
  };
  const erase = (p: InkPoint) => {
    const value = active.current;
    if (!value) return;
    for (const s of latest.current.strokes)
      if (hitStroke(s, p, 12)) value.removed.add(s.id);
    svg.current
      ?.querySelectorAll<SVGPathElement>("g[data-ink-saved] > path")
      .forEach((path) => {
        const index = Array.from(path.parentElement!.children).indexOf(path);
        path.style.visibility = value.removed.has(
          latest.current.strokes[index]?.id
        )
          ? "hidden"
          : "";
      });
  };
  const scroll = (dx: number, dy: number) => {
    const viewport = svg.current?.closest<HTMLElement>("[data-ink-viewport]");
    if (viewport) {
      viewport.scrollLeft -= dx;
      viewport.scrollTop -= dy;
    } else window.scrollBy(-dx, -dy);
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "pen") {
      penUntil.current = Date.now() + 900;
      if (active.current) finish(true);
      selection.current = null; setSelectionBox(null);
    }
    if (e.pointerType === "touch") {
      if (Date.now() < penUntil.current || e.width > 45 || e.height > 45)
        return;
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size > 1) {
        selection.current = null; setSelectionBox(null);
        finish(true);
        const p = [...touches.current.values()];
        gesture.current = {
          x: (p[0].x + p[1].x) / 2,
          y: (p[0].y + p[1].y) / 2,
          distance: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (!finger || tool === "hand") {
        gesture.current = { x: e.clientX, y: e.clientY, distance: 0 };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    if (tool === "hand") {
      gesture.current = { x: e.clientX, y: e.clientY, distance: 0 };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "select" && onSelection) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = point(e);
      selection.current = { id: e.pointerId, x: p[0], y: p[1] };
      setSelectionBox({ x: p[0], y: p[1], width: 1, height: 1 });
      return;
    }
    if (active.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const eraser =
      tool === "eraser" ||
      e.button === 5 ||
      (e.pointerType === "pen" && e.button === 2) ||
      (e.buttons & 32) !== 0;
    active.current = {
      id: e.pointerId,
      eraser,
      removed: new Set(),
      stroke: {
        id: crypto.randomUUID(),
        tool: tool === "highlighter" ? "highlighter" : "pen",
        color,
        width: tool === "highlighter" ? thickness * 4 : thickness,
        points: [point(e)],
      },
    };
    if (eraser) erase(point(e));
    else schedule();
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (touches.current.has(e.pointerId))
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.current && !active.current) {
      const points = [...touches.current.values()];
      const x = points.length > 1 ? (points[0].x + points[1].x) / 2 : e.clientX,
        y = points.length > 1 ? (points[0].y + points[1].y) / 2 : e.clientY;
      if (points.length > 1 && gesture.current.distance) {
        const distance = Math.hypot(
          points[0].x - points[1].x,
          points[0].y - points[1].y
        );
        onZoom?.(distance / gesture.current.distance, { x, y });
        gesture.current.distance = distance;
      }
      scroll(x - gesture.current.x, y - gesture.current.y);
      gesture.current.x = x;
      gesture.current.y = y;
      return;
    }
    if (selection.current?.id === e.pointerId) {
      const p = point(e),
        a = selection.current;
      setSelectionBox({
        x: Math.min(a.x, p[0]),
        y: Math.min(a.y, p[1]),
        width: Math.max(1, Math.abs(a.x - p[0])),
        height: Math.max(1, Math.abs(a.y - p[1])),
      });
      return;
    }
    const value = active.current;
    if (!value || value.id !== e.pointerId) return;
    e.preventDefault();
    if (e.pointerType === "pen") penUntil.current = Date.now() + 900;
    if (value.eraser) {
      erase(point(e));
      return;
    }
    const samples = e.nativeEvent.getCoalescedEvents?.() || [];
    for (const sample of samples.length ? samples : [e.nativeEvent]) {
      const p = point(sample),
        last = value.stroke.points[value.stroke.points.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.3) continue;
      p[2] = (last[2] + p[2]) / 2;
      value.stroke.points.push(p);
    }
    if (value.stroke.points.length > 2048)
      value.stroke.points = value.stroke.points.filter((_, i) => i % 2 === 0);
    schedule();
  };
  const end = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (selection.current?.id === e.pointerId) {
      const p=point(e), a=selection.current;
      onSelection?.(selectedInk(strokes,{x:Math.min(a.x,p[0]),y:Math.min(a.y,p[1]),width:Math.max(1,Math.abs(a.x-p[0])),height:Math.max(1,Math.abs(a.y-p[1]))}));
      touches.current.delete(e.pointerId);
      selection.current = null;
      setSelectionBox(null);
      return;
    }
    touches.current.delete(e.pointerId);
    if (touches.current.size === 0) gesture.current = null;
    if (active.current?.id === e.pointerId) finish();
  };
  return (
    <svg
      ref={svg}
      className={`${styles.inkSurface} ${className}`}
      style={{
        ...style,
        cursor:
          tool === "hand" ? "grab" : tool === "eraser" ? "cell" : "crosshair",
      }}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Editable drawing surface. Use pen or mouse to write. Fingers pan unless finger drawing is enabled."
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={(e) => { if(selection.current?.id===e.pointerId){selection.current=null;setSelectionBox(null);} touches.current.delete(e.pointerId); gesture.current=null; if(active.current?.id===e.pointerId) finish(); }}
      onLostPointerCapture={end}
    >
      <g data-ink-saved>
        <InkPaths strokes={strokes} />
      </g>
      {selected.map((id) => {
        const stroke = strokes.find((s) => s.id === id),
          b = stroke && inkBounds([stroke]);
        return b ? (
          <rect
            key={id}
            x={b.x - 3}
            y={b.y - 3}
            width={b.width + 6}
            height={b.height + 6}
            fill="none"
            stroke="var(--accent-text)"
            strokeWidth={1}
            pointerEvents="none"
          />
        ) : null;
      })}
      {selectionBox && (
        <rect
          {...selectionBox}
          fill="var(--accent-dim)"
          stroke="var(--accent-text)"
          strokeWidth={2}
          pointerEvents="none"
        />
      )}
      <path ref={live} />
    </svg>
  );
}
