/**
 * ============================================================================
 * PIXEL DISPLAY — ENGINE TYPES
 * ============================================================================
 * Shared vocabulary for the engine's public surface. The concrete interfaces
 * live beside the module that owns them; this file is the single import site
 * for consumers that only need to name engine concepts.
 * ============================================================================
 */

export type { PixPoint, PixGeometry } from "./geometry";
export type { PixColor } from "./color";
export type { PixPlane, PixDisplayOptions } from "./display";
export type {
  PixTimeline,
  PixRenderer,
  PixContent,
  PixOverlay,
  PixRuntimeConfig,
} from "./runtime";
// Renderer-owned types (PixPresentation, PixCellLayout) are deliberately NOT
// re-exported here: the renderer is a peer of the engine, not part of it, and a
// component that needs them imports them from
// `lib/pixel-display/renderers/canvas-2d`. Re-exporting them would make the
// engine depend on a renderer — and, through it, on the DOM — which is exactly
// the dependency direction the engine boundary forbids.
