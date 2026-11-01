// What the preview host draws while "playing": the air beyond the gate, and a plain statement that the world is not here yet. A real
// host's surface takes this place, and the lobby's scene is unmounted before either of them appears, so the two never share memory.
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import { Stack, Text, useTheme } from "@sylf/design-system";
import type { WorldSky } from "@sylf/spaces";
import { SKY_PLATES } from "../art/plates.generated";

export default function PreviewSurface({ sky }: { sky: WorldSky }) {
  const { space } = useTheme();
  const { width, height } = useWindowDimensions();
  return (
    <View testID="world-surface" style={StyleSheet.absoluteFill}>
      <Image source={SKY_PLATES[sky].sky} fadeDuration={0} resizeMode="stretch" aria-hidden style={{ width, height }} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl }]}>
        <Stack gap="sm" align="center" style={{ maxWidth: 460 }}>
          <Text variant="display" role="heading" align="center">Beyond the gate</Text>
          <Text tone="soft" align="center">The world is built in a later phase. For now, this is the way in and the way out.</Text>
        </Stack>
      </View>
    </View>
  );
}
