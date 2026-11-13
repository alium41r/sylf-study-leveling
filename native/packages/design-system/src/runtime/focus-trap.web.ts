// Keeps Tab inside a modal surface and returns focus to whatever opened it.
import { useEffect, type RefObject } from "react";
import type { ViewHandle } from "../primitives/Layout";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref: RefObject<ViewHandle | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current as unknown as HTMLElement | null;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) =>
      item.getClientRects().length > 0 && !item.closest('[aria-hidden="true"]') && getComputedStyle(item).visibility === "visible"
    );
    (items()[0] ?? root).focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    root.addEventListener("keydown", onKey);
    return () => { root.removeEventListener("keydown", onKey); previous?.focus({ preventScroll: true }); };
  }, [active, ref]);
}
