// The Focus environment: the session, and nothing else. It sits above the Spaces, so leaving it returns exactly where the person was, and the dock
// and the Spaces icon step aside while it is open. Controls show on a touch or a pointer move and fade after a few seconds. Leaving is not ending.
// The screen stays awake only while this is open, and the background is decoded on the way in and released on the way out.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Image } from "expo-image";
import { useKeepAwake } from "expo-keep-awake";
import { Button, IconButton, Text, fade, useDismiss, useTheme } from "@sylf/design-system";
import { modes } from "@sylf/shared";
import { formatSessionClock, sessionModeSettings } from "@sylf/spaces";
import { useSessionReadout, useSessionState, useStudySession } from "../context";
import { SessionActions, SessionNote } from "../session/SessionParts";
import { audioEngine, useAudio } from "../audio/engine";
import { focusEnvironment } from "./environment";
import { PhaseLine } from "./PhaseLine";
import { useFocusBackground } from "./useFocusBackground";

const IDLE_MS = 4_000;
const PHASE_WORDS: Record<string, string> = { focus: "Focus", "short-break": "Break", "long-break": "Long break", rest: "Rest", done: "Done" };

function useControlsShown() {
  const [shown, setShown] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    setShown(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), IDLE_MS);
  }, []);
  useEffect(() => { wake(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [wake]);
  return { shown, wake };
}

function Clock() {
  const readout = useSessionReadout(true);
  const quiet = readout.status !== "running";
  return <Text variant="readoutXL" tone={quiet ? "soft" : "ink"} align="center" numberOfLines={1} testID="environment-clock" style={{ fontVariant: ["tabular-nums"] }}>{formatSessionClock(readout.clock)}</Text>;
}

function Rhythm() {
  const state = useSessionState();
  const readout = useSessionReadout(true);
  const active = state.active;
  const pattern = useMemo(() => {
    if (!active?.phase) return [{ phase: "focus", seconds: active?.length ? active.length * 60 : null }];
    return modes.modePattern(active.phase.mode, sessionModeSettings(state, active.phase.mode));
  }, [active?.phase?.mode, active?.length, state]);
  if (!active) return null;
  // Where we are in the pattern: the nth focus block, or the break after it.
  const round = active.phase?.round ?? 1;
  const focusIndices = pattern.map((segment, index) => (segment.phase === "focus" ? index : -1)).filter((index) => index >= 0);
  const base = focusIndices[Math.min(round, focusIndices.length) - 1] ?? 0;
  const at = readout.phase === "focus" ? base : Math.min(pattern.length - 1, base + 1);
  return <View style={{ width: "100%", maxWidth: 560 }}><PhaseLine pattern={pattern} at={at} fraction={readout.fraction} label={`${PHASE_WORDS[readout.phase] ?? "Focus"}, round ${round}`} /></View>;
}

export function FocusEnvironment() {
  useKeepAwake("sylf-focus");
  const { color, space, motion } = useTheme();
  const session = useStudySession();
  const state = useSessionState();
  const readout = useSessionReadout(false);
  const audio = useAudio();
  const { chosen } = useFocusBackground();
  const { shown, wake } = useControlsShown();
  const [dim, setDim] = useState(false);
  const opacity = useSharedValue(1);
  useEffect(() => { opacity.value = fade(shown ? 1 : 0, motion); }, [shown, motion, opacity]);
  const controls = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const leave = () => focusEnvironment.close();
  useDismiss(true, leave);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || (event.target as HTMLElement)?.tagName === "INPUT") return;
      event.preventDefault();
      const status = session.status();
      if (status === "running") session.pause(); else if (status === "paused") session.resume();
      wake();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, wake]);

  const active = state.active;
  const breaking = readout.phase !== "focus" && readout.phase !== "done";
  const canBreak = active?.phase && modes.takesBreaksOnDemand(active.phase.mode) && readout.phase === "focus" && readout.status === "running";
  const ground = breaking ? color.selected : color.ground;
  return (
    <View testID="focus-environment" style={[StyleSheet.absoluteFill, { backgroundColor: ground, zIndex: 50 }]}>
      {chosen ? <Image source={{ uri: chosen.publicUrl }} contentFit="cover" contentPosition={{ left: `${Math.round((chosen.focalX ?? 0.5) * 100)}%`, top: `${Math.round((chosen.focalY ?? 0.5) * 100)}%` }} style={StyleSheet.absoluteFill} recyclingKey={String(chosen.id)} cachePolicy="memory" accessible={false} /> : null}
      {/* A solved scrim, so the clock meets contrast on any image in any theme. Breaks lift it a little. */}
      {chosen ? <View style={[StyleSheet.absoluteFill, { backgroundColor: color.ground, opacity: breaking ? 0.45 : 0.62 }]} /> : null}
      {dim ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: 0.45 }]} /> : null}
      <Pressable accessible={false} onPress={wake} {...(Platform.OS === "web" ? { onHoverIn: wake } : {})} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.xl }}>
        <Text variant="caption" tone="soft" align="center" testID="environment-phase">{breaking ? "Break" : active?.phase?.label ? PHASE_WORDS[readout.phase] ?? "Focus" : active ? "Focus" : "Ready"}</Text>
        <Text variant="title" align="center" numberOfLines={2}>{active?.title ?? "Nothing running"}</Text>
        <Clock />
        <Rhythm />
      </Pressable>
      <Animated.View pointerEvents={shown ? "box-none" : "none"} style={[StyleSheet.absoluteFill, controls]}>
        <View style={{ position: "absolute", top: space.xl, left: space.xl, right: space.xl, flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <IconButton icon="chevronLeft" label="Leave. The session keeps going" testID="environment-leave" onPress={leave} />
          <View style={{ flex: 1 }} />
          <IconButton icon={dim ? "sun" : "moon"} label={dim ? "Brighter" : "Dimmer"} testID="environment-dim" onPress={() => { setDim(!dim); wake(); }} />
          <IconButton icon="audio" label={audio.playing ? `Pause ${audio.title ?? "sound"}` : "Play the last sound"} testID="environment-sound" disabled={!audio.url} onPress={() => { if (audio.playing) audioEngine.pause(); else if (audio.trackId && audio.url) void audioEngine.play({ id: audio.trackId, title: audio.title ?? "", url: audio.url }); wake(); }} />
        </View>
        <View style={{ position: "absolute", bottom: space.xl, left: space.xl, right: space.xl, alignItems: "center", gap: space.sm }}>
          <View style={{ width: "100%", maxWidth: 420, gap: space.sm }}>
            {canBreak ? <Button title="Take a break" testID="environment-break" onPress={() => { session.takeBreak(); wake(); }} /> : null}
            <SessionActions surface="environment" onEnded={leave} />
            <SessionNote />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export default FocusEnvironment;
