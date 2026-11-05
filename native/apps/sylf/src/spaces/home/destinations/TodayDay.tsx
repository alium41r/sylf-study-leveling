// The day, as one surface: the line through it with what has a time, the quests that do not (they wait at the end, ticked off where they stand), and what is
// coming in the next week. With nothing planned it says so and offers the plan, rather than drawing an empty card.
import { View } from "react-native";
import { Button, Checkbox, Marker, Plane, Stack, Text, useTheme } from "@sylf/design-system";
import { useSubjectColour } from "../../../shell/live";
import type { DayEntry, Objective } from "../data/contracts";
import { formatMinutes } from "../format";
import { TodayAhead } from "./TodayAhead";

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
      <Stack gap="xs" flex={1} style={{ minWidth: 0, paddingLeft: space.sm }}>
        <Text variant="body" tone={past ? "soft" : "ink"} numberOfLines={2}>{entry.title}</Text>
        <Text variant="small" tone="soft">{entry.detail}</Text>
      </Stack>
    </View>
  );
}

/** A quest has no time of day. Its tick goes through the server's own rules, and what it pays comes back from there. */
function QuestRow({ objective, colour, sending, onTick, onStudy }: { objective: Objective; colour: string | null; sending: boolean; onTick: () => void; onStudy?: () => void }) {
  const { color, space } = useTheme();
  return (
    <View testID={`today-quest-${objective.id}`} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <View aria-hidden style={{ width: 3, alignSelf: "stretch", minHeight: 30, borderRadius: 2, backgroundColor: colour ?? color.line, opacity: objective.done ? 0.4 : 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Checkbox label={objective.title} value={objective.done} disabled={objective.done || sending} onChange={onTick} />
        <Text variant="caption" tone="soft" style={{ paddingLeft: space.xl }}>{objective.detail}</Text>
      </View>
      {onStudy ? <Button title="Study this" size="small" variant="ghost" testID={`today-study-${objective.id}`} onPress={onStudy} /> : null}
    </View>
  );
}

export function DayCard({ entries, objectives, allDay, planned, sending, canStudy, onTick, onStudy, onPlan }: { entries: DayEntry[]; objectives: Objective[]; allDay?: string[]; planned: number; sending: boolean; canStudy: (objective: Objective) => boolean; onTick: (objective: Objective) => void; onStudy: (objective: Objective) => void; onPlan: () => void }) {
  const { space } = useTheme();
  const colourOf = useSubjectColour();
  const done = objectives.filter((objective) => objective.done).length;
  const empty = !entries.length && !objectives.length;
  return (
    <Plane level="raised" radius="lg" testID="today-day" style={{ padding: space.xl, gap: space.xl }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md, flexWrap: "wrap" }}>
        <Text variant="subheading" role="heading" aria-level={2}>Your day</Text>
        {planned ? <Text variant="caption" tone="soft">{`${formatMinutes(planned)} planned`}</Text> : null}
      </View>
      {allDay?.length ? <Text variant="small" tone="soft" testID="today-all-day">{`All day: ${allDay.join(", ")}`}</Text> : null}
      {empty ? (
        <Stack gap="md">
          <Text tone="soft">Nothing is planned for today. A quest or an event gives the day a shape.</Text>
          <View style={{ flexDirection: "row" }}><Button title="Plan something" variant="emphasis" testID="today-plan" onPress={onPlan} /></View>
        </Stack>
      ) : null}
      {entries.length ? <View>{entries.map((entry, index) => <DayRow key={entry.id} entry={entry} last={index === entries.length - 1} />)}</View> : null}
      {objectives.length ? (
        <Stack gap="md">
          {entries.length ? <Text variant="caption" tone="soft">{`Quests, ${done} of ${objectives.length} done`}</Text> : <Text variant="caption" tone="soft">{`${done} of ${objectives.length} quests done`}</Text>}
          {objectives.map((objective) => <QuestRow key={objective.id} objective={objective} colour={colourOf(objective.subjectId)} sending={sending} onTick={() => onTick(objective)} onStudy={canStudy(objective) ? () => onStudy(objective) : undefined} />)}
        </Stack>
      ) : null}
      <Stack gap="sm">
        <Text variant="caption" tone="soft">Coming up</Text>
        <TodayAhead />
      </Stack>
    </Plane>
  );
}
