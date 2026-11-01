// Foundation diagnostics, carried over from Phase 3. Automated checks read the log lines, so they must keep firing.
import { useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { ALL_FONT_FILES, Row, Stack, Text, useAppearance, useTheme } from "@sylf/design-system";
import { detectCapabilities, windowSizeClass } from "@sylf/platform";
import { runParitySuite } from "@sylf/shared/parity";
import { Chapter, Specimen } from "./chrome";
import { PerformanceProbe } from "./chapters-components";

export function SystemChapter() {
  const { width, height } = useWindowDimensions();
  const theme = useTheme();
  const { preference } = useAppearance();
  const capabilities = useMemo(() => detectCapabilities(), []);
  const parity = useMemo(() => runParitySuite(), []);
  const rows: [string, string][] = [
    ["Runtime", `${capabilities.runtime} · ${capabilities.os} ${capabilities.osVersion}`],
    ["Device", `${capabilities.model} · ${capabilities.formFactor}`],
    ["Window", `${Math.round(width)}×${Math.round(height)} · ${windowSizeClass(width)}`],
    ["Stylus / hover", `${String(capabilities.input.stylus)} / ${String(capabilities.input.hover)}`],
    ["Refresh rates", capabilities.display.refreshRates.join(", ") || "unknown"],
    ["Theme", `${preference.themeId} · ${theme.mode} · ${theme.palette.polarity}`],
    ["Bundled faces", String(ALL_FONT_FILES.length)],
  ];
  return (
    <Chapter index="16" title="System" lede="What this build is running on, and whether shared Sylf logic behaves identically here.">
      <Specimen label="Runtime"><Stack gap="xs">{rows.map(([label, value]) => <Row key={label} gap="lg" justify="space-between"><Text variant="small" tone="soft">{label}</Text><Text variant="value" style={{ flexShrink: 1, textAlign: "right" }}>{value}</Text></Row>)}</Stack></Specimen>
      <Specimen label="Shared-code parity"><Stack gap="xs">{parity.map((p) => <Row key={p.name} gap="lg" justify="space-between"><Text variant="small" tone="soft">{p.name}</Text><Text variant="value" tone={p.ok ? "positive" : "critical"}>{p.ok ? "match" : `MISMATCH ${p.value}`}</Text></Row>)}</Stack></Specimen>
      <Specimen label="Performance"><PerformanceProbe /></Specimen>
      <View />
    </Chapter>
  );
}

