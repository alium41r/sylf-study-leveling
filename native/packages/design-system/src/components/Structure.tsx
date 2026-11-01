import { useEffect, useState, type ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { Icon, type IconName } from "../icons";
import { Marker } from "../primitives/Marker";
import { FocusRing, Press } from "../primitives/Press";
import { Text } from "../primitives/Text";
import { useInputFormat, useTheme, useWindowClass } from "../theme/context";
import { useInputMode } from "../runtime/input";
import { move } from "../runtime/motion";
import { clampRect, resolveSplit, type Rect } from "../logic/geometry";

export function SafeArea({ edges = ["top", "left", "right", "bottom"], style, children }: { edges?: Edge[]; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[{ paddingTop: edges.includes("top") ? insets.top : 0, paddingLeft: edges.includes("left") ? insets.left : 0, paddingRight: edges.includes("right") ? insets.right : 0, paddingBottom: edges.includes("bottom") ? insets.bottom : 0 }, style]}>{children}</View>;
}

/** Equal columns that follow the window class, never the device: 1 in compact, up to `max` when expanded. */
export function Columns({ children, max = 3, min = 1 }: { children: ReactNode[]; max?: number; min?: number }) {
  const { size } = useWindowClass();
  const { space } = useTheme();
  const count = Math.max(min, size === "compact" ? 1 : size === "medium" ? Math.min(2, max) : max);
  const columns: ReactNode[][] = Array.from({ length: count }, () => []);
  children.forEach((child, index) => columns[index % count].push(child));
  return <View style={{ flexDirection: "row", gap: space.xl }}>{columns.map((column, index) => <View key={index} style={{ flex: 1, minWidth: 0, gap: space.xl }}>{column}</View>)}</View>;
}

export function ListRow({ title, detail, icon, trailing, selected, onPress, disabled, value }: { title: string; detail?: string; icon?: IconName; trailing?: ReactNode; selected?: boolean; onPress?: () => void; disabled?: boolean; value?: string }) {
  const { density, shape, space, color } = useTheme();
  const format = useInputFormat();
  const content = (
    <>
      {selected ? <View style={{ position: "absolute", left: 0 }}><Marker /></View> : null}
      {icon ? <Icon name={icon} size={18} active={selected} color={selected ? color.ink : color.inkSoft} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small" numberOfLines={1}>{title}</Text>
        {detail ? <Text variant="caption" tone="soft" numberOfLines={1}>{detail}</Text> : null}
      </View>
      {value ? <Text variant="value" tone="soft">{value}</Text> : null}
      {trailing}
    </>
  );
  const body: ViewStyle = { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, minHeight: density.row[format] };
  if (!onPress) return <View style={body}>{content}</View>;
  return <Press role="button" label={title} selected={selected} disabled={disabled} onPress={onPress} radius={shape.radius.sm} bodyStyle={body}>{content}</Press>;
}

export function Disclosure({ title, detail, defaultOpen, children, icon }: { title: string; detail?: string; defaultOpen?: boolean; icon?: IconName; children: ReactNode }) {
  const { space, motion, color, shape } = useTheme();
  const [open, setOpen] = useState(!!defaultOpen);
  const turn = useSharedValue(defaultOpen ? 1 : 0);
  useEffect(() => { turn.value = move(open ? 1 : 0, motion); }, [open, motion, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 90}deg` }] }));
  return (
    <View>
      <Press role="button" label={title} expanded={open} onPress={() => setOpen(!open)} radius={shape.radius.sm} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.xs }}>
        {icon ? <Icon name={icon} size={18} color={color.inkSoft} /> : null}
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{title}</Text>
          {detail ? <Text variant="caption" tone="soft" numberOfLines={1}>{detail}</Text> : null}
        </View>
        <Animated.View style={chevron}><Icon name="chevronRight" size={14} color={color.inkFaint} /></Animated.View>
      </Press>
      {open ? <View style={{ paddingHorizontal: space.xs, paddingBottom: space.md, gap: space.md }}>{children}</View> : null}
    </View>
  );
}

const SPLIT_SNAPS = [1 / 3, 0.5, 2 / 3];

/** Two resizable panes. Drag with touch, pen or mouse; arrow keys on desktop; snaps to thirds and halves. */
export function Splitter({ first, second, initial = 0.5, minPane = 160, height = 240, label = "Resize panes" }: { first: ReactNode; second: ReactNode; initial?: number; minPane?: number; height?: number; label?: string }) {
  const { color, motion, shape } = useTheme();
  const inputMode = useInputMode();
  const [total, setTotal] = useState(0);
  const [focused, setFocused] = useState(false);
  const ratio = useSharedValue(initial);
  const start = useSharedValue(initial);
  const active = useSharedValue(0);
  const width = useSharedValue(0);
  const [, setSettled] = useState(initial);

  const pan = usePanGesture({
    activeOffsetX: [-2, 2],
    onBegin: () => { "worklet"; start.value = ratio.value; active.value = move(1, motion); },
    onUpdate: (event) => { "worklet"; if (width.value > 0) ratio.value = resolveSplit(start.value + event.translationX / width.value, width.value, minPane, SPLIT_SNAPS); },
    onFinalize: () => { "worklet"; active.value = move(0, motion); scheduleOnRN(setSettled, ratio.value); },
  });
  const firstStyle = useAnimatedStyle(() => ({ width: ratio.value * width.value }));
  const grip = useAnimatedStyle(() => ({ opacity: 0.5 + active.value * 0.5, transform: [{ scaleY: 1 + active.value * 0.4 }] }));
  const nudge = (delta: number) => { const next = resolveSplit(ratio.value + delta, total, minPane, []); ratio.value = move(next, motion); setSettled(next); };
  const webProps = Platform.OS === "web" ? { tabIndex: 0, onFocus: () => setFocused(true), onBlur: () => setFocused(false), onKeyDown: (event: { key: string; preventDefault(): void }) => { if (event.key === "ArrowLeft") { event.preventDefault(); nudge(-0.02); } if (event.key === "ArrowRight") { event.preventDefault(); nudge(0.02); } } } : {};

  return (
    <View onLayout={(e) => { const w = e.nativeEvent.layout.width; setTotal(w); width.value = w; }} style={{ flexDirection: "row", height, overflow: "hidden", borderRadius: shape.radius.lg, borderWidth: 1, borderColor: color.line }}>
      <Animated.View style={[{ overflow: "hidden" }, firstStyle]}>{first}</Animated.View>
      <GestureDetector gesture={pan}>
        <View {...webProps as object} accessible role="slider" aria-label={label} accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === "increment" ? 0.05 : -0.05)} style={[{ width: 14, marginHorizontal: -7, zIndex: 2, alignItems: "center", justifyContent: "center" }, Platform.select({ web: { cursor: "col-resize", outlineStyle: "none", touchAction: "none" } as object, default: {} })]}>
          <View style={{ position: "absolute", top: 0, bottom: 0, left: 6.5, width: 1, backgroundColor: color.line }} />
          <Animated.View style={[{ width: 3, height: 28, borderRadius: 2, backgroundColor: color.inkSoft }, grip]} />
          {focused && inputMode === "keyboard" ? <FocusRing radius={2} inset={0} /> : null}
        </View>
      </GestureDetector>
      <View style={{ flex: 1, minWidth: 0 }}>{second}</View>
    </View>
  );
}

/** Pick something up: it lifts, follows any pointer, and is held inside its container when released. */
export function Lift({ container, initial, size, children, label }: { container: { width: number; height: number }; initial: { x: number; y: number }; size: { width: number; height: number }; children: ReactNode; label: string }) {
  const theme = useTheme();
  const { motion, shape } = theme;
  const x = useSharedValue(initial.x);
  const y = useSharedValue(initial.y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const lifted = useSharedValue(0);
  const settle = (rect: Rect) => { const next = clampRect(rect, container); x.value = move(next.x, motion, "lift"); y.value = move(next.y, motion, "lift"); };
  useEffect(() => { settle({ x: x.value, y: y.value, ...size }); }, [container.width, container.height]);
  const pan = usePanGesture({
    minDistance: 1,
    onBegin: () => { "worklet"; startX.value = x.value; startY.value = y.value; lifted.value = move(1, motion); },
    onUpdate: (event) => { "worklet"; x.value = startX.value + event.translationX; y.value = startY.value + event.translationY; },
    onFinalize: () => { "worklet"; lifted.value = move(0, motion); scheduleOnRN(settle, { x: x.value, y: y.value, ...size }); },
  });
  const amount = motion.amount;
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value - lifted.value * 3 * amount }, { scale: 1 + lifted.value * 0.025 * amount }] }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View aria-label={label} role="button" style={[theme.surface("float", "lg"), { position: "absolute", width: size.width, height: size.height, borderRadius: shape.radius.lg }, Platform.select({ web: { cursor: "grab", touchAction: "none", userSelect: "none" } as object, default: {} }), animated]}>{children}</Animated.View>
    </GestureDetector>
  );
}

/**
 * Hosts authored content. Notes, ink, PDFs and document formatting belong to the document, so this surface deliberately
 * reads NOTHING from the theme: it takes the document's own paper and passes through everything inside it unchanged.
 */
export const DOCUMENT_DEFAULTS = { paper: "#ffffff", ink: "#1a1a1a", fontFamily: undefined } as const;

export function DocumentSurface({ paper = DOCUMENT_DEFAULTS.paper, children, style }: { paper?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: paper, overflow: "hidden" }, style]}>{children}</View>;
}

