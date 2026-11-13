// Home's view of Sylf World: the gate on its dais, standing in the sea of cloud, a little way off. It is the World's own baked plates for the hour, layered
// the way the lobby layers them, so it is art, like the lobby's: authored plates that never follow the theme. The sky is a window, and the gate's roof rises
// out of its top edge, which is what keeps this a picture and not a card.
//
// It moves, barely: the dais rises and settles, two clouds drift, the sea sways and the light in the opening breathes. Every one of those is a CSS animation
// of transform or opacity (Reanimated's CSS engine: real @keyframes on the web, the UI thread on a device), so between frames no JavaScript runs and React
// renders nothing. `playing` pauses all of it when Home's dashboard is not what is on screen, and with reduced motion or the Still intensity no animation is
// created at all. It lives in World's folder because World's art may only be imported from there, and Home loads it with import() when it first draws it.
import { memo, useMemo } from "react";
import { Image, Platform, View, type ImageSourcePropType, type ViewStyle } from "react-native";
import Animated, { steps as stepped } from "react-native-reanimated";
import { useTheme } from "@sylf/design-system";
import type { WorldSky } from "@sylf/spaces";
import { GATE_ANCHORS, GLOW_PLATE, PLATE_SIZES, SKY_PLATES } from "./art/plates.generated";
import { SKY_STYLES, STARS, STAR_COLOR } from "./art/skies";
import { ISLAND_FRAME, islandMotion, type Swing } from "./dashboardMotion";

const GATE_RATIO = PLATE_SIZES.gate.width / PLATE_SIZES.gate.height;
const SEA_RATIO = PLATE_SIZES.sea.width / PLATE_SIZES.sea.height;
const CLOUD_A_RATIO = PLATE_SIZES.cloudA.width / PLATE_SIZES.cloudA.height;
const CLOUD_B_RATIO = PLATE_SIZES.cloudB.width / PLATE_SIZES.cloudB.height;
/** The light in the opening and at the lanterns, as shares of the gate's width. */
const THRESHOLD_GLOW = 0.66;
const LANTERN_GLOW = 0.24;
/** A handful of the lobby's stars, the ones high in the sky. */
const WINDOW_STARS = STARS.filter(([, y]) => y < 0.34).slice(0, 12);

const percent = (value: number) => `${Math.round(value * 1000) / 10}%` as `${number}%`;
const fill = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, width: "100%", height: "100%" } as const;

function Plate({ source, stretch }: { source: ImageSourcePropType; stretch?: boolean }) {
  return <Image source={source} fadeDuration={0} resizeMode={stretch ? "stretch" : "cover"} style={fill} />;
}

type Axis = "translateX" | "translateY";
/** A swing as animation styles. Null when nothing moves, so the layer is a plain view. */
function swingStyle(swing: Swing | undefined, axis: Axis, sign: 1 | -1, playing: boolean) {
  if (!swing) return null;
  return {
    animationName: { from: { transform: [{ [axis]: 0 } as { translateX: number }] }, to: { transform: [{ [axis]: sign * swing.distance } as { translateX: number }] } },
    animationDuration: swing.duration,
    animationTimingFunction: swing.steps > 0 ? stepped(swing.steps) : "ease-in-out",
    animationIterationCount: "infinite",
    animationDirection: "alternate",
    animationPlayState: playing ? "running" : "paused",
  } as const;
}

export const DashboardWindow = memo(function DashboardWindow({ sky, playing = true, testID }: { sky: WorldSky; /** False while the dashboard is not what is on screen. */ playing?: boolean; testID?: string }) {
  const { color, motion, shape } = useTheme();
  const plates = SKY_PLATES[sky];
  const look = SKY_STYLES[sky];
  const plan = useMemo(() => islandMotion(motion.amount, motion.steps), [motion.amount, motion.steps]);
  const styles = useMemo(() => ({
    float: swingStyle(plan?.float, "translateY", -1, playing),
    cloudNear: swingStyle(plan?.cloudNear, "translateX", -1, playing),
    cloudFar: swingStyle(plan?.cloudFar, "translateX", 1, playing),
    sea: swingStyle(plan?.sea, "translateX", 1, playing),
    glow: plan ? {
      animationName: { from: { opacity: look.threshold }, to: { opacity: look.threshold * plan.glow.low } },
      animationDuration: plan.glow.duration,
      animationTimingFunction: plan.glow.steps > 0 ? stepped(plan.glow.steps) : "ease-in-out",
      animationIterationCount: "infinite",
      animationDirection: "alternate",
      animationPlayState: playing ? "running" : "paused",
    } as const : null,
  }), [plan, playing, look.threshold]);

  const skyBox: ViewStyle = { position: "absolute", left: 0, right: 0, bottom: 0, top: percent(ISLAND_FRAME.skyTop), borderRadius: shape.radius.xl, overflow: "hidden" };
  const glowLeft = percent(GATE_ANCHORS.threshold.x - THRESHOLD_GLOW / 2);
  const glowTop = percent(GATE_ANCHORS.threshold.y - (THRESHOLD_GLOW * GATE_RATIO) / 2);

  return (
    <View testID={testID} {...(Platform.OS === "web" ? { dataSet: { island: plan ? (playing ? "running" : "paused") : "still" } } as object : {})} aria-hidden accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width: "100%", height: "100%" }}>
      <View style={[skyBox, { backgroundColor: color.sunken }]}>
        <Plate source={plates.sky} />
        {look.stars ? WINDOW_STARS.map(([x, y, size], index) => <View key={index} style={{ position: "absolute", left: percent(x), top: percent(y * 1.6), width: size, height: size, backgroundColor: STAR_COLOR, opacity: 0.35 + (index % 4) * 0.2 }} />) : null}
        <Animated.View style={[{ position: "absolute", top: "9%", left: "5%", width: "24%", aspectRatio: CLOUD_B_RATIO, opacity: 0.8 * look.clouds }, styles.cloudFar]}><Plate source={plates.cloudB} stretch /></Animated.View>
        <Animated.View style={[{ position: "absolute", top: "20%", right: "3%", width: "33%", aspectRatio: CLOUD_A_RATIO, opacity: 0.94 * look.clouds }, styles.cloudNear]}><Plate source={plates.cloudA} stretch /></Animated.View>
      </View>
      {/* The gate is clipped by the sky's lower edge and corners, and by nothing above, so its roof stands clear of the window. */}
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden", borderBottomLeftRadius: shape.radius.xl, borderBottomRightRadius: shape.radius.xl }}>
        <Animated.View style={[{ position: "absolute", alignSelf: "center", bottom: percent(ISLAND_FRAME.gateBottom), height: percent(ISLAND_FRAME.gateHeight), aspectRatio: GATE_RATIO }, styles.float]}>
          <Plate source={plates.gate} stretch />
          <Animated.View style={[{ position: "absolute", left: glowLeft, top: glowTop, width: percent(THRESHOLD_GLOW), aspectRatio: 1, opacity: look.threshold }, styles.glow]}><Plate source={GLOW_PLATE} stretch /></Animated.View>
          {GATE_ANCHORS.lanterns.map((anchor) => (
            <View key={anchor.x} style={{ position: "absolute", left: percent(anchor.x - LANTERN_GLOW / 2), top: percent(anchor.y - (LANTERN_GLOW * GATE_RATIO) / 2), width: percent(LANTERN_GLOW), aspectRatio: 1, opacity: look.lantern }}><Plate source={GLOW_PLATE} stretch /></View>
          ))}
        </Animated.View>
      </View>
      <View style={skyBox}>
        <Animated.View style={[{ position: "absolute", bottom: percent(ISLAND_FRAME.seaBottom), left: "-24%", width: "148%", aspectRatio: SEA_RATIO }, styles.sea]}><Plate source={plates.sea} stretch /></Animated.View>
      </View>
    </View>
  );
});
