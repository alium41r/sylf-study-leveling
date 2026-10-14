"use client";

import { useSyncExternalStore } from "react";

// Temporary visual-review URL controls. No account or persisted preferences.
const CHANGE_EVENT = "sylf-pixel-preview-change";
export type PixelCompanionVariant = "svg" | "pixel" | "pixel-layered";
export const PIXEL_EYE_STATES = [
  "neutral",
  "happy",
  "thinking",
  "focused",
  "sleepy",
  "blink",
] as const;
export type PixelEyeState = (typeof PIXEL_EYE_STATES)[number];

function developmentParameter(name: string) {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined")
    return null;
  return new URLSearchParams(window.location.search).get(name);
}

function variantSnapshot(): PixelCompanionVariant {
  const variant = developmentParameter("companion");
  return variant === "pixel" || variant === "pixel-layered" ? variant : "svg";
}

function eyeSnapshot(): PixelEyeState {
  const eye = developmentParameter("eyes");
  return PIXEL_EYE_STATES.find((state) => state === eye) ?? "neutral";
}

function subscribe(onChange: () => void) {
  if (process.env.NODE_ENV !== "development") return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

export function usePixelCompanionPreview() {
  return usePixelCompanionVariant() !== "svg";
}

export function usePixelCompanionVariant() {
  return useSyncExternalStore(subscribe, variantSnapshot, () => "svg" as const);
}

export function usePixelEyePreview() {
  return useSyncExternalStore(subscribe, eyeSnapshot, () => "neutral" as const);
}

export function setPixelCompanionPreview(pixel: boolean) {
  setPixelCompanionVariant(pixel ? "pixel" : "svg");
}

function updateParameter(name: string, value: string | null) {
  if (process.env.NODE_ENV !== "development") return;
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function setPixelCompanionVariant(variant: PixelCompanionVariant) {
  updateParameter("companion", variant === "svg" ? null : variant);
}

export function setPixelEyePreview(eye: PixelEyeState) {
  updateParameter("eyes", eye);
}
