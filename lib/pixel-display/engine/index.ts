/**
 * ============================================================================
 * PIXEL DISPLAY — ENGINE PUBLIC SURFACE
 * ============================================================================
 * The engine's only supported entry point. Consumers import from here, not from
 * individual engine modules, so internal layout stays changeable.
 *
 * The engine is deliberately domain-free (roadmap boundaries B1 and B2):
 * nothing below knows what Sylf is, what a character is, or that a browser
 * exists. Content and application surfaces are separate layers.
 * ============================================================================
 */

export {
  createPixGeometry,
  isValidGridSize,
  pointAt,
  type PixGeometry,
  type PixPoint,
} from "./geometry";

export {
  BLACK,
  TRANSPARENT,
  hexToPixColor,
  isTransparent,
  mixPixColor,
  packRgba,
  pixColorToHex,
  scaleAlpha,
  unpackRgba,
  type PixColor,
} from "./color";

export {
  PixFramebuffer,
  clearFramebuffer,
  createFramebuffer,
} from "./framebuffer";

export {
  PixDisplay,
  createPixDisplay,
  type PixDisplayOptions,
  type PixPlane,
} from "./display";

export {
  PixRuntime,
  canScheduleFrames,
  createPixRuntime,
  type PixContent,
  type PixOverlay,
  type PixRenderer,
  type PixRuntimeConfig,
  type PixRuntimePhase,
  type PixTimeline,
} from "./runtime";

// The engine's public surface is engine-only. Renderer and presentation types
// live in `lib/pixel-display/renderers/`; import them from there.
