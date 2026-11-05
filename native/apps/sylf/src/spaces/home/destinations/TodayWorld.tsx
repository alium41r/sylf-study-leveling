// The way to Sylf World, as a slim row: what you have earned toward it, and one press to open the gate. The scenery lives once on this page, in the hero, so this
// stays quiet. Level, rank and Sylph are the server's. Time in World never counts as study (G1), and nothing here suggests it does.
import { View } from "react-native";
import { Icon, Plane, Press, Text, useTheme } from "@sylf/design-system";
import { useSpacesStore } from "../../../shell/context";
import { useStats } from "../../../shell/live";

export function WorldCard() {
  const { color, shape, space } = useTheme();
  const store = useSpacesStore();
  const stats = useStats();
  return (
    <Plane level="plane" radius="lg" testID="today-world" style={{ padding: space.lg }}>
      <Press role="button" label="Sylf World. Open the gate" onPress={() => store.select("world")} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View aria-hidden style={{ width: 44, height: 44, borderRadius: shape.radius.md, backgroundColor: color.accent.wash, alignItems: "center", justifyContent: "center" }}><Icon name="world" color={color.accent.mote} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="subheading">Sylf World</Text>
          <Text variant="caption" tone="soft">{stats?.sylph !== undefined ? `${stats.sylph.toLocaleString()} Sylph to spend` : "A place you earn by studying"}</Text>
        </View>
        <Icon name="chevronRight" color={color.inkSoft} />
      </Press>
    </Plane>
  );
}
