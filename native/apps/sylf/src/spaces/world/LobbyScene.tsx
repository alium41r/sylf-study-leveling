// The lobby's art: a sky, drifting clouds, the gate and a sea of cloud, all baked plates, plus a few falling petals. One clock drives
// everything that moves, capped at 30 updates a second, because nothing here moves far enough per frame to need more. Nothing
// is scheduled at all with reduced motion, the Still intensity or Drift off, and this unmounts as soon as someone is through the gate.
// Plates are images and not SVG: a full-window SVG costs about 50 MB on Android (Phase 5), and these cost a few MB.
import { memo, useEffect, useState } from "react";
import { Image, StyleSheet, View, type ImageSourcePropType } from "react-native";
import Animated, { Easing, ReduceMotion, cancelAnimation, useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { useTheme, useWindowClass } from "@sylf/design-system";
import type { WorldSky } from "@sylf/spaces";
import { GATE_ANCHORS, GLOW_PLATE, PLATE_SIZES, SKY_PLATES } from "./art/plates.generated";
import { SKY_STYLES, STARS, STAR_COLOR } from "./art/skies";
import { sceneLayout, type SceneLayout } from "./layout";

/** One turn of the clock. Everything repeats a whole number of times in it, so the loop has no seam. */
const LOOP_MS = 240_000;
const LOOP_UPDATES_PER_SECOND = 30;
const CROSSFADE_MS = 460;

interface Motion { tick: SharedValue<number>; pointer: SharedValue<number> }

function Plate({ source, width, height }: { source: ImageSourcePropType; width: number; height: number }) {
  return <Image source={source} fadeDuration={0} resizeMode="stretch" style={{ width, height }} />;
}

function Cloud({ source, top, width, turns, phase, opacity, depth, travel, motion }: { source: ImageSourcePropType; top: number; width: number; turns: number; phase: number; opacity: number; depth: number; travel: number; motion: Motion }) {
  const { tick, pointer } = motion;
  const size = PLATE_SIZES.cloudA;
  const height = width * (size.height / size.width);
  const span = travel + width;
  const style = useAnimatedStyle(() => {
    const along = (tick.value * turns + phase) % 1;
    return { transform: [{ translateX: span * (1 - along) - width + pointer.value * depth }] };
  });
  return <Animated.View style={[{ position: "absolute", top, left: 0, opacity }, style]}><Plate source={source} width={width} height={height} /></Animated.View>;
}

/** A petal is one small block, as in the visual direction's wind sheet. It falls right to left and sways. */
function Petal({ index, count, color, motion, width, height, size }: { index: number; count: number; color: string; motion: Motion; width: number; height: number; size: number }) {
  const { tick } = motion;
  const turns = 14 + (index % 5) * 3;
  const phase = index / count;
  const start = ((index * 37) % 100) / 100;
  const style = useAnimatedStyle(() => {
    const t = (tick.value * turns + phase) % 1;
    const x = (width + 80) * (1 - t) - 40 + 26 * Math.sin(t * 12.566 + index);
    const y = -24 + (height * 0.92 + 48) * ((t + start) % 1);
    return { opacity: Math.min(1, Math.min((t + start) % 1, 1 - ((t + start) % 1)) * 12), transform: [{ translateX: x }, { translateY: y }, { rotate: `${Math.round(t * 720)}deg` }] };
  });
  return <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: size, height: size, backgroundColor: color }, style]} />;
}

const SkySet = memo(function SkySet({ sky, layout, motion, aim, open }: { sky: WorldSky; layout: SceneLayout; motion: Motion; aim: SharedValue<number>; open: SharedValue<number> }) {
  const { width, height } = useWindowClass();
  const plates = SKY_PLATES[sky];
  const style = SKY_STYLES[sky];
  const { gate, sea } = layout;
  const { tick, pointer } = motion;
  const threshold = gate.width * 0.66;
  const lamp = gate.width * 0.24;

  const gatePlace = useAnimatedStyle(() => ({ opacity: 1 - open.value * 0.2, transform: [{ translateX: pointer.value * 7 + open.value * width * 0.03 }] }));
  const seaPlace = useAnimatedStyle(() => ({ transform: [{ translateX: pointer.value * 16 }] }));
  const glow = useAnimatedStyle(() => ({ opacity: Math.min(1, style.threshold * (0.9 + 0.1 * Math.sin(tick.value * 75.398)) + aim.value * 0.24) }));

  return (
    <>
      <Plate source={plates.sky} width={width} height={height} />
      {style.stars ? STARS.map(([x, y, size], index) => <View key={index} style={{ position: "absolute", left: x * width, top: y * height, width: size * 1.5, height: size * 1.5, backgroundColor: STAR_COLOR, opacity: 0.35 + (index % 4) * 0.2 }} />) : null}
      <Cloud source={plates.cloudB} top={height * 0.21} width={width * 0.15} turns={1} phase={0.62} opacity={0.72 * style.clouds} depth={2} travel={width} motion={motion} />
      <Cloud source={plates.cloudA} top={height * 0.05} width={Math.max(220, width * 0.27)} turns={2} phase={0.38} opacity={0.96 * style.clouds} depth={4} travel={width} motion={motion} />
      <Cloud source={plates.cloudB} top={height * 0.11} width={Math.max(130, width * 0.17)} turns={3} phase={0.82} opacity={0.88 * style.clouds} depth={5} travel={width} motion={motion} />
      <Animated.View style={[{ position: "absolute", left: gate.x, top: gate.y, width: gate.width, height: gate.height }, gatePlace]}>
        <Plate source={plates.gate} width={gate.width} height={gate.height} />
        <Animated.View style={[{ position: "absolute", left: gate.width * GATE_ANCHORS.threshold.x - threshold / 2, top: gate.height * GATE_ANCHORS.threshold.y - threshold / 2 }, glow]}>
          <Plate source={GLOW_PLATE} width={threshold} height={threshold} />
        </Animated.View>
        {GATE_ANCHORS.lanterns.map((anchor) => (
          <View key={anchor.x} style={{ position: "absolute", left: gate.width * anchor.x - lamp / 2, top: gate.height * anchor.y - lamp / 2, opacity: style.lantern }}>
            <Plate source={GLOW_PLATE} width={lamp} height={lamp} />
          </View>
        ))}
      </Animated.View>
      <Animated.View style={[{ position: "absolute", left: sea.x, top: sea.y }, seaPlace]}><Plate source={plates.sea} width={sea.width} height={sea.height} /></Animated.View>
    </>
  );
});

function Layer({ sky, layout, motion, aim, open, arriving }: { sky: WorldSky; layout: SceneLayout; motion: Motion; aim: SharedValue<number>; open: SharedValue<number>; arriving: boolean }) {
  const theme = useTheme();
  const shown = useSharedValue(arriving ? 0 : 1);
  useEffect(() => { if (arriving) shown.value = withTiming(1, { duration: theme.motion.amount === 0 ? theme.motion.fade.base : CROSSFADE_MS, reduceMotion: ReduceMotion.Never }); }, [arriving, shown, theme.motion]);
  const style = useAnimatedStyle(() => ({ opacity: shown.value }));
  return <Animated.View style={[StyleSheet.absoluteFill, style]}><SkySet sky={sky} layout={layout} motion={motion} aim={aim} open={open} /></Animated.View>;
}

/**
 * `through` is the walk through the gate, from 0 to 1. `aim` rises while the way in is under the pointer or the keyboard. `open` is a
 * panel being open, and `pointer` is the mouse across the window, from -1 to 1.
 */
export function LobbyScene({ sky, drift, through, aim, open, pointer }: { sky: WorldSky; drift: boolean; through: SharedValue<number>; aim: SharedValue<number>; open: SharedValue<number>; pointer: SharedValue<number> }) {
  const { motion } = useTheme();
  const { size, width, height } = useWindowClass();
  const layout = sceneLayout(width, height, size === "compact");
  const clock = useSharedValue(0);
  const moving = drift && motion.amount > 0;
  const rate = motion.steps > 0 ? motion.steps : LOOP_UPDATES_PER_SECOND;
  const updates = (LOOP_MS / 1000) * rate;
  const tick = useDerivedValue(() => Math.floor(clock.value * updates) / updates);
  const scene = { tick, pointer };

  useEffect(() => {
    if (!moving) { cancelAnimation(clock); return; }
    // Starts from wherever it stopped, and every position is taken modulo one, so a repeat never shows.
    const from = clock.value;
    clock.value = withRepeat(withTiming(from + 1, { duration: LOOP_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }), -1, false);
    return () => cancelAnimation(clock);
  }, [moving, clock]);

  // A new sky comes in over the old one, which leaves when it is covered.
  const [skies, setSkies] = useState({ current: sky, previous: null as WorldSky | null });
  if (skies.current !== sky) setSkies({ current: sky, previous: skies.current });
  useEffect(() => {
    if (!skies.previous) return;
    const timer = setTimeout(() => setSkies((value) => ({ ...value, previous: null })), motion.amount === 0 ? motion.fade.base + 40 : CROSSFADE_MS + 40);
    return () => clearTimeout(timer);
  }, [skies, motion]);

  // Scaling about the middle of the window, while the gate's opening slides to that middle, so the walk heads straight through it.
  const amount = motion.amount;
  const { threshold } = layout;
  const walk = useAnimatedStyle(() => {
    const t = through.value;
    const scale = 1 + (1.5 * amount + 0.04 * aim.value * amount) * t + 0.012 * aim.value * amount;
    const offset = (from: number, center: number) => (from - center) * (1 - t * (amount > 0 ? 1 : 0) - scale);
    return { transform: [{ translateX: offset(threshold.x, width / 2) }, { translateY: offset(threshold.y, height / 2) }, { scale }] };
  });
  const petals = moving ? SKY_STYLES[sky].petals : 0;

  return (
    <View testID="world-scene" pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Animated.View style={[StyleSheet.absoluteFill, walk]}>
        {skies.previous ? <Layer key={skies.previous} sky={skies.previous} layout={layout} motion={scene} aim={aim} open={open} arriving={false} /> : null}
        <Layer key={skies.current} sky={skies.current} layout={layout} motion={scene} aim={aim} open={open} arriving={skies.previous !== null} />
      </Animated.View>
      {Array.from({ length: petals }, (_, index) => <Petal key={index} index={index} count={petals} color={SKY_STYLES[sky].petal} motion={scene} width={width} height={height} size={index % 3 === 0 ? 7 : 5} />)}
    </View>
  );
}
