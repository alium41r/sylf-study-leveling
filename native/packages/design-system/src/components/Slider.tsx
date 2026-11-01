// A needle on a fine rule, not a knob in a groove: it reads like an instrument and leaves the value visible under a finger.
// All tracking runs on the UI thread. Keyboard and screen-reader adjustment go through the same step logic.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, View, type LayoutChangeEvent } from "react-native";
import { GestureDetector, usePanGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { FocusRing } from "../primitives/Press";
import { Text } from "../primitives/Text";
import { useTheme } from "../theme/context";
import { useInputMode } from "../runtime/input";
import { move } from "../runtime/motion";
import { clampToStep, snapValue } from "../logic/geometry";

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  /** Fires once when a drag ends, or on each discrete keyboard or tap change. */
  onCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  format?: (value: number) => string;
  ticks?: boolean;
  /** Replaces the rule, for color tracks. */
  track?: ReactNode;
  disabled?: boolean;
  hideValue?: boolean;
}

const TRACK_HEIGHT = 32;

export function Slider({ value, onChange, onCommit, min = 0, max = 1, step = 0.01, label, format, ticks, track, disabled, hideValue }: SliderProps) {
  const { color, motion, space } = useTheme();
  const inputMode = useInputMode();
  const [width, setWidth] = useState(0);
  const [focused, setFocused] = useState(false);
  const ratio = max === min ? 0 : (value - min) / (max - min);
  const position = useSharedValue(ratio);
  const active = useSharedValue(0);
  const dragging = useSharedValue(false);
  const lastSent = useSharedValue(value);
  const trackWidth = useSharedValue(0);

  useEffect(() => { if (!dragging.value) position.value = move(ratio, motion); }, [ratio, motion, position, dragging]);

  const emit = (next: number) => { lastSent.value = next; onChange(next); };
  const commit = (next: number) => onCommit?.(next);

  const pan = usePanGesture({
    enabled: !disabled,
    activeOffsetX: [-4, 4],
    failOffsetY: [-20, 20],
    onBegin: () => { "worklet"; active.value = move(1, motion); },
    onActivate: () => { "worklet"; dragging.value = true; },
    onUpdate: (event) => {
      "worklet";
      if (trackWidth.value === 0) return;
      const next = Math.min(1, Math.max(0, event.x / trackWidth.value));
      position.value = next;
      const snapped = snapValue(min + next * (max - min), min, max, step);
      if (snapped !== lastSent.value) scheduleOnRN(emit, snapped);
    },
    onFinalize: () => {
      "worklet";
      active.value = move(0, motion);
      if (dragging.value) { dragging.value = false; scheduleOnRN(commit, lastSent.value); }
    },
  });
  const tap = useTapGesture({
    enabled: !disabled,
    onDeactivate: (event) => {
      "worklet";
      if (event.canceled || trackWidth.value === 0) return;
      const next = Math.min(1, Math.max(0, event.x / trackWidth.value));
      const snapped = snapValue(min + next * (max - min), min, max, step);
      scheduleOnRN(emit, snapped);
      scheduleOnRN(commit, snapped);
    },
  });
  const gesture = useSimultaneousGestures(pan, tap);

  const adjust = (direction: number, large = false) => {
    const next = clampToStep(value + direction * step * (large ? 10 : 1), min, max, step);
    if (next !== value) { emit(next); commit(next); }
  };

  const needle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * trackWidth.value - 1.5 }, { scaleY: 1 + active.value * 0.25 }] }));
  const fill = useAnimatedStyle(() => ({ width: position.value * trackWidth.value }));
  const onLayout = (event: LayoutChangeEvent) => { const w = event.nativeEvent.layout.width; setWidth(w); trackWidth.value = w; };
  const tickList = useMemo(() => (ticks ? Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => i) : []), [ticks, max, min, step]);
  const text = format ? format(value) : String(Math.round(value * 100) / 100);

  const webProps = Platform.OS === "web" ? {
    tabIndex: disabled ? -1 : 0,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onKeyDown: (event: { key: string; shiftKey: boolean; preventDefault(): void }) => {
      const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
      if (dir) { event.preventDefault(); adjust(dir, event.shiftKey); }
      if (event.key === "Home") { event.preventDefault(); emit(min); commit(min); }
      if (event.key === "End") { event.preventDefault(); emit(max); commit(max); }
    },
  } : {};

  return (
    <View style={{ gap: space.xs, opacity: disabled ? 0.5 : 1 }}>
      {hideValue ? null : (
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
          <Text variant="caption" tone="soft">{label}</Text>
          <Text variant="micro" tone="soft">{text}</Text>
        </View>
      )}
      <GestureDetector gesture={gesture}>
        <View
          {...webProps as object}
          accessible
          role="slider"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={text}
          aria-disabled={disabled || undefined}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => adjust(event.nativeEvent.actionName === "increment" ? 1 : -1)}
          onLayout={onLayout}
          style={[{ height: TRACK_HEIGHT, justifyContent: "center" }, Platform.select({ web: { outlineStyle: "none", cursor: disabled ? "not-allowed" : "ew-resize", touchAction: "pan-y" } as object, default: {} })]}
        >
          {track ?? <View style={{ height: 1, backgroundColor: color.lineStrong }} />}
          {!track ? <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, height: 2, backgroundColor: color.accent.fill }, fill]} /> : null}
          {ticks && width > 0 ? tickList.map((i) => <View key={i} pointerEvents="none" style={{ position: "absolute", left: (i / (tickList.length - 1)) * width - 0.5, width: 1, height: 7, top: TRACK_HEIGHT / 2 + 3, backgroundColor: color.lineStrong }} />) : null}
          <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 6, height: 20, width: 3, backgroundColor: track ? color.ink : color.accent.ink, boxShadow: track ? `0px 0px 0px 1.5px ${color.ground}` : undefined }, needle]} />
          {focused && inputMode === "keyboard" ? <FocusRing radius={2} inset={-1} /> : null}
        </View>
      </GestureDetector>
    </View>
  );
}
