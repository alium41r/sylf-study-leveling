/**
 * ============================================================================
 * PIXEL DISPLAY — SYLF CHARACTER CONTENT
 * ============================================================================
 * Composes the Sylf companion's planes and owns its state and animation logic.
 *
 * THE COMPOSITION MODEL (doc §13)
 *   A state selects planes; it never replaces the character. Rendering is:
 *
 *     scenery (sparkles, ground) → body → leaves → blush → eyes
 *
 *   Because every plane has its own table, a blink swaps the eye plane and
 *   leaves the body, leaves and blush exactly as authored. That is the property
 *   Phase 2 exists to prove, and it is asserted rather than assumed.
 *
 * THE REPAINT CONTRACT (clarified in Phase 1)
 *   Each `render` is a **full composite**: it clears and repaints the whole
 *   picture from state alone, so nothing depends on what survived the last
 *   frame. Plane-local is a statement about what *differs* between two states,
 *   not about how much is written. The two are different and both are load-bearing.
 *
 * ZERO WORK WHEN SETTLED
 *   `update` returns `true` only while an animation is genuinely running. The
 *   four holding states return `false`, so the runtime settles into `idle` and
 *   the display costs nothing while the companion simply exists.
 * ============================================================================
 */

import { createPixDisplay, type PixDisplay } from "@/lib/pixel-display/engine/display";
import type { PixContent, PixRuntime, PixTimeline } from "@/lib/pixel-display/engine/runtime";
import {
  DEFAULT_AUTO_BLINK_INTERVAL_MS,
  RESTING_STATE,
  SYLF_ANIMATIONS,
  SYLF_COMPOSITIONS,
  type SylfAnimation,
  type SylfComposition,
  type SylfState,
} from "./frames";
import { paintComposition, type ModularComposition } from "@/lib/pixel-display/content/asset/compose";
import { referenceCellRect, type AssetPlacement } from "@/lib/pixel-display/content/asset/paint";
import { assetContentIdentity } from "@/lib/pixel-display/content/asset/identity";
import { SYLF_PALETTE } from "@/lib/pixel-display/content/palette";
import { frameCountOf } from "@/lib/pixel-display/content/asset/resolve";
import { SPARKLES, type EyeShape } from "./sprite";
import {
  EFFECT_HIGHLIGHT,
  bodyPulseIntensity,
  planEffect,
  pulseColor,
  sparkleWaveTable,
  type SylfEffect,
  type SylfEffectPlan,
} from "./effects";
import {
  PLANE_ORDER,
  SYLF_PLANES,
  SYLF_SCENERY,
  cellIndexFromKey,
  createPlaneMapping,
  drawBody,
  selectsPlane,
  type PlaneMapping,
  type SylfPlaneId,
} from "./parts";

export interface SylfContentOptions {
  /** Fraction of the display's short side the character occupies. */
  characterFill?: number;
  /** Explicit editor/static playhead; null restores automatic playback. */
  frame?: number | null;
  /**
   * The state the companion presents.
   *
   * Applied at creation **and** whenever a surface re-declares its options (the
   * React host's `content` prop does this on every change), so a surface names
   * the state it wants rather than setting it once.
   */
  state?: SylfState;
  /** Whether the companion blinks on its own while idling. */
  autoBlink?: boolean;
  /** Milliseconds between automatic blinks. */
  autoBlinkIntervalMs?: number;
  /**
   * An equipped character: a base figure plus attached parts.
   *
   * When present, `render` paints the composition instead of the bare character,
   * which is how an equipped scholar is drawn. Omitted, the character paints
   * itself — so the dev surface, the tests and every existing caller behave
   * exactly as before.
   */
  composition?: ModularComposition | null;
  /**
   * A transient effect layered over `state`.
   *
   * Options rather than a call because a surface declares *what should be
   * happening* and the content works out how. Changing this while mounted starts
   * the new effect; setting it to `null` clears whatever is running.
   */
  effect?: SylfEffect | null;
  /**
   * Whether the *effect* should run in its reduced form.
   *
   * Separate from `autoBlink`, which is a different question entirely: an
   * application may legitimately want a still companion while a reaction still
   * animates, and vice versa.
   */
  reducedMotion?: boolean;
}

/**
 * How one state composes, as a plain description.
 *
 * This is what the dev surface reviews and what tests assert against: it answers
 * "which planes does this state show?" without painting anything.
 */
export interface SylfStatePlan {
  readonly state: SylfState;
  readonly composition: SylfComposition;
  readonly animation: SylfAnimation;
  /** The eye shape currently in force. */
  readonly eyeShape: EyeShape;
  /** The frame index within the active animation. */
  readonly frameIndex: number;
  /** Scenery planes drawn before the character. */
  readonly scenery: readonly string[];
  /** Character planes drawn, in order. */
  readonly planes: readonly SylfPlaneId[];
}

export class SylfCharacterContent implements PixContent {
  readonly id = "sylf-character";

  private readonly display: PixDisplay;
  private readonly runtime: PixRuntime;
  /**
   * A scratch framebuffer used only to measure the silhouette without drawing
   * it. Keeps "where is the body?" answerable for a partial repaint.
   */
  private readonly characterScratch: PixDisplay;

  private characterFill: number;
  private currentState: SylfState;
  private frameIndex = 0;
  private frameElapsed = 0;
  private completedLoops = 0;
  private revision = 0;

  private autoBlink: boolean;
  private autoBlinkIntervalMs: number;
  private sinceLastBlink = 0;

  /** Development-only override; isolates one eye shape for inspection. */
  private eyeShapeOverride: EyeShape | null = null;
  /**
   * Viewer-layer suppression: planes deliberately left unpainted.
   *
   * This lives on the content rather than being applied as a post-render patch,
   * because `render` is a full composite and would immediately paint over any
   * external erasure. Making it content state keeps exactly one definition of
   * what is on screen.
   */
  private suppressed: ReadonlySet<SylfPlaneId> = new Set();

  /**
   * The transient effect currently happening to the character, if any.
   *
   * Not a state: the base state is untouched while an effect plays, so an effect
   * can never leave the companion in a posture the state table does not describe.
   */
  private effect: SylfEffectPlan | null = null;
  private effectFrame = 0;
  private effectElapsed = 0;
  /**
   * Precomputed intensity table for the running sparkle wave.
   *
   * Built once per wave rather than per frame, so the effect allocates nothing
   * while it plays. Bounded by `SPARKLES.length × frameCount`.
   */
  private sparkleTable: readonly (readonly number[])[] | null = null;
  /** The effect a surface last declared, so re-declaring it is a no-op. */
  private declaredEffect: SylfEffect | null = null;
  /** Whether effects should run in their reduced form. */
  private reducedMotion = false;
  /**
   * The equipped composition, when this content is drawing an equipped scholar.
   *
   * `null` means "paint the character on its own", which is the behaviour every
   * phase before this one relied on.
   */
  private composition: ModularComposition | null = null;

  /**
   * The animation frame a composed character is showing.
   *
   * Only ever non-zero for a composition that carries an animation — a scholar's
   * own drawing. Every built-in asset is static and never reaches this code, so
   * the zero-work behaviour of every existing surface is untouched.
   */
  private selectedFrame: number | null = null;
  private animationFrame = 0;
  private animationElapsed = 0;
  private animationCompleted = false;
  /** A frame is due once this timer fires. `null` when nothing is scheduled. */
  private animationTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * How the last composite mapped reference space onto the display, and which of
   * its cells the figure itself occupied — recorded only when that composite was
   * a composition.
   *
   * An effect *modulates* cells the composite has already painted, so it has to
   * address them the way the composite did. The character path and a composition
   * derive their placement differently on purpose (a composition is framed by its
   * own asset), and using the character's mapping over a composition put the
   * acknowledgement pulse on the pedestal's ground and the sparkle wave outside
   * the figure it was supposed to brighten.
   */
  private composedPlacement: AssetPlacement | null = null;
  private composedFigureCells: ReadonlySet<string> = new Set();

  constructor(
    display: PixDisplay,
    runtime: PixRuntime,
    options: SylfContentOptions = {},
  ) {
    this.display = display;
    this.runtime = runtime;
    this.characterScratch = createPixDisplay(display.width, display.height);
    this.characterFill = options.characterFill ?? 0.63;
    this.currentState = options.state ?? RESTING_STATE;
    this.autoBlink = options.autoBlink ?? true;
    this.reducedMotion = options.reducedMotion ?? false;
    this.declaredEffect = options.effect ?? null;
    /*
     * A declared effect is one that is *happening*, so it starts here.
     *
     * Recording it without starting it left the content claiming an effect it
     * never played — and because the declaration was recorded, a later
     * `configure` with the same effect was treated as a repeat and never started
     * it either. A surface that rebuilds its display mid-reaction (changing
     * pixel density does exactly that) therefore lost the reaction's effect.
     */
    if (this.declaredEffect) {
      this.startEffect(this.declaredEffect, this.reducedMotion);
    }
    this.composition = options.composition ?? null;
    this.selectedFrame = options.frame ?? null;
    this.autoBlinkIntervalMs =
      options.autoBlinkIntervalMs ?? DEFAULT_AUTO_BLINK_INTERVAL_MS;
  }

  // ─── Inspection ────────────────────────────────────────────────────────────

  getState(): SylfState {
    return this.currentState;
  }

  getFrameIndex(): number {
    return this.frameIndex;
  }

  getEyeShape(): EyeShape {
    if (this.eyeShapeOverride) return this.eyeShapeOverride;
    const animation = SYLF_ANIMATIONS[this.currentState];
    return animation.frames[this.frameIndex]?.eyes ?? "open";
  }

  getComposition(): SylfComposition {
    return SYLF_COMPOSITIONS[this.currentState];
  }

  getRevision(): number {
    return this.revision;
  }

  getCharacterFill(): number {
    return this.characterFill;
  }

  isAutoBlinkEnabled(): boolean {
    return this.autoBlink;
  }

  getDisplay(): PixDisplay {
    return this.display;
  }

  getRuntime(): PixRuntime {
    return this.runtime;
  }

  /** The declared paint order. Constant, but exposed so tests can pin it. */
  getPlaneOrder(): readonly SylfPlaneId[] {
    return PLANE_ORDER;
  }

  /** A complete description of what the current state composes. */
  plan(): SylfStatePlan {
    const composition = SYLF_COMPOSITIONS[this.currentState];
    return {
      state: this.currentState,
      composition,
      animation: SYLF_ANIMATIONS[this.currentState],
      eyeShape: this.getEyeShape(),
      frameIndex: this.frameIndex,
      scenery: composition.sparkles ? ["sparkles", "ground"] : ["ground"],
      planes: this.effectivePlanes(),
    };
  }

  // ─── Configuration ─────────────────────────────────────────────────────────

  /** Applies presentation and behaviour changes without recreating content. */
  configure(options: SylfContentOptions): void {
    let changed = false;
    /*
     * A declared state is applied to the live content, not only at creation.
     *
     * The React host passes its `content` options through here on every change,
     * so leaving `state` out meant a surface's declared state was honoured once
     * and never again: the dashboard card's celebration attribute changed while
     * the drawing stayed in its opening posture.
     */
    if (options.state !== undefined && options.state !== this.currentState) {
      // A self-triggered blink is the resting state in motion, so re-declaring
      // the resting state must not cut one short. Any other state is a real
      // change and resets the frame table, exactly as `setState` does.
      const blinkInProgress =
        this.currentState === "BLINK" && options.state === RESTING_STATE;
      if (!blinkInProgress) this.setState(options.state);
    }
    if (options.reducedMotion !== undefined && options.reducedMotion !== this.reducedMotion) {
      this.reducedMotion = options.reducedMotion;
      this.cancelAnimationWake();
      if (this.reducedMotion) this.animationFrame = 0;
      changed = true;
    }
    if (options.frame !== undefined && options.frame !== this.selectedFrame) {
      this.selectedFrame = options.frame;
      this.cancelAnimationWake();
      changed = true;
    }
    if (options.composition !== undefined) {
      // Compared by shape rather than identity: a caller that rebuilds an
      // equivalent composition on every render — the dashboard does — must not
      // cause a repaint storm.
      if (!sameComposition(options.composition, this.composition)) {
        // Unequipping or replacing the companion must take its pending wake-up
        // with it, or a timer would fire for an animation that is gone.
        this.cancelAnimationWake();
        this.composition = options.composition;
        this.animationFrame = 0;
        this.animationElapsed = 0;
        this.animationCompleted = false;
        changed = true;
      }
    }
    if (options.effect !== undefined) {
      // Keyed on kind and seed, so re-declaring the same effect on every render
      // does not restart it — which would freeze a running effect on frame one.
      const next = options.effect;
      const same =
        (next === null && this.declaredEffect === null) ||
        (next !== null &&
          this.declaredEffect !== null &&
          next.kind === this.declaredEffect.kind &&
          next.seed === this.declaredEffect.seed);
      if (!same) {
        this.declaredEffect = next;
        if (next) {
          this.startEffect(next, this.reducedMotion);
        } else {
          this.clearEffect();
        }
      }

    }
    if (
      options.characterFill !== undefined &&
      options.characterFill !== this.characterFill
    ) {
      this.characterFill = options.characterFill;
      changed = true;
    }
    if (
      options.autoBlink !== undefined &&
      options.autoBlink !== this.autoBlink
    ) {
      this.autoBlink = options.autoBlink;
      this.sinceLastBlink = 0;
      changed = true;
    }
    if (
      options.autoBlinkIntervalMs !== undefined &&
      options.autoBlinkIntervalMs !== this.autoBlinkIntervalMs
    ) {
      this.autoBlinkIntervalMs = options.autoBlinkIntervalMs;
    }
    if (changed) {
      this.revision += 1;
      this.runtime.requestFrame();
    }
  }

  setCharacterFill(fill: number): void {
    this.configure({ characterFill: fill });
  }

  setAutoBlink(enabled: boolean): void {
    this.configure({ autoBlink: enabled });
  }

  /** Overrides the eye shape until cleared. Development tooling only. */
  setEyeShape(shape: EyeShape | null): void {
    this.eyeShapeOverride = shape;
    this.revision += 1;
  }

  /**
   * Suppresses planes, as a viewer preference rather than an edit to the
   * character. Suppressed planes are simply not painted by the composite.
   */
  setSuppressedPlanes(planes: readonly SylfPlaneId[]): void {
    const next = new Set(planes);
    if (
      next.size === this.suppressed.size &&
      [...next].every((plane) => this.suppressed.has(plane))
    ) {
      return;
    }
    this.suppressed = next;
    this.revision += 1;
    this.runtime.requestFrame();
  }

  /** Planes currently suppressed. */
  getSuppressedPlanes(): readonly SylfPlaneId[] {
    return [...this.suppressed];
  }

  /** Suppressed planes in declared order, for diagnostics and tests. */
  effectivePlanes(): readonly SylfPlaneId[] {
    const plan = SYLF_COMPOSITIONS[this.currentState];
    return PLANE_ORDER.filter(
      (plane) => selectsPlane(plane, plan) && !this.suppressed.has(plane),
    );
  }

  // ─── State ─────────────────────────────────────────────────────────────────

  /**
   * Switches state. A holding state settles immediately; a looping animation
   * restarts from its first frame. Either way the runtime is woken once, and a
   * holding state then falls straight back to `idle`.
   */
  setState(state: SylfState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    this.frameIndex = 0;
    this.frameElapsed = 0;
    this.completedLoops = 0;
    this.revision += 1;
    this.runtime.requestFrame();
  }

  /** Starts the authored blink from its first beat. */
  startBlink(): void {
    this.setState("BLINK");
  }

  /**
   * Starts a transient effect over the current base state.
   *
   * Starting a new effect replaces any effect already running rather than
   * queueing behind it. A queue would make the companion progressively later
   * than the application under a burst of signals, which is worse than dropping
   * a fading acknowledgment.
   */
  startEffect(effect: SylfEffect, reducedMotion = false): void {
    const plan = planEffect(effect, reducedMotion);
    this.effect = plan;
    this.effectFrame = 0;
    this.effectElapsed = 0;
    this.sparkleTable =
      plan.kind === "sparkleWave"
        ? sparkleWaveTable(plan.seed, plan.frameCount)
        : null;
    this.revision += 1;
    this.runtime.requestFrame();
  }

  /** Stops any running effect immediately, without settling the state. */
  clearEffect(): void {
    if (!this.effect) return;
    this.effect = null;
    this.effectFrame = 0;
    this.effectElapsed = 0;
    this.sparkleTable = null;
    this.revision += 1;
    this.runtime.requestFrame();
  }

  /** The running effect, or `null`. */
  getEffect(): SylfEffectPlan | null {
    return this.effect;
  }

  /** Which frame of the running effect is being shown. */
  getEffectFrame(): number {
    return this.effectFrame;
  }

  /** Whether an effect is currently running. */
  isEffectRunning(): boolean {
    return this.effect !== null;
  }

  /**
   * Advances a running effect by one frame.
   *
   * @returns whether the effect still wants frames.
   */
  advanceEffect(deltaMs: number): boolean {
    const effect = this.effect;
    if (!effect) return false;

    this.effectElapsed += deltaMs;
    const frameDuration = effect.durationMs / effect.frameCount;
    if (this.effectElapsed >= frameDuration) {
      this.effectElapsed -= frameDuration;
      const next = this.effectFrame + 1;
      if (next >= effect.frameCount) {
        // The effect is finished. It contributes nothing from here, so clearing
        // it is what allows the runtime to settle to zero work.
        this.effect = null;
        this.effectFrame = 0;
        this.effectElapsed = 0;
        this.sparkleTable = null;
        this.revision += 1;
        return false;
      }
      this.effectFrame = next;
      this.revision += 1;
    }
    return true;
  }

  /** Advances one authored frame and reports whether the table wrapped. */
  advanceFrame(): boolean {
    const animation = SYLF_ANIMATIONS[this.currentState];
    const wrapped = this.frameIndex >= animation.frames.length - 1;
    this.frameIndex = wrapped ? 0 : this.frameIndex + 1;
    this.frameElapsed = 0;
    this.revision += 1;
    return wrapped;
  }

  /**
   * Advances the authored frame table, and triggers a blink on its own while
   * idling.
   *
   * The return value is the runtime's continuation signal and the whole
   * zero-work mechanism: a holding state returns `false` once nothing is
   * animating, so the runtime stops scheduling frames entirely.
   */
  update(timeline: PixTimeline): boolean | void {
    /*
     * An equipped animation is advanced first, and is an independent reason to
     * keep producing frames.
     *
     * This is the Phase 8 exception to zero-work idle, and it is deliberately
     * *not* hidden: frames advance on the authored durations, so a 240 ms frame
     * asks for six frames a second rather than sixty, and a static composition
     * reports no animation at all and costs nothing.
     */
    const animationRunning = this.advanceAnimation(timeline.delta);

    const animation = SYLF_ANIMATIONS[this.currentState];

    // An effect is an independent reason to keep producing frames, so it is
    // advanced first and OR-ed into every return below. Without this a holding
    // state would settle mid-effect and the effect would freeze half-played.
    const effectRunning = this.advanceEffect(timeline.delta);

    if (animation.mode === "hold") {
      // Only the idle posture blinks on its own, and only when enabled.
      if (this.currentState !== RESTING_STATE || !this.autoBlink) {
        return effectRunning || animationRunning;
      }
      this.sinceLastBlink += timeline.delta;
      if (this.sinceLastBlink >= this.autoBlinkIntervalMs) {
        this.sinceLastBlink = 0;
        this.beginLoopingAnimation();
      }
      return this.autoBlink || effectRunning || animationRunning;
    }

    this.frameElapsed += timeline.delta;
    const current = animation.frames[this.frameIndex];
    if (!current) return effectRunning || animationRunning;

    if (this.frameElapsed >= current.durationMs) {
      this.frameElapsed -= current.durationMs;
      const isLastFrame = this.frameIndex >= animation.frames.length - 1;
      if (isLastFrame) {
        this.completedLoops += 1;
        // A limited animation settles on its final beat the moment that beat is
        // reached. Waiting for another frame would leave a frame permanently
        // scheduled, which the zero-work guarantee forbids.
        if (
          animation.loops !== undefined &&
          this.completedLoops >= animation.loops
        ) {
          this.settle();
          return effectRunning || animationRunning;
        }
        this.frameIndex = 0;
      } else {
        this.frameIndex += 1;
      }
      this.revision += 1;
    }

    return true;
  }

  /**
   * Advances an equipped animation by one frame when its duration has elapsed.
   *
   * `once` completes and then reports no work, exactly as a limited authored
   * animation does, so a one-shot emote returns the display to zero work by
   * itself. `loop` keeps asking, which is the cost the roadmap requires to be
   * visible rather than hidden.
   */
  private advanceAnimation(deltaMs: number): boolean {
    if (this.reducedMotion || this.selectedFrame !== null) {
      this.cancelAnimationWake();
      return false;
    }
    const animation = compositionAnimation(this.composition);
    if (!animation || animation.frameCount <= 1) return false;
    if (animation.mode === "once" && this.animationCompleted) return false;

    /*
     * A stopped display does not animate.
     *
     * `stop()` means the display is not being maintained — scrolled out of view,
     * or the tab is in the background — and the whole point of the phase is that
     * nothing runs until something resumes it. A looping animation keeps its own
     * wake-up timer, so without this it would go on waking a display nobody can
     * see: measured at nine frames over three seconds in a hidden tab, on a
     * surface that was supposed to be doing nothing.
     *
     * Dropping the wake-up freezes the drawing where it is. `resume()` sends a
     * frame, the phase is no longer `stopped`, and the cycle carries on from the
     * same frame rather than jumping.
     */
    if (this.runtime.getPhase() === "stopped") {
      this.cancelAnimationWake();
      return false;
    }

    this.animationElapsed += deltaMs;
    const duration = this.animationDurationFor(animation);
    if (this.animationElapsed < duration) {
      /*
       * THE LOOPING-PERFORMANCE RULE, IN ONE RETURN VALUE.
       *
       * A frame's `delta` is the time since the previous frame, so on a 60 Hz
       * display this is called about every 16 ms. An earlier version returned
       * `true` here — "the animation is not finished" — which asked the runtime
       * for another frame *immediately*, and a 400 ms frame produced six hundred
       * frames of work to hold one picture.
       *
       * Returning `false` lets the runtime settle into idle, and the scheduled
       * timer below wakes it again when the frame is genuinely due. Measured on
       * the real dashboard: a two-frame loop at 400/240 ms went from ~60 frames a
       * second to ~0.2, with the same pixels on screen.
       */
      this.scheduleAnimationWake(duration - this.animationElapsed);
      return false;
    }

    this.animationElapsed -= duration;
    const next = this.animationFrame + 1;
    if (next >= animation.frameCount) {
      this.animationFrame = 0;
      if (animation.mode === "once") {
        // Park on the last frame so a one-shot animation holds its final pose
        // rather than snapping back to the first.
        this.animationFrame = animation.frameCount - 1;
        this.animationCompleted = true;
        this.revision += 1;
        return false;
      }
    } else {
      this.animationFrame = next;
    }
    this.revision += 1;
    // One frame of work, then rest until the next is due.
    this.scheduleAnimationWake(this.animationDurationFor(animation));
    return false;
  }

  /** The current frame's authored duration, with a sane fallback. */
  private animationDurationFor(animation: {
    readonly durationsMs: readonly number[];
  }): number {
    return (
      animation.durationsMs[this.animationFrame] ??
      animation.durationsMs[0] ??
      240
    );
  }

  /**
   * Wake the runtime when the next frame is due.
   *
   * A timer rather than a stream of requested frames, because holding a picture
   * is not work. Cleared on every stop and on teardown, so a paused, unequipped
   * or disposed animation leaves nothing scheduled.
   */
  private scheduleAnimationWake(afterMs: number): void {
    if (this.animationTimer !== null) return;
    const delay = Math.max(16, Math.round(afterMs));
    this.animationTimer = setTimeout(() => {
      this.animationTimer = null;
      // Not `requestFrame()`: a suspension must not be undone by an animation
      // waking a display nobody can see.
      this.runtime.requestFrameFromContent();
    }, delay);
  }

  /** Stops any scheduled animation wake-up. */
  private cancelAnimationWake(): void {
    if (this.animationTimer === null) return;
    clearTimeout(this.animationTimer);
    this.animationTimer = null;
  }

  /** Restarts a one-shot animation from its first frame. */
  restartAnimation(): void {
    this.cancelAnimationWake();
    this.animationFrame = 0;
    this.animationElapsed = 0;
    this.animationCompleted = false;
    this.revision += 1;
    this.runtime.requestFrame();
  }

  private beginLoopingAnimation(): void {
    this.currentState = "BLINK";
    this.frameIndex = 0;
    this.frameElapsed = 0;
    this.completedLoops = 0;
    this.revision += 1;
  }

  /** Returns a finished animation to the resting posture. */
  private settle(): void {
    this.currentState = RESTING_STATE;
    this.frameIndex = 0;
    this.frameElapsed = 0;
    this.completedLoops = 0;
    this.sinceLastBlink = 0;
    this.revision += 1;
  }

  // ─── Painting ──────────────────────────────────────────────────────────────

  /**
   * Paints one plane on its own.
   *
   * This exists so composition is directly observable: painting `eyes` after a
   * full render changes only eye cells, and a test can prove the body, leaves
   * and blush are untouched. It is also how the dev surface isolates planes.
   */
  paintPlane(plane: SylfPlaneId): void {
    const plan = SYLF_COMPOSITIONS[this.currentState];
    const mapping = createPlaneMapping(this.display, this.characterFill);
    // Painting a face plane on its own still needs the silhouette to clip to,
    // so the body is measured first even when it is not painted.
    const silhouette = drawBody(this.characterScratch, mapping);
    SYLF_PLANES[plane](this.display, {
      mapping,
      eyes: this.getEyeShape(),
      plan,
      silhouette,
    });
  }

  /** Paints the character's planes in order, without clearing first. */
  paintCharacter(): void {
    const plan = SYLF_COMPOSITIONS[this.currentState];
    const mapping = createPlaneMapping(this.display, this.characterFill);
    // The body records the silhouette; the planes that sit on the character
    // clip to it, so a face plane can never land beside the figure.
    let silhouette: ReadonlySet<number> | undefined;
    for (const plane of PLANE_ORDER) {
      if (!selectsPlane(plane, plan)) continue;
      if (this.suppressed.has(plane)) continue;
      if (plane === "body") {
        silhouette = drawBody(this.display, mapping);
        continue;
      }
      SYLF_PLANES[plane](this.display, {
        mapping,
        eyes: this.getEyeShape(),
        plan,
        silhouette,
      });
    }
  }

  /**
   * Paints the scenery planes the current state asks for, without clearing.
   * Exposed so an editor or a partial repaint can reproduce the full composite.
   */
  paintScenery(): void {
    const composition = SYLF_COMPOSITIONS[this.currentState];
    const mapping = createPlaneMapping(this.display, this.characterFill);
    if (composition.sparkles) SYLF_SCENERY.sparkles(this.display, mapping);
    SYLF_SCENERY.ground(this.display, mapping);
  }

  /**
   * A full composite: the framebuffer is repainted from state alone.
   *
   * This is the only definition of the composite. Scenery goes down first so the
   * character sits in front of it, then the planes the state actually selects, in
   * declared order. Every other painting entry point defers to these helpers, so
   * there is no second opinion about what a state shows.
   */
  render(): void {
    this.display.clear();

    if (this.composition) {
      // The composition owns the whole picture: ground, figure, worn content,
      // aura and grip content. The character's own planes are what the base asset
      // contributes, so there is no second paint path to keep in step.
      //
      // The content's state is passed explicitly: the base asset describes the
      // same six states, and a composition that painted the asset's *first* state
      // meant a celebrating companion was drawn resting.
      const composed = paintComposition(this.display, this.composition, {
        frame: this.selectedFrame ?? this.animationFrame,
        state: this.currentState,
      });
      // Recorded for the effects, which address what this call painted.
      this.composedPlacement = composed.placement;
      this.composedFigureCells = composed.silhouette;
    } else {
      this.composedPlacement = null;
      this.composedFigureCells = EMPTY_CELLS;
      this.paintScenery();
      this.paintCharacter();
    }

    this.paintEffect();
  }

  /** The equipped composition being drawn, or `null` when unequipped. */
  getComposedCharacter(): ModularComposition | null {
    return this.composition;
  }

  /** Which frame of the equipped animation is showing. */
  getAnimationFrame(): number {
    return this.selectedFrame ?? this.animationFrame;
  }

  /**
   * The animation on the equipped composition, if it has one.
   *
   * Read from the content rather than configured, so a surface cannot leave the
   * display playing a frame table that no longer matches what it is drawing.
   */
  getComposedAnimation(): {
    readonly mode: "once" | "loop";
    readonly frameCount: number;
    readonly durationsMs: readonly number[];
  } | null {
    return compositionAnimation(this.composition);
  }

  // ─── Effects ───────────────────────────────────────────────────────────────

  /**
   * Applies the running effect to cells the composite has already painted.
   *
   * Effects post-process rather than paint. That is what keeps the flat-plane
   * model sufficient: an effect has no planes, no paint order and no z-index —
   * it modulates what is already there, so it can never invent geometry or
   * change what a state means.
   *
   * Both branches iterate a bounded, known set of cells: the authored sparkle
   * table, or the body's own cells. Neither grows with elapsed time.
   */
  private paintEffect(): void {
    const effect = this.effect;
    if (!effect) return;

    if (effect.kind === "sparkleWave") {
      this.paintSparkleWave();
      return;
    }
    this.paintBodyPulse();
  }

  /**
   * Lights the authored sparkles in a travelling wave.
   *
   * The positions are the ones the scenery plane already uses — an effect
   * brightens existing cells rather than adding new ones, so a wave can never
   * put light somewhere the character's ambience does not reach.
   */
  private paintSparkleWave(): void {
    if (this.composition?.base.id.startsWith("user:")) { this.paintBodyPulse(); return; }
    const table = this.sparkleTable;
    if (!table) return;
    const row = table[this.effectFrame];
    if (!row) return;

    const placement = this.composedPlacement;
    if (placement) {
      for (let index = 0; index < SPARKLES.length; index += 1) {
        const intensity = row[index] ?? 0;
        if (intensity <= 0) continue;
        const sparkle = SPARKLES[index];
        // A composition paints each reference cell with its own placement, so
        // the wave addresses exactly the cells the ambience plane painted.
        this.paintReferenceCell(
          placement,
          sparkle.x,
          sparkle.y,
          pulseColor(sparkle.color, intensity, EFFECT_HIGHLIGHT),
        );
      }
      return;
    }

    const mapping = createPlaneMapping(this.display, this.characterFill);
    for (let index = 0; index < SPARKLES.length; index += 1) {
      const intensity = row[index] ?? 0;
      if (intensity <= 0) continue;
      const sparkle = SPARKLES[index];
      this.display.setPixel(
        mapping.toX(sparkle.x),
        mapping.toY(sparkle.y),
        pulseColor(sparkle.color, intensity, EFFECT_HIGHLIGHT),
      );
    }
  }

  /**
   * Lifts the character's own body tone briefly, then settles.
   *
   * Uses the cells the figure actually painted, so the pulse cannot spill outside
   * it — nor reach the ground, which a composition paints and the figure does not.
   *
   * Preserve Sylf's eye ink so the face stays readable. User drawings retain
   * their occupied mask; no arbitrary color is treated as an invented eye role.
   */
  private paintBodyPulse(): void {
    const intensity = bodyPulseIntensity(
      this.effectFrame,
      this.effect?.frameCount ?? 0,
    );
    if (intensity <= 0) return;

    const placement = this.composedPlacement;
    if (placement) {
      for (const key of this.composedFigureCells) {
        const comma = key.indexOf(",");
        const referenceX = Number(key.slice(0, comma));
        const referenceY = Number(key.slice(comma + 1));
        const rect = referenceCellRect(placement, referenceX, referenceY);
        for (let dy = 0; dy < rect.height; dy += 1) {
          for (let dx = 0; dx < rect.width; dx += 1) {
            this.pulseCell(rect.x + dx, rect.y + dy, intensity);
          }
        }
      }
      return;
    }

    const mapping = createPlaneMapping(this.display, this.characterFill);
    const silhouette = drawBody(this.characterScratch, mapping);
    const width = this.display.width;
    for (const key of silhouette) {
      // `cellKey` is a byte offset, so it is divided by the four bytes a cell
      // occupies. Treating it as a cell index silently addressed a quarter of
      // the figure — which is why the first version of this effect changed
      // nothing on screen.
      const cell = cellIndexFromKey(key);
      const x = cell % width;
      const y = Math.floor(cell / width);
      this.pulseCell(x, y, intensity);
    }
  }

  /** Blends one already-painted cell toward the effect highlight. */
  private pulseCell(x: number, y: number, intensity: number): void {
    const current = this.display.getPixel(x, y);
    if ((current & 0xff) === 0) return;
    if ((!this.composition || this.composition.base.id === "sylf:sylf-character") && current === SYLF_PALETTE.eye) return;
    this.display.setPixel(x, y, pulseColor(current, intensity, EFFECT_HIGHLIGHT));
  }

  /** Paints the logical cells one reference cell covers. */
  private paintReferenceCell(
    placement: AssetPlacement,
    referenceX: number,
    referenceY: number,
    color: number,
  ): void {
    const rect = referenceCellRect(placement, referenceX, referenceY);
    for (let dy = 0; dy < rect.height; dy += 1) {
      for (let dx = 0; dx < rect.width; dx += 1) {
        const current = this.display.getPixel(rect.x + dx, rect.y + dy);
        if ((current & 0xff) !== 0) this.display.setPixel(rect.x + dx, rect.y + dy, color);
      }
    }
  }

}

/** Shared empty set, so the character path allocates nothing per frame. */
const EMPTY_CELLS: ReadonlySet<string> = new Set();

/**
 * Whether two compositions would paint the same thing.
 *
 * Compares the base, the state, and each part's slot/asset/state — everything
 * that affects the picture — and nothing else. Identity comparison would repaint
 * on every render for a caller that rebuilds its composition, which on the
 * dashboard is every render.
 */
/**
 * The animation a composition carries, if any.
 *
 * Looked for on the base first, then on any part, so a scholar's drawing animates
 * wherever it is equipped. Returns `null` for every built-in asset, which is what
 * keeps the zero-work path unchanged for everything that does not move.
 */
function compositionAnimation(
  composition: ModularComposition | null,
): {
  readonly mode: "once" | "loop";
  readonly frameCount: number;
  readonly durationsMs: readonly number[];
} | null {
  if (!composition) return null;
  const assets = [composition.base, ...composition.parts.map((p) => p.asset)];
  for (const asset of assets) {
    if (!asset.animation) continue;
    for (const plane of asset.planes) {
      if (plane.geometry?.geometry !== "animated") continue;
      const frameCount = frameCountOf(plane.geometry);
      if (frameCount <= 1) continue;
      const durations = asset.animation.frameDurationsMs;
      return {
        mode: asset.animation.mode,
        frameCount,
        durationsMs: durations.length === 1
          ? Array.from({ length: frameCount }, () => durations[0])
          : durations,
      };
    }
  }
  return null;
}

function sameComposition(
  a: ModularComposition | null | undefined,
  b: ModularComposition | null | undefined,
): boolean {
  if (!a || !b) return !a === !b;
  if (assetContentIdentity(a.base) !== assetContentIdentity(b.base)) return false;
  if (a.baseState !== b.baseState) return false;
  if (a.parts.length !== b.parts.length) return false;
  return a.parts.every((part, index) => {
    const other = b.parts[index];
    return (
      part.slot === other.slot &&
      assetContentIdentity(part.asset) === assetContentIdentity(other.asset) &&
      part.state === other.state
    );
  });
}

/** Convenience factory used by the dev surface. */
export function createSylfContent(
  display: PixDisplay,
  runtime: PixRuntime,
  options?: SylfContentOptions,
): SylfCharacterContent {
  return new SylfCharacterContent(display, runtime, options);
}

export type { SylfState, EyeShape, SylfPlaneId, PlaneMapping };
