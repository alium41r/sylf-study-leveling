// How new notes and whiteboards start: one choice per device, set from the gear in the Notes library and used by New, the command
// palette and anything else that makes a note. A note's own page settings change that note afterwards. Kept with the device's other
// preferences (SharedPreferences on Android, localStorage on desktop); a store that cannot be read gives the defaults.
import { useSyncExternalStore } from "react";
import { nativePreferences } from "@sylf/native-platform";
import { paperFor, type CreateOptions, type PageFlow, type PaperTemplate } from "@sylf/notes";
import type { InkPaper } from "@sylf/shared";

export type Spacing = "narrow" | "medium" | "wide";
export interface NoteStyle {
  layout: PaperTemplate;
  spacing: Spacing;
  /** Paper colour and its rule colour. */
  paper: { color: string; rule: string };
  flow: PageFlow;
  /** A typed template the first page starts with ("blank" for none). */
  template: string;
  /** Which mode a note opens in; "auto" is Write with a pen and Type without. */
  opensIn: "auto" | "type" | "write";
  board: PaperTemplate;
}

export const SPACINGS: Record<string, Record<Spacing, number>> = {
  grid: { narrow: 16, medium: 24, wide: 32 },
  dotted: { narrow: 16, medium: 24, wide: 32 },
  music: { narrow: 12, medium: 14, wide: 18 },
  lined: { narrow: 22, medium: 28, wide: 36 },
};
export const spacingsFor = (layout: PaperTemplate) => SPACINGS[layout] ?? SPACINGS.lined;
export const PAPERS = [
  { label: "White", color: "#ffffff", rule: "#d9dfea" },
  { label: "Cream", color: "#fffdf7", rule: "#d9dfea" },
  { label: "Sand", color: "#f8f3e8", rule: "#e2d7bf" },
  { label: "Mist", color: "#e8eef2", rule: "#c7d2db" },
  { label: "Graphite", color: "#23252a", rule: "#626773" },
  { label: "Midnight", color: "#111827", rule: "#485671" },
  { label: "Peach", color: "#fdf0e4", rule: "#ecd0b8" },
  { label: "Butter", color: "#fff6d7", rule: "#e6d7a4" },
  { label: "Mint", color: "#f3faf6", rule: "#cfe3d8" },
  { label: "Sky", color: "#f2f6fd", rule: "#cdd9ee" },
  { label: "Lavender", color: "#eeeafa", rule: "#d6c9f0" },
  { label: "Blush", color: "#fdf4f4", rule: "#ecd4d4" },
];

const KEY = "sylf.notes.style.v1";
export const DEFAULT_NOTE_STYLE: NoteStyle = { layout: "ruled", spacing: "medium", paper: { color: paperFor("ruled").color, rule: paperFor("ruled").rule }, flow: "pages", template: "blank", opensIn: "auto", board: "dotted" };

const storage = (() => {
  const native = nativePreferences();
  if (native) return native;
  try { if (typeof localStorage !== "undefined") return { getItem: (k: string) => localStorage.getItem(k), setItem: (k: string, v: string) => localStorage.setItem(k, v) }; } catch { /* No storage: defaults. */ }
  return null;
})();

function read(): NoteStyle {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? { ...DEFAULT_NOTE_STYLE, ...(JSON.parse(raw) as Partial<NoteStyle>) } : DEFAULT_NOTE_STYLE;
  } catch { return DEFAULT_NOTE_STYLE; }
}

let current = read();
const listeners = new Set<() => void>();
export const noteStyle = {
  get: () => current,
  set(patch: Partial<NoteStyle>) {
    current = { ...current, ...patch };
    try { storage?.setItem(KEY, JSON.stringify(current)); } catch { /* Kept for this run. */ }
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
export const useNoteStyle = () => useSyncExternalStore(noteStyle.subscribe, noteStyle.get, noteStyle.get);

/** The paper a new note's pages start on. */
export function stylePaper(style: NoteStyle): InkPaper {
  return { ...paperFor(style.layout), spacing: spacingsFor(style.layout)[style.spacing], color: style.paper.color, rule: style.paper.rule };
}

/** What to pass to `library.create` for a new note or whiteboard in this style. */
export function createOptions(kind: "note" | "board", style: NoteStyle, title: string | undefined): CreateOptions {
  if (kind === "board") return { kind, paper: style.board, title };
  return { kind: "note", template: style.template, paperSpec: stylePaper(style), flow: style.flow, title };
}
