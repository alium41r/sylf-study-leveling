// Three small bars that rise and fall while a sound plays, and rest low when it is paused. With reduced motion they stand still.
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import { useTheme } from "@sylf/design-system";

const BARS = [{ low: 0.3, high: 1, ms: 420 }, { low: 0.45, high: 0.75, ms: 560 }, { low: 0.25, high: 0.9, ms: 360 }];

function Bar({ level, height, width, color }: { level: SharedValue<number>; height: number; width: number; color: string }) {
  const style = useAnimatedStyle(() => ({ height: Math.max(width, level.value * height) }));
  return <Animated.View style={[{ width, borderRadius: width / 2, backgroundColor: color }, style]} />;
}

export function SoundBars({ playing, size = 14, color }: { playing: boolean; size?: number; color?: string }) {
  const { color: palette, motion } = useTheme();
  const levels = [useSharedValue(0.35), useSharedValue(0.6), useSharedValue(0.3)];
  const still = motion.amount === 0;
  useEffect(() => {
    levels.forEach((level, i) => {
      const bar = BARS[i];
      cancelAnimation(level);
      if (!playing || still) { level.value = withTiming(playing ? bar.high * 0.8 : bar.low, { duration: 200 }); return; }
      const ease = Easing.inOut(Easing.quad);
      level.value = withRepeat(withSequence(withTiming(bar.high, { duration: bar.ms, easing: ease }), withTiming(bar.low, { duration: bar.ms * 0.9, easing: ease })), -1, true);
    });
    return () => levels.forEach((level) => cancelAnimation(level));
    // The shared values are stable for the component's life.
  }, [playing, still]);
  const width = Math.max(2, Math.round(size / 6));
  return (
    <View aria-hidden style={{ width: size, height: size, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
      {levels.map((level, i) => <Bar key={i} level={level} height={size} width={width} color={color ?? palette.accent.fill} />)}
    </View>
  );
}
