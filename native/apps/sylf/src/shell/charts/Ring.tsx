// A progress ring that reads as an instrument: a quiet track, the progress laid over it, and the Marker sitting at the leading edge, as it does at the
// end of every other measure in Aloft. It is drawn small (a few hundred pixels of SVG, never a window's worth), carries no animation, and the number
// in the middle is whatever the caller passes. The caller decides what the ring measures and says so in `label`.
import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Marker, useTheme } from "@sylf/design-system";

export function Ring({ value, size = 168, stroke = 8, label, children, testID }: { value: number; size?: number; stroke?: number; label: string; children?: ReactNode; testID?: string }) {
  const { color } = useTheme();
  const fraction = Math.min(1, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const angle = -Math.PI / 2 + fraction * 2 * Math.PI;
  const edge = { x: centre + radius * Math.cos(angle), y: centre + radius * Math.sin(angle) };
  return (
    <View testID={testID} accessible role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={centre} cy={centre} r={radius} stroke={color.line} strokeWidth={stroke} fill="none" />
        {fraction > 0 ? <Circle cx={centre} cy={centre} r={radius} stroke={color.accent.mote} strokeWidth={stroke} fill="none" strokeDasharray={`${circumference * fraction} ${circumference}`} transform={`rotate(-90 ${centre} ${centre})`} /> : null}
      </Svg>
      {fraction > 0 ? <View pointerEvents="none" style={{ position: "absolute", left: edge.x - 4, top: edge.y - 4 }}><Marker /></View> : null}
      <View style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: stroke * 2 }}>{children}</View>
    </View>
  );
}
