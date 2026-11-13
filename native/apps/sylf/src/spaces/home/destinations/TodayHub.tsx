// The way into a session, at the middle of the dashboard: where the four parts meet on a desktop, and on the hairline under the greeting or the progress on a
// narrower page. It is one button on the rule that divides the rows, so it sits in the flow and never over content. What it begins is decided by the page
// (the running session, the next quest with its subject and title, or the next event), which the objectives beside it name.
import { memo, useState } from "react";
import { View } from "react-native";
import { Button, Divider, useTheme } from "@sylf/design-system";
import { gutterCentre, hubOffset } from "./todayLayout";

export type Spotlight = "session" | "quest" | "event" | "ready";
const ACTIONS: Record<Spotlight, string> = { session: "Back to focus", quest: "Begin focus", event: "View calendar", ready: "Begin focus" };

export const TodayHub = memo(function TodayHub({ kind, split, width, onBegin }: { kind: Spotlight; /** The columns it sits between: its middle is their gutter's. The page's own middle when left out. */ split?: { left: number; right: number; gap: number }; /** The page's width, until the row has measured its own. */ width: number; onBegin: () => void }) {
  const { color, space } = useTheme();
  // The row's real width decides where the gutter is, so the button stays on it whatever the shell around the page does.
  const [measured, setMeasured] = useState<number | null>(null);
  const row = measured ?? width;
  const centre = split ? gutterCentre(row, split) : undefined;
  return (
    <View testID="today-hub" onLayout={(event) => { const next = Math.round(event.nativeEvent.layout.width); if (next !== measured) setMeasured(next); }} style={{ justifyContent: "center" }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: "50%" }}><Divider /></View>
      <View style={{ marginLeft: hubOffset(centre, row), alignItems: "center" }}>
        <View style={{ backgroundColor: color.ground, paddingHorizontal: space.md }}>
          <Button title={ACTIONS[kind]} variant="emphasis" icon={kind === "event" ? "calendar" : "play"} testID="today-begin" onPress={onBegin} />
        </View>
      </View>
    </View>
  );
});
