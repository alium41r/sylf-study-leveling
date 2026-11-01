// World: a lobby at the gate, then a game flow that owns the screen, then Save and Leave returning to the Space you came from. This file
// only joins what is elsewhere: the phases are the store's, the host's lifecycle is the controller's, and the art and the lobby are
// their own components. The interface is the person's own theme solved against the sky, through ThemeScope, so World looks like
// World and still keeps their type, shapes, Marker and accent. Nothing here keeps running after this Space unmounts.
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Dialog, IconButton, Plane, Progress, Text, ThemeScope, move, useDismiss, useTheme } from "@sylf/design-system";
import { parseWorldSnapshot, resolveSky, type WorldPhase, type WorldSky } from "@sylf/spaces";
import { useHomeNavigation, useShellMetrics, useSpaces, useSpacesStore, useWorldController, useWorldRuntime } from "../../shell/context";
import { SKY_STYLES } from "./art/skies";
import { Lobby } from "./Lobby";
import { LobbyScene } from "./LobbyScene";

const PreviewSurface = lazy(() => import("./host/PreviewSurface"));

const isGame = (phase: WorldPhase) => phase === "playing" || phase === "paused" || phase === "saving" || phase === "saved";

function statusFor(world: WorldPhase, departure: "saved" | "discarded" | null) {
  if (world === "saving") return "Saving";
  if (world === "saved") return departure === "discarded" ? "Left without saving" : "Saved on this device";
  return null;
}

function WorldStage({ sky }: { sky: WorldSky }) {
  const { color, motion, palette, space } = useTheme();
  const { insets, left, top } = useShellMetrics();
  const store = useSpacesStore();
  const home = useHomeNavigation();
  const controller = useWorldController();
  const runtime = useWorldRuntime();
  const { world, state: { activeSpace, snapshots } } = useSpaces();
  const saved = useMemo(() => parseWorldSnapshot(snapshots.world), [snapshots.world]);
  const inLobby = world === "entry" && activeSpace === "world";

  // Once someone is through the gate this view never goes back to the lobby: on the way out the phase is already "entry", but this
  // view is leaving, and it must not show the lobby again for the length of the fade.
  const [beyond, setBeyond] = useState(isGame(world));
  if (isGame(world) && !beyond) setBeyond(true);
  if (inLobby && beyond) setBeyond(false);

  const through = useSharedValue(0);
  const aim = useSharedValue(0);
  const open = useSharedValue(saved.section && saved.section !== "gate" ? 1 : 0);
  const pointer = useSharedValue(0);
  useEffect(() => { through.value = move(world === "entering" ? 1 : 0, motion, "glide"); }, [world, motion, through]);
  useEffect(() => { if (world === "entering") aim.value = 0; }, [world, aim]);

  // While the game holds the screen, Back and Escape belong to its menu. They never fall through to the app.
  useDismiss(world === "playing", () => controller.pause());
  useDismiss(world === "entering" || world === "saving" || world === "saved", () => undefined);

  const onPointerMove = (event: { nativeEvent: { pageX: number; pointerType?: string } }) => {
    if (event.nativeEvent.pointerType !== "mouse" || motion.amount === 0 || saved.drift === false) return;
    pointer.value = move(1 - (event.nativeEvent.pageX / globalThis.innerWidth) * 2, motion, "glide");
  };
  const bloom = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, through.value * 1.7 - 0.7)) }));
  const veil = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - through.value * 2.4) }));

  const status = statusFor(world, runtime.departure);
  const preview = runtime.host === "preview";
  const fault = runtime.fault;

  return (
    <View {...(Platform.OS === "web" ? { onPointerMove } as object : {})} style={{ flex: 1, backgroundColor: color.ground, overflow: "hidden" }}>
      <StatusBar style={palette.polarity === "dark" ? "light" : "dark"} />
      {beyond ? <Suspense fallback={null}><PreviewSurface sky={sky} /></Suspense> : <LobbyScene sky={sky} drift={saved.drift !== false} through={through} aim={aim} open={open} pointer={pointer} />}

      {!beyond && world === "entry" ? (
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, veil]}>
          <Lobby
            section={saved.section ?? "gate"}
            sky={sky}
            leftAt={saved.leftAt}
            fault={fault}
            aim={aim}
            open={open}
            onSection={(section) => controller.updateSnapshot({ section })}
            onEnter={() => { void controller.enter(); }}
            onFocusStudy={() => { home.select("focus"); store.select("home"); }}
          />
        </Animated.View>
      ) : null}

      <Animated.View testID="world-bloom" pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: SKY_STYLES[sky].bloom }, bloom]} />

      {world === "entering" ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: space.sky + insets.bottom, alignItems: "center", paddingHorizontal: space.lg }}>
          <Plane level="float" radius="lg" testID="world-loading" style={{ width: "100%", maxWidth: 360, padding: space.lg, gap: space.sm }}>
            <Text variant="subheading" role="status">{runtime.progress?.label ?? "Entering the world"}</Text>
            <Progress value={runtime.progress?.fraction ?? 0} label="Entering the world" />
            <Text variant="caption" tone="soft">Preview. No game is loading yet.</Text>
          </Plane>
        </View>
      ) : null}

      {world === "playing" || world === "paused" ? (
        <View style={{ position: "absolute", top, left }}><Plane level="raised" radius="md"><IconButton icon="pause" label="Game menu" testID="world-menu" onPress={() => controller.pause()} /></Plane></View>
      ) : null}

      {status ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: space.sky + insets.bottom, alignItems: "center" }}>
          <Plane level="float" radius="lg" style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>
            <Text variant="small" role="status">{status}</Text>
          </Plane>
        </View>
      ) : null}

      <Dialog
        open={world === "paused"}
        onClose={() => controller.resume()}
        title="Paused"
        message={fault?.during === "save" ? fault.message : preview ? "There is no game to save yet. Leaving records this visit on this device." : undefined}
        actions={fault?.during === "save"
          ? [{ label: "Leave without saving", variant: "critical", onPress: () => { void controller.leave({ discard: true }); } }, { label: "Try again", variant: "emphasis", onPress: () => { void controller.leave(); } }]
          : [{ label: "Resume", onPress: () => controller.resume() }, { label: "Save and leave", variant: "emphasis", onPress: () => { void controller.leave(); } }]}
      />
    </View>
  );
}

export default function WorldSpace() {
  const { axes } = useTheme();
  const { state: { snapshots } } = useSpaces();
  // Read once: the sky is chosen on arrival, so it does not change under someone sitting in the lobby as the hour turns.
  const [hour] = useState(() => new Date().getHours());
  const choice = parseWorldSnapshot(snapshots.world).sky;
  const sky = resolveSky(choice, hour);
  const style = SKY_STYLES[sky];
  const scoped = useMemo(() => ({ ...axes, groundDay: style.ground, groundNight: style.ground }), [axes, style.ground]);
  return <ThemeScope axes={scoped} mode={style.polarity}><WorldStage sky={sky} /></ThemeScope>;
}
