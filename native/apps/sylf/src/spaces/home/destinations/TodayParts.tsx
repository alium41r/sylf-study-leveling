// The small pieces the dashboard's four parts share, so they read as one page: a heading with its one way onward, and a number with its name. Neither draws a
// surface. A part of the dashboard is set apart by air and by where its heading sits, never by a box.
import type { ReactNode } from "react";
import { View } from "react-native";
import { Button, Text, useTheme, type IconName } from "@sylf/design-system";

export function PartHeader({ title, detail, action, actionIcon, onAction, actionTestID, level = 2 }: { title: string; detail?: string | null; action?: string; actionIcon?: IconName; onAction?: () => void; actionTestID?: string; level?: number }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, minHeight: space.xxl }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: space.sm, flexShrink: 1, minWidth: 0 }}>
        <Text variant="heading" role="heading" aria-level={level} numberOfLines={1}>{title}</Text>
        {detail ? <Text variant="caption" tone="soft" numberOfLines={1}>{detail}</Text> : null}
      </View>
      {action && onAction ? <Button title={action} size="small" variant="ghost" trailingIcon={actionIcon ?? "arrowRight"} {...(actionTestID ? { testID: actionTestID } : {})} onPress={onAction} /> : null}
    </View>
  );
}

/** A measured value and what it measures, in the Instrument voice. */
export function Stat({ value, label, testID }: { value: string; label: string; testID?: string }) {
  return (
    <View accessible aria-label={`${label}: ${value}`} testID={testID} style={{ gap: 2 }}>
      <Text variant="readout" numberOfLines={1}>{value}</Text>
      <Text variant="caption" tone="soft" numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** A quiet name for a group inside a part. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <Text variant="label" tone="soft">{children}</Text>;
}
