// The almanac. Month shows how full each day is, Week is a time grid, Agenda is the next two weeks, and the day page beside them holds everything about
// the selected date with one field to add to it. Text belongs to the day page, so the month stays calm. Plain views throughout: no full-window SVG, and
// nothing moves on its own, which keeps Home's memory and battery rules.
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, Checkbox, IconButton, ListRow, Marker, Meter, Plane, Press, Segmented, Stack, Text, TextField, useNotice, useTheme, useWindowClass } from "@sylf/design-system";
import { quickAdd } from "@sylf/shared";
import type { DayQuest, MonthDay, PlanEvent } from "@sylf/backend";
import { useLiveBackend } from "../../../shell/backend";
import { useSubjectColour } from "../../../shell/live";
import { describeFailureText } from "../../../shell/account/failure";
import { useHomeNavigation, useSessionState, useStudySession } from "../../../shell/context";
import { formatMinutes } from "../format";
import { EventSheet, type EventTarget } from "./EventSheet";
import { addDays, clock, dateKey, dayDensity, dayTitle, deviceTimezone, eventsOn, instantOf, monthRows, questDone, questFailed, questMinutes, questOverdue, shortDay, validTime, weekOf } from "./shared";
import { QuestSheet, type QuestTarget } from "./QuestSheet";
import { refreshPlan, useMonth, type MonthView } from "./usePlan";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GRID_HOURS = Array.from({ length: 18 }, (_, index) => index + 6);
const HOUR = 44;
const HOUR_LABEL = 40;
type Span = "month" | "week" | "agenda";

function MonthCell({ date, data, selected, today, rest, density, onPress }: { date: string; data: MonthDay | undefined; selected: boolean; today: boolean; rest: boolean; density: number; onPress: () => void }) {
  const { color, shape, space } = useTheme();
  const day = Number(date.slice(8));
  const label = `${dayTitle(date)}.${rest ? " Rest day." : ""}${density ? ` ${density} planned.` : ""}${data?.totalMinutes ? ` ${data.totalMinutes} minutes studied.` : ""}`;
  return (
    <Press testID={`plan-day-${date}`} label={label} selected={selected} onPress={onPress} height={56} radius={shape.radius.md} style={{ flex: 1 }} bodyStyle={{ height: 56, alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: selected ? color.accent.wash : undefined, borderRadius: shape.radius.md }}>
      <Text variant="small" tone={rest ? "soft" : today || selected ? "ink" : "ink"} style={{ fontWeight: today ? "700" : undefined }}>{String(day)}</Text>
      <View style={{ flexDirection: "row", gap: 3, height: 6, alignItems: "center" }}>
        {rest ? <View style={{ width: 10, height: 1, backgroundColor: color.lineStrong }} /> : Array.from({ length: density }, (_, index) => <View key={index} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: today ? color.accent.ink : color.inkSoft }} />)}
      </View>
      {today ? <View style={{ position: "absolute", top: space.xs, right: space.sm }}><Marker scale={0.6} /></View> : null}
    </Press>
  );
}

function MonthGrid({ view, year, month, selected, onSelect }: { view: MonthView | null; year: number; month: number; selected: string; onSelect: (day: string) => void }) {
  const { space } = useTheme();
  const rows = useMemo(() => monthRows(year, month), [year, month]);
  const byDate = useMemo(() => new Map(view?.month.days.map((day) => [day.date, day])), [view]);
  const floating = view?.month.floatingRestDays ?? [];
  return (
    <View testID="plan-month" style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row" }}>{WEEKDAYS.map((name) => <View key={name} style={{ flex: 1, alignItems: "center" }}><Text variant="caption" tone="soft">{name}</Text></View>)}</View>
      {rows.map((row, index) => (
        <View key={index} style={{ flexDirection: "row", gap: 2 }}>
          {row.map((date, cell) => (date ? <MonthCell key={date} date={date} data={byDate.get(date)} selected={date === selected} today={date === view?.today} rest={byDate.get(date)?.isRestDay === true || floating.includes(date)} density={dayDensity(view?.events ?? [], byDate.get(date), date)} onPress={() => onSelect(date)} /> : <View key={cell} style={{ flex: 1 }} />))}
        </View>
      ))}
    </View>
  );
}

/** A real week. Tapping an empty hour starts an event there. Moving one is done in its sheet, which works from a keyboard and a screen reader alike. */
function WeekGrid({ events, quests, colourOf, selected, today, onSelect, onEvent, onNew }: { events: PlanEvent[]; quests: (day: string) => DayQuest[]; colourOf: (id: number | null | undefined) => string | null; selected: string; today: string; onSelect: (day: string) => void; onEvent: (event: PlanEvent) => void; onNew: (day: string, time: string) => void }) {
  const { color, shape, space } = useTheme();
  const days = weekOf(selected);
  return (
    <View testID="plan-week" style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", paddingLeft: HOUR_LABEL }}>
        {days.map((day) => <Press key={day} label={dayTitle(day)} selected={day === selected} onPress={() => onSelect(day)} height={40} style={{ flex: 1 }} bodyStyle={{ height: 40, alignItems: "center", justifyContent: "center" }}><Text variant="caption" tone={day === today || day === selected ? "ink" : "soft"} numberOfLines={1}>{shortDay(day)}</Text></Press>)}
      </View>
      <View testID="plan-week-quests" style={{ flexDirection: "row", paddingLeft: HOUR_LABEL, gap: 2, minHeight: 28 }}>
        {days.map((day) => {
          const list = quests(day).filter((quest) => !questFailed(quest));
          return (
            <View key={day} style={{ flex: 1, minWidth: 0, gap: 2 }}>
              {list.slice(0, 3).map((quest) => (
                <Press key={quest.id} label={`Quest: ${quest.title}`} onPress={() => onSelect(day)} radius={shape.radius.xs} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2, paddingHorizontal: 4, backgroundColor: color.selected, borderRadius: shape.radius.xs, opacity: questDone(quest) ? 0.5 : 1 }}>
                  <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: colourOf((quest as { subjectId?: number | null }).subjectId) ?? color.accent.mote }} />
                  <Text variant="caption" numberOfLines={1} style={{ flex: 1, textDecorationLine: questDone(quest) ? "line-through" : undefined }}>{quest.title}</Text>
                </Press>
              ))}
              {list.length > 3 ? <Text variant="caption" tone="soft">{`+${list.length - 3} more`}</Text> : null}
            </View>
          );
        })}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: HOUR * 10 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", height: HOUR * GRID_HOURS.length }}>
          <View style={{ width: HOUR_LABEL }}>{GRID_HOURS.map((hour) => <View key={hour} style={{ height: HOUR }}><Text variant="caption" tone="soft">{`${String(hour).padStart(2, "0")}`}</Text></View>)}</View>
          {days.map((day) => (
            <View key={day} style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: color.line }}>
              {GRID_HOURS.map((hour) => <Press key={hour} label={`New event, ${dayTitle(day)} at ${hour}:00`} feedback="none" onPress={() => onNew(day, `${String(hour).padStart(2, "0")}:00`)} height={HOUR} bodyStyle={{ height: HOUR, borderTopWidth: 1, borderTopColor: color.line }}><View /></Press>)}
              {eventsOn(events, day).filter((event) => !event.allDay && event.startsAt).map((event) => {
                const begins = new Date(event.startsAt!); const ends = event.endsAt ? new Date(event.endsAt) : new Date(begins.getTime() + 3_600_000);
                const top = (begins.getHours() + begins.getMinutes() / 60 - GRID_HOURS[0]) * HOUR;
                const height = Math.max(20, ((ends.getTime() - begins.getTime()) / 3_600_000) * HOUR - 2);
                if (top < 0) return null;
                return <Press key={event.id} testID={`plan-week-event-${event.id}`} label={`${event.title}, ${clock(event.startsAt!)}`} onPress={() => onEvent(event)} height={height} radius={shape.radius.sm} style={{ position: "absolute", top, left: 2, right: 2 }} bodyStyle={{ height, paddingHorizontal: 4, paddingTop: 2, backgroundColor: color.accent.wash, borderRadius: shape.radius.sm, overflow: "hidden" }}><Text variant="caption" numberOfLines={2}>{event.title}</Text></Press>;
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Agenda({ view, from, onSelect, onEvent }: { view: MonthView | null; from: string; onSelect: (day: string) => void; onEvent: (event: PlanEvent) => void }) {
  const { space } = useTheme();
  const days = Array.from({ length: 14 }, (_, index) => addDays(from, index));
  const filled = days.flatMap((day) => {
    const events = eventsOn(view?.events ?? [], day);
    const quests = view?.month.days.find((entry) => entry.date === day)?.quests ?? [];
    return events.length || quests.length ? [{ day, events, quests }] : [];
  });
  if (!filled.length) return <View testID="plan-agenda"><Text tone="soft">Nothing in the next two weeks yet.</Text></View>;
  return (
    <View testID="plan-agenda" style={{ gap: space.lg }}>
      {filled.map(({ day, events, quests }) => (
        <Stack key={day} gap="xs">
          <Press label={dayTitle(day)} onPress={() => onSelect(day)} height={28} bodyStyle={{ height: 28, justifyContent: "center" }}><Text variant="caption" tone="soft">{dayTitle(day)}</Text></Press>
          {events.map((event) => <ListRow key={event.id} title={event.title} detail={event.allDay ? "All day" : clock(event.startsAt!)} onPress={() => onEvent(event)} />)}
          {quests.map((quest) => <ListRow key={quest.id} title={quest.title} detail={questMinutes(quest) ? formatMinutes(questMinutes(quest)!) : "Quest"} />)}
        </Stack>
      ))}
    </View>
  );
}

/** "Lab at 3pm" reads as an event, and anything without a time as a quest. The choice is shown and can be changed, so nothing lands by surprise. */
function AddField({ day, rest, onAdded, onDetails }: { day: string; rest: boolean; onAdded: () => void; onDetails: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"quest" | "event">("quest");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const timeError = kind === "event" && time.trim() && !validTime(time) ? "Use 24-hour time, such as 14:30." : undefined;
  // "Physics mock tomorrow at 10am" and "Study group every Tuesday 4pm": a small, fixed grammar turns words into a draft, and the draft is shown before it is saved.
  const draft = useMemo(() => {
    if (kind !== "event" || !text.trim() || time.trim()) return null;
    try { return quickAdd.parseQuickEvent(text, dateKey(new Date()), day, deviceTimezone()); } catch { return null; }
  }, [kind, text, time, day]);
  const preview = draft ? [dayTitle(draft.data.startDate), draft.data.allDay ? "all day" : `${clock(draft.data.startsAt!)} to ${clock(draft.data.endsAt!)}`, draft.data.recurrence ? "repeats" : null].filter(Boolean).join(", ") : null;
  const add = async () => {
    if (!backend || !text.trim() || busy || timeError) return;
    setBusy(true);
    try {
      if (kind === "quest") await backend.reads.plan.createQuest({ title: text.trim(), scheduledFor: day, targetMinutes: 30, difficulty: "NORMAL" });
      else if (draft) await backend.reads.plan.createEvent(globalThis.crypto.randomUUID(), draft.data);
      else {
        const startsAt = time.trim() ? instantOf(day, time) : null;
        const endsAt = startsAt ? new Date(Date.parse(startsAt) + 3_600_000).toISOString() : null;
        await backend.reads.plan.createEvent(globalThis.crypto.randomUUID(), { title: text.trim(), description: "", color: "BLUE", allDay: !startsAt, startDate: day, endDate: startsAt ? new Date(endsAt!).toLocaleDateString("en-CA") : day, startsAt, endsAt, timezone: deviceTimezone() });
      }
      setText(""); setTime(""); refreshPlan(backend); onAdded();
    } catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  return (
    <Stack gap="sm">
      <TextField label="Add to this day" hideLabel placeholder={kind === "quest" ? "Add a quest" : "Add an event, like Lab tomorrow at 3pm"} value={text} onChangeText={setText} testID="plan-add-text" returnKeyType="done" onSubmitEditing={() => void add()} />
      {preview ? <Text variant="caption" tone="soft" testID="plan-add-preview">{`${draft!.data.title}: ${preview}`}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm, flexWrap: "wrap" }}>
        <Segmented<"quest" | "event"> label="Kind of thing to add" value={kind} options={[{ value: "quest", label: "Quest" }, { value: "event", label: "Event" }]} onChange={setKind} />
        {kind === "event" ? <View style={{ width: 120 }}><TextField label="Time" hideLabel placeholder="Time" value={time} onChangeText={setTime} error={timeError} testID="plan-add-time" /></View> : null}
        <Button title={busy ? "Adding" : "Add"} disabled={busy || !text.trim() || Boolean(timeError)} testID="plan-add" onPress={() => void add()} />
        <Button title="More" variant="ghost" size="small" testID="plan-add-more" onPress={onDetails} />
      </View>
      {kind === "quest" && rest ? <Text variant="caption" tone="soft">This is a rest day. Sylf keeps rest days free of quests, so choose another day or change your rest days under Quests.</Text> : null}
    </Stack>
  );
}

function DayQuestRow({ quest, date, today, sending, onTick, onOpen, onMove, onStudy }: { quest: DayQuest; date: string; today: string; sending: boolean; onTick: () => void; onOpen: () => void; onMove: () => void; onStudy?: () => void }) {
  const { space } = useTheme();
  const overdue = questOverdue(quest, date, today);
  const minutes = questMinutes(quest);
  return (
    <View testID={`plan-quest-${quest.id}`} style={{ gap: space.hair }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {overdue || questFailed(quest) ? <Text variant="small" tone="soft">{quest.title}</Text> : <Checkbox label={quest.title} value={questDone(quest)} disabled={questDone(quest) || sending} onChange={onTick} />}
        </View>
        {onStudy ? <Button title="Study this" size="small" variant="ghost" testID={`plan-study-${quest.id}`} onPress={onStudy} /> : null}
        {overdue ? <Button title="Move to today" size="small" testID={`plan-move-${quest.id}`} disabled={sending} onPress={onMove} /> : null}
        <IconButton icon="chevronRight" label={`Open ${quest.title}`} onPress={onOpen} />
      </View>
      <Text variant="caption" tone="soft" style={{ paddingLeft: overdue || questFailed(quest) ? 0 : space.xl }}>{[quest.goal?.title, minutes ? formatMinutes(minutes) : null, questFailed(quest) ? "Not finished" : overdue ? "From an earlier day" : null].filter(Boolean).join(", ") || "Quest"}</Text>
    </View>
  );
}

function DayPage({ view, day, onEvent, onNewEvent, onQuest }: { view: MonthView | null; day: string; onEvent: (event: PlanEvent) => void; onNewEvent: () => void; onQuest: (target: QuestTarget) => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const navigation = useHomeNavigation();
  const session = useStudySession();
  const { active } = useSessionState();
  const [sending, setSending] = useState(false);
  const data = view?.month.days.find((entry) => entry.date === day);
  const events = eventsOn(view?.events ?? [], day);
  const quests = data?.quests ?? [];
  const today = view?.today ?? dateKey(new Date());
  const floating = view?.month.floatingRestDays.includes(day) === true;
  const rest = data?.isRestDay === true || floating;
  const milestones = (view?.month.milestones ?? []).filter((item) => (item.date ?? item.targetDate) === day);
  const run = async (work: () => Promise<unknown>, done?: string) => {
    if (!backend || sending) return;
    setSending(true);
    try { await work(); if (done) notice(done); } catch (error) { notice(describeFailureText(error)); }
    setSending(false);
    refreshPlan(backend);
  };
  const study = (quest: DayQuest) => { session.setPlan({ title: quest.title, subject: null, subjectId: (quest as { subjectId?: number | null }).subjectId ?? null, questId: quest.id }); navigation.select("focus"); };
  return (
    <Plane level="raised" radius="lg" testID="plan-day-page" style={{ padding: space.lg, gap: space.md }}>
      <Stack gap="xs">
        <Text variant="subheading" role="heading" aria-level={2}>{dayTitle(day)}</Text>
        {rest ? <Text variant="small" tone="soft">{floating ? "A rest day you chose." : "A rest day."}</Text> : data ? <Meter value={Math.min(data.totalMinutes, data.dailyGoalMinutes)} max={data.dailyGoalMinutes} label={`${formatMinutes(data.totalMinutes)} of ${formatMinutes(data.dailyGoalMinutes)} studied`} /> : null}
      </Stack>
      {milestones.map((item) => <Text key={item.id} variant="small">{`Goal due: ${item.title}`}</Text>)}
      {events.map((event) => <View key={event.id} testID={`plan-event-${event.id}`}><ListRow title={event.title} detail={event.allDay ? "All day" : `${clock(event.startsAt!)}${event.endsAt ? ` to ${clock(event.endsAt)}` : ""}`} onPress={() => onEvent(event)} /></View>)}
      {quests.map((quest) => <DayQuestRow key={quest.id} quest={quest} date={day} today={today} sending={sending} onTick={() => backend && void run(() => backend.reads.completeQuest({ id: quest.id, plannedMinutes: quest.plannedMinutes ?? null, executionVersion: (quest as { executionVersion?: number }).executionVersion }), "Quest done.")} onOpen={() => onQuest({ quest, day })} onMove={() => backend && void run(() => backend.reads.plan.updateQuest(quest.id, { scheduledFor: today }), "Moved to today.")} onStudy={day === today && !questDone(quest) && !questFailed(quest) && !active ? () => study(quest) : undefined} />)}
      {!events.length && !quests.length ? <Text variant="small" tone="soft">Nothing here yet.</Text> : null}
      <AddField day={day} rest={rest} onAdded={() => undefined} onDetails={onNewEvent} />
      {rest || day < today ? null : <Button title="Make this a rest day" size="small" variant="ghost" testID="plan-rest-day" disabled={sending} onPress={() => backend && void run(() => backend.reads.plan.setFloatingRestDay(day, true), "This is now a rest day.")} />}
      {floating && day >= today ? <Button title="Study on this day after all" size="small" variant="ghost" testID="plan-unrest-day" disabled={sending} onPress={() => backend && void run(() => backend.reads.plan.setFloatingRestDay(day, false))} /> : null}
    </Plane>
  );
}

export function CalendarView() {
  const { space } = useTheme();
  const { size } = useWindowClass();
  const now = useMemo(() => new Date(), []);
  const [shown, setShown] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [span, setSpan] = useState<Span>(size === "compact" ? "agenda" : "month");
  const [selected, setSelected] = useState(dateKey(now));
  const [eventTarget, setEventTarget] = useState<EventTarget | null>(null);
  const [questTarget, setQuestTarget] = useState<QuestTarget | null>(null);
  const result = useMonth(shown.year, shown.month);
  const view = result?.data ?? null;
  const change = (delta: number) => {
    if (span === "week") { select(addDays(selected, 7 * delta)); return; }
    const next = new Date(shown.year, shown.month + delta, 1);
    setShown({ year: next.getFullYear(), month: next.getMonth() });
    setSelected(dateKey(next));
  };
  const select = (day: string) => {
    setSelected(day);
    const date = new Date(`${day}T12:00:00`);
    if (date.getMonth() !== shown.month || date.getFullYear() !== shown.year) setShown({ year: date.getFullYear(), month: date.getMonth() });
  };
  const weekDays = weekOf(selected);
  const title = span === "week"
    ? `${new Date(`${weekDays[0]}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "short" })} to ${new Date(`${weekDays[6]}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`
    : new Date(shown.year, shown.month, 1).toLocaleDateString([], { month: "long", year: "numeric" });
  const colourOf = useSubjectColour();
  const questsOn = (day: string) => view?.month.days.find((entry) => entry.date === day)?.quests ?? [];
  const main = (
    <Stack gap="md">
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" }}>
        <IconButton icon="chevronLeft" label={span === "week" ? "Previous week" : "Previous month"} testID="plan-prev" onPress={() => change(-1)} />
        <Text variant="subheading" testID="plan-month-title" style={{ minWidth: span === "week" ? 220 : 150, textAlign: "center" }}>{title}</Text>
        <IconButton icon="chevronRight" label={span === "week" ? "Next week" : "Next month"} testID="plan-next" onPress={() => change(1)} />
        <View style={{ flex: 1 }} />
        <Segmented<Span> label="Calendar span" value={span} options={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "agenda", label: "Agenda" }]} onChange={setSpan} />
      </View>
      {result?.live?.failure && !view ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}><Text variant="small" tone="soft" style={{ flex: 1 }}>{result.live.failure}</Text><Button title="Try again" size="small" onPress={result.live.retry} /></View> : null}
      {span === "month" ? <MonthGrid view={view} year={shown.year} month={shown.month} selected={selected} onSelect={select} /> : span === "week" ? <WeekGrid events={view?.events ?? []} quests={questsOn} colourOf={colourOf} selected={selected} today={view?.today ?? dateKey(now)} onSelect={select} onEvent={(event) => setEventTarget({ event, day: selected })} onNew={(day, time) => setEventTarget({ event: null, day, time })} /> : <Agenda view={view} from={selected} onSelect={select} onEvent={(event) => setEventTarget({ event, day: selected })} />}
    </Stack>
  );
  const page = <DayPage view={view} day={selected} onEvent={(event) => setEventTarget({ event, day: selected })} onNewEvent={() => setEventTarget({ event: null, day: selected })} onQuest={setQuestTarget} />;
  return (
    <>
      {size === "expanded" ? <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xl }}><View style={{ flex: 3, minWidth: 0 }}>{main}</View><View style={{ flex: 2, minWidth: 0 }}>{page}</View></View> : <Stack gap="xl">{main}{page}</Stack>}
      <EventSheet target={eventTarget} onClose={() => setEventTarget(null)} />
      <QuestSheet target={questTarget} onClose={() => setQuestTarget(null)} />
    </>
  );
}

