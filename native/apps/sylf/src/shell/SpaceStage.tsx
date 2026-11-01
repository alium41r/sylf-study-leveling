// Holds the one mounted Space. A Space that is left stays only as long as its exit takes, then unmounts, so nothing in it
// keeps running. Its small snapshot is in the store. Each Space's code loads the first time it is needed.
import { Suspense, lazy, useEffect, useState, type ComponentType } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { fade, move, useTheme } from "@sylf/design-system";
import { SPACE_IDS, transitionDirection, type SpaceId } from "@sylf/spaces";
import { useSpaces, useSpacesStore } from "./context";

type SpaceModule = { default: ComponentType };
const LOADERS: Record<SpaceId, () => Promise<SpaceModule>> = {
  home: () => import("../spaces/home/HomeSpace"),
  workspace: () => import("../spaces/workspace/WorkspaceSpace"),
  world: () => import("../spaces/world/WorldSpace"),
};
const VIEWS: Record<SpaceId, ComponentType> = { home: lazy(LOADERS.home), workspace: lazy(LOADERS.workspace), world: lazy(LOADERS.world) };

/** Called when the switcher opens, so a chosen Space can start its entrance on the next frame. */
export function preloadSpaces() { SPACE_IDS.forEach((id) => void LOADERS[id]()); }

function SpaceLayer({ id, leaving, direction, onGone }: { id: SpaceId; leaving: boolean; direction: number; onGone: () => void }) {
  const { motion } = useTheme();
  const entered = useSharedValue(direction === 0 ? 1 : 0);
  const left = useSharedValue(0);
  const travel = motion.enterTravel * 3 * motion.amount;
  // Workspace slides in without scaling. Its dock and windows carry blurred shadows, and scaling one redraws it at every size,
  // which the GPU keeps: 135 MB after two entrances on the tablet, for good.
  const scale = id === "workspace" ? 1 : 1 - (1 - motion.enterScale) * motion.amount;
  const View_ = VIEWS[id];

  useEffect(() => {
    console.log(`SYLF_SPACE_MOUNT ${id}`);
    return () => console.log(`SYLF_SPACE_UNMOUNT ${id}`);
  }, [id]);
  useEffect(() => {
    if (!leaving) { entered.value = move(1, motion, "glide"); left.value = fade(0, motion); return; }
    left.value = fade(1, motion, "base");
    const timer = setTimeout(onGone, motion.fade.base + 40);
    return () => clearTimeout(timer);
  }, [leaving, motion, entered, left, onGone]);

  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, entered.value * 1.6) * (1 - left.value),
    transform: [{ translateX: direction * travel * (1 - entered.value) - direction * travel * 0.5 * left.value }, { scale: scale + (1 - scale) * entered.value }],
  }));

  return (
    <Animated.View testID={`space-${id}`} pointerEvents={leaving ? "none" : "auto"} aria-hidden={leaving || undefined} style={[StyleSheet.absoluteFill, animated]}>
      <Suspense fallback={null}><View_ /></Suspense>
    </Animated.View>
  );
}

export function SpaceStage() {
  const store = useSpacesStore();
  const { state: { activeSpace } } = useSpaces();
  const [stage, setStage] = useState<{ current: SpaceId; leaving: SpaceId | null; direction: number }>({ current: activeSpace, leaving: null, direction: 0 });
  if (stage.current !== activeSpace) setStage({ current: activeSpace, leaving: stage.current, direction: transitionDirection(store.available(), stage.current, activeSpace) });
  const [onGone] = useState(() => () => setStage((value) => ({ ...value, leaving: null })));

  return (
    <View style={{ flex: 1 }}>
      {stage.leaving ? <SpaceLayer key={stage.leaving} id={stage.leaving} leaving direction={stage.direction} onGone={onGone} /> : null}
      <SpaceLayer key={stage.current} id={stage.current} leaving={false} direction={stage.direction} onGone={onGone} />
    </View>
  );
}
