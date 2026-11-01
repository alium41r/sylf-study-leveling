import { Platform, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons";
import { Press, type PressProps } from "../primitives/Press";
import { Text } from "../primitives/Text";
import { Marker } from "../primitives/Marker";
import { useControlHeight, useInputFormat, useTheme } from "../theme/context";

export type ButtonVariant = "emphasis" | "solid" | "quiet" | "ghost" | "critical";
export type ButtonSize = "regular" | "small";

export interface ButtonProps extends Omit<PressProps, "children" | "label" | "bodyStyle"> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  trailingIcon?: IconName;
  fill?: boolean;
}

function useButtonColors(variant: ButtonVariant) {
  const { color, surface } = useTheme();
  switch (variant) {
    case "emphasis": return { background: color.emphasis.fill, foreground: color.emphasis.on, border: "transparent" };
    case "solid": return { background: color.inverse.fill, foreground: color.inverse.on, border: "transparent" };
    case "critical": return { background: color.critical.wash, foreground: color.critical.ink, border: "transparent" };
    case "quiet": return { background: surface("raised").backgroundColor, foreground: color.ink, border: color.line };
    default: return { background: "transparent", foreground: color.ink, border: "transparent" };
  }
}

export function Button({ title, variant = "quiet", size = "regular", icon, trailingIcon, fill, busy, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const { shape, space, material, type } = theme;
  const base = useControlHeight();
  const height = size === "small" ? Math.round(base * 0.82) : base;
  const colors = useButtonColors(variant);
  const blocky = material.pressDepth > 0 && variant !== "ghost";
  const border = blocky ? 2 : variant === "quiet" ? 1 : 0;
  const labelStyle = { color: colors.foreground, fontFamily: type.label.fontFamily };
  return (
    <Press
      {...rest}
      label={title}
      busy={busy}
      feedback="sink"
      height={height}
      radius={shape.radius.md}
      style={[fill ? { alignSelf: "stretch" } : { alignSelf: "flex-start" }, style]}
      bodyStyle={{
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm,
        paddingHorizontal: size === "small" ? space.md : space.lg + 2,
        backgroundColor: colors.background, borderColor: blocky ? theme.color.lineStrong : colors.border, borderWidth: border,
        ...(blocky ? { boxShadow: `0px ${material.pressDepth + 1}px 0px ${theme.color.lineStrong}`, marginBottom: material.pressDepth + 1 } : null),
      }}
    >
      {busy ? <Marker breathing color={colors.foreground} /> : icon ? <Icon name={icon} size={size === "small" ? 16 : 18} color={colors.foreground} /> : null}
      <Text variant="label" numberOfLines={1} style={labelStyle}>{title}</Text>
      {trailingIcon ? <Icon name={trailingIcon} size={size === "small" ? 14 : 16} color={colors.foreground} /> : null}
    </Press>
  );
}

export interface IconButtonProps extends Omit<PressProps, "children" | "label"> {
  icon: IconName;
  label: string;
  active?: boolean;
  size?: ButtonSize;
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({ icon, label, active, size = "regular", bare, style, disabled, ...rest }: IconButtonProps) {
  const theme = useTheme();
  const format = useInputFormat();
  const base = useControlHeight();
  const side = size === "small" ? Math.round(base * 0.82) : base;
  const { color, shape } = theme;
  return (
    <Press
      {...rest}
      label={label}
      disabled={disabled}
      selected={active}
      height={side}
      radius={shape.radius.md}
      hitSlop={format === "touch" && side < 44 ? (44 - side) / 2 : undefined}
      accessibilityHint={Platform.OS === "web" ? undefined : rest.hint}
      style={[{ alignSelf: "flex-start" }, style]}
      bodyStyle={{ width: side, height: side, alignItems: "center", justifyContent: "center", backgroundColor: active && !bare ? color.selected : "transparent" }}
    >
      <Icon name={icon} size={size === "small" ? 17 : 20} active={active} color={active ? color.ink : color.inkSoft} />
    </Press>
  );
}
