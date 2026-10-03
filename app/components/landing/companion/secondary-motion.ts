/**
 * Local layer offsets only. JourneyPath remains the owner of page coordinates.
 *
 * Angles are degrees, translations are SVG user units, `capeStretch` is a
 * unitless scale delta. SVG user units are deliberately used rather than CSS
 * pixels: the artwork is one 630x865 viewBox scaled to whatever size the
 * landing gives it, so "px" inside the SVG is not a screen pixel. At the
 * desktop journey size (144 CSS px wide) one user unit is about 0.229 CSS px.
 */
export interface SecondaryMotionPose {
  /** Torso bank into the direction of travel. */
  bodyTilt: number;
  /** Small horizontal torso offset that sells the bank. */
  bodyShift: number;
  /**
   * Forward pitch along the travel axis, in degrees, applied as a real 3D
   * rotateX about the figure's middle. Positive brings the head toward the
   * viewer and sends the feet away, so the head reads larger and the legs
   * foreshorten: a uniform squash cannot do that.
   */
  bodyPitch: number;
  /** Lower body follow-through: same idea as bodyTilt, later and softer. */
  lowerTilt: number;
  lowerLift: number;
  /** Cape rotation about its attachment line (kept small: seams). */
  capeTilt: number;
  /** Cape shear about its attachment line. Carries most of the visible swing. */
  capeSkew: number;
  /** Cape rise/drop. Kept small: the torso matte cut this shape out too. */
  capeLift: number;
  /** Cape billow. Clamped to >= 0 so the panel only ever grows outward. */
  capeStretch: number;
  /** Per-side cape asymmetry so the two halves never move as one plate. */
  capeLeftTilt: number;
  capeRightTilt: number;
  capeLeftSkew: number;
  capeRightSkew: number;
  ribbonLeftTilt: number;
  ribbonRightTilt: number;
  ribbonLeftLift: number;
  ribbonRightLift: number;
  haloTilt: number;
  haloX: number;
  haloY: number;
  starTilt: number;
  starX: number;
  starY: number;
}

/** Declared bounds. Tests assert against these instead of magic numbers. */
export const SECONDARY_MOTION_LIMITS: Readonly<SecondaryMotionPose> = {
  bodyTilt: 7.4,
  bodyShift: 6,
  bodyPitch: 13,
  lowerTilt: 5.4,
  lowerLift: 5,
  capeTilt: 3.4,
  capeSkew: 8.5,
  capeLift: 3,
  capeStretch: 0.085,
  capeLeftTilt: 3,
  capeRightTilt: 2.6,
  capeLeftSkew: 3.4,
  capeRightSkew: 2.9,
  ribbonLeftTilt: 14,
  ribbonRightTilt: 12,
  ribbonLeftLift: 7,
  ribbonRightLift: 6,
  haloTilt: 3.4,
  haloX: 5,
  haloY: 4.5,
  starTilt: 5.2,
  starX: 7,
  starY: 6.2,
};

/**
 * Spring tuning. `frequency` is the undamped angular frequency (rad/s) and
 * `damping` is the damping ratio: below 1 overshoots, 1 is critically damped.
 * Fabric layers (cape, ribbons) sit near 0.35-0.5 so they visibly overshoot and
 * catch up late; the torso is stiff and near-critical so it reads as heavy.
 */
const TUNING: Record<
  keyof SecondaryMotionPose,
  { frequency: number; damping: number }
> = {
  bodyTilt: { frequency: 7.4, damping: 0.66 },
  bodyShift: { frequency: 6.6, damping: 0.74 },
  bodyPitch: { frequency: 6, damping: 0.7 },
  lowerTilt: { frequency: 5.2, damping: 0.52 },
  lowerLift: { frequency: 5.6, damping: 0.6 },
  capeTilt: { frequency: 4.6, damping: 0.42 },
  capeSkew: { frequency: 4.2, damping: 0.4 },
  capeLift: { frequency: 4.8, damping: 0.55 },
  capeStretch: { frequency: 4, damping: 0.5 },
  capeLeftTilt: { frequency: 4, damping: 0.5 },
  capeRightTilt: { frequency: 3.6, damping: 0.55 },
  capeLeftSkew: { frequency: 3.8, damping: 0.52 },
  capeRightSkew: { frequency: 3.4, damping: 0.57 },
  ribbonLeftTilt: { frequency: 3.4, damping: 0.44 },
  ribbonRightTilt: { frequency: 3.05, damping: 0.47 },
  ribbonLeftLift: { frequency: 3.4, damping: 0.45 },
  ribbonRightLift: { frequency: 3, damping: 0.48 },
  haloTilt: { frequency: 3, damping: 0.7 },
  haloX: { frequency: 3, damping: 0.7 },
  haloY: { frequency: 3, damping: 0.7 },
  starTilt: { frequency: 4.2, damping: 0.5 },
  starX: { frequency: 4.2, damping: 0.5 },
  starY: { frequency: 4.2, damping: 0.5 },
};

/** Seconds. Low-pass time constant for the acceleration signal. */
const ACCEL_TAU = 0.06;
/** px/s^2 that maps to roughly 0.76 of the saturating impulse range. */
const ACCEL_SCALE = 9000;
/** Below this the impulse can no longer move any spring; treated as rest. */
const ACCEL_EPSILON = ACCEL_SCALE * 1e-4;
/**
 * Lateral acceleration maps to a bank-in on turns. Deliberately a smaller
 * divisor than ACCEL_SCALE so a bend in the journey path saturates the turn
 * bank readily: turning is the most readable thing the body does.
 */
const TURN_SCALE = 4200;

/**
 * Wind streaks are environmental, not part of the character, so they are a
 * plain function of travel speed rather than a spring. The floor is set well
 * above any idle drift, so a resting page produces no wind at all; the ceiling
 * is a hard cap on intensity, and the streak count itself is a fixed, small
 * constant in the artwork.
 */
export const WIND_SPEED_FLOOR = 200;
export const WIND_SPEED_FULL = 1100;

export interface WindState {
  /** 0 at rest, 1 at or above `WIND_SPEED_FULL`. Never exceeds 1. */
  intensity: number;
  /** Sign of travel along the page: 1 downward, -1 upward, 0 stopped. */
  direction: 1 | -1 | 0;
  speed: number;
}

export function windFor(vx: number, vy: number): WindState {
  const x = Number.isFinite(vx) ? vx : 0;
  const y = Number.isFinite(vy) ? vy : 0;
  const speed = Math.hypot(x, y);
  const intensity = Math.max(
    0,
    Math.min(
      1,
      (speed - WIND_SPEED_FLOOR) / (WIND_SPEED_FULL - WIND_SPEED_FLOOR)
    )
  );
  return { intensity, direction: y > 1 ? 1 : y < -1 ? -1 : 0, speed };
}
const MAX_STEP = 0.048;
const SUBSTEP = 1 / 120;

class Spring {
  value = 0;
  velocity = 0;
  /** Settle thresholds scale with the bound so big layers are not pinned awake. */
  private readonly restValue: number;
  private readonly restVelocity: number;

  constructor(
    private readonly frequency: number,
    private readonly damping: number,
    private readonly limit: number
  ) {
    // Thresholds are a small fraction of the layer's own range, so they stay
    // perceptually invisible while still letting the travel RAF park. The light
    // fabric damping makes the tail longer than the old tuning by design.
    this.restValue = limit * 0.015;
    this.restVelocity = limit * 0.06;
  }

  advance(target: number, seconds: number) {
    const acceleration =
      this.frequency ** 2 * (target - this.value) -
      2 * this.damping * this.frequency * this.velocity;
    this.velocity += acceleration * seconds;
    this.value += this.velocity * seconds;
    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) {
      this.reset();
      return 0;
    }
    if (Math.abs(this.value) > this.limit) {
      this.value = Math.sign(this.value) * this.limit;
      if (this.value * this.velocity > 0) this.velocity = 0;
    }
    if (
      target === 0 &&
      Math.abs(this.value) < this.restValue &&
      Math.abs(this.velocity) < this.restVelocity
    ) {
      this.reset();
    }
    return this.value;
  }

  get active() {
    return this.value !== 0 || this.velocity !== 0;
  }

  reset() {
    this.value = 0;
    this.velocity = 0;
  }
}

/**
 * Scroll-driven secondary motion, with no clock, timer, or rendering dependency.
 * Call from the existing travel RAF using actual CSS px/s velocity and seconds.
 * Continue that RAF while `active` is true, then stop. CSS owns the ambient idle.
 * Reset when hidden, offscreen, resized, or reduced motion becomes active.
 *
 * The returned pose is reused to avoid per-frame allocations; copy it only when
 * retaining a past sample.
 */
export class SecondaryMotion {
  readonly pose: SecondaryMotionPose = {
    bodyTilt: 0,
    bodyShift: 0,
    bodyPitch: 0,
    lowerTilt: 0,
    lowerLift: 0,
    capeTilt: 0,
    capeSkew: 0,
    capeLift: 0,
    capeStretch: 0,
    capeLeftTilt: 0,
    capeRightTilt: 0,
    capeLeftSkew: 0,
    capeRightSkew: 0,
    ribbonLeftTilt: 0,
    ribbonRightTilt: 0,
    ribbonLeftLift: 0,
    ribbonRightLift: 0,
    haloTilt: 0,
    haloX: 0,
    haloY: 0,
    starTilt: 0,
    starX: 0,
    starY: 0,
  };
  active = false;

  private readonly keys = Object.keys(
    SECONDARY_MOTION_LIMITS
  ) as Array<keyof SecondaryMotionPose>;
  private readonly springs = Object.fromEntries(
    this.keys.map((key) => [
      key,
      new Spring(
        TUNING[key].frequency,
        TUNING[key].damping,
        SECONDARY_MOTION_LIMITS[key]
      ),
    ])
  ) as Record<keyof SecondaryMotionPose, Spring>;
  private readonly springList = this.keys.map((key) => this.springs[key]);
  private lastVx = 0;
  private lastVy = 0;
  private accelX = 0;
  private accelY = 0;

  advance(vx: number, vy: number, dt: number): SecondaryMotionPose {
    if (!Number.isFinite(dt) || dt <= 0) return this.pose;
    const x = Number.isFinite(vx) ? vx : 0;
    const y = Number.isFinite(vy) ? vy : 0;
    const duration = Math.min(dt, MAX_STEP);
    // Soft saturation keeps fast desktop scrolls as restrained as mobile ones.
    const horizontal = Math.tanh(x / 380);
    const vertical = Math.tanh(y / 560);
    const direction = Math.tanh(x / 380 + y / 900);

    // Change in velocity, low-passed with a time constant so the impulse is
    // frame-rate independent and does not chatter on rAF jitter. A hard
    // direction reversal saturates it; steady travel leaves it near zero.
    const blend = 1 - Math.exp(-duration / ACCEL_TAU);
    this.accelX += ((x - this.lastVx) / duration - this.accelX) * blend;
    this.accelY += ((y - this.lastVy) / duration - this.accelY) * blend;
    this.lastVx = x;
    this.lastVy = y;
    // An exponential decay never actually reaches zero, and any non-zero
    // impulse keeps `active` true, which would stop the travel RAF from ever
    // parking. Snap to rest well below the level that can move a spring.
    if (Math.abs(this.accelX) < ACCEL_EPSILON) this.accelX = 0;
    if (Math.abs(this.accelY) < ACCEL_EPSILON) this.accelY = 0;
    const impulse =
      Math.tanh(this.accelY / ACCEL_SCALE) * 0.9 +
      Math.tanh(this.accelX / ACCEL_SCALE) * 0.45;
    // How hard the path is currently bending. Steady diagonal travel leaves this
    // near zero and banks only through `horizontal` below; a genuine turn spikes
    // it, which is what makes the body lean into the corner.
    const turn = Math.tanh(this.accelX / TURN_SCALE);

    const steps = Math.ceil(duration / SUBSTEP);
    const seconds = duration / steps;
    const s = this.springs;
    const p = this.pose;

    for (let step = 0; step < steps; step++) {
      p.bodyTilt = s.bodyTilt.advance(
        direction * 3.6 + horizontal * 2.6 + turn * 3.4 + impulse * 0.6,
        seconds
      );
      p.bodyShift = s.bodyShift.advance(
        horizontal * 5 + turn * 2.2 + impulse * 1.2,
        seconds
      );
      // Faster travel leans further into it, and a turn adds a little more.
      // The sign matters: a NEGATIVE rotateX brings the head toward the viewer,
      // while a positive angle tips the bottom forward and shrinks the head.
      p.bodyPitch = s.bodyPitch.advance(
        -vertical * 10 - Math.abs(turn) * 1.8,
        seconds
      );
      // Lower body lags the torso: softer springs on the same signal, including
      // the turn bank, so the hips swing through the corner after the chest.
      p.lowerTilt = s.lowerTilt.advance(
        direction * 3.2 + horizontal * 2.2 + turn * 3 + impulse * 1.1,
        seconds
      );
      p.lowerLift = s.lowerLift.advance(-vertical * 3.8, seconds);

      // Cape. Rotation stays small because the torso matte cut this exact
      // shape out; shear and outward billow carry the visible movement.
      p.capeTilt = s.capeTilt.advance(
        -direction * 2.9 - impulse * 1.3 + turn * 1.5,
        seconds
      );
      p.capeSkew = s.capeSkew.advance(
        -direction * 7 - impulse * 3.2 + turn * 3.2,
        seconds
      );
      p.capeLift = s.capeLift.advance(-vertical * 2.4 - impulse * 1.1, seconds);
      // Only ever billows outward, so the panel cannot open a gap behind it.
      p.capeStretch = s.capeStretch.advance(
        Math.max(0, vertical) * 0.07 + Math.max(0, impulse) * 0.02,
        seconds
      );
      // Fabric tips trail the panel rather than turning with it.
      const trailingDirection =
        direction * 0.35 - (p.capeTilt / SECONDARY_MOTION_LIMITS.capeTilt) * 0.65;
      p.capeLeftTilt = s.capeLeftTilt.advance(
        -trailingDirection * 2.6 - impulse * 0.9 + turn * 1.3,
        seconds
      );
      p.capeRightTilt = s.capeRightTilt.advance(
        -trailingDirection * 2.2 - impulse * 0.7 + turn * 1,
        seconds
      );
      p.capeLeftSkew = s.capeLeftSkew.advance(
        -trailingDirection * 3.1 - impulse * 1.1 + turn * 1.5,
        seconds
      );
      p.capeRightSkew = s.capeRightSkew.advance(
        -trailingDirection * 2.6 - impulse * 0.9 + turn * 1.2,
        seconds
      );

      // Ribbons are the liveliest layer: lightest springs, biggest travel,
      // and a kick on acceleration that the cape only partly shares.
      p.ribbonLeftTilt = s.ribbonLeftTilt.advance(
        -trailingDirection * 12.5 - impulse * 4.4 + turn * 3.4,
        seconds
      );
      p.ribbonRightTilt = s.ribbonRightTilt.advance(
        -trailingDirection * 10.8 - impulse * 3.6 + turn * 2.7,
        seconds
      );
      p.ribbonLeftLift = s.ribbonLeftLift.advance(
        -vertical * 6 - impulse * 2.2,
        seconds
      );
      p.ribbonRightLift = s.ribbonRightLift.advance(
        -vertical * 5.1 - impulse * 1.8,
        seconds
      );

      // Halo is heavy and slow; star is lighter and more playful.
      p.haloTilt = s.haloTilt.advance(-direction * 3 - impulse * 0.9, seconds);
      p.haloX = s.haloX.advance(
        -horizontal * 4.4 - impulse * 1.4 + turn * 1.6,
        seconds
      );
      p.haloY = s.haloY.advance(-vertical * 3.8 - impulse * 1.2, seconds);
      p.starTilt = s.starTilt.advance(-direction * 4.6 - impulse * 2.6, seconds);
      p.starX = s.starX.advance(
        -horizontal * 6.2 - impulse * 2.8 + turn * 2.2,
        seconds
      );
      p.starY = s.starY.advance(-vertical * 5.4 - impulse * 2.4, seconds);
    }

    this.active =
      direction !== 0 ||
      horizontal !== 0 ||
      vertical !== 0 ||
      impulse !== 0 ||
      turn !== 0 ||
      this.springList.some((spring) => spring.active);
    return p;
  }

  reset(): SecondaryMotionPose {
    for (const name of this.keys) {
      this.springs[name].reset();
      this.pose[name] = 0;
    }
    this.lastVx = 0;
    this.lastVy = 0;
    this.accelX = 0;
    this.accelY = 0;
    this.active = false;
    return this.pose;
  }
}
