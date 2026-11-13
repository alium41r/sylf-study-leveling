// Sylvie's note for the day, when she wrote one. One line and a way to read the rest. It is never forced: nothing here blocks Today, it loads after it,
// and without a briefing (the server's morning job may not have run) it renders nothing. Model text is drawn through RichText, never run.
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button, Divider, Text, useTheme } from "@sylf/design-system";
import { RichText } from "../../../shell/rich-text/RichText";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";

const firstLine = (text: string) => text.replace(/[#*_`>]/g, "").split("\n").map((line) => line.trim()).find(Boolean) ?? "";

export function TodayBriefing() {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const [open, setOpen] = useState(false);
  const resource = useMemo(() => (backend ? backend.resources.resource({ key: "today-briefing", tags: ["sylvie"], ttlMs: 10 * 60_000, load: async (signal) => (await backend.reads.briefing(signal)).messages[0] ?? null }) : null), [backend]);
  const briefing = useOptionalResource(resource)?.data ?? null;
  const insightsResource = useMemo(() => (backend ? backend.resources.resource({ key: "today-insights", tags: ["sylvie"], ttlMs: 30 * 60_000, load: (signal) => backend.reads.insights(signal) }) : null), [backend]);
  const insights = (useOptionalResource(insightsResource)?.data ?? []).filter((item) => item.category !== "warning").slice(0, 3);
  if (!briefing && !insights.length) return null;
  return (
    <View testID="today-briefing" style={{ gap: space.sm }}>
      <Divider />
      {briefing ? (
        <>
          <Text variant="label" tone="soft">Sylvie's note for today</Text>
          {open ? <RichText text={briefing.content} /> : <Text variant="small" numberOfLines={2}>{firstLine(briefing.content)}</Text>}
          <View style={{ flexDirection: "row" }}><Button title={open ? "Show less" : "Read more"} size="small" variant="ghost" testID="today-briefing-toggle" onPress={() => setOpen(!open)} /></View>
        </>
      ) : null}
      {insights.length ? (
        <View style={{ gap: space.xs }} testID="today-insights">
          <Text variant="label" tone="soft">Sylvie noticed</Text>
          {insights.map((item) => <RichText key={item.id} text={item.content} />)}
        </View>
      ) : null}
    </View>
  );
}
