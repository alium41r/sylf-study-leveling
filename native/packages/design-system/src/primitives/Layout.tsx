import type { ComponentRef } from "react";
import { View, type ViewProps, type ViewStyle } from "react-native";
import { useTheme } from "../theme/context";
import type { SpaceTokens } from "../theme/resolve";

/** The instance type of a mounted View: what refs, measureInWindow and focus work with. */
export type ViewHandle = ComponentRef<typeof View>;

interface StackProps extends ViewProps { gap?: keyof SpaceTokens; align?: ViewStyle["alignItems"]; justify?: ViewStyle["justifyContent"]; wrap?: boolean; flex?: number }

function useStackStyle({ gap, align, justify, wrap, flex }: StackProps): ViewStyle {
  const { space } = useTheme();
  return { gap: gap ? space[gap] : undefined, alignItems: align, justifyContent: justify, flexWrap: wrap ? "wrap" : undefined, flex };
}

export function Stack({ style, gap, align, justify, wrap, flex, ...rest }: StackProps) {
  return <View {...rest} style={[useStackStyle({ gap, align, justify, wrap, flex }), style]} />;
}

export function Row({ style, gap, align = "center", justify, wrap, flex, ...rest }: StackProps) {
  return <View {...rest} style={[{ flexDirection: "row" }, useStackStyle({ gap, align, justify, wrap, flex }), style]} />;
}

/** The hairline between groups. Space separates first; this is the last resort. */
export function Divider({ vertical, style }: { vertical?: boolean; style?: ViewStyle }) {
  const { color } = useTheme();
  return <View role="presentation" style={[vertical ? { width: 1, alignSelf: "stretch" } : { height: 1, alignSelf: "stretch" }, { backgroundColor: color.line }, style]} />;
}
