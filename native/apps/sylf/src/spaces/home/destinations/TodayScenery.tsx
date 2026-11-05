// The window onto the World, loaded when it is first needed. World's art stays out of Home's first paint and out of memory until a dashboard actually draws it
// (the boundary audit keeps World behind import()), and while it loads the frame is already there, so nothing shifts.
import { Suspense, lazy } from "react";
import { View } from "react-native";
import { useTheme } from "@sylf/design-system";
import type { WorldSky } from "@sylf/spaces";

const Loaded = lazy(() => import("../../world/DashboardWindow").then((module) => ({ default: module.DashboardWindow })));

export function Scenery({ sky, width, height, bleed, gate, testID }: { sky: WorldSky; width?: number | `${number}%`; height?: number | `${number}%`; bleed?: boolean; gate?: boolean; testID?: string }) {
  const { color } = useTheme();
  const frame = <View aria-hidden style={{ width: width ?? "100%", height: height ?? "100%", backgroundColor: color.sunken }} />;
  return <Suspense fallback={frame}><Loaded sky={sky} {...(width !== undefined ? { width } : {})} {...(height !== undefined ? { height } : {})} {...(bleed !== undefined ? { bleed } : {})} {...(gate !== undefined ? { gate } : {})} {...(testID ? { testID } : {})} /></Suspense>;
}
