import { z } from "zod";
/** Actions a stylus button can trigger for the stroke it is held during. */
export const stylusActions = [
  "none",
  "pen",
  "highlighter",
  "eraser",
  "lasso",
  "hand",
] as const;
export type StylusAction = (typeof stylusActions)[number];
export const stylusActionLabels: Record<StylusAction, string> = {
  none: "Do nothing (keep current tool)",
  pen: "Pen",
  highlighter: "Highlighter",
  eraser: "Eraser",
  lasso: "Select (lasso)",
  hand: "Pan",
};
export const stylusMappingSchema = z.object({
  /** Barrel/side button (S Pen button, most Wacom/Surface pens). */
  barrel: z.enum(stylusActions).default("eraser"),
  /** Eraser end of the pen (Surface Pen, Wacom). */
  eraserEnd: z.enum(stylusActions).default("eraser"),
});
export type StylusMapping = z.infer<typeof stylusMappingSchema>;
export const DEFAULT_STYLUS_MAPPING: StylusMapping = {
  barrel: "eraser",
  eraserEnd: "eraser",
};
export type StylusButton = "barrel" | "eraserEnd" | undefined;
/** Pointer Events report the eraser end as button 5/buttons bit 32 and the barrel as button 2/bit 2. */
export function stylusButton(event: {
  pointerType: string;
  button: number;
  buttons: number;
}): StylusButton {
  if (event.pointerType !== "pen") return undefined;
  if (event.button === 5 || event.buttons & 32) return "eraserEnd";
  if (event.button === 2 || event.buttons & 2) return "barrel";
  return undefined;
}
/** The tool for this contact: a configured button action, otherwise the selected tool. */
export function resolveStylusTool<T extends string>(
  button: StylusButton,
  mapping: StylusMapping | undefined,
  current: T
): T | Exclude<StylusAction, "none"> {
  if (!button) return current;
  const action = (mapping || DEFAULT_STYLUS_MAPPING)[button];
  return action === "none" ? current : action;
}
export type StylusCapabilities = {
  pen: boolean;
  barrelButton: boolean;
  eraserEnd: boolean;
  tilt: boolean;
  pressure: boolean;
};
export const noStylusCapabilities: StylusCapabilities = {
  pen: false,
  barrelButton: false,
  eraserEnd: false,
  tilt: false,
  pressure: false,
};
const KEY = "sylf-notes-stylus-capabilities";
/** Capabilities are per device and learned from real pen events, never assumed from the user agent. */
export function readStylusCapabilities(): StylusCapabilities {
  try {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    const stored = JSON.parse(storage?.getItem(KEY) || "null");
    return { ...noStylusCapabilities, ...(stored || {}) };
  } catch {
    return { ...noStylusCapabilities };
  }
}
/** Returns the updated capabilities only when this event taught us something new. */
export function learnStylus(
  known: StylusCapabilities,
  event: {
    pointerType: string;
    button: number;
    buttons: number;
    tiltX?: number;
    tiltY?: number;
    pressure: number;
  }
): StylusCapabilities | undefined {
  if (event.pointerType !== "pen") return undefined;
  const next = { ...known, pen: true };
  const button = stylusButton(event);
  if (button === "barrel") next.barrelButton = true;
  if (button === "eraserEnd") next.eraserEnd = true;
  if (event.tiltX || event.tiltY) next.tilt = true;
  if (event.pressure > 0 && event.pressure !== 0.5) next.pressure = true;
  return (Object.keys(next) as (keyof StylusCapabilities)[]).some(
    (k) => next[k] !== known[k]
  )
    ? next
    : undefined;
}
export function saveStylusCapabilities(value: StylusCapabilities) {
  try {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    storage?.setItem(KEY, JSON.stringify(value));
  } catch {
    /* Capability hints are optional. */
  }
}
