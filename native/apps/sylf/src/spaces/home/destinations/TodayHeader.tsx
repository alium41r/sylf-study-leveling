// The greeting. A small mark for the hour (the sun by day, the moon after dark) sits beside it, so the page already feels like the time it is, and Sylvie is one
// control away. The sentence under it is the server's own summary of the day.
import { View } from "react-native";
import { Button, Icon, Text, useTheme, useWindowClass } from "@sylf/design-system";
import type { WorldSky } from "@sylf/spaces";
import { glyphFor } from "./todaySky";

export function Header({ greeting, detail, sky, onAsk }: { greeting: string; detail?: string; sky: WorldSky; onAsk?: () => void }) {
  const { color, shape, space } = useTheme();
  const compact = useWindowClass().size === "compact";
  const mark = (size: number) => <View aria-hidden style={{ width: size, height: size, borderRadius: shape.radius.md, backgroundColor: color.accent.wash, alignItems: "center", justifyContent: "center" }}><Icon name={glyphFor(sky)} color={color.accent.mote} /></View>;
  // On a phone the title may need two lines, so the mark and Sylvie sit above it rather than fighting it for the row.
  if (compact) {
    return (
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
          {mark(36)}
          {onAsk ? <Button title="Ask Sylvie" size="small" icon="sylvie" testID="today-ask" onPress={onAsk} /> : null}
        </View>
        <View style={{ gap: space.xs }}>
          <Text variant="display" role="heading" aria-level={1}>{greeting}</Text>
          {detail ? <Text tone="soft">{detail}</Text> : null}
        </View>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.lg }}>
      <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Text variant="display" role="heading" aria-level={1} style={{ flexShrink: 1 }}>{greeting}</Text>
          {mark(40)}
        </View>
        {detail ? <Text tone="soft" style={{ maxWidth: 560 }}>{detail}</Text> : null}
      </View>
      {onAsk ? <Button title="Ask Sylvie" size="small" icon="sylvie" testID="today-ask" onPress={onAsk} /> : null}
    </View>
  );
}
