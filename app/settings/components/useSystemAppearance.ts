"use client";

import { useEffect, type RefObject } from "react";
import { getSafeAccentText } from "@/lib/color-utils";

// Global text tokens target cards. Library navigation sits directly on the user's
// canvas, which can be any color independently of the light/dark surface mode.
export function useSystemAppearance(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const sync = () => {
      const root = getComputedStyle(document.documentElement);
      const canvas = root.getPropertyValue("--app-canvas").trim();
      if (!canvas) return;
      for (const [target, source] of [
        ["--chrome-accent", "--accent-primary"],
        ["--index-ink", "--text-primary"],
        ["--index-muted", "--text-secondary"],
      ]) {
        const color = root.getPropertyValue(source).trim();
        if (color)
          ref.current?.style.setProperty(
            target,
            getSafeAccentText(color, canvas)
          );
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "data-mode", "class"],
    });
    return () => observer.disconnect();
  }, [ref]);
}
