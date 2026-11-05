// The application shell. Each Space owns everything inside it; the shell adds the switcher and the timer dock, and both sit above the
// Spaces, so neither moves when a Space changes. Both step aside for the game, whose own flow holds the screen.
import { Suspense, lazy, useState } from "react";
import { View } from "react-native";
import { IconButton, Tooltip, useTheme } from "@sylf/design-system";
import { worldHoldsNavigation } from "@sylf/spaces";
import { useHomeNavigation, useShellMetrics, useSpaces, useWorkspaceState } from "./context";
import { useChromeRevealed } from "../spaces/workspace/chrome-reveal";
import { conversationRequest } from "./profile/store";
import { ProfileSheet } from "./profile/ProfileSheet";
import { DEV_TOOLS, openShowcase } from "./dev-surface";
import { SpaceStage } from "./SpaceStage";
import { SpacesSwitcher } from "./SpacesSwitcher";
import { TimerDock } from "./TimerDock";
import { useFocusEnvironmentOpen } from "./focus/environment";
import { LevelNotice } from "./LevelNotice";
import { AppearanceSeed } from "./AppearanceSeed";
import { commandPalette, useCommandPaletteOpen } from "./palette/palette";
import { PALETTE_SHORTCUT, usePaletteKeys } from "./shell-keys";

const FocusEnvironment = lazy(() => import("./focus/FocusEnvironment"));
const CommandPalette = lazy(() => import("./palette/CommandPalette"));

/** The way into the command palette, in the top-right corner of every Space, beside the development entry when there is one. */
function PaletteEntry() {
  const { space } = useTheme();
  const { control, edge, insets, top } = useShellMetrics();
  return (
    <View style={{ position: "absolute", top, right: insets.right + edge + (DEV_TOOLS ? control + space.sm : 0), zIndex: 10 }}>
      <Tooltip text="Search Sylf" shortcut={PALETTE_SHORTCUT}>
        {(tip) => <IconButton icon="search" label="Search Sylf" testID="palette-open" onPress={() => commandPalette.open()} onHover={tip.onHover} onFocusChange={tip.onFocusChange} onLongPress={tip.onLongPress} />}
      </Tooltip>
    </View>
  );
}

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
  const chrome = useChromeRevealed();
  const filling = state.activeSpace === "workspace" && workspace.layout === "fill" && workspace.windows.some((w) => !w.minimized) && !chrome;
  const free = !worldHoldsNavigation(world) && !focusing && !filling;
  const [barReach, setBarReach] = useState<number | null>(null);
  const navigation = useHomeNavigation();
  const openMessages = (id: number) => { conversationRequest.ask(id); navigation.setView("circle", "messages"); navigation.select("circle"); };
  // The palette mounts the first time it is asked for and stays, so its next opening is instant.
  const paletteOpen = useCommandPaletteOpen();
  const [paletteUsed, setPaletteUsed] = useState(false);
  if (paletteOpen && !paletteUsed) setPaletteUsed(true);
  const reachable = !worldHoldsNavigation(world) && !focusing;
  usePaletteKeys(() => { if (reachable) commandPalette.toggle(); });
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
      {free ? <PaletteEntry /> : null}
      {paletteUsed && reachable ? <Suspense fallback={null}><CommandPalette open={paletteOpen} /></Suspense> : null}
      {focusing && !worldHoldsNavigation(world) ? <Suspense fallback={null}><FocusEnvironment /></Suspense> : null}
    </View>
  );
}
