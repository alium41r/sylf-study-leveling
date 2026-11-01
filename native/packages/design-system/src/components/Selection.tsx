import { useEffect, useRef, useState, type ComponentRef } from "react";
import { ScrollView, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Icon, type IconName } from "../icons";
import { Press } from "../primitives/Press";
import { Text } from "../primitives/Text";
import { Marker, TravellingMarker } from "../primitives/Marker";
import { useControlHeight, useInputFormat, useTheme } from "../theme/context";
import { fade, move } from "../runtime/motion";

export function Toggle({ value, onChange, label, disabled, hint }: { value: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean; hint?: string }) {
  const { color, shape, motion, marker } = useTheme();
  const trackRadius = Math.min(shape.radius.sm + 1, 11);
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => { progress.value = move(value ? 1 : 0, motion); }, [value, motion, progress]);
  const knobSize = 14;
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: 3 + progress.value * 18 }] }));
  const onFill = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Press role="switch" checked={value} label={label} hint={hint} disabled={disabled} onPress={() => onChange(!value)} feedback="none" radius={trackRadius} hitSlop={{ top: 11, bottom: 11, left: 8, right: 8 }} style={{ alignSelf: "flex-start" }}>
      <View style={{ width: 38, height: 22, borderRadius: trackRadius, backgroundColor: color.sunken, borderWidth: 1, borderColor: color.lineStrong, justifyContent: "center", overflow: "hidden" }}>
        <Animated.View style={[{ position: "absolute", top: -1, left: -1, right: -1, bottom: -1, backgroundColor: color.accent.fill }, onFill]} />
        <Animated.View style={[{ width: knobSize, height: knobSize, borderRadius: Math.min(shape.radius.xs + 1, 7), backgroundColor: value ? color.accent.on : color.inkSoft, marginTop: 0 }, marker.rotate ? { borderRadius: 1 } : null, knob]} />
      </View>
    </Press>
  );
}

export function Checkbox({ value, onChange, label, disabled }: { value: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  const { color, shape, motion, space } = useTheme();
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => { progress.value = move(value ? 1 : 0, motion); }, [value, motion, progress]);
  const check = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.7 + 0.3 * progress.value }] }));
  return (
    <Press role="checkbox" checked={value} label={label} disabled={disabled} onPress={() => onChange(!value)} feedback="none" radius={shape.radius.xs} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 28 }}>
      <View style={{ width: 20, height: 20, borderRadius: shape.radius.xs, borderWidth: 1.5, borderColor: value ? color.accent.fill : color.lineStrong, backgroundColor: value ? color.accent.fill : "transparent", alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={check}><Icon name="check" size={14} color={color.accent.on} /></Animated.View>
      </View>
      <Text variant="small">{label}</Text>
    </Press>
  );
}

export function RadioGroup<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; detail?: string }[]; label: string }) {
  const { color, space, shape } = useTheme();
  return (
    <View role="radiogroup" aria-label={label} style={{ gap: space.xs }}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Press key={option.value} role="radio" checked={on} label={option.label} onPress={() => onChange(option.value)} radius={shape.radius.sm} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.xs }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: on ? color.accent.ink : color.lineStrong, alignItems: "center", justifyContent: "center" }}>
              {on ? <Marker scale={1.1} color={color.accent.ink} /> : null}
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text variant="small">{option.label}</Text>
              {option.detail ? <Text variant="caption" tone="soft">{option.detail}</Text> : null}
            </View>
          </Press>
        );
      })}
    </View>
  );
}

export interface SegmentOption<T extends string> { value: T; label: string; icon?: IconName }

/** Labels on a shared line with the Marker travelling beneath. Scrolls rather than wraps, so it never changes height. */
export function Segmented<T extends string>({ value, onChange, options, label, fit }: { value: T; onChange: (value: T) => void; options: SegmentOption<T>[]; label: string; fit?: boolean }) {
  const { space, shape, color } = useTheme();
  const height = useControlHeight();
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const active = layouts[value];
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [viewport, setViewport] = useState(0);
  // Tabs past the edge come into view when chosen, so a clipped last item is never a dead end.
  useEffect(() => { if (!fit && active) scroller.current?.scrollTo({ x: Math.max(0, active.x + active.width / 2 - viewport / 2), animated: true }); }, [fit, active, viewport]);
  const onLayout = (key: T) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setLayouts((current) => (current[key]?.x === x && current[key]?.width === width ? current : { ...current, [key]: { x, width } }));
  };
  const body = (
    <View role="tablist" aria-label={label} style={{ flexDirection: "row", gap: space.xs, paddingBottom: 9, flexGrow: fit ? 1 : 0 }}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Press key={option.value} role="tab" selected={on} label={option.label} onPress={() => onChange(option.value)} onLayout={onLayout(option.value)} height={height - 6} radius={shape.radius.sm} style={fit ? { flex: 1 } : undefined} bodyStyle={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs + 2, paddingHorizontal: space.md }}>
            {option.icon ? <Icon name={option.icon} size={16} active={on} color={on ? color.ink : color.inkFaint} /> : null}
            <Text variant="label" tone={on ? "ink" : "soft"} numberOfLines={1}>{option.label}</Text>
          </Press>
        );
      })}
      {active ? <TravellingMarker x={active.x + (active.width > 40 ? 12 : 0)} width={active.width - (active.width > 40 ? 24 : 0)} /> : null}
    </View>
  );
  return fit ? body : <ScrollView keyboardShouldPersistTaps="handled" ref={scroller} horizontal showsHorizontalScrollIndicator={false} onLayout={(event) => setViewport(event.nativeEvent.layout.width)} style={{ flexGrow: 0 }}>{body}</ScrollView>;
}

export function Chip({ label, selected, onPress, icon, onRemove, disabled, radio }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; onRemove?: () => void; disabled?: boolean; radio?: boolean }) {
  const { color, shape, space, motion } = useTheme();
  const format = useInputFormat();
  const height = format === "touch" ? 34 : 28;
  const tint = useSharedValue(selected ? 1 : 0);
  useEffect(() => { tint.value = fade(selected ? 1 : 0, motion); }, [selected, motion, tint]);
  const wash = useAnimatedStyle(() => ({ opacity: tint.value }));
  return (
    <Press role={radio ? "radio" : onPress ? "button" : "text"} selected={radio ? undefined : selected} checked={radio ? !!selected : undefined} label={label} disabled={disabled} onPress={onPress} height={height} radius={shape.radius.sm} style={{ alignSelf: "flex-start", opacity: 1 }} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.xs + 2, paddingHorizontal: space.md, borderWidth: 1, borderColor: selected ? color.accent.line : color.line, overflow: "hidden" }}>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.accent.wash }, wash]} />
      {icon ? <Icon name={icon} size={14} active={selected} color={color.inkSoft} /> : null}
      <Text variant="caption" tone={selected ? "accent" : "soft"} numberOfLines={1}>{label}</Text>
      {onRemove ? <Press label={`Remove ${label}`} onPress={onRemove} feedback="none" hitSlop={10}><Icon name="close" size={12} color={color.inkFaint} /></Press> : null}
    </Press>
  );
}
