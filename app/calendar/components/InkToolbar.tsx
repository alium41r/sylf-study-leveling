"use client";
import {
  Eraser,
  Hand,
  Highlighter,
  Minus,
  PenLine,
  Plus,
  Redo2,
  Undo2,
  Fingerprint,
} from "lucide-react";
import {
  inkColors,
  inkColor,
  type InkTool,
  type InkStroke,
} from "@/lib/calendar/ink";
import styles from "../Notebook.module.css";
export interface InkTools {
  tool: InkTool;
  color: InkStroke["color"];
  thickness: number;
  finger: boolean;
  zoom: number;
}
export const defaultInkTools: InkTools = {
  tool: "pen",
  color: "INK",
  thickness: 3,
  finger: false,
  zoom: 1,
};
export default function InkToolbar({
  value,
  onChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  zoom = true,
}: {
  value: InkTools;
  onChange: (tools: InkTools) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoom?: boolean;
}) {
  const tools = [
    ["pen", "Pen", PenLine],
    ["highlighter", "Highlighter", Highlighter],
    ["eraser", "Stroke eraser", Eraser],
    ["hand", "Pan", Hand],
  ] as const;
  return (
    <div className={styles.tools} role="toolbar" aria-label="Writing tools">
      <div className={styles.toolGroup}>
        {tools.map(([tool, label, Icon]) => (
          <button
            type="button"
            key={tool}
            title={label}
            aria-label={label}
            aria-pressed={value.tool === tool}
            onClick={() => onChange({ ...value, tool })}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
      <div className={styles.toolGroup}>
        <button
          type="button"
          title="Undo"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 size={17} />
        </button>
        <button
          type="button"
          title="Redo"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 size={17} />
        </button>
      </div>
      <div className={styles.toolGroup} role="group" aria-label="Ink color">
        {inkColors.map((color) => (
          <button
            type="button"
            key={color}
            className={styles.swatch}
            title={color === "INK" ? "Theme ink" : color.toLowerCase()}
            aria-label={`${color.toLowerCase()} ink`}
            aria-pressed={value.color === color}
            onClick={() => onChange({ ...value, color })}
          >
            <i style={{ background: inkColor(color) }} />
          </button>
        ))}
      </div>
      <label className={styles.thickness}>
        Width
        <input
          type="range"
          min="1"
          max="8"
          step=".5"
          value={value.thickness}
          aria-label="Stroke thickness"
          onChange={(e) =>
            onChange({ ...value, thickness: Number(e.target.value) })
          }
        />
      </label>
      <button
        type="button"
        aria-label="Finger drawing"
        title="Finger drawing. Off: fingers pan, pen and mouse write."
        aria-pressed={value.finger}
        onClick={() => onChange({ ...value, finger: !value.finger })}
      >
        <Fingerprint size={18} />
      </button>
      {zoom && (
        <div className={styles.zoom}>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={value.zoom <= 0.75}
            onClick={() =>
              onChange({ ...value, zoom: Math.max(0.75, value.zoom - 0.25) })
            }
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            title="Fit page"
            aria-label="Fit page"
            onClick={() => onChange({ ...value, zoom: 1 })}
          >
            {Math.round(value.zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={value.zoom >= 3}
            onClick={() =>
              onChange({ ...value, zoom: Math.min(3, value.zoom + 0.25) })
            }
          >
            <Plus size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
