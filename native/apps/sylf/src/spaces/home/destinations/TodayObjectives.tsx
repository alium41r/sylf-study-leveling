// What there is to do: today's timed events and sequential quests on a connected path, what is coming up next, this week's focus quest anchored
// at the bottom of the quests section, longer goals, and Sylvie's note. Draws no outer box surface; everything aligns from one left edge.
import { memo, useMemo } from "react";
import { View } from "react-native";
import { Divider, Marker, Stack, Text, useTheme } from "@sylf/design-system";
import { WeeklyQuestInline } from "../../../shell/charts/WeeklyQuestCard";
import { useSubjectColour } from "../../../shell/live";
import type { DayEntry, Objective } from "../data/contracts";
import { formatMinutes } from "../format";
import { useWeeklyQuest } from "../progress/useProgress";
import { QuestPath } from "./QuestPath";
import { buildTodayQuestSteps } from "./questSteps";
import { TodayGoals, TodayUpcoming } from "./TodayAhead";
import { TodayBriefing } from "./TodayBriefing";
import { GroupLabel, PartHeader } from "./TodayParts";

const TIME_COLUMN = 64;
const LINE_COLUMN = 24;
const NODE = 6;
const clock = (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function DayRow({ entry, last }: { entry: DayEntry; last: boolean }) {
  const { color, marker, space } = useTheme();
  const node = { width: NODE, height: NODE, borderRadius: Math.min(marker.radius, NODE / 2), borderWidth: 1, borderColor: color.lineStrong };
  const next = entry.state === "next";
  const past = entry.state === "past";
  return (
    <View style={{ flexDirection: "row", paddingBottom: last ? 0 : space.lg }}>
      <Text variant="value" tone={next ? "ink" : "soft"} numberOfLines={1} style={{ width: TIME_COLUMN }}>{clock(entry.startsAt)}</Text>
      <View style={{ width: LINE_COLUMN, alignItems: "center", paddingTop: 6 }}>
        {next ? <Marker scale={1.2} /> : <View style={[node, { backgroundColor: past ? color.lineStrong : color.ground }]} />}
        {last ? null : <View aria-hidden style={{ position: "absolute", top: 18, bottom: -space.lg, width: 1, backgroundColor: color.line }} />}
      </View>
      <Stack gap="hair" flex={1} style={{ minWidth: 0, paddingLeft: space.sm }}>
        <Text variant="body" tone={past ? "soft" : "ink"} numberOfLines={2}>{entry.title}</Text>
        <Text variant="small" tone="soft">{entry.detail}</Text>
      </Stack>
    </View>
  );
}

export interface ObjectivesProps {
  entries: DayEntry[];
  objectives: Objective[];
  allDay: string[] | undefined;
  planned: number;
  sending: boolean;
  /** A session is running, so no quest offers to start another. */
  busy: boolean;
  onTick: (objective: Objective) => void;
  onStudy: (objective: Objective) => void;
  onPlan: () => void;
}

export const TodayObjectives = memo(function TodayObjectives({ entries, objectives, allDay, planned, sending, busy, onTick, onStudy, onPlan }: ObjectivesProps) {
  const { space } = useTheme();
  const colourOf = useSubjectColour();
  const weekly = useWeeklyQuest()?.data;
  const done = objectives.filter((objective) => objective.done).length;
  const empty = !entries.length && !objectives.length && !allDay?.length;

  const todaySteps = useMemo(
    () => buildTodayQuestSteps({ objectives, colourOf, sending, busy, onTick, onStudy }),
    [busy, colourOf, objectives, onStudy, onTick, sending],
  );

  return (
    <View testID="today-objectives" style={{ gap: space.xl }}>
      <PartHeader title="Today" detail={planned ? `${formatMinutes(planned)} planned` : null} action="Calendar" onAction={onPlan} actionTestID="today-plan" />
      <View testID="today-day" style={{ gap: space.lg }}>
        {allDay?.length ? <Text variant="small" tone="soft" testID="today-all-day">{`All day: ${allDay.join(", ")}`}</Text> : null}
        {empty ? <Text variant="small" tone="soft">No events or quests today.</Text> : null}
        {entries.length ? <View>{entries.map((entry, index) => <DayRow key={entry.id} entry={entry} last={index === entries.length - 1} />)}</View> : null}
        {entries.length && todaySteps.length ? <Divider /> : null}
        {todaySteps.length ? (
          <Stack gap="md">
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md }}>
              <GroupLabel>Quests</GroupLabel>
              <Text variant="caption" tone="soft">{`${done} of ${todaySteps.length} done`}</Text>
            </View>
            <QuestPath steps={todaySteps} />
          </Stack>
        ) : null}
      </View>
      <TodayUpcoming divided />
      {weekly ? <WeeklyQuestInline quest={weekly} /> : null}
      <TodayGoals divided />
      <TodayBriefing />
    </View>
  );
});
