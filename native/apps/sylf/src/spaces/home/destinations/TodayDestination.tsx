// Today reads as one line through the day: what has gone, the single next thing, and what follows, with the Marker on "next".
import { useMemo } from "react";
import { View } from "react-native";
import { Button, Icon, ListRow, Marker, Meter, Stack, Text, useTheme, type IconName } from "@sylf/design-system";
import { SPACE_LABELS, type SpaceId } from "@sylf/spaces";
import { useHomeNavigation, useSessionState, useSpacesStore, useStudySession } from "../../../shell/context";
import { useHomeResult } from "../data";
import type { DayEntry, HomeDataAdapter, Objective } from "../data/contracts";
import { formatMinutes, greetingFor, plannedMinutes, summarizeDay } from "../format";
import { EmptyPage, FailedPage, HomeColumns, HomePage, LoadingPage, PageTitle, Section } from "../HomePage";

const load = (adapter: HomeDataAdapter) => adapter.today(new Date());
const TIME_COLUMN = 84;
const LINE_COLUMN = 28;
const NODE = 6;
const clock = (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function DayRow({ entry, onPrepare }: { entry: DayEntry; onPrepare: () => void }) {
  const { color, marker, space } = useTheme();
  const node = { width: NODE, height: NODE, borderRadius: Math.min(marker.radius, NODE / 2), borderWidth: 1, borderColor: color.lineStrong };
  const next = entry.state === "next";
  const past = entry.state === "past";
  return (
    <View style={{ flexDirection: "row", gap: 0, paddingBottom: next ? space.xxl : space.xl }}>
      <Text variant="value" tone={next ? "ink" : "soft"} numberOfLines={1} style={{ width: TIME_COLUMN }}>{clock(entry.startsAt)}</Text>
      <View style={{ width: LINE_COLUMN, alignItems: "center", paddingTop: next ? 7 : 6 }}>
        {next ? <Marker scale={1.4} /> : <View style={[node, { backgroundColor: past ? color.lineStrong : color.ground }]} />}
      </View>
      <Stack gap="xs" flex={1} style={{ minWidth: 0, paddingLeft: space.sm }}>
        <Text variant={next ? "title" : "body"} tone={past ? "soft" : "ink"}>{entry.title}</Text>
        <Text variant="small" tone="soft">{entry.detail}</Text>
        {next ? <View style={{ paddingTop: space.sm }}><Button title="Prepare in Focus" size="small" trailingIcon="arrowRight" onPress={onPrepare} testID="today-prepare" /></View> : null}
      </Stack>
    </View>
  );
}

function ObjectiveRow({ objective, onStudy }: { objective: Objective; onStudy?: () => void }) {
  const { color, marker, space } = useTheme();
  return (
    <View accessible aria-label={`${objective.title}. ${objective.done ? "Done" : "Not done"}. ${objective.detail}`} style={{ flexDirection: "row", gap: space.md }}>
      <View style={{ width: 18, height: 22, alignItems: "center", justifyContent: "center" }}>
        {objective.done ? <Icon name="check" size={16} color={color.inkSoft} /> : <View style={{ width: NODE, height: NODE, borderRadius: Math.min(marker.radius, NODE / 2), borderWidth: 1, borderColor: color.lineStrong }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small" tone={objective.done ? "soft" : "ink"}>{objective.title}</Text>
        <Text variant="caption" tone="soft">{objective.detail}</Text>
      </View>
      {onStudy ? <Button title="Study this" size="small" variant="ghost" testID={`today-study-${objective.id}`} onPress={onStudy} /> : null}
    </View>
  );
}

export function TodayDestination() {
  const { color } = useTheme();
  const navigation = useHomeNavigation();
  const spaces = useSpacesStore();
  const session = useStudySession();
  const result = useHomeResult("today", load);
  const now = useMemo(() => new Date(), []);
  const { active } = useSessionState();
  const today = result?.data;
  const greeting = greetingFor(now.getHours());
  const date = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  const go = (space: SpaceId) => () => spaces.select(space);
  const places: { title: string; detail: string; icon: IconName; onPress: () => void }[] = [
    { title: active ? "Back to your session" : "Start studying", detail: active ? active.title : result?.live ? "Choose a subject and a length" : "Choose a length and a desk", icon: "focus", onPress: () => navigation.select("focus") },
    ...spaces.available().filter((space) => space !== "home").map((space) => ({ title: `Open ${SPACE_LABELS[space]}`, detail: space === "workspace" ? "Your tools and canvas" : "A place you earn by studying", icon: space as IconName, onPress: go(space) })),
  ];

  // A quest has a subject and a title, so choosing it fills in everything Focus would ask. It starts nothing: the person does that.
  const study = (objective: Objective) => () => {
    session.setPlan({ title: objective.title, subject: objective.subject ?? null, subjectId: objective.subjectId ?? null, questId: objective.questId ?? null });
    navigation.select("focus");
  };
  const clear = !today || (!today.entries.length && !today.objectives.length);
  const done = today?.objectives.filter((objective) => objective.done).length ?? 0;
  const planned = today ? plannedMinutes(today.entries) : 0;

  return (
    <HomePage destination="today" eyebrow={date} provenance={result?.provenance} live={result?.live} ready={result !== null}>
      {!result ? <LoadingPage title={greeting} /> : !today && result.live?.failure ? <FailedPage title={greeting} icon="today" live={result.live} /> : clear ? (
        <>
          <EmptyPage title={greeting} icon="today" heading="A clear day" message={today?.summary ?? "Sessions, deadlines and objectives will appear here once you plan them."} />
          <Section title="Go to">{places.map((place) => <ListRow key={place.title} {...place} trailing={<Icon name="chevronRight" size={14} color={color.inkFaint} />} />)}</Section>
        </>
      ) : (
        <>
          <PageTitle title={greeting} detail={today!.summary ?? summarizeDay(today!.entries)} />
          <HomeColumns
            primary={
              <>
                {today!.allDay?.length ? <Text variant="small" tone="soft" testID="today-all-day">{`All day: ${today!.allDay.join(", ")}`}</Text> : null}
                {today!.entries.length ? (
                  <Section title={planned ? `The day, ${formatMinutes(planned)} planned` : "The day"}>
                    <View>
                      <View style={{ position: "absolute", left: TIME_COLUMN + LINE_COLUMN / 2, top: 8, bottom: 40, width: 1, backgroundColor: color.line }} />
                      {today!.entries.map((entry) => <DayRow key={entry.id} entry={entry} onPrepare={() => navigation.select("focus")} />)}
                    </View>
                  </Section>
                ) : null}
                {/* Quests have a date and no time, so they follow the line in order and never sit on it (G-3). */}
                {today!.objectives.length ? (
                  <Section title="Quests">
                    <Meter value={done} max={today!.objectives.length} label={`${done} of ${today!.objectives.length} quests done`} />
                    <Stack gap="md">{today!.objectives.map((objective) => <ObjectiveRow key={objective.id} objective={objective} onStudy={objective.done || active || objective.questId === undefined ? undefined : study(objective)} />)}</Stack>
                  </Section>
                ) : null}
              </>
            }
            secondary={[
              <Section key="go" title="Go to">
                <View>{places.map((place) => <ListRow key={place.title} {...place} trailing={<Icon name="chevronRight" size={14} color={color.inkFaint} />} />)}</View>
              </Section>,
            ]}
          />
        </>
      )}
    </HomePage>
  );
}
