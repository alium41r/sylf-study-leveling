import { describe, expect, it } from "vitest";
import {
  SECONDARY_MOTION_LIMITS,
  SecondaryMotion,
  WIND_SPEED_FLOOR,
  WIND_SPEED_FULL,
  windFor,
  type SecondaryMotionPose,
} from "@/app/components/landing/companion/secondary-motion";

const KEYS = Object.keys(
  SECONDARY_MOTION_LIMITS
) as Array<keyof SecondaryMotionPose>;

function travel(
  motion: SecondaryMotion,
  vx: number,
  vy: number,
  seconds: number,
  fps = 60
) {
  for (let frame = 0; frame < seconds * fps; frame++)
    motion.advance(vx, vy, 1 / fps);
  return { ...motion.pose };
}

/** Extreme but legal input: well past any real scroll speed. */
const FAST = 8000;

describe("landing companion secondary motion", () => {
  it("does no work at rest and reuses its pose instead of allocating each frame", () => {
    const motion = new SecondaryMotion();
    const pose = motion.pose;
    expect(motion.advance(0, 0, 1 / 60)).toBe(pose);
    expect(motion.active).toBe(false);
    expect(Object.values(pose).every((offset) => offset === 0)).toBe(true);
    expect(motion.advance(320, 400, 1 / 60)).toBe(pose);
    expect(motion.active).toBe(true);
  });

  it("never exceeds its declared bounds, at any speed or direction", () => {
    const motion = new SecondaryMotion();
    const inputs: Array<[number, number]> = [
      [FAST, FAST],
      [-FAST, -FAST],
      [FAST, -FAST],
      [-FAST, FAST],
      [0, FAST],
      [FAST, 0],
      [0, -FAST],
      [-FAST, 0],
    ];
    for (const [vx, vy] of inputs) {
      const motion2 = new SecondaryMotion();
      for (let frame = 0; frame < 240; frame++) {
        const p = motion2.advance(vx, vy, 1 / 60);
        for (const name of KEYS)
          expect(Math.abs(p[name])).toBeLessThanOrEqual(
            SECONDARY_MOTION_LIMITS[name]
          );
      }
    }
    // A long reversal from a saturated state must also stay bounded.
    for (let frame = 0; frame < 240; frame++) {
      const p = motion.advance(-FAST, -FAST, 1 / 60);
      for (const name of KEYS)
        expect(Math.abs(p[name])).toBeLessThanOrEqual(
          SECONDARY_MOTION_LIMITS[name]
        );
    }
  });

  it("drives every layer hard enough to be perceptible on screen", () => {
    // Guards the actual defect this pass fixed: motion that technically existed
    // but was sub-pixel. Expressed as a fraction of each declared bound so the
    // tuning can move without rewriting the test.
    const steady = travel(new SecondaryMotion(), FAST, FAST, 2);
    const meaningful: Array<keyof SecondaryMotionPose> = [
      "bodyTilt",
      "bodyShift",
      "lowerTilt",
      "capeTilt",
      "capeSkew",
      "capeLeftTilt",
      "ribbonLeftTilt",
      "ribbonRightTilt",
      "haloTilt",
      "starTilt",
    ];
    for (const name of meaningful)
      expect(Math.abs(steady[name])).toBeGreaterThan(
        SECONDARY_MOTION_LIMITS[name] * 0.5
      );
    expect(steady.capeTilt).toBeLessThan(0);
    expect(steady.capeLift).toBeLessThan(0);
    expect(steady.ribbonLeftTilt).toBeLessThan(0);
  });

  it("keeps the cape halves and the halo/star pairs out of lockstep", () => {
    const steady = travel(new SecondaryMotion(), 600, 1200, 2);
    expect(steady.ribbonLeftTilt).not.toBe(steady.ribbonRightTilt);
    expect(steady.capeLeftTilt).not.toBe(steady.capeRightTilt);
    expect(steady.capeLeftSkew).not.toBe(steady.capeRightSkew);
    expect(steady.ribbonLeftLift).not.toBe(steady.ribbonRightLift);
    expect(steady.starY).not.toBe(steady.haloY);
    expect(steady.starX).not.toBe(steady.haloX);
    // The lighter layers must outrun the heavier ones they hang from.
    expect(Math.abs(steady.ribbonLeftTilt)).toBeGreaterThan(
      Math.abs(steady.capeSkew)
    );
    expect(Math.abs(steady.starTilt)).toBeGreaterThan(
      Math.abs(steady.haloTilt)
    );
  });

  it("preserves fabric inertia when direction reverses instead of snapping", () => {
    const motion = new SecondaryMotion();
    const before = travel(motion, 300, 800, 2);
    const first = { ...motion.advance(-300, -800, 1 / 60) };
    expect(first.capeTilt).toBeLessThan(0);
    expect(first.ribbonLeftTilt).toBeLessThan(0);
    // A single frame may only move a small fraction of the layer's own range.
    expect(Math.abs(first.capeTilt - before.capeTilt)).toBeLessThan(
      SECONDARY_MOTION_LIMITS.capeTilt * 0.15
    );
    const later = travel(motion, -300, -800, 0.25);
    expect(later.bodyTilt).toBeLessThan(0);
    expect(later.capeTilt).toBeGreaterThan(0);
    // The ribbon tip crosses later than the cape at the same reversal.
    expect(later.ribbonLeftTilt).toBeLessThan(0);
    const settled = travel(motion, -300, -800, 1.5);
    expect(settled.ribbonLeftTilt).toBeGreaterThan(0);
    expect(settled.ribbonRightTilt).toBeGreaterThan(0);
  });

  it("reacts harder to a sudden reversal than to the same steady speed", () => {
    const steady = new SecondaryMotion();
    travel(steady, 200, 900, 1.2);
    const cruise = { ...steady.pose };
    const reversed = new SecondaryMotion();
    travel(reversed, 200, 900, 1.2);
    // One abrupt change of direction, then hold.
    travel(reversed, -200, -900, 0.12);
    // The cape and ribbon kick back through neutral far enough to overshoot the
    // cruise pose in the opposite direction: that is what reads as inertia.
    expect(reversed.pose.ribbonLeftTilt).toBeLessThan(0);
    expect(Math.abs(reversed.pose.capeSkew - cruise.capeSkew)).toBeGreaterThan(
      Math.abs(cruise.capeSkew) * 0.25
    );
  });

  it("settles after movement stops, then reaches exact rest", () => {
    const motion = new SecondaryMotion();
    travel(motion, 220, 650, 1);
    motion.advance(0, 0, 1 / 60);
    expect(motion.active).toBe(true);
    // Lingering here is deliberate: the light fabric damping gives the layers a
    // visible overshoot-and-settle tail. What matters is that it terminates.
    travel(motion, 0, 0, 6);
    expect(motion.active).toBe(false);
    expect(Object.values(motion.pose).every((offset) => offset === 0)).toBe(
      true
    );
  });

  it("responds consistently across common frame rates", () => {
    const poses = [30, 60, 120].map((fps) => {
      const motion = new SecondaryMotion();
      travel(motion, 220, 600, 0.5, fps);
      return travel(motion, -90, -400, 0.3, fps);
    });
    for (const name of KEYS) {
      expect(Math.abs(poses[0][name] - poses[1][name])).toBeLessThan(
        SECONDARY_MOTION_LIMITS[name] * 0.05
      );
      expect(Math.abs(poses[1][name] - poses[2][name])).toBeLessThan(
        SECONDARY_MOTION_LIMITS[name] * 0.05
      );
    }
  });

  it("caps stalled frames and ignores invalid time without poisoning its springs", () => {
    const stalled = new SecondaryMotion();
    const bounded = new SecondaryMotion();
    expect(stalled.advance(100, 600, 9)).toEqual(
      bounded.advance(100, 600, 0.048)
    );
    const before = { ...stalled.pose };
    expect(stalled.advance(100, 600, Number.NaN)).toEqual(before);
    expect(stalled.advance(100, 600, -1)).toEqual(before);
    stalled.advance(Number.NaN, Number.POSITIVE_INFINITY, 1 / 60);
    expect(Object.values(stalled.pose).every(Number.isFinite)).toBe(true);
  });

  it("resets all lag for hidden, resized, or reduced-motion presentations", () => {
    const motion = new SecondaryMotion();
    travel(motion, 100, 900, 1);
    expect(motion.active).toBe(true);
    const reset = motion.reset();
    expect(reset).toBe(motion.pose);
    expect(motion.active).toBe(false);
    expect(Object.values(reset).every((offset) => offset === 0)).toBe(true);
    expect(motion.advance(0, 0, 1 / 60)).toEqual(reset);
    expect(motion.active).toBe(false);
  });

  it("does not carry acceleration across a reset", () => {
    const motion = new SecondaryMotion();
    travel(motion, 40, 1200, 0.4);
    motion.reset();
    // A reset spring must not inherit the previous run's velocity derivative.
    const after = { ...motion.advance(0, 0, 1 / 60) };
    expect(Object.values(after).every((offset) => offset === 0)).toBe(true);
    expect(motion.active).toBe(false);
  });
});

describe("travel wind", () => {
  it("is entirely absent at rest and below the speed floor", () => {
    expect(windFor(0, 0).intensity).toBe(0);
    expect(windFor(0, WIND_SPEED_FLOOR).intensity).toBe(0);
    expect(windFor(0, WIND_SPEED_FLOOR - 1).intensity).toBe(0);
    expect(windFor(120, 40).intensity).toBe(0);
    expect(windFor(0, 0).direction).toBe(0);
  });

  it("rises with speed and is hard-capped at 1", () => {
    const mid = windFor(0, (WIND_SPEED_FLOOR + WIND_SPEED_FULL) / 2).intensity;
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
    expect(windFor(0, WIND_SPEED_FULL).intensity).toBe(1);
    expect(windFor(0, WIND_SPEED_FULL * 50).intensity).toBe(1);
    expect(windFor(99999, 99999).intensity).toBe(1);
    // Monotonic: more speed can never mean less wind.
    let previous = -1;
    for (let speed = 0; speed <= 4000; speed += 50) {
      const value = windFor(0, speed).intensity;
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });

  it("follows the sign of travel and survives invalid input", () => {
    expect(windFor(0, 600).direction).toBe(1);
    expect(windFor(0, -600).direction).toBe(-1);
    expect(windFor(600, 0).direction).toBe(0);
    const bad = windFor(Number.NaN, Number.POSITIVE_INFINITY);
    expect(Number.isFinite(bad.intensity)).toBe(true);
    expect(bad.intensity).toBeLessThanOrEqual(1);
  });
});
