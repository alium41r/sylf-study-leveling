// Today answers one question: what should I do right now? One card holds the next thing and the way to start it. The line through the day keeps its
// place below, with what has no time of day waiting at the end of it, ticked off where it stands.
import { useMemo, useState, useSyncExternalStore } from "react";
import { useNotice } from "@sylf/design-system";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { useHomeNavigation, useSessionState, useStudySession } from "../../../shell/context";
import { useEnterFocus } from "../../../shell/focus/enter";
import { useSubjectColour } from "../../../shell/live";
import { useHomeResult } from "../data";
import type { HomeDataAdapter, Objective } from "../data/contracts";
import { greetingFor, pickNext, plannedMinutes } from "../format";
import { TodayBriefing } from "./TodayBriefing";
import { TodayInvites } from "./TodayInvites";
import { QuickAsk } from "./QuickAsk";
import { CircleCard } from "./TodayCircle";
import { DayCard } from "./TodayDay";
import { Header } from "./TodayHeader";
import { MomentumCard } from "./TodayMomentum";
import { TodayHero } from "./TodayHero";
import { WorldCard } from "./TodayWorld";
import { skyAt } from "./todaySky";
import { FailedPage, HomeColumns, HomePage, LoadingPage } from "../HomePage";

const load = (adapter: HomeDataAdapter) => adapter.today(new Date());
const clock = (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function TodayDestination() {
  const navigation = useHomeNavigation();
  const session = useStudySession();
  const enter = useEnterFocus();
  const backend = useLiveBackend();
  const notice = useNotice();
  const result = useHomeResult("today", load);
  const now = useMemo(() => new Date(), []);
  const { active } = useSessionState();
  const showing = useSyncExternalStore(navigation.subscribe, navigation.destination, navigation.destination) === "today";
  const [sending, setSending] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const today = result?.data;
  const colourOf = useSubjectColour();
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
  const planned = plannedMinutes(entries);
  const next = pickNext(entries, objectives, now.getTime());
  const nextTitle = active ? active.title : next?.kind === "quest" ? next.objective.title : next?.kind === "event" ? next.entry.title : "";
  const nextDetail = active ? active.subject ?? "" : next?.kind === "quest" ? next.objective.detail : next?.kind === "event" ? `${clock(next.entry.startsAt)}. ${next.entry.detail}` : "";
  const nextSubject = !active && next?.kind === "quest" ? colourOf(next.objective.subjectId) : null;
  const sky = skyAt(now.getHours());
  const onBegin = () => begin(!active && next?.kind === "quest" ? next.objective : undefined);
  const canStudy = (objective: Objective) => !(objective.done || active || objective.questId === undefined);

  return (
    <HomePage destination="today" eyebrow={date} provenance={result?.provenance} live={result?.live} ready={result !== null}>
      {!result ? <LoadingPage title={greeting} /> : !today && result.live?.failure ? <FailedPage title={greeting} icon="today" live={result.live} /> : (
        <>
          <Header greeting={greeting} detail={today?.summary} sky={sky} onAsk={backend ? () => setAsking(true) : undefined} />
          <QuickAsk open={asking} onClose={() => setAsking(false)} />
          <TodayInvites />
          <TodayHero sky={sky} target={today?.target} title={nextTitle} detail={nextDetail} subjectColour={nextSubject} active={active !== null} live={showing} onBegin={onBegin} onChoose={() => prepare(!active && next?.kind === "quest" ? next.objective : undefined)} />
          <TodayBriefing />
          <HomeColumns
            primary={<DayCard entries={entries} objectives={objectives} allDay={today?.allDay} planned={planned} sending={sending !== null} canStudy={canStudy} onTick={(objective) => void tick(objective)} onStudy={prepare} onPlan={() => navigation.select("plan")} />}
            secondary={[<MomentumCard key="momentum" />, <WorldCard key="world" />, <CircleCard key="circle" />]}
          />
        </>
      )}
    </HomePage>
  );
}
