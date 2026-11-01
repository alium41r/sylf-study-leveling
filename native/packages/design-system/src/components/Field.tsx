import { forwardRef, useEffect, useRef, useState, type ComponentRef } from "react";
import { Platform, TextInput, View, type TextInputProps, DeviceEventEmitter } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Icon, type IconName } from "../icons";
import type { ViewHandle } from "../primitives/Layout";
import { Press } from "../primitives/Press";
import { Text } from "../primitives/Text";
import { useControlHeight, useTheme } from "../theme/context";
import { move } from "../runtime/motion";
import { Menu, type MenuItem } from "./Overlays";

/** Raised when a field takes focus, because Android reports the keyboard only once however many fields it serves. */
export const FIELD_FOCUS_EVENT = "sylf:field-focus";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  hideLabel?: boolean;
  helper?: string;
  error?: string;
  icon?: IconName;
  trailing?: React.ReactNode;
  monospace?: boolean;
}

/** A tray with a rule that grows from the left on focus. Focus is shown by the rule, for touch and keyboard alike. */
export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(function TextField({ label, hideLabel, helper, error, icon, trailing, monospace, onFocus, onBlur, multiline, editable = true, ...rest }, ref) {
  const { color, shape, space, type, motion } = useTheme();
  const height = useControlHeight();
  const [focused, setFocused] = useState(false);
  const [trayWidth, setTrayWidth] = useState(0);
  const progress = useSharedValue(0);
  useEffect(() => { progress.value = move(focused ? 1 : 0, motion); }, [focused, motion, progress]);
  const rule = useAnimatedStyle(() => ({ width: progress.value * trayWidth }));
  const textStyle = monospace ? type.value : type.small;
  const { maxScale, ...inputType } = textStyle;
  return (
    <View style={{ gap: space.xs + 2 }}>
      {hideLabel ? null : <Text variant="caption" tone="soft">{label}</Text>}
      <View onLayout={(e) => setTrayWidth(e.nativeEvent.layout.width)} style={{ minHeight: multiline ? height * 2.2 : height, flexDirection: "row", alignItems: multiline ? "flex-start" : "center", gap: space.sm, paddingHorizontal: space.md, backgroundColor: color.sunken, borderRadius: shape.radius.sm, borderWidth: 1, borderColor: error ? color.critical.ink : color.line, overflow: "hidden", opacity: editable ? 1 : 0.55 }}>
        {icon ? <Icon name={icon} size={16} color={color.inkFaint} /> : null}
        <TextInput
          {...rest}
          ref={ref}
          multiline={multiline}
          editable={editable}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          maxFontSizeMultiplier={maxScale}
          placeholderTextColor={color.inkFaint}
          selectionColor={color.accent.mote}
          cursorColor={color.accent.ink}
          onFocus={(event) => { setFocused(true); DeviceEventEmitter.emit(FIELD_FOCUS_EVENT); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
          style={[inputType, { flex: 1, minWidth: 0, color: color.ink, paddingVertical: multiline ? space.sm : 0, textAlignVertical: multiline ? "top" : "center" }, Platform.select({ web: { outlineStyle: "none" } as object, default: {} })]}
        />
        {trailing}
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, bottom: 0, height: 2, backgroundColor: error ? color.critical.ink : color.accent.ink }, rule]} />
      </View>
      {error ? <Text variant="caption" tone="critical">{error}</Text> : helper ? <Text variant="caption" tone="soft">{helper}</Text> : null}
    </View>
  );
});

export function Select<T extends string>({ label, value, options, onChange, hideLabel }: { label: string; value: T; options: { value: T; label: string; detail?: string; fontFamily?: string }[]; onChange: (value: T) => void; hideLabel?: boolean }) {
  const { color, shape, space } = useTheme();
  const height = useControlHeight();
  const [open, setOpen] = useState(false);
  const anchor = useRef<ViewHandle>(null);
  const current = options.find((option) => option.value === value);
  const items: MenuItem[] = options.map((option) => ({ key: option.value, label: option.label, detail: option.detail, selected: option.value === value, fontFamily: option.fontFamily, onSelect: () => onChange(option.value) }));
  return (
    <View style={{ gap: space.xs + 2 }}>
      {hideLabel ? null : <Text variant="caption" tone="soft">{label}</Text>}
      <View ref={anchor} collapsable={false}>
        <Press role="button" label={`${label}: ${current?.label ?? ""}`} expanded={open} onPress={() => setOpen(true)} height={height} radius={shape.radius.sm} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, backgroundColor: color.sunken, borderWidth: 1, borderColor: color.line }}>
          <Text variant="small" numberOfLines={1} style={[{ flex: 1 }, current?.fontFamily ? { fontFamily: current.fontFamily } : null]}>{current?.label}</Text>
          <Icon name="chevronDown" size={14} color={color.inkFaint} />
        </Press>
      </View>
      <Menu open={open} anchor={anchor} onClose={() => setOpen(false)} items={items} label={label} matchWidth />
    </View>
  );
}
