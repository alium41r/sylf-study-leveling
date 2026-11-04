// Home: the rail and one visible destination. A destination mounts the first time it is visited and then stays mounted and
// hidden until Home itself leaves. Every mount costs native memory that is not returned (risk R15), so going back and forth
// must not mount anything. Hidden destinations take no touches, no keyboard focus and no place in the accessibility tree.
import { Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { move, useControlHeight, useNoticeClearance, useTheme, useWindowClass } from "@sylf/design-system";
import { HOME_DESTINATIONS, HOME_LABELS, type HomeDestination } from "@sylf/spaces";
import { useAccountEntry, useHomeNavigation } from "../../shell/context";
import { CircleDestination } from "./destinations/CircleDestination";
import { FocusDestination } from "./destinations/FocusDestination";
import { PlanDestination } from "./destinations/PlanDestination";
import { ProgressDestination } from "./destinations/ProgressDestination";
import { TodayDestination } from "./destinations/TodayDestination";
import { HomeRail } from "./HomeRail";

const AccountPage = lazy(() => import("../../shell/account/AccountPage"));
const SCREENS: Record<HomeDestination, ComponentType> = { today: TodayDestination, plan: PlanDestination, focus: FocusDestination, circle: CircleDestination, progress: ProgressDestination };
const offScreen = Platform.select<ViewStyle>({ web: { visibility: "hidden" } as unknown as ViewStyle, default: {} });

function DestinationLayer({ id, active, direction }: { id: HomeDestination; active: boolean; direction: number }) {
  const { motion } = useTheme();
  const shown = useSharedValue(active && direction === 0 ? 1 : 0);
  const startedAt = useRef(Date.now());
  const Screen = SCREENS[id];

  useEffect(() => { console.log(`SYLF_HOME_MOUNT ${id} ${Date.now() - startedAt.current}`); }, [id]);
  // The old page goes at once and the new one arrives: two pages crossing over each other is harder to read than either.
  useEffect(() => { shown.value = active ? move(1, motion, "lift") : 0; }, [active, motion, shown]);

  const travel = motion.enterTravel * motion.amount * direction;
  const animated = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.value * 1.4), transform: [{ translateY: travel * (1 - shown.value) }] }));

  return (
    <Animated.View testID={`home-${id}`} role="tabpanel" aria-label={HOME_LABELS[id]} aria-hidden={!active || undefined} importantForAccessibility={active ? "auto" : "no-hide-descendants"} pointerEvents={active ? "auto" : "none"} style={[StyleSheet.absoluteFill, active ? null : offScreen, animated]}>
      <Screen />
    </Animated.View>
  );
}

export default function HomeSpace() {
  const { color } = useTheme();
  const { size } = useWindowClass();
  const navigation = useHomeNavigation();
  const destination = useSyncExternalStore(navigation.subscribe, navigation.destination, navigation.destination);
  const accountOpen = useSyncExternalStore(navigation.subscribeDetail, navigation.accountOpen, navigation.accountOpen);
  const account = useAccountEntry();
  const [stage, setStage] = useState({ current: destination, visited: [destination], direction: 0 });
  if (stage.current !== destination) {
    const delta = HOME_DESTINATIONS.indexOf(destination) - HOME_DESTINATIONS.indexOf(stage.current);
    setStage({ current: destination, visited: stage.visited.includes(destination) ? stage.visited : [...stage.visited, destination], direction: Math.sign(delta) });
  }
  useEffect(() => () => navigation.flush(), [navigation]);

  const compact = size === "compact";
  // The bottom bar is as tall as an icon and its label.
  const control = useControlHeight();
  useNoticeClearance(compact ? control + 44 : 0);
  return (
    <View style={{ flex: 1, flexDirection: compact ? "column-reverse" : "row", backgroundColor: color.ground }}>
      <HomeRail destination={destination} axis={compact ? "horizontal" : "vertical"} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {stage.visited.map((id) => <DestinationLayer key={id} id={id} active={id === destination && !accountOpen} direction={stage.direction} />)}
        {accountOpen && account ? <View style={[StyleSheet.absoluteFill, { backgroundColor: color.ground }]}><Suspense fallback={null}><AccountPage /></Suspense></View> : null}
      </View>
    </View>
  );
}
