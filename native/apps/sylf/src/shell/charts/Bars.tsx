// Study time as bars. One component for the week and the month, so both read the same way: bars scale to the person's own target (never to the longest
// day), today carries the Marker's accent, a hairline marks the target, and a day with no study is a short quiet stub rather than a gap. The whole chart is
// one accessible summary, because a screen reader gains nothing from thirty unlabelled columns.
import { View } from "react-native";
import { Text, useTheme } from "@sylf/design-system";

export interface Bar { key: string; value: number; /** One short character under the bar, e.g. "M". */ label?: string; today?: boolean; /** A day that has not happened yet. */ future?: boolean }

export function Bars({ bars, target, height = 72, summary, testID, gap = 3 }: { bars: Bar[]; target: number; height?: number; summary: string; testID?: string; gap?: number }) {
  const { color, shape, space } = useTheme();
  const top = Math.max(1, target * 1.25, ...bars.map((bar) => bar.value));
  const corner = Math.min(shape.radius.xs, 4);
  const labelled = bars.some((bar) => bar.label);
  return (
    <View testID={testID} accessible role="img" aria-label={summary} style={{ gap: space.xs }}>
      <View style={{ height, flexDirection: "row", alignItems: "flex-end", gap }}>
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: (Math.min(target, top) / top) * height, height: 1, backgroundColor: color.line, opacity: 0.9 }} />
        {bars.map((bar) => {
          const filled = bar.value > 0 ? Math.max(4, Math.round((bar.value / top) * height)) : 0;
          return (
            <View key={bar.key} aria-hidden style={{ flex: 1, minWidth: 0, height, justifyContent: "flex-end", alignItems: "center" }}>
              <View style={{ width: "100%", maxWidth: 36, height: filled || 3, borderTopLeftRadius: corner, borderTopRightRadius: corner, backgroundColor: bar.today ? color.accent.mote : filled ? color.ink : color.line, opacity: bar.future ? 0.25 : bar.today ? 1 : filled ? 0.62 : 0.55 }} />
            </View>
          );
        })}
      </View>
      {labelled ? (
        <View aria-hidden style={{ flexDirection: "row", gap }}>
          {bars.map((bar) => <View key={bar.key} style={{ flex: 1, alignItems: "center" }}><Text variant="caption" tone={bar.today ? "ink" : "soft"}>{bar.label ?? ""}</Text></View>)}
        </View>
      ) : null}
    </View>
  );
}
