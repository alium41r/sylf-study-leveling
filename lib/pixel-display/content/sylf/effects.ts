/** Bounded reaction timing and color modulation for explicitly supplied artwork. */

import { mixPixColor, TRANSPARENT, type PixColor } from "../../engine/color";


/** The effect vocabulary. Deliberately two, because two are different in kind. */
export type SylfEffectKind = "sparkleWave" | "bodyPulse";

/** A transient effect applied over the base state. */
export interface SylfEffect {
  readonly kind: SylfEffectKind;
  /**
   * Chooses one variant out of the effect's family.
   *
   * Every seed produces a valid, bounded effect; the seed only selects *which*
   * bounded effect, so an application can make two celebrations differ without
   * ever being able to make one misbehave.
   */
  readonly seed: number;
}

// ─── Sparkle wave ─────────────────────────────────────────────────────────────

/**
 * Duration and frame count.
 *
 * The step count is a constant rather than a duration divided by a frame time,
 * so the effect cannot change length on a slow machine — it has a fixed number
 * of beats, and the runtime decides how fast to play them.
 */
export const SPARKLE_WAVE_MS = 1_100;
export const SPARKLE_WAVE_FRAMES = 24;

/** The reduced-motion variant: the same effect, held briefly rather than swept. */
export const SPARKLE_WAVE_REDUCED_MS = 500;
export const SPARKLE_WAVE_REDUCED_FRAMES = 4;

/**
 * Per-sparkle intensity for every frame of the wave.
 *
 * Each sparkle lights on its own schedule and fades, and the schedules are
 * spread across the frame budget so the wave travels through the field rather
 * than pulsing all at once. Intensity is a small integer percentage, which keeps
 * the whole effect readable as a table and makes it exactly reproducible.
 *
 * Computed once per `(seed, frameCount)` and reused for every frame — the effect
 * allocates nothing while it is running.
 */
// ─── Body pulse ───────────────────────────────────────────────────────────────

/** Acknowledgment, deliberately shorter and quieter than a celebration. */
export const BODY_PULSE_MS = 620;
export const BODY_PULSE_FRAMES = 12;
export const BODY_PULSE_REDUCED_MS = 320;
export const BODY_PULSE_REDUCED_FRAMES = 2;

/**
 * How much brighter than its painted tone a body cell is, per frame.
 *
 * A short ramp up and a longer fall, so the pulse reads as a lift and a settle
 * rather than a flash. Percentages again, for the same reason as the wave.
 */
export const BODY_PULSE_RAMP: readonly number[] = [
  30, 55, 75, 88, 100, 92, 78, 60, 44, 30, 18, 8,
];

/** The pulse's brightness percentage on `frame`. */
export function bodyPulseIntensity(
  frame: number,
  frameCount: number = BODY_PULSE_FRAMES,
): number {
  if (frame < 0 || frame >= frameCount) return 0;
  // Reduced motion has a shorter ramp than the authored one, so the table is
  // sampled across the table rather than truncated — the shape is preserved.
  if (frameCount >= BODY_PULSE_RAMP.length) return BODY_PULSE_RAMP[frame];
  const index = Math.round((frame / frameCount) * BODY_PULSE_RAMP.length);
  return BODY_PULSE_RAMP[Math.min(index, BODY_PULSE_RAMP.length - 1)];
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

/** One scheduled effect: which effect, and how long it runs. */
export interface SylfEffectPlan {
  readonly kind: SylfEffectKind;
  readonly seed: number;
  readonly durationMs: number;
  readonly frameCount: number;
}

/**
 * Resolves an effect into what it will actually do on this display.
 *
 * Reduced motion is resolved here, once, rather than being re-checked on every
 * frame: the effect becomes a four-frame hint rather than a sweep, and nothing
 * about it becomes invisible.
 */
export function planEffect(
  effect: SylfEffect,
  reducedMotion: boolean,
): SylfEffectPlan {
  if (effect.kind === "sparkleWave") {
    return {
      kind: "sparkleWave",
      seed: effect.seed,
      durationMs: reducedMotion ? SPARKLE_WAVE_REDUCED_MS : SPARKLE_WAVE_MS,
      frameCount: reducedMotion
        ? SPARKLE_WAVE_REDUCED_FRAMES
        : SPARKLE_WAVE_FRAMES,
    };
  }
  return {
    kind: "bodyPulse",
    seed: effect.seed,
    durationMs: reducedMotion ? BODY_PULSE_REDUCED_MS : BODY_PULSE_MS,
    frameCount: reducedMotion ? BODY_PULSE_REDUCED_FRAMES : BODY_PULSE_FRAMES,
  };
}

// ─── Palette ─────────────────────────────────────────────────────────────────

/**
 * Blends a cell toward its brighter form by an integer percentage.
 *
 * `mixPixColor` already owns colour interpolation, so an effect never invents a
 * colour of its own — it only moves an existing one along an axis the palette
 * defines. That is what keeps an effect from being able to paint something the
 * character would never be.
 */
export function pulseColor(
  color: PixColor,
  intensity: number,
  highlight: PixColor,
): PixColor {
  if (color === TRANSPARENT || intensity <= 0) return color;
  return mixPixColor(color, highlight, Math.min(100, intensity) / 100);
}

/** The brightest tone an effect may blend toward, from the authored palette. */
export const EFFECT_HIGHLIGHT: PixColor = 0xffffffff;

