// The pen you picked stays picked: one choice per surface (pages, PDFs, whiteboards), shared by every page and window, as a pen case
// would be. The pen's settings (kind, colour, size, pressure, line style, straightening) and the colours you mixed are kept with the
// device's other preferences (SharedPreferences on Android, localStorage on desktop); which tool is in hand is for this run only.
// The first pen stroke turns fingers into scrolling, which is what people expect on a tablet; the toolbar can turn it back.
import { useCallback, useSyncExternalStore } from "react";
import { nativePreferences } from "@sylf/native-platform";
import { detectCapabilities } from "@sylf/platform";
import { WIDTH_RANGE, type InkToolState } from "./ink-types";

const KEY = "sylf.notes.pens.v1";
const MAX_INKS = 8;
interface Saved { tools: Record<string, Partial<InkToolState>>; inks: string[] }

const storage = (() => {
  const native = nativePreferences();
  if (native) return native;
  try { if (typeof localStorage !== "undefined") return { getItem: (k: string) => localStorage.getItem(k), setItem: (k: string, v: string) => localStorage.setItem(k, v) }; } catch { /* No storage: defaults. */ }
  return null;
})();

const HEX = /^#[0-9a-f]{6}$/i;
const oneOf = <T extends string>(values: readonly T[]) => (v: unknown): v is T => typeof v === "string" && (values as readonly string[]).includes(v);
const bool = (v: unknown): v is boolean => typeof v === "boolean";
/** What is kept, and what a kept value must look like to be used: a store from another build never breaks the pen. */
const KEPT: { [K in keyof InkToolState]?: (v: unknown) => boolean } = {
  color: (v) => typeof v === "string" && HEX.test(v),
  width: (v) => typeof v === "number" && v >= WIDTH_RANGE.min && v <= WIDTH_RANGE.max,
  shape: oneOf(["line", "rectangle", "ellipse"]),
  eraser: oneOf(["stroke", "precise"]),
  nib: oneOf(["ballpoint", "fountain", "brush", "pencil", "fineliner"]),
  pressure: bool,
  lineStyle: oneOf(["solid", "dashed", "dotted"]),
  straighten: bool,
};

function read(): Saved {
  try {
    const raw = storage?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
    return { tools: parsed.tools && typeof parsed.tools === "object" ? parsed.tools : {}, inks: Array.isArray(parsed.inks) ? parsed.inks.filter((c) => typeof c === "string" && HEX.test(c)).slice(0, MAX_INKS) : [] };
  } catch { return { tools: {}, inks: [] }; }
}
const saved = read();
const write = () => { try { storage?.setItem(KEY, JSON.stringify(saved)); } catch { /* Kept for this run. */ } };

/** A surface's starting tool with what was kept for it laid over, field by field. */
export function restore(initial: InkToolState, kept: Partial<InkToolState> | undefined): InkToolState {
  const next = { ...initial } as Record<string, unknown>;
  for (const [field, valid] of Object.entries(KEPT)) {
    const value = (kept as Record<string, unknown> | undefined)?.[field];
    if (value !== undefined && valid?.(value)) next[field] = value;
  }
  return next as unknown as InkToolState;
}
const keptOf = (tool: InkToolState) => Object.fromEntries(Object.keys(KEPT).map((field) => [field, tool[field as keyof InkToolState]])) as Partial<InkToolState>;

const listeners = new Set<() => void>();
const tools = new Map<string, InkToolState>();
let penSeenOnce = false;
const deviceStylus = (() => { try { return detectCapabilities().input.stylus === true; } catch { return false; } })();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const inkTools = {
  get(key: string, initial: InkToolState): InkToolState {
    // The first read settles the default, so every later read returns the same object (useSyncExternalStore requires it).
    if (!tools.has(key)) {
      const start = restore(initial, saved.tools[key]);
      tools.set(key, penSeenOnce || deviceStylus ? { ...start, penOnly: true } : start);
    }
    return tools.get(key)!;
  },
  set(key: string, next: InkToolState) {
    tools.set(key, next);
    saved.tools = { ...saved.tools, [key]: keptOf(next) };
    write();
    emit();
  },
  /** Colours mixed by hand, newest first. */
  inks: () => saved.inks,
  addInk(hex: string) {
    if (!HEX.test(hex)) return;
    const lower = hex.toLowerCase();
    saved.inks = [lower, ...saved.inks.filter((c) => c !== lower)].slice(0, MAX_INKS);
    write();
    emit();
  },
};

export function useInkTool(initial: InkToolState, key = initial.tool === "highlighter" ? "pdf" : "page"): [InkToolState, (next: InkToolState) => void, boolean, () => void] {
  const tool = useSyncExternalStore(subscribe, () => inkTools.get(key, initial));
  const stylus = useSyncExternalStore(subscribe, () => penSeenOnce || deviceStylus);
  const set = useCallback((next: InkToolState) => inkTools.set(key, next), [key]);
  const penSeen = useCallback(() => {
    if (penSeenOnce) return;
    penSeenOnce = true;
    for (const [k, t] of tools) tools.set(k, { ...t, penOnly: true });
    emit();
  }, []);
  return [tool, set, stylus, penSeen];
}

export const useCustomInks = () => useSyncExternalStore(subscribe, inkTools.inks);
