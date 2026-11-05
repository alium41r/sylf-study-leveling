// The pen you picked stays picked: one choice per device for this run, shared by every page and window, as a pen case would be.
// The first pen stroke turns fingers into scrolling, which is what people expect on a tablet; the toolbar can turn it back.
import { useCallback, useSyncExternalStore } from "react";
import { detectCapabilities } from "@sylf/platform";
import type { InkToolState } from "./ink-types";

const listeners = new Set<() => void>();
const tools = new Map<string, InkToolState>();
let penSeenOnce = false;
const deviceStylus = (() => { try { return detectCapabilities().input.stylus === true; } catch { return false; } })();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useInkTool(initial: InkToolState, key = initial.tool === "highlighter" ? "pdf" : "page"): [InkToolState, (next: InkToolState) => void, boolean, () => void] {
  const tool = useSyncExternalStore(subscribe, () => {
    // The first read settles the default, so every later read returns the same object (useSyncExternalStore requires it).
    if (!tools.has(key)) tools.set(key, penSeenOnce || deviceStylus ? { ...initial, penOnly: true } : initial);
    return tools.get(key)!;
  });
  const stylus = useSyncExternalStore(subscribe, () => penSeenOnce || deviceStylus);
  const set = useCallback((next: InkToolState) => { tools.set(key, next); emit(); }, [key]);
  const penSeen = useCallback(() => {
    if (penSeenOnce) return;
    penSeenOnce = true;
    for (const [k, t] of tools) tools.set(k, { ...t, penOnly: true });
    emit();
  }, []);
  return [tool, set, stylus, penSeen];
}
