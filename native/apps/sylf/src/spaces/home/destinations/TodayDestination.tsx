// The dashboard. Four parts, each with its own job and its own reads: where you stand (with the greeting at its head), your World, what there is to do, and
// who is around. With room they sit two by two, set apart by air and one hairline, with no surface around any of them. A portrait tablet pairs progress with
// the island and runs the rest in one column, and a phone is one column with the next thing to do first. The way into a session is the hub: one button
// on the hairline at the middle, where the four parts meet. This file only arranges them and owns the actions
// that leave the page. Each part is memoised and reads its own data, so one read answering renders one part.
import { useCallback, useMemo, useState } from "react";
import { Platform, View } from "react-native";
import { Divider, useNotice, useTheme } from "@sylf/design-system";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { useHomeNavigation, useSessionState, useStudySession } from "../../../shell/context";
import { useEnterFocus } from "../../../shell/focus/enter";
import { useHomeResult } from "../data";
import type { Objective } from "../data/contracts";
import { greetingFor, pickNext, plannedMinutes } from "../format";
import { FailedPage, HomePage, LoadingPage, useHomeContentWidth } from "../HomePage";
import { Header } from "./TodayHeader";
import { TodayHub } from "./TodayHub";
import { TodayObjectives } from "./TodayObjectives";
import { TodayProgress } from "./TodayProgress";
import { TodaySocial } from "./TodaySocial";
import { TodayWorld } from "./TodayWorld";
import { GRID_FLEX, islandBox, todayLayout } from "./todayLayout";
import { skyAt } from "./todaySky";
import { useDashboardLive } from "./useDashboardLive";

const NO_ENTRIES: never[] = [];

export function TodayDestination() {
  const { space } = useTheme();
  const navigation = useHomeNavigation();
  const session = useStudySession();
  const enter = useEnterFocus();
  const backend = useLiveBackend();
  const notice = useNotice();
  const result = useHomeResult("today");
  const now = useMemo(() => new Date(), []);
  const { active } = useSessionState();
  const live = useDashboardLive();
  const width = useHomeContentWidth(true);
  const [sending, setSending] = useState<string | null>(null);
  const today = result?.data;
  const greeting = greetingFor(now.getHours());
  const date = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  const objectives = today?.objectives ?? NO_ENTRIES;
  const entries = today?.entries ?? NO_ENTRIES;
  const planned = plannedMinutes(entries);
  const next = pickNext(entries, objectives, now.getTime());
  const nextQuest = !active && next?.kind === "quest" ? next.objective : undefined;
  const nextIsEvent = !active && next?.kind === "event";
  const sky = skyAt(now.getHours());
  const kind = active ? "session" : next?.kind ?? "ready";

  const plan = useCallback((objective?: Objective) => {
    if (objective) session.setPlan({ title: objective.title, subject: objective.subject ?? null, subjectId: objective.subjectId ?? null, questId: objective.questId ?? null });
  }, [session]);
  // "Study this" on a quest only prepares: it shows Focus with that quest chosen, so the rhythm can still be picked.
  const prepare = useCallback((objective?: Objective) => { plan(objective); navigation.select("focus"); }, [navigation, plan]);
  const calendar = useCallback(() => { navigation.setView("plan", "calendar"); navigation.select("plan"); }, [navigation]);
  const targetSettings = useCallback(() => { navigation.setView("plan", "quests"); navigation.select("plan"); }, [navigation]);
  // A quest has a subject and a title, so beginning it fills in everything Focus would ask, then goes straight into the environment.
  const onBegin = useCallback(() => { if (nextIsEvent) calendar(); else { plan(nextQuest); enter(); } }, [calendar, enter, nextIsEvent, nextQuest, plan]);
  const tick = useCallback(async (objective: Objective) => {
    if (!backend || !objective.completion || sending) return;
    setSending(objective.id);
    try { await backend.reads.completeQuest(objective.completion); notice("Quest done."); }
    catch (error) { notice(describeFailureText(error)); }
    setSending(null);
    backend.resources.invalidate("today");
    backend.resources.invalidate("progress");
    backend.resources.invalidate("traveller");
  }, [backend, notice, sending]);
  const onTick = useCallback((objective: Objective) => { void tick(objective); }, [tick]);

  const layout = todayLayout(width);
  const gap = layout === "grid" ? space.xxl : space.xl;
  const columnGap = layout === "grid" ? space.air : space.xl;
  const island = islandBox(layout, width, columnGap);

  const header = <Header date={date} greeting={greeting} detail={today?.summary} compact={layout === "stack"} />;
  const progress = <TodayProgress target={today?.target} onTarget={targetSettings} />;
  const world = <TodayWorld sky={sky} playing={live} height={island.height} {...(layout === "stack" ? { maxWidth: 420 } : {})} />;
  const objectivesPart = (
    <TodayObjectives
      entries={entries} objectives={objectives} allDay={today?.allDay} planned={planned} sending={sending !== null} busy={Boolean(active)}
      onTick={onTick} onStudy={prepare} onPlan={calendar}
    />
  );
  const social = <TodaySocial />;
  // On a desktop the hub's middle is the gutter between the columns, which is where the four parts meet.
  const split = useMemo(() => ({ ...GRID_FLEX, gap: columnGap }), [columnGap]);
  const hub = <TodayHub kind={kind} width={width} onBegin={onBegin} {...(layout === "grid" ? { split } : {})} />;
  const column = { minWidth: 0 } as const;

  return (
    <HomePage destination="today" live={result?.live} ready={result !== null} wide>
      {!result ? <LoadingPage title={greeting} /> : !today ? <FailedPage title={greeting} icon="today" live={result.live} /> : (
        <View testID="today-dashboard" {...(Platform.OS === "web" ? { dataSet: { layout } } as object : {})} style={{ gap }}>
          {layout === "grid" ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: columnGap }}>
                <View testID="today-part-progress" style={[column, { flex: GRID_FLEX.left, gap: space.xl }]}>{header}{progress}</View>
                <View testID="today-part-world" style={[column, { flex: GRID_FLEX.right }]}>{world}</View>
              </View>
              {hub}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: columnGap }}>
                <View testID="today-part-objectives" style={[column, { flex: GRID_FLEX.left }]}>{objectivesPart}</View>
                <View testID="today-part-social" style={[column, { flex: GRID_FLEX.right }]}>{social}</View>
              </View>
            </>
          ) : layout === "paired" ? (
            <>
              {header}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: columnGap }}>
                <View testID="today-part-progress" style={[column, { flex: 1 }]}>{progress}</View>
                <View testID="today-part-world" style={{ width: island.width }}>{world}</View>
              </View>
              {hub}
              <View testID="today-part-objectives" style={column}>{objectivesPart}</View>
              <Divider />
              <View testID="today-part-social" style={column}>{social}</View>
            </>
          ) : (
            <>
              {header}
              {hub}
              <View testID="today-part-objectives" style={column}>{objectivesPart}</View>
              <Divider />
              <View testID="today-part-progress" style={column}>{progress}</View>
              <Divider />
              <View testID="today-part-world" style={column}>{world}</View>
              <Divider />
              <View testID="today-part-social" style={column}>{social}</View>
            </>
          )}
        </View>
      )}
    </HomePage>
  );
}
