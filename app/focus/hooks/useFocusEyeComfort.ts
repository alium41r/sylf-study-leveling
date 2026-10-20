"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Focus Room — Light Mode Eye-Comfort Dimming Engine
 *
 * A zero-IOPS, client-side-only dim state:
 *  - persisted to `localStorage` under "sylf_focus_light_dim" ("1" | "0")
 *  - applies STRICTLY while the app is in Light Mode (`html[data-mode="light"]`)
 *  - auto-deactivates the effect when the user switches to Dark Mode
 *  - toggled instantly via the dock button or Shift+D / Meta(⌘)+D
 *
 * The timer execution loop never reads this state, so toggling dimming
 * cannot interfere with the 1s tick cadence or its re-render budget.
 */

export const FOCUS_DIM_STORAGE_KEY = "sylf_focus_light_dim";

/** Read the persisted dim flag (defaults to off). */
export function getStoredDim(): boolean {
  try {
    return localStorage.getItem(FOCUS_DIM_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Resolve the current light/dark mode.
 * Prefers the live `data-mode` attribute on <html>, falling back to the
 * persisted `app_mode` preference (applied by GlobalSystemWrapper).
 */
export function isLightModeActive(): boolean {
  if (typeof document === "undefined") return false;
  const polarity = document.documentElement.getAttribute("data-surface-polarity");
  if (polarity === "light" || polarity === "dark") {
    return polarity === "light";
  }
  const mode = document.documentElement.getAttribute("data-mode");
  if (mode) return mode === "light";
  try {
    return (localStorage.getItem("app_mode") || "dark") === "light";
  } catch {
    return false;
  }
}

export interface FocusEyeComfortState {
  /** User's persisted preference (independent of theme). */
  isDimmed: boolean;
  /** Whether the app is currently in Light Mode. */
  isLightMode: boolean;
  /** Effective dim state: preference AND light mode both true. */
  isDimActive: boolean;
  /** Flip the preference and persist it. */
  toggleDim: () => void;
}

export function useFocusEyeComfort(): FocusEyeComfortState {
  const [isDimmed, setIsDimmed] = useState<boolean>(false);
  const [isLightMode, setIsLightMode] = useState<boolean>(false);

  // Hydrate preference + theme on mount (client-only; SSR-safe default false)
  useEffect(() => {
    setIsDimmed(getStoredDim());
    setIsLightMode(isLightModeActive());
  }, []);

  // Watch `html[data-mode]` / `html[data-surface-polarity]` changes → the effect
  // auto-deactivates the moment the user switches to a dark surface.
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      setIsLightMode(isLightModeActive());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode", "data-surface-polarity"],
    });
    return () => observer.disconnect();
  }, []);

  const toggleDim = useCallback(() => {
    setIsDimmed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(FOCUS_DIM_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Memory-only fallback: dimming still works for this session.
      }
      return next;
    });
  }, []);

  // Keyboard shortcut: Shift+D or Meta(⌘)+D toggles dimming instantly.
  // Alt+D is reserved for the Tools dock (FocusToolsContext), so it is
  // deliberately excluded here; Ctrl+D is the browser bookmark shortcut.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      if (e.altKey || e.ctrlKey) return;

      if (e.key.toLowerCase() === "d" && (e.shiftKey || e.metaKey)) {
        e.preventDefault();
        toggleDim();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleDim]);

  return {
    isDimmed,
    isLightMode,
    isDimActive: isDimmed && isLightMode,
    toggleDim,
  };
}
