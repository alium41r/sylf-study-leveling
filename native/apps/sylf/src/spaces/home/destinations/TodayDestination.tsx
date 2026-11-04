// Today answers one question: what should I do right now? One card holds the next thing and the way to start it. The line through the day keeps its
// place below, with what has no time of day waiting at the end of it, ticked off where it stands.
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button, Checkbox, Marker, Meter, Plane, Stack, Text, useNotice, useTheme } from "@sylf/design-system";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { useHomeNavigation, useSessionState, useStudySession } from "../../../shell/context";
import { useEnterFocus } from "../../../shell/focus/enter";
import { useHomeResult } from "../data";
import type { DayEntry, DayTarget, HomeDataAdapter, Objective } from "../data/contracts";
import { formatMinutes, greetingFor, pickNext, plannedMinutes } from "../format";
import { TodayBriefing } from "./TodayBriefing";
import { EmptyPage, FailedPage, HomeColumns, HomePage, LoadingPage, PageTitle, Section } from "../HomePage";

const load = (adapter: HomeDataAdapter) => adapter.today(new Date());
const TIME_COLUMN = 84;
const LINE_COLUMN = 28;
const NODE = 6;
const clock = (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function DayRow({ entry }: { entry: DayEntry }) {
  const { color, marker, space } = useTheme();
  const node = { width: NODE, height: NODE, borderRadius: Math.min(marker.radius, NODE / 2), borderWidth: 1, borderColor: color.lineStrong };
  const next = entry.state === "next";
  const past = entry.state === "past";
  return (
    <View style={{ flexDirection: "row", gap: 0, paddingBottom: space.xl }}>
      <Text variant="value" tone={next ? "ink" : "soft"} numberOfLines={1} style={{ width: TIME_COLUMN }}>{clock(entry.startsAt)}</Text>
      <View style={{ width: LINE_COLUMN, alignItems: "center", paddingTop: 6 }}>
        {next ? <Marker scale={1.2} /> : <View style={[node, { backgroundColor: past ? color.lineStrong : color.ground }]} />}
      </View>
      <Stack gap="xs" flex={1} style={{ minWidth: 0, paddingLeft: space.sm }}>
        <Text variant="body" tone={past ? "soft" : "ink"}>{entry.title}</Text>
        <Text variant="small" tone="soft">{entry.detail}</Text>
      </Stack>
    </View>
  );
}

/** A quest has no time of day, so it waits at the end of the line. Its tick goes through the server's own rules, and what it pays comes back from there. */
function QuestRow({ objective, sending, onTick, onStudy }: { objective: Objective; sending: boolean; onTick: () => void; onStudy?: () => void }) {
  const { space } = useTheme();
  return (
    <View testID={`today-quest-${objective.id}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Checkbox label={objective.title} value={objective.done} disabled={objective.done || sending} onChange={onTick} />
        <Text variant="caption" tone="soft" style={{ paddingLeft: space.xl }}>{objective.detail}</Text>
      </View>
      {onStudy ? <Button title="Study this" size="small" variant="ghost" testID={`today-study-${objective.id}`} onPress={onStudy} /> : null}
    </View>
  );
}

function NextCard({ title, detail, active, onBegin }: { title: string; detail: string; active: boolean; onBegin: () => void }) {
  const { space } = useTheme();
  return (
    <Plane level="raised" radius="lg" testID="today-next" style={{ padding: space.xl, gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Marker />
        <Text variant="caption" tone="soft">{active ? "In progress" : "Next"}</Text>
      </View>
      <Stack gap="xs">
        <Text variant="title" numberOfLines={3}>{title}</Text>
        {detail ? <Text variant="small" tone="soft">{detail}</Text> : null}
      </Stack>
      <View style={{ flexDirection: "row" }}>
        <Button title={active ? "Back to your session" : "Begin"} variant="emphasis" trailingIcon="arrowRight" testID="today-begin" onPress={onBegin} />
      </View>
    </Plane>
  );
}

function TargetLine({ target }: { target: DayTarget }) {
  if (target.rest) return <View testID="today-target"><Text variant="small" tone="soft">A rest day. Nothing to reach today.</Text></View>;
  const left = target.goal - target.studied;
  return (
    <View testID="today-target">
      <Stack gap="sm">
        <Meter value={Math.min(target.studied, target.goal)} max={target.goal} label={`${formatMinutes(target.studied)} of ${formatMinutes(target.goal)} studied today`} />
        <Text variant="caption" tone="soft">{left > 0 ? `${formatMinutes(left)} to your target` : "Target reached."}</Text>
      </Stack>
    </View>
  );
}

export function TodayDestination() {
  const { color } = useTheme();
  const navigation = useHomeNavigation();
  const session = useStudySession();
  const enter = useEnterFocus();
  const backend = useLiveBackend();
  const notice = useNotice();
  const result = useHomeResult("today", load);
  const now = useMemo(() => new Date(), []);
  const { active } = useSessionState();
  const [sending, setSending] = useState<string | null>(null);
  const today = result?.data;
  const greeting = greetingFor(now.getHours());
  const date = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  // A quest has a subject and a title, so beginning it fills in everything Focus would ask, then goes straight into the environment.
  // "Study this" on a quest only prepares: it shows Focus with that quest chosen, so the rhythm can still be picked.
  const prepare = (objective?: Objective) => {
    if (objective) session.setPlan({ title: objective.title, subject: objective.subject ?? null, subjectId: objective.subjectId ?? null, questId: objective.questId ?? null });
    navigation.select("focus");
  };
  const begin = (objective?: Objective) => {
    if (objective) session.setPlan({ title: objective.title, subject: objective.subject ?? null, subjectId: objective.subjectId ?? null, questId: objective.questId ?? null });
    enter();
  };
  const tick = async (objective: Objective) => {
    if (!backend || !objective.completion || sending) return;
    setSending(objective.id);
    try { await backend.reads.completeQuest(objective.completion); notice("Quest done."); }
    catch (error) { notice(describeFailureText(error)); }
    setSending(null);
    backend.resources.invalidate("today");
    backend.resources.invalidate("progress");
    backend.resources.invalidate("traveller");
  };

  const objectives = today?.objectives ?? [];
  const entries = today?.entries ?? [];
  const clear = !today || (!entries.length && !objectives.length);
  const done = objectives.filter((objective) => objective.done).length;
  const planned = plannedMinutes(entries);
  const next = pickNext(entries, objectives, now.getTime());
  const nextTitle = active ? active.title : next?.kind === "quest" ? next.objective.title : next?.kind === "event" ? next.entry.title : "";
  const nextDetail = active ? active.subject ?? "" : next?.kind === "quest" ? next.objective.detail : next?.kind === "event" ? `${clock(next.entry.startsAt)}. ${next.entry.detail}` : "";
  const onBegin = () => begin(!active && next?.kind === "quest" ? next.objective : undefined);

  return (
    <HomePage destination="today" eyebrow={date} provenance={result?.provenance} live={result?.live} ready={result !== null}>
      {!result ? <LoadingPage title={greeting} /> : !today && result.live?.failure ? <FailedPage title={greeting} icon="today" live={result.live} /> : clear ? (
        <>
          <EmptyPage title={greeting} icon="today" heading="A clear day" message={today?.summary ?? "Sessions, deadlines and objectives will appear here once you plan them."} />
          {today?.target ? <TargetLine target={today.target} /> : null}
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            <Button title="Plan something" variant="emphasis" testID="today-plan" onPress={() => navigation.select("plan")} />
            <Button title={active ? "Back to your session" : "Start studying"} testID="today-study" onPress={() => prepare()} />
          </View>
        </>
      ) : (
        <>
          <PageTitle title={greeting} detail={today!.summary} />
          <TodayBriefing />
          <HomeColumns
            primary={
              <>
                {nextTitle ? <NextCard title={nextTitle} detail={nextDetail} active={active !== null} onBegin={onBegin} /> : null}
                {today!.allDay?.length ? <Text variant="small" tone="soft" testID="today-all-day">{`All day: ${today!.allDay.join(", ")}`}</Text> : null}
                {entries.length ? (
                  <Section title={planned ? `The day, ${formatMinutes(planned)} planned` : "The day"}>
                    <View>
                      <View style={{ position: "absolute", left: TIME_COLUMN + LINE_COLUMN / 2, top: 8, bottom: 40, width: 1, backgroundColor: color.line }} />
                      {entries.map((entry) => <DayRow key={entry.id} entry={entry} />)}
                    </View>
                  </Section>
                ) : null}
                {/* Quests have a date and no time, so they follow the line in order and never sit on it (G-3). */}
                {objectives.length ? (
                  <Section title={`Quests, ${done} of ${objectives.length} done`}>
                    <Stack gap="md">{objectives.map((objective) => <QuestRow key={objective.id} objective={objective} sending={sending !== null} onTick={() => void tick(objective)} onStudy={objective.done || active || objective.questId === undefined ? undefined : () => prepare(objective)} />)}</Stack>
                  </Section>
                ) : null}
              </>
            }
            secondary={[
              ...(today!.target ? [<Section key="target" title="Today's target"><TargetLine target={today!.target} /></Section>] : []),
              <Section key="ahead" title="What's ahead">
                <View style={{ flexDirection: "row" }}><Button title="Open your plan" size="small" trailingIcon="arrowRight" testID="today-plan" onPress={() => navigation.select("plan")} /></View>
              </Section>,
            ]}
          />
        </>
      )}
    </HomePage>
  );
}
