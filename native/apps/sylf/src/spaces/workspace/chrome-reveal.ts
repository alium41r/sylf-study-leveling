// While Workspace hides its chrome (Focus and full screen), pulling up "Tools" brings back the Command Center and, with it, the
// Spaces icon and the timer dock with its control panel. The shell reads this to show them; nothing else keeps a copy.
import { useSyncExternalStore } from "react";

let revealed = false;
const listeners = new Set<() => void>();
export function setChromeRevealed(next: boolean) { if (next !== revealed) { revealed = next; listeners.forEach((listener) => listener()); } }
export const useChromeRevealed = () => useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => revealed);
