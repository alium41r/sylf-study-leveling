// The application shell. Each Space owns everything inside it; the shell adds the switcher and the timer dock, and both sit above the
// Spaces, so neither moves when a Space changes. Both step aside for the game, whose own flow holds the screen.
import { Suspense, lazy, useState } from "react";
import { View } from "react-native";
import { IconButton, useTheme } from "@sylf/design-system";
import { worldHoldsNavigation } from "@sylf/spaces";
import { useHomeNavigation, useShellMetrics, useSpaces, useWorkspaceState } from "./context";
import { conversationRequest } from "./profile/store";
import { ProfileSheet } from "./profile/ProfileSheet";
import { DEV_TOOLS, openShowcase } from "./dev-surface";
import { SpaceStage } from "./SpaceStage";
import { SpacesSwitcher } from "./SpacesSwitcher";
import { TimerDock } from "./TimerDock";
import { useFocusEnvironmentOpen } from "./focus/environment";
import { LevelNotice } from "./LevelNotice";
import { AppearanceSeed } from "./AppearanceSeed";

const FocusEnvironment = lazy(() => import("./focus/FocusEnvironment"));

function DevEntry() {
  const { edge, insets, top } = useShellMetrics();
  return <View style={{ position: "absolute", top, right: insets.right + edge, zIndex: 10 }}><IconButton icon="palette" size="small" label="Design System (development only)" testID="dev-showcase" onPress={() => openShowcase()} /></View>;
}

export function SpacesShell() {
  const { color } = useTheme();
  const { world, state } = useSpaces();
  const workspace = useWorkspaceState();
  const focusing = useFocusEnvironmentOpen();
  // Workspace in full screen keeps the whole screen for its tools: no Spaces icon, no timer, no development entry.
  const filling = state.activeSpace === "workspace" && workspace.layout === "fill" && workspace.windows.some((w) => !w.minimized);
  const free = !worldHoldsNavigation(world) && !focusing && !filling;
  const [barReach, setBarReach] = useState<number | null>(null);
  const navigation = useHomeNavigation();
  const openMessages = (id: number) => { conversationRequest.ask(id); navigation.setView("circle", "messages"); navigation.select("circle"); };
  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      {/* Reading order is tab order: the Spaces icon, then the timer, then the Space. */}
      {free ? <SpacesSwitcher onReach={setBarReach} /> : null}
      {free ? <TimerDock barReach={barReach} /> : null}
      <SpaceStage />
      <ProfileSheet onMessage={openMessages} />
      <LevelNotice />
      <AppearanceSeed />
      {free && DEV_TOOLS ? <DevEntry /> : null}
      {focusing && !worldHoldsNavigation(world) ? <Suspense fallback={null}><FocusEnvironment /></Suspense> : null}
    </View>
  );
}
