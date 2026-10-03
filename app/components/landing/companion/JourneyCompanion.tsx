"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import Companion from "./Companion";
import { presentationFor, type CompanionState } from "./model";
import { SecondaryMotion, type SecondaryMotionPose } from "./secondary-motion";
import styles from "./JourneyCompanion.module.css";

export interface JourneyCompanionHandle {
  present(
    state: CompanionState,
    active: boolean,
    velocity?: { x: number; y: number },
    dt?: number,
    sustainPresentation?: boolean
  ): boolean;
}

/**
 * [pose key, CSS variable, unit, decimal places].
 *
 * These are written as declared: the spring bounds in `secondary-motion.ts` are
 * already expressed in the units the CSS consumes, so there is no hidden
 * presentation scale to reason about. Previously cape and ribbon were scaled by
 * 0.42/0.45 here, which silently halved the strongest fabric response.
 */
const VARIABLES: Array<[keyof SecondaryMotionPose, string, string, number]> = [
  ["bodyTilt", "--journey-lean", "deg", 2],
  ["bodyShift", "--journey-shift", "px", 2],
  ["bodyPitch", "--body-pitch", "deg", 2],
  ["lowerTilt", "--lower-tilt", "deg", 2],
  ["lowerLift", "--lower-lift", "px", 2],
  ["capeTilt", "--cape-lag", "deg", 2],
  ["capeSkew", "--cape-skew", "deg", 2],
  ["capeLift", "--cape-lift", "px", 2],
  ["capeStretch", "--cape-stretch", "", 4],
  ["capeLeftTilt", "--cape-left-tilt", "deg", 2],
  ["capeRightTilt", "--cape-right-tilt", "deg", 2],
  ["capeLeftSkew", "--cape-left-skew", "deg", 2],
  ["capeRightSkew", "--cape-right-skew", "deg", 2],
  ["ribbonLeftTilt", "--ribbon-left-lag", "deg", 2],
  ["ribbonRightTilt", "--ribbon-right-lag", "deg", 2],
  ["ribbonLeftLift", "--ribbon-left-lift", "px", 2],
  ["ribbonRightLift", "--ribbon-right-lift", "px", 2],
  ["haloTilt", "--halo-lag", "deg", 2],
  ["haloX", "--halo-x", "px", 2],
  ["haloY", "--halo-y", "px", 2],
  ["starTilt", "--star-lag", "deg", 2],
  ["starX", "--star-x", "px", 2],
  ["starY", "--star-y", "px", 2],
];

/** World movement remains in JourneyPath. React changes only at semantic boundaries. */
export default forwardRef<JourneyCompanionHandle>(
  function JourneyCompanion(_, ref) {
    const host = useRef<HTMLDivElement>(null);
    const last = useRef({ state: "IDLE" as CompanionState, sustained: false });
    const written = useRef(new Map<string, string>());
    const [presentation, setPresentation] = useState({
      state: "IDLE" as CompanionState,
      sustained: false,
    });
    const secondary = useRef<SecondaryMotion | null>(null);
    if (!secondary.current) secondary.current = new SecondaryMotion();
    useImperativeHandle(
      ref,
      () => ({
        present(
          next,
          active,
          velocity = { x: 0, y: 0 },
          dt = 0,
          sustained = false
        ) {
          if (
            last.current.state !== next ||
            last.current.sustained !== sustained
          ) {
            last.current = { state: next, sustained };
            setPresentation(last.current);
          }
          const element = host.current;
          if (!element) return false;
          const activity = active ? "active" : "paused";
          if (element.dataset.activity !== activity)
            element.dataset.activity = activity;
          const physics = secondary.current!;
          const pose =
            active && dt > 0
              ? physics.advance(velocity.x, velocity.y, dt)
              : physics.reset();
          for (const [key, variable, unit, places] of VARIABLES) {
            const value = `${pose[key].toFixed(places)}${unit}`;
            if (written.current.get(variable) !== value) {
              element.style.setProperty(variable, value);
              written.current.set(variable, value);
            }
          }
          return active && physics.active;
        },
      }),
      []
    );
    return (
      <div ref={host} className={styles.surface} data-activity="active">
        <Companion
          state={presentation.state}
          preview={
            presentation.sustained
              ? presentationFor(presentation.state)
              : undefined
          }
          size="LARGE"
          motionProfile="journey"
          className={styles.character}
        />
      </div>
    );
  }
);
