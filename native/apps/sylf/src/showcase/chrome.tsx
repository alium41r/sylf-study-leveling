// Layout pieces shared by the showcase chapters. Review tooling only: nothing here is an application surface.
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Stack, Text, useTheme, useWindowClass } from "@sylf/design-system";

export function Chapter({ index, title, lede, children }: { index: string; title: string; lede: string; children: ReactNode }) {
  const { space } = useTheme();
  const { size } = useWindowClass();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: size === "compact" ? space.lg : space.air, paddingTop: space.xl, paddingBottom: space.sky, gap: space.air, width: "100%", maxWidth: 1180, alignSelf: "center" }}>
      <Stack gap="sm" style={{ maxWidth: 620 }}>
        <Text variant="micro" tone="faint">{index}</Text>
        <Text variant="display" role="heading">{title}</Text>
        <Text tone="soft">{lede}</Text>
      </Stack>
      {children}
    </ScrollView>
  );
}

export function Specimen({ label, children, note }: { label: string; note?: string; children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.md, minWidth: 0 }}>
      <Stack gap="hair">
        <Text variant="caption" tone="faint">{label}</Text>
        {note ? <Text variant="small" tone="soft">{note}</Text> : null}
      </Stack>
      {children}
    </View>
  );
}
