// The application shell. Each Space owns everything inside it; the shell adds the switcher and the timer dock, and both sit above the
// Spaces, so neither moves when a Space changes. Both step aside for the game, whose own flow holds the screen.
import { useState } from "react";
import { View } from "react-native";
import { IconButton, useTheme } from "@sylf/design-system";
import { worldHoldsNavigation } from "@sylf/spaces";
import { useShellMetrics, useSpaces } from "./context";
import { DEV_TOOLS, openShowcase } from "./dev-surface";
import { SpaceStage } from "./SpaceStage";
import { SpacesSwitcher } from "./SpacesSwitcher";
import { TimerDock } from "./TimerDock";

function DevEntry() {
  const { edge, insets, top } = useShellMetrics();
  return <View style={{ position: "absolute", top, right: insets.right + edge, zIndex: 10 }}><IconButton icon="palette" size="small" label="Design System (development only)" testID="dev-showcase" onPress={() => openShowcase()} /></View>;
}

export function SpacesShell() {
  const { color } = useTheme();
  const { world } = useSpaces();
  const free = !worldHoldsNavigation(world);
  const [barReach, setBarReach] = useState<number | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      {/* Reading order is tab order: the Spaces icon, then the timer, then the Space. */}
      {free ? <SpacesSwitcher onReach={setBarReach} /> : null}
      {free ? <TimerDock barReach={barReach} /> : null}
      <SpaceStage />
      {free && DEV_TOOLS ? <DevEntry /> : null}
    </View>
  );
}
