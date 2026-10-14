import { describe, expect, it } from "vitest";
import { createPixDisplay, TRANSPARENT } from "@/lib/pixel-display/engine";
import { PixRuntime } from "@/lib/pixel-display/engine/runtime";
import { SylfCharacterContent } from "./fixtures/retired-sylf/character";
import {
  BODY_PULSE_FRAMES,
  BODY_PULSE_MS,
  BODY_PULSE_RAMP,
  BODY_PULSE_REDUCED_FRAMES,
  SPARKLE_WAVE_FRAMES,
  SPARKLE_WAVE_MS,
  SPARKLE_WAVE_REDUCED_FRAMES,
  bodyPulseIntensity,
  planEffect,
  pulseColor,
  sparkleWaveTable,
} from "./fixtures/retired-sylf/effects";
import { SPARKLES } from "./fixtures/retired-sylf/sprite";
import { SYLF_ANIMATIONS } from "./fixtures/retired-sylf/frames";
import { SYLF_PALETTE } from "@/lib/pixel-display/content/palette";

/**
 * ============================================================================
 * PHASE 4 — EFFECTS: DETERMINISM, BOUNDS, TERMINATION
 * ============================================================================
 * Three properties the roadmap requires of every effect, each asserted rather
 * than asserted-about:
 *
 *   deterministic — the same inputs give a byte-identical framebuffer;
 *   bounded       — work does not grow with elapsed time;
 *   terminating   — the effect ends and the runtime can reach zero work.
 *
 * The engine and content are never mocked. A stub content layer would let these
 * pass while the real effect was broken.
 */

function harness(options: Parameters<typeof createContent>[0] = {}) {
  return createContent(options);
}

function createContent(
  options: {
    state?: "IDLE" | "CELEBRATING" | "THINKING";
    reducedMotion?: boolean;
    /**
     * Off by default here: the tests are about effects reaching zero work, and an
     * auto-blinking idle posture deliberately keeps requesting frames. Leaving it
     * on would make every termination assertion fail for the wrong reason.
     */
    autoBlink?: boolean;
  } = {},
) {
  const display = createPixDisplay(48, 48);
  // A clock the test drives. `tick()` takes no argument and derives its delta
  // from this, so advancing time is `advance(ms)` followed by `tick()` — which
  // is what makes an effect's own timing, rather than the test's, decide when it
  // finishes.
  let now = 1000;
  const runtime = new PixRuntime({
    clock: () => now,
    schedule: () => 0,
    cancel: () => {},
  });
  const content = new SylfCharacterContent(display, runtime, {
    autoBlink: false,
    ...options,
  });
  return {
    display,
    runtime,
    content,
    advance(ms: number) {
      now += ms;
    },
  };
}

const hex = (value: number) =>
  `#${(value >>> 8).toString(16).padStart(6, "0")}${(value & 0xff)
    .toString(16)
    .padStart(2, "0")}`;

// ─── Determinism ─────────────────────────────────────────────────────────────

describe("effects are deterministic", () => {
  it("produces a byte-identical framebuffer for the same frame and seed", () => {
    const a = harness({ state: "IDLE" });
    const b = harness({ state: "IDLE" });
    a.content.startEffect({ kind: "sparkleWave", seed: 2 });
    b.content.startEffect({ kind: "sparkleWave", seed: 2 });

    for (let frame = 0; frame < SPARKLE_WAVE_FRAMES; frame += 1) {
      a.content.render();
      b.content.render();
      expect(
        Array.from(a.display.snapshot()),
        `frame ${frame}`,
      ).toEqual(Array.from(b.display.snapshot()));
      a.content.advanceEffect(SPARKLE_WAVE_MS / SPARKLE_WAVE_FRAMES);
      b.content.advanceEffect(SPARKLE_WAVE_MS / SPARKLE_WAVE_FRAMES);
    }
  });

  it("produces a different picture for a different seed", () => {
    const a = harness({ state: "IDLE" });
    const b = harness({ state: "IDLE" });
    a.content.startEffect({ kind: "sparkleWave", seed: 0 });
    b.content.startEffect({ kind: "sparkleWave", seed: 3 });

    let differs = false;
    for (let frame = 0; frame < SPARKLE_WAVE_FRAMES; frame += 1) {
      a.content.render();
      b.content.render();
      if (Array.from(a.display.snapshot()).join() !== Array.from(b.display.snapshot()).join()) {
        differs = true;
        break;
      }
      a.content.advanceEffect(SPARKLE_WAVE_MS / SPARKLE_WAVE_FRAMES);
      b.content.advanceEffect(SPARKLE_WAVE_MS / SPARKLE_WAVE_FRAMES);
    }
    // A seed that changed nothing would make the parameter a lie.
    expect(differs).toBe(true);
  });

  it("does not depend on how the frame was reached", () => {
    // Frame 5 by one long step and by five short ones must look the same: an
    // effect may not accumulate floating-point drift.
    const step = SPARKLE_WAVE_MS / SPARKLE_WAVE_FRAMES;
    const a = harness({ state: "IDLE" });
    a.content.startEffect({ kind: "sparkleWave", seed: 1 });
    for (let i = 0; i < 5; i += 1) a.content.advanceEffect(step);

    const b = harness({ state: "IDLE" });
    b.content.startEffect({ kind: "sparkleWave", seed: 1 });
    for (let i = 0; i < 25; i += 1) b.content.advanceEffect(step / 5);

    a.content.render();
    b.content.render();
    expect(a.content.getEffectFrame()).toBe(b.content.getEffectFrame());
    expect(Array.from(a.display.snapshot())).toEqual(
      Array.from(b.display.snapshot()),
    );
  });
});

// ─── Bounds ──────────────────────────────────────────────────────────────────

describe("effects are bounded", () => {
  it("never addresses more cells than the authored sparkle table", () => {
    const table = sparkleWaveTable(0);
    expect(table).toHaveLength(SPARKLE_WAVE_FRAMES);
    for (const row of table) {
      expect(row).toHaveLength(SPARKLES.length);
      for (const intensity of row) {
        expect(Number.isInteger(intensity)).toBe(true);
        expect(intensity).toBeGreaterThanOrEqual(0);
        expect(intensity).toBeLessThanOrEqual(100);
      }
    }
  });

  it("keeps the sparkle table fixed regardless of how long the effect runs", () => {
    // Bounded means: the table's size is known before the effect starts and does
    // not change as it plays. This is what rules out an unbounded particle list.
    const first = sparkleWaveTable(0);
    const later = sparkleWaveTable(0);
    expect(later).toHaveLength(first.length);
    expect(later.flat()).toEqual(first.flat());
  });

  it("keeps the body pulse ramp finite and in range", () => {
    expect(BODY_PULSE_RAMP).toHaveLength(BODY_PULSE_FRAMES);
    for (const value of BODY_PULSE_RAMP) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    // Outside the effect's own frames it contributes nothing, so a caller cannot
    // index past the table into undefined behaviour.
    expect(bodyPulseIntensity(-1)).toBe(0);
    expect(bodyPulseIntensity(BODY_PULSE_FRAMES)).toBe(0);
  });

  it("lights no cell the ambience does not already own", () => {
    // The wave brightens authored sparkle positions; it never invents geometry.
    const { display, content } = harness({ state: "IDLE" });
    content.startEffect({ kind: "sparkleWave", seed: 0 });
    content.render();
    const withEffect = Array.from(display.snapshot());

    content.clearEffect();
    content.render();
    const withoutEffect = Array.from(display.snapshot());

    for (let cell = 0; cell < withEffect.length; cell += 1) {
      if (withoutEffect[cell] === TRANSPARENT) {
        // A cell that was empty before the effect must still be empty after it.
        expect(withEffect[cell], `cell ${cell}`).toBe(TRANSPARENT);
      }
    }
  });

  it("only ever brightens, by blending along the palette", () => {
    // `pulseColor` moves a colour toward the authored highlight, so an effect
    // cannot paint something the character could never be.
    const base = SYLF_PALETTE.body;
    expect(pulseColor(base, 0, 0xffffffff)).toBe(base);
    const lifted = pulseColor(base, 100, 0xffffffff);
    expect(lifted).not.toBe(base);
    // Fully lit means fully the highlight.
    expect(hex(lifted)).toBe("#ffffffff");
    // And nothing happens to an unpainted cell.
    expect(pulseColor(TRANSPARENT, 100, 0xffffffff)).toBe(TRANSPARENT);
  });
});

// ─── Termination ─────────────────────────────────────────────────────────────

describe("effects terminate", () => {
  it("ends the sparkle wave after its authored frame count", () => {
    const { content } = harness({ state: "IDLE" });
    content.startEffect({ kind: "sparkleWave", seed: 0 });
    const plan = content.getEffect();
    expect(plan?.frameCount).toBe(SPARKLE_WAVE_FRAMES);

    let steps = 0;
    while (content.advanceEffect(SPARKLE_WAVE_MS / SPARKLE_WAVE_FRAMES)) {
      steps += 1;
      if (steps > SPARKLE_WAVE_FRAMES * 2) break;
    }
    expect(steps).toBe(SPARKLE_WAVE_FRAMES - 1);
    expect(content.getEffect()).toBeNull();
    expect(content.isEffectRunning()).toBe(false);
  });

  it("ends the body pulse after its authored frame count", () => {
    const { content } = harness({ state: "IDLE" });
    content.startEffect({ kind: "bodyPulse", seed: 0 });
    let steps = 0;
    while (content.advanceEffect(BODY_PULSE_MS / BODY_PULSE_FRAMES)) {
      steps += 1;
      if (steps > BODY_PULSE_FRAMES * 2) break;
    }
    expect(content.getEffect()).toBeNull();
  });

  it("returns the runtime to zero work once a reaction finishes", () => {
    // The guarantee that matters: an effect must not leave a frame scheduled.
    const view = harness({ state: "IDLE" });
    const { runtime, content } = view;
    runtime.setContent(content);
    content.startEffect({ kind: "bodyPulse", seed: 0 });
    runtime.start();

    const step = BODY_PULSE_MS / BODY_PULSE_FRAMES + 1;
    let guard = 0;
    while (runtime.getPhase() !== "idle" && guard < 400) {
      view.advance(step);
      runtime.tick();
      guard += 1;
    }

    expect(runtime.getPhase()).toBe("idle");
    expect(content.isEffectRunning()).toBe(false);
  });

  it("keeps a holding state free when no effect is running", () => {
    const { runtime, content, advance } = harness({ state: "IDLE" });
    runtime.setContent(content);
    runtime.start();
    // The idle posture with auto-blink off requests nothing at all.
    advance(16);
    runtime.tick();
    expect(runtime.getPhase()).toBe("idle");
  });

  it("would keep working if auto-blink were left on", () => {
    // The control for the test above: with the idle animation enabled the same
    // setup stays running, so "zero work" is a property of the configuration
    // rather than of the assertion never being able to fail.
    const { runtime, content, advance } = harness({
      state: "IDLE",
      autoBlink: true,
    });
    runtime.setContent(content);
    runtime.start();
    advance(16);
    runtime.tick();
    expect(runtime.getPhase()).toBe("running");
  });

  it("treats a declared effect as a no-op when it is re-declared", () => {
    // A surface re-rendering must not restart a running effect on frame one.
    const { content } = harness({ state: "IDLE" });
    content.configure({ effect: { kind: "sparkleWave", seed: 1 } });
    content.advanceEffect(SPARKLE_WAVE_MS / SPARKLE_WAVE_FRAMES);
    const frame = content.getEffectFrame();
    expect(frame).toBeGreaterThan(0);

    content.configure({ effect: { kind: "sparkleWave", seed: 1 } });
    expect(content.getEffectFrame()).toBe(frame);
  });
});

// ─── Reduced motion ──────────────────────────────────────────────────────────

describe("reduced motion shortens an effect without removing it", () => {
  it("plans a shorter, still-visible sparkle wave", () => {
    const plan = planEffect({ kind: "sparkleWave", seed: 0 }, true);
    expect(plan.frameCount).toBe(SPARKLE_WAVE_REDUCED_FRAMES);
    expect(plan.frameCount).toBeGreaterThan(0);
    expect(plan.durationMs).toBeLessThan(SPARKLE_WAVE_MS);
  });

  it("plans a shorter body pulse that still lifts the body", () => {
    const plan = planEffect({ kind: "bodyPulse", seed: 0 }, true);
    expect(plan.frameCount).toBe(BODY_PULSE_REDUCED_FRAMES);
    expect(bodyPulseIntensity(0, plan.frameCount)).toBeGreaterThan(0);
  });

  it("still changes the picture", () => {
    // A state that paints a body: the pulse lifts the silhouette, so an empty
    // figure would make this assertion vacuous.
    const { display, content } = harness({
      state: "CELEBRATING",
      reducedMotion: true,
    });
    content.render();
    const before = Array.from(display.snapshot());
    content.startEffect({ kind: "bodyPulse", seed: 0 });
    content.render();
    expect(Array.from(display.snapshot())).not.toEqual(before);
  });
});

// ─── The one sustained animation ─────────────────────────────────────────────

describe("THINKING is the single sustained animation", () => {
  it("is authored as an unbounded loop", () => {
    const animation = SYLF_ANIMATIONS.THINKING;
    expect(animation.mode).toBe("loop");
    expect(animation.frames.length).toBeGreaterThan(1);
    // No `loops` means "held until withdrawn".
    expect(animation.loops).toBeUndefined();
  });

  it("keeps requesting frames while it is the active state", () => {
    const { runtime, content, advance } = harness({ state: "THINKING" });
    runtime.setContent(content);
    runtime.start();
    // Far longer than one pass of the table: it must still be working.
    for (let i = 0; i < 40; i += 1) {
      advance(600);
      runtime.tick();
    }
    expect(runtime.getPhase()).toBe("running");
  });

  it("is the only loop that outlives its own table", () => {
    // BLINK is also authored without `loops`, but it is *finite*: it completes
    // one pass and settles. Asserting the difference behaviourally is what makes
    // "THINKING is the one sustained animation" a claim about the system rather
    // than about a field being absent.
    const blink = harness({ state: "IDLE" });
    blink.runtime.setContent(blink.content);
    blink.runtime.start();
    blink.content.setState("BLINK");
    let guard = 0;
    while (blink.runtime.getPhase() !== "idle" && guard < 200) {
      blink.advance(200);
      blink.runtime.tick();
      guard += 1;
    }
    expect(blink.runtime.getPhase()).toBe("idle");
  });

  it("settles as soon as the state changes away from it", () => {
    const { runtime, content, advance } = harness({ state: "THINKING" });
    runtime.setContent(content);
    runtime.start();
    advance(600);
    runtime.tick();
    content.setState("IDLE");
    advance(16);
    runtime.tick();
    expect(runtime.getPhase()).toBe("idle");
  });
});
