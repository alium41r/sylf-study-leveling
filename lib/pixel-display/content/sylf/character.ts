/** The Pixel Display plays explicitly supplied artwork. No character is built in.
 * The legacy class name remains for existing React hosts and reaction adapters. */
import type { PixDisplay } from '../../engine/display';
import type { PixContent, PixRuntime, PixTimeline } from '../../engine/runtime';
import { RESTING_STATE, type SylfState } from './frames';
import { paintComposition, type ModularComposition } from '../asset/compose';
import { referenceCellRect, type AssetPlacement } from '../asset/paint';
import { assetContentIdentity } from '../asset/identity';
import { frameCountOf } from '../asset/resolve';
import { EFFECT_HIGHLIGHT, bodyPulseIntensity, planEffect, pulseColor, type SylfEffect, type SylfEffectPlan } from './effects';

export interface SylfContentOptions {
  /** Legacy presentation options; explicit compositions own their framing. */
  characterFill?: number;
  autoBlink?: boolean;
  autoBlinkIntervalMs?: number;
  frame?: number | null;
  state?: SylfState;
  composition?: ModularComposition | null;
  effect?: SylfEffect | null;
  reducedMotion?: boolean;
}

export class SylfCharacterContent implements PixContent {
  readonly id = 'pixel-artwork';
  private currentState: SylfState;
  private revision = 0;
  private composition: ModularComposition | null;
  private selectedFrame: number | null;
  private reducedMotion: boolean;
  private effect: SylfEffectPlan | null = null;
  private effectFrame = 0;
  private effectElapsed = 0;
  private declaredEffect: SylfEffect | null;
  private animationFrame = 0;
  private animationElapsed = 0;
  private animationCompleted = false;
  private animationTimer: ReturnType<typeof setTimeout> | null = null;
  private composedPlacement: AssetPlacement | null = null;
  private composedFigureCells: ReadonlySet<string> = new Set();

  constructor(private readonly display: PixDisplay, private readonly runtime: PixRuntime, options: SylfContentOptions = {}) {
    this.currentState = options.state ?? RESTING_STATE;
    this.composition = options.composition ?? null;
    this.selectedFrame = options.frame ?? null;
    this.reducedMotion = options.reducedMotion ?? false;
    this.declaredEffect = options.effect ?? null;
    if (this.declaredEffect) this.startEffect(this.declaredEffect, this.reducedMotion);
  }

  getState(): SylfState { return this.currentState; }
  getRevision(): number { return this.revision; }
  getDisplay(): PixDisplay { return this.display; }
  getRuntime(): PixRuntime { return this.runtime; }
  setState(state: SylfState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    this.revision += 1;
    this.runtime.requestFrame();
  }
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
      this.setState(options.state);
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
    if (changed) {
      this.revision += 1;
      this.runtime.requestFrame();
    }
  }
  startEffect(effect: SylfEffect, reducedMotion = false): void {
    const plan = planEffect(effect, reducedMotion);
    this.effect = plan;
    this.effectFrame = 0;
    this.effectElapsed = 0;
    this.revision += 1;
    this.runtime.requestFrame();
  }

  clearEffect(): void {
    if (!this.effect) return;
    this.effect = null;
    this.effectFrame = 0;
    this.effectElapsed = 0;
    this.revision += 1;
    this.runtime.requestFrame();
  }

  getEffect(): SylfEffectPlan | null {
    return this.effect;
  }

  getEffectFrame(): number {
    return this.effectFrame;
  }

  isEffectRunning(): boolean {
    return this.effect !== null;
  }

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
            this.revision += 1;
        return false;
      }
      this.effectFrame = next;
      this.revision += 1;
    }
    return true;
  }

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

  private animationDurationFor(animation: {
    readonly durationsMs: readonly number[];
  }): number {
    return (
      animation.durationsMs[this.animationFrame] ??
      animation.durationsMs[0] ??
      240
    );
  }

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

  private cancelAnimationWake(): void {
    if (this.animationTimer === null) return;
    clearTimeout(this.animationTimer);
    this.animationTimer = null;
  }

  restartAnimation(): void {
    this.cancelAnimationWake();
    this.animationFrame = 0;
    this.animationElapsed = 0;
    this.animationCompleted = false;
    this.revision += 1;
    this.runtime.requestFrame();
  }

  getComposedCharacter(): ModularComposition | null {
    return this.composition;
  }

  getAnimationFrame(): number {
    return this.selectedFrame ?? this.animationFrame;
  }

  getComposedAnimation(): {
    readonly mode: "once" | "loop";
    readonly frameCount: number;
    readonly durationsMs: readonly number[];
  } | null {
    return compositionAnimation(this.composition);
  }

  update(timeline: PixTimeline): boolean {
    this.advanceAnimation(timeline.delta);
    return this.advanceEffect(timeline.delta);
  }

  render(): void {
    this.display.clear();
    if (!this.composition) return;
    const composed = paintComposition(this.display, this.composition, {
      frame: this.selectedFrame ?? this.animationFrame, state: this.currentState,
    });
    this.composedPlacement = composed.placement;
    this.composedFigureCells = composed.silhouette;
    if (this.effect) this.paintBodyPulse();
  }

  /** Reactions brighten only the drawing's existing cells; they add no geometry. */
  private paintBodyPulse(): void {
    if (!this.effect || !this.composedPlacement) return;
    const intensity = bodyPulseIntensity(this.effectFrame, this.effect.frameCount);
    if (intensity <= 0) return;
    for (const key of this.composedFigureCells) {
      const comma = key.indexOf(',');
      const x = Number(key.slice(0, comma)), y = Number(key.slice(comma + 1));
      const rect = referenceCellRect(this.composedPlacement, x, y);
      for (let dy = 0; dy < rect.height; dy += 1) {
        for (let dx = 0; dx < rect.width; dx += 1) {
          const px = rect.x + dx, py = rect.y + dy;
          const color = this.display.getPixel(px, py);
          if ((color & 0xff) !== 0) this.display.setPixel(px, py, pulseColor(color, intensity, EFFECT_HIGHLIGHT));
        }
      }
    }
  }
}
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

export type { SylfState };
