"use client";
import { Star, Trash2, Minus, Square, Circle, Slash } from "lucide-react";
import type { InkTools } from "@/lib/notes/ink-controller";
import type { PenPreset } from "@/lib/notes/note-style";
import CreativePanel from "./CreativePanel";
import s from "../Creative.module.css";
const nibs = ["ballpoint", "fountain", "brush", "pencil", "fineliner"] as const;
const colors = [
  "#242830",
  "#345bc6",
  "#b83349",
  "#20705b",
  "#7954a0",
  "#e4b930",
  "#ff784f",
  "#f5f5f5",
];
export default function PenPanel({
  settings,
  choose,
  pens,
  savePens,
  onClose,
  onStylus,
  previewColor,
  paperColor,
}: {
  settings: InkTools;
  choose: (change: Partial<InkTools>) => void;
  pens: PenPreset[];
  savePens: (pens: PenPreset[]) => void;
  onClose: () => void;
  onStylus?: () => void;
  previewColor: string;
  paperColor: string;
}) {
  const erasing = settings.tool === "eraser";
  const preset = (): PenPreset => ({
    id: crypto.randomUUID(),
    name: `${settings.nib || "ballpoint"} · ${settings.width.toFixed(1)}`,
    tool: settings.tool === "highlighter" ? "highlighter" : "pen",
    nib: settings.nib || "ballpoint",
    color: settings.color,
    width: settings.width,
    opacity: settings.opacity ?? (settings.tool === "highlighter" ? 0.28 : 1),
    pressure: settings.pressure ?? 1,
    smoothing: settings.smoothing ?? 0.65,
    lineStyle: settings.lineStyle || "solid",
    straighten: !!settings.straighten,
  });
  return (
    <CreativePanel title={erasing ? "Eraser" : "Pen studio"} onClose={onClose}>
      {erasing ? (
        <>
          <div className={s.segmented}>
            {(["stroke", "precision"] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={(settings.eraserMode || "stroke") === mode}
                onClick={() => choose({ eraserMode: mode })}
              >
                {mode === "stroke" ? "Whole stroke" : "Precision"}
              </button>
            ))}
          </div>
          <label>
            Eraser size <output>{settings.eraserSize || 12}</output>
            <input
              aria-label="Eraser size"
              type="range"
              min="6"
              max="36"
              value={settings.eraserSize || 12}
              onChange={(e) => choose({ eraserSize: Number(e.target.value) })}
            />
          </label>
          <p>
            Precision removes only the part you touch. One undo restores the
            original stroke.
          </p>
        </>
      ) : (
        <>
          <div className={s.nibs}>
            {nibs.map((nib) => (
              <button
                key={nib}
                className={s.nib}
                aria-label={`${nib[0].toUpperCase() + nib.slice(1)} pen`}
                aria-pressed={
                  (settings.nib || "ballpoint") === nib &&
                  settings.tool !== "highlighter"
                }
                onClick={() =>
                  choose({
                    tool: "pen",
                    nib,
                    opacity: nib === "pencil" ? 0.65 : 1,
                  })
                }
              >
                <svg
                  viewBox="0 0 44 78"
                  aria-hidden="true"
                  style={{ color: previewColor }}
                >
                  <path
                    d={
                      nib === "brush"
                        ? "M14 43 Q9 22 23 3 Q35 22 30 43Z"
                        : nib === "fountain"
                          ? "M11 43 22 5 33 43 22 49Z"
                          : nib === "pencil"
                            ? "M14 43 22 9 30 43Z"
                            : "M16 43 18 15 Q22 8 26 15L28 43Z"
                    }
                    fill="var(--text-secondary)"
                  />
                  <path d="M13 45H31V76H13Z" fill="currentColor" opacity=".7" />
                  <path d="M13 53H31V59H13Z" fill="currentColor" />
                  <path
                    d="M22 18V39"
                    stroke="var(--surface-1)"
                    strokeWidth="1.5"
                  />
                </svg>
                <span>{nib[0].toUpperCase() + nib.slice(1)}</span>
              </button>
            ))}
          </div>
          <svg
            className={s.inkPreview}
            style={{ background: paperColor }}
            viewBox="0 0 300 45"
            aria-label="Ink preview"
          >
            <path
              d="M10 27Q40 4 65 26T120 23T180 24T240 21T290 26"
              fill="none"
              stroke={previewColor}
              strokeWidth={
                settings.width * (settings.tool === "highlighter" ? 5 : 1)
              }
              opacity={settings.opacity ?? 1}
              strokeLinecap="round"
              strokeDasharray={
                settings.lineStyle === "dashed"
                  ? "14 8"
                  : settings.lineStyle === "dotted"
                    ? "1 9"
                    : undefined
              }
            />
          </svg>
          <label>
            Thickness <output>{settings.width.toFixed(1)}</output>
            <input
              aria-label="Pen thickness"
              type="range"
              min=".5"
              max="8"
              step=".1"
              value={settings.width}
              onChange={(e) => choose({ width: Number(e.target.value) })}
            />
          </label>
          <label>
            Opacity{" "}
            <output>
              {Math.round(
                (settings.opacity ??
                  (settings.tool === "highlighter" ? 0.28 : 1)) * 100
              )}
              %
            </output>
            <input
              aria-label="Ink opacity"
              type="range"
              min=".05"
              max="1"
              step=".05"
              value={
                settings.opacity ?? (settings.tool === "highlighter" ? 0.28 : 1)
              }
              onChange={(e) => choose({ opacity: Number(e.target.value) })}
            />
          </label>
          <div className={s.segmented}>
            {(["solid", "dashed", "dotted"] as const).map((lineStyle) => (
              <button
                key={lineStyle}
                aria-label={`${lineStyle} ink`}
                aria-pressed={(settings.lineStyle || "solid") === lineStyle}
                onClick={() => choose({ lineStyle })}
              >
                <svg width="64" height="16" aria-hidden="true">
                  <path
                    d="M5 8H59"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={
                      lineStyle === "dashed"
                        ? "12 8"
                        : lineStyle === "dotted"
                          ? "1 8"
                          : undefined
                    }
                  />
                </svg>
              </button>
            ))}
          </div>
          <div className={s.swatches}>
            {colors.map((color) => (
              <button
                key={color}
                aria-label={`Ink ${color}`}
                aria-pressed={settings.color === color}
                style={{ background: color }}
                onClick={() => choose({ color })}
              />
            ))}
            <input
              aria-label="Custom ink color"
              type="color"
              value={settings.color}
              onChange={(e) => choose({ color: e.target.value })}
            />
          </div>
          <label className={s.toggle}>
            <span>
              Straight-line assistance
              <small>Gently straighten near-straight strokes</small>
            </span>
            <input
              type="checkbox"
              checked={!!settings.straighten}
              onChange={(e) => choose({ straighten: e.target.checked })}
            />
          </label>
          <details className={s.more}>
            <summary>Pressure & smoothing</summary>
            <label>
              Pressure response
              <input
                aria-label="Pressure response"
                type="range"
                min="0"
                max="1"
                step=".05"
                value={settings.pressure ?? 1}
                onChange={(e) => choose({ pressure: Number(e.target.value) })}
              />
            </label>
            <label>
              Smoothing
              <input
                aria-label="Ink smoothing"
                type="range"
                min="0"
                max="1"
                step=".05"
                value={settings.smoothing ?? 0.65}
                onChange={(e) => choose({ smoothing: Number(e.target.value) })}
              />
            </label>
          </details>
          <div className={s.panelHeading}>
            <h3>Favorite pens</h3>
            <button
              disabled={pens.length >= 8}
              onClick={() => savePens([...pens, preset()])}
            >
              <Star size={15} /> Save current
            </button>
          </div>
          <div className={s.favoriteList}>
            {pens.map((pen) => (
              <div key={pen.id}>
                <button onClick={() => choose(pen)}>
                  <i style={{ background: pen.color }} />
                  {pen.name}
                </button>
                <button
                  aria-label={`Remove favorite ${pen.name}`}
                  onClick={() => savePens(pens.filter((p) => p.id !== pen.id))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className={s.panelHeading}>
            <h3>Draw a shape</h3>
          </div>
          <div className={s.segmented}>
            {(
              [
                { tool: "pen", label: "Freehand", Icon: Slash },
                { tool: "line", label: "Line", Icon: Minus },
                { tool: "rectangle", label: "Rectangle", Icon: Square },
                { tool: "ellipse", label: "Ellipse", Icon: Circle },
              ] as const
            ).map(({ tool, label, Icon }) => (
              <button
                key={tool}
                aria-label={`Draw ${label.toLowerCase()}`}
                aria-pressed={settings.tool === tool}
                onClick={() => {
                  choose({ tool });
                  onClose();
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <label className={s.toggle}>
        <span>
          Write with a finger<small>Two fingers always pan and zoom</small>
        </span>
        <input
          type="checkbox"
          checked={settings.finger}
          onChange={(e) => choose({ finger: e.target.checked })}
        />
      </label>
      {onStylus && (
        <div className={s.fields}>
          <button onClick={onStylus}>Stylus buttons…</button>
        </div>
      )}
    </CreativePanel>
  );
}
