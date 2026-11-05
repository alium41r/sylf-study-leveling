// Command + 1, 2 or 3 on a Mac and Control + 1, 2 or 3 elsewhere switch Spaces (master plan §3.1). The modifier follows the system,
// because Control + a digit switches desktops on a Mac once that is turned on. Alt and Shift stay out of it: Alt + a digit opens
// Workspace's tools. A key works while typing, since it is not text, and never behind a modal, whose answer comes first. Alt + T and
// Alt + P reach the timer. They are matched by physical key, because Option turns letters into symbols on a Mac, and they stand aside
// while someone types. The keys unmount with the switcher and the dock, so none of this exists during play.
import { useEffect, useRef } from "react";
import { detectCapabilities } from "@sylf/platform";
import type { DockKeyActions } from "./shell-keys";

const mac = detectCapabilities().os === "macos";
export const SPACES_SHORTCUT = mac ? "⌘1 2 3" : "Ctrl 1 2 3";
export const DOCK_SHORTCUT = mac ? "⌥T" : "Alt T";
export const PALETTE_SHORTCUT = mac ? "⌘K" : "Ctrl K";
const behindModal = () => document.querySelector('[aria-modal="true"]') !== null;
const typing = () => {
  const element = document.activeElement as HTMLElement | null;
  return !!element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable);
};

export function useSpaceKeys(onDigit: (digit: string) => void) {
  const latest = useRef(onDigit);
  latest.current = onDigit;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const primary = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      const digit = /^Digit([1-3])$/.exec(event.code)?.[1];
      if (!primary || !digit || event.altKey || event.shiftKey || event.repeat || behindModal()) return;
      event.preventDefault();
      latest.current(digit);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Command or Control + K opens the command palette from anywhere, typing included, and closes it again. Another modal comes first. */
export function usePaletteKeys(toggle: () => void) {
  const latest = useRef(toggle);
  latest.current = toggle;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const primary = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!primary || event.code !== "KeyK" || event.altKey || event.shiftKey || event.repeat) return;
      const palette = document.querySelector('[data-testid="command-palette"]');
      if (behindModal() && !palette) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

export function useDockKeys(actions: DockKeyActions) {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || event.repeat || typing() || behindModal()) return;
      const run = { KeyT: latest.current.toggle, KeyP: latest.current.pauseOrResume }[event.code];
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
