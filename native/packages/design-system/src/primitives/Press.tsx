// Every interactive surface is a Press. It owns hover, press, keyboard focus, disabled and busy state for touch, stylus,
// mouse, trackpad and keyboard, so individual controls only describe how they look.
import { useCallback, useRef, useState, type ReactNode, type Ref } from "react";
import { Platform, Pressable, StyleSheet, View, type AccessibilityRole, type GestureResponderEvent, type Insets, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useInputFormat, useTheme } from "../theme/context";
import { fade, move } from "../runtime/motion";
import { focusImpliesKeyboard } from "../runtime/input-listeners";
import { setInputMode, useInputMode } from "../runtime/input";
import type { ViewHandle } from "./Layout";

export interface PressProps extends Omit<PressableProps, "children" | "style" | "disabled" | "role"> {
  ref?: Ref<ViewHandle>;
  children?: ReactNode;
  label?: string;
  hint?: string;
  role?: AccessibilityRole | "tab" | "menuitem" | "option" | "radio" | "checkbox" | "switch";
  disabled?: boolean;
  busy?: boolean;
  selected?: boolean;
  checked?: boolean;
  expanded?: boolean;
  /** "surface" tints on hover and press. "sink" also moves the control. "none" leaves all drawing to the child. */
  feedback?: "surface" | "sink" | "none";
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** Styles for the layer that moves when pressed, usually where backgrounds and padding belong. */
  bodyStyle?: StyleProp<ViewStyle>;
  /** Hit area can exceed the drawing. Touch targets never fall below 44 pt. */
  minHit?: number;
  height?: number;
  onHover?: (hovering: boolean) => void;
  onFocusChange?: (focused: boolean) => void;
}

const webPointer = Platform.select<ViewStyle>({ web: { cursor: "pointer", outlineStyle: "none", userSelect: "none" } as unknown as ViewStyle, default: {} });
const webDisabled = Platform.select<ViewStyle>({ web: { cursor: "not-allowed" } as unknown as ViewStyle, default: {} });

export function Press({ children, label, hint, role = "button", disabled, busy, selected, checked, expanded, feedback = "surface", radius, style, bodyStyle, minHit = 44, height, onHover, onFocusChange, onPress, onLongPress, onPressIn, onPressOut, onFocus, onBlur, hitSlop, ...rest }: PressProps) {
  const theme = useTheme();
  const format = useInputFormat();
  const inputMode = useInputMode();
  const { motion, material, shape, color } = theme;
  const [focused, setFocused] = useState(false);
  const pressed = useSharedValue(0);
  const hovered = useSharedValue(0);
  const inert = disabled || busy;
  const cornerRadius = radius ?? shape.radius.md;

  const handlePressIn = useCallback((event: GestureResponderEvent) => { pressed.value = motion.amount === 0 ? fade(1, motion) : move(1, motion); onPressIn?.(event); }, [motion, onPressIn, pressed]);
  const handlePressOut = useCallback((event: GestureResponderEvent) => { pressed.value = motion.amount === 0 ? fade(0, motion) : move(0, motion); onPressOut?.(event); }, [motion, onPressOut, pressed]);
  const lastHover = useRef(false);
  const setHover = useCallback((next: boolean) => {
    if (lastHover.current === next) return;
    lastHover.current = next;
    hovered.value = fade(next ? 1 : 0, motion);
    onHover?.(next);
  }, [hovered, motion, onHover]);

  const overlay = useAnimatedStyle(() => ({ opacity: Math.min(1, hovered.value * 0.6 + pressed.value) }));
  const sinkDepth = feedback === "sink" ? material.pressDepth * Math.max(motion.amount, 0) : 0;
  const sinkScale = feedback === "sink" ? 1 - (1 - motion.pressScale) * motion.amount : 1;
  const sink = useAnimatedStyle(() => ({ transform: [{ translateY: pressed.value * sinkDepth }, { scale: 1 - pressed.value * (1 - sinkScale) }] }));

  const slop: Insets | number | undefined = hitSlop ?? (format === "touch" && height !== undefined && height < minHit ? { top: (minHit - height) / 2, bottom: (minHit - height) / 2 } : undefined);

  return (
    <Pressable
      {...rest}
      role={role as PressableProps["role"]}
      aria-label={label}
      aria-disabled={inert || undefined}
      aria-busy={busy || undefined}
      aria-selected={selected}
      aria-checked={checked}
      aria-expanded={expanded}
      accessibilityHint={hint}
      disabled={inert}
      hitSlop={slop}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      onFocus={(event) => { if (focusImpliesKeyboard) setInputMode("keyboard"); setFocused(true); onFocusChange?.(true); onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); onFocusChange?.(false); onBlur?.(event); }}
      style={[inert ? webDisabled : webPointer, style]}
    >
      <Animated.View style={[height !== undefined ? { minHeight: height } : null, { borderRadius: cornerRadius }, bodyStyle, sink, inert ? { opacity: 0.5 } : null]}>
        {feedback !== "none" ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: cornerRadius, backgroundColor: color.press }, overlay]} /> : null}
        {children}
      </Animated.View>
      {focused && inputMode === "keyboard" ? <FocusRing radius={cornerRadius} /> : null}
    </Pressable>
  );
}

/** A two-layer ring: the gap keeps it visible on any fill, whatever the theme or custom colors. */
export function FocusRing({ radius, inset = -3 }: { radius: number; inset?: number }) {
  const { color } = useTheme();
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: inset, left: inset, right: inset, bottom: inset, borderRadius: radius ? radius + -inset : 0, borderWidth: 2, borderColor: color.focus }} />
  );
}
