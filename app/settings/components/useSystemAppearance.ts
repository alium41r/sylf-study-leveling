"use client";

import { useEffect, type RefObject } from "react";
import { getSafeAccentText, isValidHex } from "@/lib/color-utils";

// Global text tokens target cards. Library navigation sits directly on the user's
// canvas, which can be any color independently of the light/dark surface mode.
export function useSystemAppearance(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const sync = () => {
      const root = getComputedStyle(document.documentElement);
      const polarity =
        document.documentElement.getAttribute("data-surface-polarity") ||
        (document.documentElement.getAttribute("data-mode") === "light"
          ? "light"
          : "dark");
      const rawCanvas =
        document.documentElement.style.getPropertyValue("--app-canvas").trim() ||
        root.getPropertyValue("--app-canvas").trim() ||
        root.getPropertyValue("--bg-void").trim();
      const canvas = isValidHex(rawCanvas)
        ? rawCanvas
        : polarity === "light"
          ? "#f8fafc"
          : "#000000";
      for (const [target, source] of [
        ["--chrome-accent", "--accent-primary"],
        ["--index-ink", "--text-primary"],
        ["--index-muted", "--text-secondary"],
      ]) {
        const color =
          document.documentElement.style.getPropertyValue(source).trim() ||
          root.getPropertyValue(source).trim();
        if (color && isValidHex(color))
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
      attributeFilter: [
        "style",
        "data-mode",
        "data-surface-polarity",
        "data-app-theme",
        "class",
      ],
    });
    return () => observer.disconnect();
  }, [ref]);
}
