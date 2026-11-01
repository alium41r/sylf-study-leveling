import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "../icons";
import { Marker } from "../primitives/Marker";
import { Text } from "../primitives/Text";
import { useTheme } from "../theme/context";
import { move } from "../runtime/motion";

/** A fine rule with the Marker riding its leading edge. */
export function Progress({ value, label, showValue }: { value: number; label: string; showValue?: boolean }) {
  const { color, motion, space } = useTheme();
  const clamped = Math.min(1, Math.max(0, value));
  const [width, setWidth] = useState(0);
  const position = useSharedValue(clamped);
  useEffect(() => { position.value = move(clamped, motion, "glide"); }, [clamped, motion, position]);
  const fill = useAnimatedStyle(() => ({ width: position.value * width }));
  const head = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * width - 3 }] }));
  return (
    <View accessible role="progressbar" aria-label={label} aria-valuenow={Math.round(clamped * 100)} aria-valuemin={0} aria-valuemax={100} style={{ gap: space.xs }}>
      {showValue ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="caption" tone="soft">{label}</Text>
          <Text variant="micro" tone="soft">{Math.round(clamped * 100)}%</Text>
        </View>
      ) : null}
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 8, justifyContent: "center" }}>
        <View style={{ height: 1, backgroundColor: color.line }} />
        <Animated.View style={[{ position: "absolute", left: 0, height: 2, backgroundColor: color.accent.fill }, fill]} />
        <Animated.View style={[{ position: "absolute", left: 0 }, head]}><Marker /></Animated.View>
      </View>
    </View>
  );
}

/** Discrete cells, from the pixel lineage: counts of sessions, levels, or steps. */
export function Meter({ value, max, label, tone = "accent" }: { value: number; max: number; label: string; tone?: "accent" | "positive" | "caution" | "critical" }) {
  const { color, shape, space } = useTheme();
  const fill = tone === "accent" ? color.accent.mote : color[tone].mark;
  return (
    <View accessible role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} style={{ flexDirection: "row", gap: space.hair + 1 }}>
      {Array.from({ length: max }, (_, i) => <View key={i} style={{ flex: 1, maxWidth: 22, height: 6, borderRadius: Math.min(shape.radius.xs, 2), backgroundColor: i < value ? fill : color.line }} />)}
    </View>
  );
}

/** A waiting state that breathes rather than spins. */
export function Activity({ label }: { label: string }) {
  return <View accessible role="progressbar" aria-label={label} aria-busy style={{ padding: 4 }}><Marker breathing scale={1.2} /></View>;
}

export function Placeholder({ width = "100%", height = 12 }: { width?: number | `${number}%`; height?: number }) {
  const { color, motion, shape } = useTheme();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (motion.amount === 0) return;
    opacity.value = withRepeat(withSequence(withTiming(0.45, { duration: 900, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never }), withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never })), -1);
  }, [motion.amount, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View aria-hidden style={[{ width, height, borderRadius: Math.min(shape.radius.xs, height / 2), backgroundColor: color.line }, animated]} />;
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "accent" | "positive" | "caution" | "critical" }) {
  const { color, shape, space } = useTheme();
  const palette = tone === "neutral" ? { background: color.selected, text: "soft" as const } : tone === "accent" ? { background: color.accent.wash, text: "accent" as const } : { background: color[tone].wash, text: tone };
  return <View style={{ alignSelf: "flex-start", paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: shape.radius.xs, backgroundColor: palette.background }}><Text variant="caption" tone={palette.text}>{label}</Text></View>;
}

export function Avatar({ name, size = 36, presence }: { name: string; size?: number; presence?: "online" | "focusing" }) {
  const { color, shape } = useTheme();
  const initials = name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return (
    <View accessible aria-label={presence ? `${name}, ${presence}` : name} style={{ width: size, height: size }}>
      <View style={{ flex: 1, borderRadius: shape.radius.md, backgroundColor: color.accent.wash, alignItems: "center", justifyContent: "center" }}>
        <Text variant="caption" tone="accent">{initials}</Text>
      </View>
      {presence ? <View style={{ position: "absolute", right: -2, bottom: -2, padding: 2, backgroundColor: color.ground, borderRadius: 3 }}><Marker color={presence === "online" ? color.positive.mark : color.accent.mote} /></View> : null}
    </View>
  );
}

export function Keycap({ keys }: { keys: string }) {
  const { color, shape, space } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space.hair }}>
      {keys.split("+").map((key) => <View key={key} style={{ minWidth: 22, alignItems: "center", paddingHorizontal: 5, paddingVertical: 1, borderRadius: shape.radius.xs, borderWidth: 1, borderColor: color.line, backgroundColor: color.raised }}><Text variant="micro" tone="soft">{key}</Text></View>)}
    </View>
  );
}

export function Callout({ tone = "neutral", title, message, icon }: { tone?: "neutral" | "positive" | "caution" | "critical"; title: string; message?: string; icon?: IconName }) {
  const { color, shape, space } = useTheme();
  const neutral = tone === "neutral";
  const background = neutral ? color.accent.wash : color[tone].wash;
  const mark = neutral ? color.accent.ink : color[tone].ink;
  return (
    <View role="note" style={{ flexDirection: "row", gap: space.md, padding: space.md, borderRadius: shape.radius.md, backgroundColor: background }}>
      <Icon name={icon ?? (tone === "critical" || tone === "caution" ? "warning" : "info")} size={18} color={mark} markColor={mark} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subheading">{title}</Text>
        {message ? <Text variant="small" tone="soft">{message}</Text> : null}
      </View>
    </View>
  );
}

export function Readout({ value, label, unit, size = "regular" }: { value: string; label: string; unit?: string; size?: "regular" | "large" }) {
  return (
    <View accessible aria-label={`${label}: ${value}${unit ? ` ${unit}` : ""}`}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text variant={size === "large" ? "readoutXL" : "readout"}>{value}</Text>
        {unit ? <Text variant="value" tone="soft">{unit}</Text> : null}
      </View>
      <Text variant="caption" tone="soft">{label}</Text>
    </View>
  );
}

export function EmptyState({ title, message, icon, action }: { title: string; message: string; icon?: IconName; action?: React.ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg }}>
      {icon ? <Icon name={icon} size={26} active /> : <Marker scale={1.4} breathing />}
      <Text variant="title" align="center">{title}</Text>
      <Text variant="small" tone="soft" align="center" style={{ maxWidth: 340 }}>{message}</Text>
      {action}
    </View>
  );
}
