// Whether the Focus environment is open, and where the person came from. A shell service like the session: it belongs to no Space, so leaving it
// returns to exactly where they were. It holds no time. Leaving is not ending: the session keeps going, and the dock shows it again.
import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const focusEnvironment = {
  isOpen: () => open,
  open() { if (!open) { open = true; notify(); } },
  close() { if (open) { open = false; notify(); } },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};

export const useFocusEnvironmentOpen = () => useSyncExternalStore(focusEnvironment.subscribe, focusEnvironment.isOpen, focusEnvironment.isOpen);
