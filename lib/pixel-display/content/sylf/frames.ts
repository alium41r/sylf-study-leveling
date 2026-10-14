/**
 * ============================================================================
 * PIXEL DISPLAY — SYLF CHARACTER STATES
 * ============================================================================
 * The Sylf companion's own state vocabulary, and the authored frame tables that
 * give each state its timing.
 *
 * WHAT LIVES HERE, AND WHAT DOES NOT
 *   This is *domain content*: it knows what the Sylf companion does — it rests,
 *   it studies, it celebrates, it blinks. It knows nothing about the dashboard,
 *   about application events, or about any other surface. An adapter that maps
 *   application signals onto these states belongs at the application boundary in
 *   a later phase, not here (roadmap boundary B6).
 *
 * AUTHORED, NOT PROCEDURAL (doc §15.1)
 *   Every frame is data. There is no interpolation, no easing function and no
 *   procedural motion in this file, which is what Phase 2 requires and what
 *   keeps the timing reviewable.
 * ============================================================================
 */

type EyeShape = "open" | "focused" | "half" | "closed" | "sleeping" | "happy";

/** The Sylf companion's states. */
export type SylfState =
  | "IDLE"
  | "FOCUSING"
  | "REST"
  | "CELEBRATING"
  | "THINKING"
  | "BLINK";

/**
 * What a state draws.
 *
 * This is the entire composition model: a state is a **plane selection**, never
 * a full-character image. `eyes: "closed"` means "swap the eye plane", not
 * "paint a different character".
 */
export interface SylfComposition {
  /** Which eye shape this state shows. */
  readonly eyes: EyeShape;
  /** Whether the cheek blush is lit. */
  readonly blush: boolean;
  /** Whether the ambient sparkles are drawn. */
  readonly sparkles: boolean;
}

export interface SylfFrame {
  readonly eyes: EyeShape;
  /** Milliseconds this frame stays on screen. */
  readonly durationMs: number;
}

export interface SylfAnimation {
  /** `hold` displays one frame indefinitely; `loop` walks the frame table. */
  readonly mode: "hold" | "loop";
  readonly frames: readonly SylfFrame[];
  /**
   * For `loop`: how many complete passes before settling. A limited animation
   * settles the moment its final pass completes, which is what lets a blink
   * return the runtime to zero work instead of leaving a frame scheduled.
   */
  readonly loops?: number;
}

/**
 * The authored blink: `open → half → closed → half → open`, exactly the sequence
 * the product document names.
 *
 * The closing beats are quicker than the opening beats because a real blink is
 * asymmetric — it shuts fast and opens more slowly. The final `open` beat is the
 * frame a settled display keeps showing.
 */
export const BLINK_FRAMES: readonly SylfFrame[] = [
  { eyes: "open", durationMs: 70 },
  { eyes: "half", durationMs: 60 },
  { eyes: "closed", durationMs: 110 },
  { eyes: "half", durationMs: 60 },
  { eyes: "open", durationMs: 100 },
];

/** The authored blink sequence, named for the dev surface and tests. */
export const BLINK_SEQUENCE: readonly EyeShape[] = BLINK_FRAMES.map(
  (frame) => frame.eyes,
);

/** The state every animation settles back into. */
export const RESTING_STATE: SylfState = "IDLE";

/**
 * Per-state timing.
 *
 * Four states hold a single frame. That is not a limitation — it is what makes
 * them free. A `hold` state requests no further frames, so the runtime settles
 * into `idle` and the display costs nothing while the companion simply exists.
 * Only `BLINK` animates, and it animates for as long as it takes to blink.
 */
export const SYLF_ANIMATIONS: Record<SylfState, SylfAnimation> = {
  IDLE: {
    mode: "hold",
    frames: [{ eyes: "open", durationMs: 0 }],
  },
  FOCUSING: {
    mode: "hold",
    frames: [{ eyes: "focused", durationMs: 0 }],
  },
  REST: {
    mode: "hold",
    frames: [{ eyes: "sleeping", durationMs: 0 }],
  },
  CELEBRATING: {
    mode: "hold",
    frames: [{ eyes: "happy", durationMs: 0 }],
  },
  /**
   * The only state with no `loops`.
   *
   * Every other animation is finite because the thing it represents finishes. A
   * companion waiting on a long-running task is genuinely ongoing, so this loop
   * is held until the application withdraws the signal — an externally
   * terminated animation rather than an open one. It is the sole exception to
   * the rule that content always settles itself, and it is deliberate.
   *
   * The gaze moves between `focused` and `half` so the companion reads as
   * working rather than frozen. Nothing pulses: a pulse would imply progress,
   * and this state is used precisely when progress cannot be known.
   */
  THINKING: {
    mode: "loop",
    frames: [
      { eyes: "focused", durationMs: 520 },
      { eyes: "half", durationMs: 210 },
      { eyes: "focused", durationMs: 460 },
      { eyes: "half", durationMs: 180 },
    ],
  },
  BLINK: {
    mode: "loop",
    loops: 1,
    frames: BLINK_FRAMES,
  },
};

/**
 * What each state composes, independent of timing.
 *
 * Kept as a separate table rather than derived from `SYLF_ANIMATIONS` so the
 * composition of a state is answerable without walking its animation — which is
 * what a state plan should be.
 */
export const SYLF_COMPOSITIONS: Record<SylfState, SylfComposition> = {
  IDLE: { eyes: "open", blush: false, sparkles: true },
  FOCUSING: { eyes: "focused", blush: false, sparkles: false },
  REST: { eyes: "sleeping", blush: false, sparkles: false },
  CELEBRATING: { eyes: "happy", blush: true, sparkles: true },
  THINKING: { eyes: "focused", blush: false, sparkles: true },
  BLINK: { eyes: "open", blush: false, sparkles: true },
};

/** Total authored duration of the blink, in milliseconds. */
export const BLINK_DURATION_MS = BLINK_FRAMES.reduce(
  (total, frame) => total + frame.durationMs,
  0,
);

/** Gap between automatic blinks while idling, in milliseconds. */
export const DEFAULT_AUTO_BLINK_INTERVAL_MS = 3200;

/**
 * The state a sustained signal holds, and the state it returns to.
 *
 * Named rather than inlined so a surface can express "thinking is over" without
 * knowing what the resting state happens to be.
 */
export const SUSTAINED_STATE: SylfState = "THINKING";
