"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, RotateCcw } from "lucide-react";
import { drawPaper } from "@/lib/notes/ink-renderer";
import {
  paperTemplates,
  paperSizes,
  type NoteStyle,
  type NotesPreferences,
} from "@/lib/notes/note-style";
import CreativePanel from "./CreativePanel";
import s from "../Creative.module.css";
function Preview({ style }: { style: NoteStyle["paper"] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext("2d");
    if (ctx) {
      ctx.setTransform(0.16, 0, 0, 0.16, 0, 0);
      drawPaper(ctx, style, 800, 1100, true);
    }
  }, [style]);
  return <canvas ref={ref} width="128" height="176" aria-hidden="true" />;
}
export default function PaperPanel({
  style,
  change,
  onClose,
  saveDefault,
  background,
  setBackground,
  busy,
  templates = [],
  saveTemplates,
  initialScope = "page",
  onScopeChange,
}: {
  style: NoteStyle;
  change: (style: NoteStyle, scope?: "page" | "all") => void;
  onClose: () => void;
  saveDefault: () => Promise<void>;
  background: boolean;
  busy: boolean;
  setBackground: (file?: File, scope?: "page" | "all") => void;
  templates?: NotesPreferences["templates"];
  saveTemplates?: (templates: NotesPreferences["templates"]) => Promise<void>;
  initialScope?: "page" | "all";
  onScopeChange?: (scope: "page" | "all") => void;
}) {
  const [scope, setScope] = useState<"page" | "all">(initialScope);
  const [category, setCategory] = useState(
      () =>
        paperTemplates.find(
          (t) =>
            t.template === style.paper.template &&
            t.spacing === style.paper.spacing
        )?.category || "Basic"
    ),
    [tab, setTab] = useState<"templates" | "page">("templates"),
    [saved, setSaved] = useState(false);
  const [size, setSize] = useState({
    width: style.width,
    height: style.height,
  });
  const [prevDims, setPrevDims] = useState({
    width: style.width,
    height: style.height,
  });
  if (prevDims.width !== style.width || prevDims.height !== style.height) {
    setPrevDims({ width: style.width, height: style.height });
    setSize({ width: style.width, height: style.height });
  }
  const file = useRef<HTMLInputElement>(null);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const paper = style.paper;
  return (
    <CreativePanel title="Page studio" onClose={onClose} wide>
      <fieldset disabled={busy} className={s.panelFields}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Apply to
            </span>
            <small style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>
              {scope === "all" ? "Applies to all pages" : "Current page only"}
            </small>
          </div>
          <div className={s.segmented} aria-label="Apply customization scope">
            <button
              type="button"
              aria-pressed={scope === "page"}
              onClick={() => {
                setScope("page");
                onScopeChange?.("page");
              }}
            >
              Current page
            </button>
            <button
              type="button"
              aria-pressed={scope === "all"}
              onClick={() => {
                setScope("all");
                onScopeChange?.("all");
              }}
            >
              All pages
            </button>
          </div>
        </div>
        <div className={s.segmented}>
          <button
            aria-pressed={tab === "templates"}
            onClick={() => setTab("templates")}
          >
            Templates
          </button>
          <button aria-pressed={tab === "page"} onClick={() => setTab("page")}>
            Page & background
          </button>
        </div>
        {tab === "templates" ? (
          <>
            <div className={s.categories}>
              {[
                "Basic",
                "Academic",
                "Planners",
                "Journals",
                "My templates",
              ].map((name) => (
                <button
                  key={name}
                  aria-pressed={category === name}
                  onClick={() => setCategory(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className={s.gallery}>
              {category === "My templates" &&
                templates.map((t) => (
                  <div key={t.id}>
                    <button
                      aria-label={`${t.name} saved template`}
                      onClick={() => change(t.style, scope)}
                    >
                      <Preview style={t.style.paper} />
                      <span>{t.name}</span>
                    </button>
                    <button
                      aria-label={`Delete ${t.name} template`}
                      onClick={() =>
                        void saveTemplates?.(
                          templates.filter((item) => item.id !== t.id)
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              {paperTemplates
                .filter((t) => t.category === category)
                .map((t) => (
                  <button
                    key={t.id}
                    aria-label={`${t.name} template`}
                    aria-pressed={
                      paper.template === t.template &&
                      paper.spacing === t.spacing
                    }
                    onClick={() => {
                      change({
                        ...style,
                        paper: {
                          ...paper,
                          template: t.template,
                          spacing: t.spacing,
                        },
                      }, scope);
                      setSaved(false);
                    }}
                  >
                    <Preview
                      style={{
                        ...paper,
                        template: t.template,
                        spacing: t.spacing,
                      }}
                    />
                    <span>{t.name}</span>
                    {paper.template === t.template &&
                      paper.spacing === t.spacing && (
                        <i>
                          <Check size={13} />
                        </i>
                      )}
                  </button>
                ))}
            </div>
            {category === "My templates" && saveTemplates && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!templateName.trim() || savingTemplate) return;
                  setSavingTemplate(true);
                  void saveTemplates([
                    ...templates,
                    {
                      id: crypto.randomUUID(),
                      name: templateName.trim(),
                      style,
                    },
                  ])
                    .then(() => setTemplateName(""))
                    .finally(() => setSavingTemplate(false));
                }}
                className={s.fields}
              >
                <label>
                  Save this paper
                  <input
                    aria-label="Template name"
                    maxLength={60}
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder="e.g. My lecture grid"
                  />
                </label>
                <button
                  disabled={
                    !templateName.trim() ||
                    savingTemplate ||
                    templates.length >= 24
                  }
                >
                  Save template
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            <div className={s.swatches}>
              {[
                "#fffdf7",
                "#ffffff",
                "#f5e9dc",
                "#f8e4e7",
                "#dfebe5",
                "#dfe8f6",
                "#e7e0f1",
                "#242830",
              ].map((color) => (
                <button
                  key={color}
                  aria-label={`Paper ${color}`}
                  aria-pressed={paper.color === color}
                  style={{ background: color }}
                  onClick={() =>
                    change({ ...style, paper: { ...paper, color } }, scope)
                  }
                />
              ))}
              <input
                aria-label="Paper color"
                type="color"
                value={paper.color}
                onChange={(e) =>
                  change({
                    ...style,
                    paper: { ...paper, color: e.target.value },
                  }, scope)
                }
              />
            </div>
            <div className={s.fields}>
              <label>
                Rule color
                <input
                  aria-label="Paper rule color"
                  type="color"
                  value={paper.rule}
                  onChange={(e) =>
                    change({
                      ...style,
                      paper: { ...paper, rule: e.target.value },
                    }, scope)
                  }
                />
              </label>
              <label>
                Spacing
                <input
                  aria-label="Paper spacing"
                  type="number"
                  min="12"
                  max="80"
                  value={paper.spacing}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 12 && n <= 80)
                      change({ ...style, paper: { ...paper, spacing: n } }, scope);
                  }}
                />
              </label>
            </div>
            <label>
              Page size
              <select
                aria-label="Page size"
                value={
                  paperSizes.find(
                    (p) =>
                      p.width === Math.min(style.width, style.height) &&
                      p.height === Math.max(style.width, style.height)
                  )?.name || "Custom"
                }
                onChange={(e) => {
                  const p = paperSizes.find((p) => p.name === e.target.value);
                  if (p) {
                    setSize(p);
                    change({ ...style, width: p.width, height: p.height }, scope);
                  }
                }}
              >
                {paperSizes.map((p) => (
                  <option key={p.name}>{p.name}</option>
                ))}
                <option>Custom</option>
              </select>
            </label>
            <div className={s.fields}>
              <label>
                Width
                <input
                  aria-label="Custom page width"
                  type="number"
                  min="320"
                  max="2400"
                  value={size.width}
                  onChange={(e) =>
                    setSize({ ...size, width: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Height
                <input
                  aria-label="Custom page height"
                  type="number"
                  min="320"
                  max="4000"
                  value={size.height}
                  onChange={(e) =>
                    setSize({ ...size, height: Number(e.target.value) })
                  }
                />
              </label>
              <button
                onClick={() => {
                  if (
                    size.width >= 320 &&
                    size.width <= 2400 &&
                    size.height >= 320 &&
                    size.height <= 4000
                  )
                    change({ ...style, ...size }, scope);
                }}
              >
                Apply
              </button>
            </div>
            <div className={s.segmented}>
              <button
                aria-pressed={style.width <= style.height}
                onClick={() => {
                  const width = Math.min(style.width, style.height),
                    height = Math.max(style.width, style.height);
                  setSize({ width, height });
                  change({ ...style, width, height }, scope);
                }}
              >
                Portrait
              </button>
              <button
                aria-pressed={style.width > style.height}
                onClick={() => {
                  const width = Math.max(style.width, style.height),
                    height = Math.min(style.width, style.height);
                  setSize({ width, height });
                  change({ ...style, width, height }, scope);
                }}
              >
                Landscape
              </button>
            </div>
            <div className={s.segmented}>
              <button
                aria-pressed={style.layout === "paged"}
                onClick={() => change({ ...style, layout: "paged" }, scope)}
              >
                Individual pages
              </button>
              <button
                aria-pressed={style.layout === "continuous"}
                onClick={() => change({ ...style, layout: "continuous" }, scope)}
              >
                Infinite scroll
              </button>
            </div>
            <p>
              {style.layout === "continuous"
                ? "Infinite paper without page breaks. Content expands seamlessly downward as you write."
                : "Individual pages. Automatically creates a new page when writing in the lower 30% of the page."}
            </p>
            <div className={s.fields}>
              <button onClick={() => file.current?.click()}>
                <ImagePlus size={17} />
                {background ? "Replace background" : "Image background"}
              </button>
              {background && (
                <button onClick={() => setBackground(undefined, scope)}>
                  <RotateCcw size={15} />
                  Remove
                </button>
              )}
            </div>
            <input
              ref={file}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Choose page background"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) setBackground(file, scope);
              }}
            />
            <label className={s.toggle}>
              <span>
                Adapt page in dark mode
                <small>Original paper and ink colors stay intact</small>
              </span>
              <input
                type="checkbox"
                checked={style.adaptDark}
                onChange={(e) =>
                  change({ ...style, adaptDark: e.target.checked }, scope)
                }
              />
            </label>
          </>
        )}
      </fieldset>
      <footer>
        <button
          className={s.primary}
          disabled={busy}
          onClick={() =>
            void saveDefault()
              .then(() => setSaved(true))
              .catch(() => {})
          }
        >
          <Check size={16} />
          {saved ? "Default style saved" : "Use as default for new notes"}
        </button>
        <small>{scope === "all" ? "Applies across all pages in this notebook." : "Saved with your Notes library."}</small>
      </footer>
    </CreativePanel>
  );
}
