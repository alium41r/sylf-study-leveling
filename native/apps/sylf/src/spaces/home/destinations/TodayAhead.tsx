// What is coming in the next week, from the real quest list: the next few quests not yet done, each with the day and its subject. It replaces a button
// that only said "open your plan". Nothing here is invented: with nothing scheduled it says so and offers the plan.
import { useMemo } from "react";
import { View } from "react-native";
import { Button, Stack, Text, useTheme } from "@sylf/design-system";
import { useHomeNavigation } from "../../../shell/context";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { useSubjects } from "../../../shell/live";

const DAY = 86_400_000;
const keyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function dayWords(scheduled: string, now: Date): string {
  const [year, month, day] = scheduled.slice(0, 10).split("-").map(Number);
  const then = new Date(year!, (month ?? 1) - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const gap = Math.round((then.getTime() - today.getTime()) / DAY);
  return gap <= 0 ? "Today" : gap === 1 ? "Tomorrow" : gap < 7 ? then.toLocaleDateString([], { weekday: "long" }) : then.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function TodayAhead() {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const navigation = useHomeNavigation();
  const subjects = useSubjects();
  const now = useMemo(() => new Date(), []);
  const resource = useMemo(() => (backend ? backend.resources.resource({ key: "today-ahead", tags: ["today", "plan", "quests"], ttlMs: 60_000, load: async (signal) => (await backend.reads.plan.questPage(null, signal)).quests }) : null), [backend]);
  const quests = useOptionalResource(resource)?.data ?? null;
  const today = keyOf(now);
  const horizon = keyOf(new Date(now.getTime() + 7 * DAY));
  const upcoming = (quests ?? []).filter((quest) => quest.status !== "COMPLETED" && quest.scheduledFor && quest.scheduledFor.slice(0, 10) > today && quest.scheduledFor.slice(0, 10) <= horizon).sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor))).slice(0, 4);
  return (
    <Stack gap="sm" testID="today-ahead">
      {upcoming.map((quest) => (
        <View key={quest.id} style={{ gap: 0 }}>
          <Text variant="small" numberOfLines={1}>{quest.title}</Text>
          <Text variant="caption" tone="soft" numberOfLines={1}>{[dayWords(quest.scheduledFor!, now), subjects.find((subject) => subject.id === quest.subjectId)?.name, quest.targetMinutes ? `${quest.targetMinutes} min` : null].filter(Boolean).join(", ")}</Text>
        </View>
      ))}
      {quests && !upcoming.length ? <Text variant="small" tone="soft">Nothing else scheduled this week.</Text> : null}
      <View style={{ flexDirection: "row", paddingTop: space.xs }}><Button title="Open your plan" size="small" trailingIcon="arrowRight" testID="today-plan" onPress={() => navigation.select("plan")} /></View>
    </Stack>
  );
}
