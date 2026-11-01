// The Workspace canvas's dots. A dot keeps its size at every zoom, and only the distance between dots follows the camera, so this
// is one view that repeats a small gradient. A full-window SVG or a bitmap would be rasterized to a full-window image on Android
// (50 MB, measured in Phase 5), and scaling a plate of tiles scales the dots with it. A pan only moves the view. A zoom changes
// the spacing, which redraws the dots and nothing else. Tinting redraws them once, so a theme change costs nothing.
import { Platform, StyleSheet, View } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { fade, useTheme } from "@sylf/design-system";
import { GRID, gridDots, gridSpacing, type Size } from "@sylf/spaces";
import type { CameraValues } from "./useCamera";

/** On screen, in points. The soft edge is what keeps a dot round at a small size. */
const DOT_RADIUS = 1.3;
const web = Platform.OS === "web";

export function DotGrid({ camera, viewport }: { camera: CameraValues; viewport: Size }) {
  const { color, motion } = useTheme();
  const settled = useSharedValue(1);
  const { x, y, zoom, width: viewWidth, height: viewHeight } = camera;

  // Moving to another octave changes how far apart the dots are. A short fade reads as the grid settling, not as a jump.
  useAnimatedReaction(
    () => gridSpacing(zoom.value).level,
    (level, previous) => { if (previous !== null && level !== previous) { settled.value = 0.35; settled.value = fade(1, motion, "base"); } },
  );

  const plate = useAnimatedStyle(() => {
    const placed = gridDots({ x: x.value, y: y.value, zoom: zoom.value }, { width: viewWidth.value, height: viewHeight.value });
    return { opacity: 0.42 * settled.value, transform: [{ translateX: placed.x }, { translateY: placed.y }] };
  });
  // Apart from the plate, so a pan moves one view and never reaches this.
  const tiles = useAnimatedStyle(() => {
    const { spacing } = gridSpacing(zoom.value);
    return { backgroundSize: web ? `${spacing}px ${spacing}px` : [{ x: spacing, y: spacing }] } as object;
  });

  return (
    <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Animated.View testID="workspace-grid" style={[{ position: "absolute", left: 0, top: 0, width: viewport.width + GRID * 2, height: viewport.height + GRID * 2 }, plate]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundImage: `radial-gradient(circle ${DOT_RADIUS}px at center, ${color.lineStrong} 0%, ${color.lineStrong} 60%, transparent 100%)` }, tiles]} />
      </Animated.View>
    </View>
  );
}
