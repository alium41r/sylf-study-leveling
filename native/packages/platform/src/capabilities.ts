// Capability model shared by every runtime. Features check capabilities, never platform names
// (master plan §5.2 rule 5). Layout follows the window size class, never the device type (§4.4).
export type Runtime = "native" | "desktop" | "web";
export type OperatingSystem = "android" | "ios" | "macos" | "windows" | "linux" | "unknown";
export type FormFactor = "tablet" | "phone" | "desktop";
export type WindowSizeClass = "compact" | "medium" | "expanded";
export type Tristate = boolean | "unknown";

export interface PlatformCapabilities {
  runtime: Runtime;
  os: OperatingSystem;
  osVersion: string;
  formFactor: FormFactor;
  input: { stylus: Tristate; hover: Tristate; finePointer: Tristate };
  display: { refreshRates: number[]; scale: number };
  /** Device-reported model or user agent summary, for diagnostics only. */
  model: string;
}

/** Window size class thresholds in density-independent points (master plan §4.4; refined in Phase 4/10). */
export const WINDOW_CLASS_BREAKPOINTS = { medium: 600, expanded: 1000 } as const;

export function windowSizeClass(width: number): WindowSizeClass {
  if (width >= WINDOW_CLASS_BREAKPOINTS.expanded) return "expanded";
  if (width >= WINDOW_CLASS_BREAKPOINTS.medium) return "medium";
  return "compact";
}

/** Phone vs tablet from the device's smallest screen side (dp), independent of the current window. */
export function formFactorFromScreen(shortestSide: number): FormFactor {
  return shortestSide >= 600 ? "tablet" : "phone";
}
