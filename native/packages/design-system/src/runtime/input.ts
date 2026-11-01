// Tracks how the user is driving the app right now, so focus rings appear for keyboards but never after a tap.
// Fed by Press focus events on native; the web build adds global listeners (input.web.ts).
import { useSyncExternalStore } from "react";

export type InputMode = "touch" | "pen" | "mouse" | "keyboard";

let mode: InputMode = "touch";
const listeners = new Set<() => void>();

export function setInputMode(next: InputMode) {
  if (next === mode) return;
  mode = next;
  listeners.forEach((listener) => listener());
}

export function getInputMode() { return mode; }

export function useInputMode() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getInputMode, getInputMode);
}
