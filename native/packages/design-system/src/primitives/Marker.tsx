// The Marker is the system's signature: one small mark that says "this is alive now". Every theme gives it a different
// body and flight, but it always means the same thing, so selection reads identically in all six personalities.
import { useEffect } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme/context";
import { move } from "../runtime/motion";

export function Marker({ color, breathing, scale = 1, style }: { color?: string; breathing?: boolean; scale?: number; style?: ViewStyle }) {
  const { marker, color: palette, motion } = useTheme();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!breathing || motion.amount === 0) { opacity.value = 1; return; }
    opacity.value = withRepeat(withSequence(withTiming(0.35, { duration: 1400, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never }), withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never })), -1);
  }, [breathing, motion.amount, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const fill = color ?? palette.accent.mote;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ width: marker.width * scale, height: marker.height * scale, borderRadius: marker.radius * scale, backgroundColor: fill, transform: [{ rotate: `${marker.rotate}deg` }] }, marker.glow ? { boxShadow: `0px 0px 8px ${fill}` } : null, animated, style]}
    />
  );
}

/**
 * A Marker that travels between measured positions. Interruptible: retargeting starts from wherever it is now. Along the
 * "y" axis `x` and `width` become the position and length on that axis, and `baseline` is the distance from the leading edge.
 */
export function TravellingMarker({ x, width, baseline = 0, visible = true, axis = "x" }: { x: number; width: number; baseline?: number; visible?: boolean; axis?: "x" | "y" }) {
  const { marker, color, motion } = useTheme();
  const vertical = axis === "y";
  const length = vertical ? marker.height : marker.width;
  const naturalLength = marker.stretch ? width : length;
  const target = marker.stretch ? x : x + width / 2 - length / 2;
  const position = useSharedValue(target);
  const from = useSharedValue(target);
  const to = useSharedValue(target);
  const size = useSharedValue(naturalLength);
  const opacity = useSharedValue(visible ? 1 : 0);
  const lift = marker.flight === "arc" ? 12 : marker.flight === "hop" ? 16 : 0;
  const breadth = marker.stretch ? marker.height : marker.width;

  useEffect(() => {
    from.value = position.value;
    to.value = target;
    position.value = move(target, motion, marker.flight === "drift" ? "lift" : "settle");
    size.value = move(naturalLength, motion);
    opacity.value = move(visible ? 1 : 0, motion);
  }, [target, naturalLength, visible, motion, marker.flight, from, to, position, size, opacity]);

  const animated = useAnimatedStyle(() => {
    const span = to.value - from.value;
    const progress = span === 0 ? 1 : Math.min(1, Math.max(0, (position.value - from.value) / span));
    const travel = Math.min(1, Math.abs(span) / 80);
    const arc = lift * travel * 4 * progress * (1 - progress) * motion.amount;
    if (vertical) return { height: size.value, opacity: opacity.value, transform: [{ translateY: position.value }, { translateX: arc }, { rotate: `${marker.rotate}deg` }] };
    return { width: size.value, opacity: opacity.value, transform: [{ translateX: position.value }, { translateY: -arc }, { rotate: `${marker.rotate}deg` }] };
  });

  const body = { position: "absolute" as const, borderRadius: marker.radius, backgroundColor: color.accent.mote };
  const glow = marker.glow ? { boxShadow: `0px 0px 8px ${color.accent.mote}` } : null;
  if (vertical) {
    return (
      <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: baseline, width: breadth }}>
        <Animated.View style={[body, { width: breadth }, glow, animated]} />
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: baseline, height: marker.height }}>
      <Animated.View style={[body, { height: marker.height }, glow, animated]} />
    </View>
  );
}
