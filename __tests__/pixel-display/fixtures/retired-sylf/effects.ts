/**
 * ============================================================================
 * PIXEL DISPLAY — SYLF EFFECTS
 * ============================================================================
 * Small, bounded, deterministic things that *happen to* the character.
 *
 * EFFECTS ARE NOT STATES
 *   A state is what the companion **is** — resting, studying, celebrating. An
 *   effect is what is briefly **happening** to it. Keeping them separate is why
 *   this file adds no `*_EFFECT` entries to the state table: a state selects
 *   planes, and an effect modulates planes that already exist. The composition
 *   model is unchanged, and the flat-plane model turned out to be sufficient —
 *   every effect below is expressible as a per-cell intensity over planes the
 *   character already paints.
 *
 * THREE PROPERTIES, ALL ASSERTED BY TEST
 *   Deterministic — every effect is a pure function of `(frame, seed)`. There is
 *   no wall clock and no random source, so the same inputs always produce a
 *   byte-identical framebuffer.
 *
 *   Bounded — the sparkle wave iterates the authored `SPARKLES` table and the
 *   body pulse iterates the body's own cells. Neither grows with elapsed time,
 *   neither allocates per frame, and both tables are precomputed once.
 *
 *   Terminating — every effect has a fixed frame count. When it finishes it
 *   contributes nothing, so the content can let the runtime settle to zero work.
 *
 * LOGICAL COORDINATES ONLY
 *   Nothing here may read a CSS size, a device pixel ratio or a cell pitch
 *   (boundary B3). An effect addresses cells.
 * ============================================================================
 */

import { mixPixColor, TRANSPARENT, type PixColor } from "@/lib/pixel-display/engine/color";
import { SPRITE_REFERENCE, SPARKLES } from "./sprite";

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
export function sparkleWaveTable(
  seed: number,
  frameCount: number = SPARKLE_WAVE_FRAMES,
): readonly (readonly number[])[] {
  const positions = SPARKLES.length;
  const frames: number[][] = [];
  // How long a sparkle stays lit, as a share of the frame budget. A sparkle is
  // lit for only part of the wave, which is what makes it read as a travelling
  // glint rather than a slow fade of the whole field.
  const litSpan = Math.max(2, Math.round(frameCount / 3));

  for (let frame = 0; frame < frameCount; frame += 1) {
    const row: number[] = [];
    for (let index = 0; index < positions; index += 1) {
      const sparkle = SPARKLES[index];
      // A fixed phase per sparkle, ordered left-to-right so the wave sweeps
      // across the character, with the seed choosing the starting offset.
      const spread = Math.round((index / positions) * frameCount);
      const jitter = (sparkle.x * 7 + sparkle.y * 13 + seed * 5) % 5;
      const phase = (spread + jitter + seed) % frameCount;
      const progress = (frame - phase + frameCount) % frameCount;
      row.push(progress < litSpan ? rampIntensity(progress, litSpan) : 0);
    }
    frames.push(row);
  }

  return frames;
}

/**
 * Triangle ramp across `span` steps, as an integer percentage.
 *
 * Integer-only on purpose: a percentage table is trivially reproducible, and
 * determinism that depends on floating-point agreement is determinism waiting to
 * break on another platform.
 */
function rampIntensity(progress: number, span: number): number {
  const half = Math.max(1, Math.floor(span / 2));
  const rise = progress < half ? progress : span - 1 - progress;
  return Math.round(((rise + 1) / half) * 100);
}

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

/**
 * The reference extent an effect is allowed to address.
 *
 * Exported so tests can assert that no effect reaches outside the authored
 * sprite grid — an effect that painted outside it would be inventing geometry
 * rather than modulating existing content.
 */
export const EFFECT_REFERENCE_EXTENT = SPRITE_REFERENCE;
