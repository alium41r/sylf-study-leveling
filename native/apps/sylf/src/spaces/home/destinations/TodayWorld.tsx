// The person's World, seen from Home: the island a little way off, and the way in. The whole picture opens World, and so does the link under it, which is the
// one a keyboard or a screen reader meets. The art is loaded on first draw and paused whenever the dashboard is not what is on screen.
import { memo, useCallback } from "react";
import { View } from "react-native";
import { Button, Press, Text, useTheme } from "@sylf/design-system";
import type { WorldSky } from "@sylf/spaces";
import { useSpacesStore } from "../../../shell/context";
import { useStatsResult } from "../data";
import { Scenery } from "./TodayScenery";

export const TodayWorld = memo(function TodayWorld({ sky, playing, height, maxWidth }: { sky: WorldSky; playing: boolean; height: number; maxWidth?: number }) {
  const { shape, space } = useTheme();
  const store = useSpacesStore();
  const stats = useStatsResult()?.data;
  const open = useCallback(() => { store.select("world"); }, [store]);
  return (
    <View testID="today-world" style={{ gap: space.md, width: "100%", ...(maxWidth ? { maxWidth, alignSelf: "center" } : {}) }}>
      <Press role="button" label="Open Sylf World" feedback="none" radius={shape.radius.xl} testID="today-world-open" onPress={open} bodyStyle={{ height }}>
        <Scenery sky={sky} playing={playing} testID="today-window" />
      </Press>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text variant="heading" role="heading" aria-level={2} numberOfLines={1}>Sylf World</Text>
          <Text variant="caption" tone="soft" numberOfLines={1}>{stats?.sylph !== undefined ? `${stats.sylph.toLocaleString()} Sylph` : "Traveller and collection"}</Text>
        </View>
        <Button title="Enter" size="small" variant="ghost" trailingIcon="arrowRight" testID="today-enter-world" onPress={open} />
      </View>
    </View>
  );
});
