/**
 * PIXEL DISPLAY — CONTENT PUBLIC SURFACE
 *
 * Content answers "what should those pixels currently show?", while the engine
 * answers "how are pixels displayed?" (doc §12). Content is deliberately a
 * separate import path from the engine so the two never collapse into one.
 *
 * Only explicitly supplied artwork is rendered. Character geometry belongs to
 * user creations; an unconfigured display remains empty.
 */

export { SYLF_PALETTE, type SylfPalette, type SylfPaletteKey } from "./palette";

// ─── The Sylf companion ──────────────────────────────────────────────────────

export {
  SylfCharacterContent,
  createSylfContent,
  type SylfContentOptions,
  type SylfState,
} from "./sylf/character";

export {
  BLINK_DURATION_MS,
  BLINK_FRAMES,
  BLINK_SEQUENCE,
  DEFAULT_AUTO_BLINK_INTERVAL_MS,
  RESTING_STATE,
  SYLF_ANIMATIONS,
  SYLF_COMPOSITIONS,
  type SylfAnimation,
  type SylfComposition,
  type SylfFrame,
} from "./sylf/frames";

/**
 * Effects — what briefly *happens to* the character.
 *
 * Exported alongside states because an adapter chooses both, and because the
 * distinction between them ("is" versus "is happening") is part of the content
 * layer's contract rather than an implementation detail.
 */
export {
  BODY_PULSE_FRAMES,
  BODY_PULSE_MS,
  BODY_PULSE_RAMP,
  BODY_PULSE_REDUCED_FRAMES,
  BODY_PULSE_REDUCED_MS,
  EFFECT_HIGHLIGHT,
  SPARKLE_WAVE_FRAMES,
  SPARKLE_WAVE_MS,
  SPARKLE_WAVE_REDUCED_FRAMES,
  SPARKLE_WAVE_REDUCED_MS,
  bodyPulseIntensity,
  planEffect,
  pulseColor,
  type SylfEffect,
  type SylfEffectKind,
  type SylfEffectPlan,
} from "./sylf/effects";
