"use client";
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { cellSegment, type CellPoint, type DraftFrame, type StudioTool } from './pixel-studio-model';
import styles from './PixelStudio.module.css';

export interface EditorCanvasProps {
 grid: number; frame: DraftFrame; palette: readonly string[]; zoom: number;
 onionPrevious?: DraftFrame | null; onionNext?: DraftFrame | null;
 tool: StudioTool; mirrored: boolean; showGrid?: boolean;
 panMode?: boolean; disabled?: boolean; describedBy?: string;
 onPaint: (point: CellPoint) => void;
 onPaintSegment?: (points: readonly CellPoint[]) => void;
 onStrokeStart: () => void; onStrokeEnd?: () => void;
 onPick: (index: number | null) => void; label: string;
}
export function EditorCanvas({ grid, frame, palette, zoom, onionPrevious, onionNext, tool, mirrored, showGrid = true, panMode = false, disabled = false, describedBy, onPaint, onPaintSegment, onStrokeStart, onStrokeEnd, onPick, label }: EditorCanvasProps) {
 const canvas = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null);
 const pointer = useRef<number | null>(null), last = useRef<CellPoint | null>(null);
 const panStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
 const [dragging, setDragging] = useState(false);
 const [hover, setHover] = useState<CellPoint | null>(null), [fit, setFit] = useState(384);
 useEffect(() => {
   const element = wrap.current; if (!element) return;
   const measure = () => {
     const style = window.getComputedStyle(element);
     const width = element.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
     const height = element.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0');
     setFit(Math.max(1, Math.min(width, height)));
   }; measure();
   const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
   observer?.observe(element); window.addEventListener("resize", measure); return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
 }, []);
 useEffect(() => {
   const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
   ctx.clearRect(0, 0, grid, grid);
   const draw = (source: DraftFrame | null | undefined, tint?: string) => {
     if (!source) return;
     ctx.globalAlpha = tint ? 0.35 : 1;
     for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
       const value = source.cells[y]?.[x]; if (value === null || value === undefined) continue;
       ctx.fillStyle = tint ?? palette[value] ?? '#000000'; ctx.fillRect(x, y, 1, 1);
     }
     ctx.globalAlpha = 1;
   };
   draw(onionPrevious, '#22d3ee'); draw(onionNext, '#f472b6'); draw(frame);
 }, [grid, frame, palette, onionPrevious, onionNext]);
 const toCell = (clientX: number, clientY: number): CellPoint | null => {
   const rect = canvas.current!.getBoundingClientRect();
   const x = Math.floor((clientX - rect.left) * grid / rect.width), y = Math.floor((clientY - rect.top) * grid / rect.height);
   return x >= 0 && y >= 0 && x < grid && y < grid ? { x, y } : null;
 };
 const apply = (points: CellPoint[]) => { if (onPaintSegment) onPaintSegment(points); else points.forEach(onPaint); };
 const down = (event: PointerEvent<HTMLCanvasElement>) => {
   if (event.button !== 0 || event.isPrimary === false || pointer.current !== null) return;
   if (disabled && !panMode) return;
   event.currentTarget.focus({ preventScroll: true });
   if (panMode && wrap.current) {
     event.preventDefault(); pointer.current = event.pointerId; setDragging(true); setHover(null);
     panStart.current = { x: event.clientX, y: event.clientY, left: wrap.current.scrollLeft, top: wrap.current.scrollTop };
     event.currentTarget.setPointerCapture(event.pointerId); return;
   }
   const point = toCell(event.clientX, event.clientY); if (!point) return;
   event.preventDefault(); setHover(point);
   if (tool === 'eyedropper') { onPick(frame.cells[point.y]?.[point.x] ?? null); return; }
   pointer.current = event.pointerId; last.current = point;
   event.currentTarget.setPointerCapture(event.pointerId); onStrokeStart(); apply([point]);
 };
 const move = (event: PointerEvent<HTMLCanvasElement>) => {
   if (panStart.current && pointer.current === event.pointerId && wrap.current) {
     wrap.current.scrollLeft = panStart.current.left + panStart.current.x - event.clientX;
     wrap.current.scrollTop = panStart.current.top + panStart.current.y - event.clientY;
     return;
   }
   if (panMode || disabled) { setHover(null); return; }
   const point = toCell(event.clientX, event.clientY); setHover(point);
   if (pointer.current !== event.pointerId || tool === 'fill') return;
   const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
   for (const sample of [...samples, event]) {
     const next = toCell(sample.clientX, sample.clientY);
     if (!next) { last.current = null; continue; }
     apply(last.current ? cellSegment(last.current, next) : [next]); last.current = next;
   }
 };
 const end = (event: PointerEvent<HTMLCanvasElement>) => {
   if (pointer.current !== event.pointerId) return;
   const wasPanning = panStart.current !== null;
   pointer.current = null; last.current = null; panStart.current = null; setDragging(false);
   if (!wasPanning) onStrokeEnd?.();
   if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
 };
 const size = zoom === 0 ? fit : grid * zoom;
 const cursors = hover && !panMode && !disabled ? [hover, ...(mirrored && tool !== 'eyedropper' ? [{ x: grid - 1 - hover.x, y: hover.y }] : [])] : [];
 return <div ref={wrap} className={styles.canvasWrap} data-zoomed={zoom !== 0}>
   <div className={styles.canvasStage} style={{ width: size, height: size, '--studio-cell': `${size / grid}px` } as React.CSSProperties}>
     <canvas ref={canvas} width={grid} height={grid} className={styles.canvas} aria-label={label} aria-describedby={describedBy} role="img" tabIndex={0} data-editor-canvas data-grid={grid} data-disabled={disabled} data-pan-mode={panMode} data-panning={dragging} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onPointerLeave={() => setHover(null)} />
     {showGrid && <div className={styles.cellGrid} aria-hidden="true" />}
     <div className={styles.cursorLayer} aria-hidden="true">{cursors.map((point, index) => <span key={index} className={styles.cursorCell} data-cursor style={{ left: `${point.x / grid * 100}%`, top: `${point.y / grid * 100}%`, width: `${100 / grid}%`, height: `${100 / grid}%` }} />)}</div>
   </div>
 </div>;
}
