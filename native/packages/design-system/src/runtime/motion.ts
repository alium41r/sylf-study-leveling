// The one way anything moves. Every animation in the system goes through move(), so a theme's character, the user's
// intensity and reduced motion apply everywhere without any component knowing about them.
import { Easing, ReduceMotion, withSpring, withTiming } from "react-native-reanimated";
import type { ResolvedMotion } from "../theme/resolve";

export type MotionKind = "settle" | "lift" | "glide";

const STEP_DURATION: Record<MotionKind, number> = { settle: 170, lift: 250, glide: 330 };

export function move(to: number, motion: ResolvedMotion, kind: MotionKind = "settle") {
  "worklet";
  if (motion.amount === 0) return withTiming(to, { duration: motion.fade.quick, reduceMotion: ReduceMotion.Never });
  if (motion.steps > 0) {
    const duration = STEP_DURATION[kind];
    return withTiming(to, { duration, easing: Easing.steps(Math.max(2, Math.round((duration / 1000) * motion.steps))), reduceMotion: ReduceMotion.Never });
  }
  return withSpring(to, { ...motion[kind], reduceMotion: ReduceMotion.Never });
}

export function fade(to: number, motion: ResolvedMotion, duration: "quick" | "base" = "quick") {
  "worklet";
  return withTiming(to, { duration: motion.fade[duration], reduceMotion: ReduceMotion.Never });
}
