// A surface, drawn entirely from the material and shape axes. Corner details are thin overlays with no layout cost.
import { View, type ViewProps } from "react-native";
import { useTheme } from "../theme/context";
import type { Elevation, ShapeTokens } from "../theme/axes";
import type { SpaceTokens } from "../theme/resolve";

export interface PlaneProps extends ViewProps {
  level?: Elevation;
  radius?: keyof ShapeTokens["radius"];
  pad?: keyof SpaceTokens;
  /** Color behind the surface, so pixel notches can cut into it. */
  behind?: string;
}

export function Plane({ level = "plane", radius = "lg", pad, behind, style, children, ...rest }: PlaneProps) {
  const theme = useTheme();
  return (
    <View {...rest} style={[theme.surface(level, radius), pad ? { padding: theme.space[pad] } : null, style]}>
      {children}
      <Corners behind={behind} />
    </View>
  );
}

export function Corners({ behind }: { behind?: string }) {
  const { shape, material, color } = useTheme();
  const inlay = material.inlay ? <View pointerEvents="none" style={{ position: "absolute", top: 3, left: 3, right: 3, bottom: 3, borderWidth: 1, borderColor: color.accent.line, borderRadius: Math.max(0, shape.radius.xs) }} /> : null;
  if (shape.corner === "round") return inlay;
  const size = shape.corner === "pixel" ? 4 : 6;
  const offset = shape.corner === "pixel" ? -material.border.plane : -3;
  const fill = shape.corner === "pixel" ? behind ?? color.ground : color.accent.mote;
  const positions = [{ top: offset, left: offset }, { top: offset, right: offset }, { bottom: offset, left: offset }, { bottom: offset, right: offset }];
  return (
    <>
      {inlay}
      {positions.map((position, index) => <View key={index} pointerEvents="none" style={[{ position: "absolute", width: size, height: size, backgroundColor: fill }, position, shape.corner === "ornament" ? { transform: [{ rotate: "45deg" }] } : null]} />)}
    </>
  );
}
