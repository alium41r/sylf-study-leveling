// The island, loaded when it is first needed. World's art stays out of Home's first paint and out of memory until the dashboard actually draws it (the
// boundary audit keeps World behind import()), and while it loads the sky's frame is already there, so nothing shifts.
import { Suspense, lazy } from "react";
import { View } from "react-native";
import { useTheme } from "@sylf/design-system";
import type { WorldSky } from "@sylf/spaces";

const Loaded = lazy(() => import("../../world/DashboardWindow").then((module) => ({ default: module.DashboardWindow })));
/** The sky's share of the scene, matching the island's own frame, so the placeholder and the art are the same shape. */
const SKY_TOP = "30%";

export function Scenery({ sky, playing, testID }: { sky: WorldSky; playing: boolean; testID?: string }) {
  const { color, shape } = useTheme();
  const frame = <View aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: SKY_TOP, borderRadius: shape.radius.xl, backgroundColor: color.sunken }} />;
  return <Suspense fallback={frame}><Loaded sky={sky} playing={playing} {...(testID ? { testID } : {})} /></Suspense>;
}
