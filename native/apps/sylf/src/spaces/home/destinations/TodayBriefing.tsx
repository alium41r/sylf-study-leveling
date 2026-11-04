// Sylvie's note for the day, when she wrote one. One line and a way to read the rest. It is never forced: nothing here blocks Today, it loads after it,
// and without a briefing (the server's morning job may not have run) it renders nothing. Model text is drawn through RichText, never run.
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button, Text, useTheme } from "@sylf/design-system";
import { RichText } from "../../../shell/rich-text/RichText";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";

const firstLine = (text: string) => text.replace(/[#*_`>]/g, "").split("\n").map((line) => line.trim()).find(Boolean) ?? "";

export function TodayBriefing() {
  const { color, shape, space } = useTheme();
  const backend = useLiveBackend();
  const [open, setOpen] = useState(false);
  const resource = useMemo(() => (backend ? backend.resources.resource({ key: "today-briefing", tags: ["sylvie"], ttlMs: 10 * 60_000, load: async (signal) => (await backend.reads.briefing(signal)).messages[0] ?? null }) : null), [backend]);
  const briefing = useOptionalResource(resource)?.data ?? null;
  if (!briefing) return null;
  return (
    <View testID="today-briefing" style={{ gap: space.sm, padding: space.md, borderRadius: shape.radius.md, borderWidth: 1, borderColor: color.line }}>
      <Text variant="small" tone="soft">Sylvie's note for today</Text>
      {open ? <RichText text={briefing.content} /> : <Text variant="small" numberOfLines={2}>{firstLine(briefing.content)}</Text>}
      <View style={{ flexDirection: "row" }}><Button title={open ? "Show less" : "Read more"} size="small" testID="today-briefing-toggle" onPress={() => setOpen(!open)} /></View>
    </View>
  );
}
