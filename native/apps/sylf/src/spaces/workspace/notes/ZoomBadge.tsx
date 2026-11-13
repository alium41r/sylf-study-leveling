// The zoom, shown at the top right of a document while it changes: under a pinch, a wheel, a trackpad or the zoom controls.
// It is this view's own state, so a finger moving renders these few characters and never the document under them.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Text, fade, useTheme } from "@sylf/design-system";

export interface ZoomBadgeHandle { show(zoom: number): void }
const HOLD = 900;

export const ZoomBadge = forwardRef<ZoomBadgeHandle>(function ZoomBadge(_, ref) {
  const { space, surface, motion } = useTheme();
  const [percent, setPercent] = useState<number | null>(null);
  const opacity = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useImperativeHandle(ref, () => ({
    show(zoom) {
      const next = Math.round(zoom * 100);
      setPercent((shown) => (shown === next ? shown : next));
      opacity.value = 1;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { opacity.value = fade(0, motion, "base"); }, HOLD);
    },
  }), [motion, opacity]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (percent === null) return null;
  return (
    <Animated.View pointerEvents="none" testID="zoom-badge" aria-live="polite" aria-label={`Zoom ${percent}%`}
      style={[surface("float", "sm"), { position: "absolute", top: space.md, right: space.md, minWidth: 56, alignItems: "center", paddingHorizontal: space.sm, paddingVertical: space.xs }, shown]}>
      <Text variant="label" style={{ fontVariant: ["tabular-nums"] }}>{percent}%</Text>
    </Animated.View>
  );
});
