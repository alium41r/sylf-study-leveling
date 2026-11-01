import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useTheme } from "../theme/context";
import type { TextVariant } from "../theme/resolve";

export type TextTone = "ink" | "soft" | "faint" | "ghost" | "accent" | "onFill" | "positive" | "caution" | "critical";

export interface TextProps extends RNTextProps { variant?: TextVariant; tone?: TextTone; align?: "left" | "center" | "right" }

export function Text({ variant = "body", tone = "ink", align, style, ...rest }: TextProps) {
  const { type, color } = useTheme();
  const { maxScale, ...typeStyle } = type[variant];
  const colors: Record<TextTone, string> = { ink: color.ink, soft: color.inkSoft, faint: color.inkFaint, ghost: color.inkGhost, accent: color.accent.ink, onFill: color.accent.on, positive: color.positive.ink, caution: color.caution.ink, critical: color.critical.ink };
  return <RNText maxFontSizeMultiplier={maxScale} {...rest} style={[typeStyle, { color: colors[tone] }, align ? { textAlign: align } : null, style]} />;
}
