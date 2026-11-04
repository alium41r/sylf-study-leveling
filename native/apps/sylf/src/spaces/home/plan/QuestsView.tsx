// Quests and goals. Each goal is a thread with its own progress, and what belongs to none sits on its own. Subjects and the shape of a study week live
// here too, because they are what a plan is made of. A goal with a plan behind it says so: the server guards those, and its refusal is shown as given.
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button, Callout, Checkbox, Chip, ListRow, Progress, Sheet, Stack, Text, TextField, useNotice, useTheme, useWindowClass } from "@sylf/design-system";
import type { GoalDetail, Quest, StudySchedule, Subject } from "@sylf/backend";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { useSubjects } from "../../../shell/live";
import { formatMinutes } from "../format";
import { QuestSheet, type QuestTarget } from "./QuestSheet";
import { dateKey, dayTitle, questDone, questFailed, questMinutes, subjectCode, validDay } from "./shared";
import { refreshPlan, useQuestsAndGoals } from "./usePlan";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PALETTE = ["#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

function QuestLine({ quest, today, onTick, onOpen, sending }: { quest: Quest; today: string; onTick: () => void; onOpen: () => void; sending: boolean }) {
  const minutes = questMinutes(quest);
  const day = quest.scheduledFor;
  const when = !day ? null : day === today ? "Today" : dayTitle(day);
  const open = !questDone(quest) && !questFailed(quest);
  return (
    <View testID={`plan-list-quest-${quest.id}`}>
      {open && day === today ? <Checkbox label={quest.title} value={false} disabled={sending} onChange={onTick} /> : null}
      <ListRow title={open && day === today ? "Details" : quest.title} detail={[when, quest.subject?.name, minutes ? formatMinutes(minutes) : null, questFailed(quest) ? "Not finished" : null].filter(Boolean).join(", ")} onPress={onOpen} />
    </View>
  );
}

function GoalSheet({ goal, open, onClose }: { goal: GoalDetail | null; open: boolean; onClose: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [due, setDue] = useState(goal?.targetDate?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(goal);
  if (seen !== goal) { setSeen(goal); setTitle(goal?.title ?? ""); setDue(goal?.targetDate?.slice(0, 10) ?? ""); }
  const invalid = !title.trim() || (due !== "" && !validDay(due));
  const act = async (work: () => Promise<unknown>, done?: string) => {
    if (!backend || busy) return;
    setBusy(true);
    try { await work(); refreshPlan(backend); onClose(); if (done) notice(done); } catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title={goal ? "Goal" : "New goal"}>
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          <TextField label="What are you working towards?" value={title} onChangeText={setTitle} testID="goal-title" />
          <TextField label="By when" helper="Optional. Year, month, day" value={due} onChangeText={setDue} autoCapitalize="none" testID="goal-due" />
          <Button title={busy ? "Saving" : goal ? "Save" : "Add goal"} variant="emphasis" disabled={invalid || busy} testID="goal-save" onPress={() => backend && void act(() => (goal ? backend.reads.plan.updateGoal(goal.id, { title: title.trim(), ...(due ? { targetDate: due } : {}) }) : backend.reads.plan.createGoal({ title: title.trim(), ...(due ? { targetDate: due } : {}) })))} />
          {goal && goal.status !== "COMPLETED" ? <Button title="Mark as finished" testID="goal-finish" disabled={busy} onPress={() => backend && void act(() => backend.reads.plan.updateGoal(goal.id, { status: "COMPLETED" }), "Goal finished.")} /> : null}
          {goal ? <Button title="Delete goal" variant="critical" testID="goal-delete" disabled={busy} onPress={() => backend && void act(() => backend.reads.plan.deleteGoal(goal.id), "Goal deleted.")} /> : null}
        </Stack>
      </View>
    </Sheet>
  );
}

function SubjectsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const subjects: Subject[] = useSubjects();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>) => {
    if (!backend || busy) return;
    setBusy(true);
    try { await work(); backend.resources.invalidate("subjects"); setName(""); } catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Subjects">
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          {subjects.map((subject) => (
            <View key={subject.id} testID={`subject-${subject.id}`} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: subject.color ?? PALETTE[0] }} />
              <Text style={{ flex: 1 }} numberOfLines={1}>{subject.name}</Text>
              <Button title="Remove" size="small" variant="ghost" disabled={busy} testID={`subject-remove-${subject.id}`} onPress={() => backend && void act(() => backend.reads.plan.archiveSubject(subject.id))} />
            </View>
          ))}
          {subjects.length ? <Text variant="caption" tone="soft">Removing a subject keeps its history.</Text> : null}
          <TextField label="New subject" value={name} onChangeText={setName} testID="subject-name" returnKeyType="done" />
          <Button title="Add subject" disabled={!name.trim() || busy} testID="subject-add" onPress={() => backend && void act(() => backend.reads.plan.createSubject({ name: name.trim(), code: subjectCode(name, subjects.map((item) => item.code)), color: PALETTE[subjects.length % PALETTE.length] }))} />
        </Stack>
      </View>
    </Sheet>
  );
}

function WeekSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const resource = useMemo(() => backend?.resources.resource({ key: "study-schedule", tags: ["plan"], ttlMs: 60_000, load: (signal) => backend.reads.schedule(signal) }) ?? null, [backend]);
  const schedule: StudySchedule | null = useOptionalResource(resource)?.data ?? null;
  const [goal, setGoal] = useState<string | null>(null);
  const [rest, setRest] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const shownGoal = goal ?? String(schedule?.dailyGoalMinutes ?? "");
  const shownRest = rest ?? schedule?.restDays ?? [];
  const minutes = Number(shownGoal);
  const invalid = !Number.isInteger(minutes) || minutes < 10 || minutes > 1440 || shownRest.length > 6;
  const save = async () => {
    if (!backend || invalid || busy) return;
    setBusy(true);
    try { await backend.reads.saveSchedule({ dailyGoalMinutes: minutes, restDays: shownRest }); refreshPlan(backend); setGoal(null); setRest(null); onClose(); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Your study week">
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          <TextField label="Daily target, in minutes" value={shownGoal} onChangeText={setGoal} keyboardType="number-pad" testID="week-goal" error={shownGoal && invalid ? "Between 10 and 1,440 minutes." : undefined} />
          <Stack gap="xs">
            <Text variant="caption" tone="soft">Rest days</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {DAY_NAMES.map((name, day) => <Chip key={name} label={name} selected={shownRest.includes(day)} onPress={() => setRest(shownRest.includes(day) ? shownRest.filter((item) => item !== day) : [...shownRest, day])} />)}
            </View>
            <Text variant="caption" tone="soft">Quests can't land on a rest day.</Text>
          </Stack>
          <Button title={busy ? "Saving" : "Save"} variant="emphasis" disabled={invalid || busy || !schedule} testID="week-save" onPress={() => void save()} />
        </Stack>
      </View>
    </Sheet>
  );
}

export function QuestsView() {
  const { space } = useTheme();
  const { size } = useWindowClass();
  const backend = useLiveBackend();
  const notice = useNotice();
  const result = useQuestsAndGoals();
  const [questTarget, setQuestTarget] = useState<QuestTarget | null>(null);
  const [goalSheet, setGoalSheet] = useState<{ goal: GoalDetail | null } | null>(null);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const today = useMemo(() => dateKey(new Date()), []);
  const data = result?.data;
  const goals = useMemo(() => (data?.goals ?? []).filter((goal) => goal.status !== "COMPLETED"), [data]);
  const quests = useMemo(() => [...(data?.quests ?? [])].sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "")), [data]);
  const open = (quest: Quest) => setQuestTarget({ quest: { ...quest, plannedMinutes: quest.plannedMinutes ?? null, requiredMinutes: quest.requiredMinutes ?? null }, day: quest.scheduledFor ?? today, goalId: quest.goal?.id, goals });
  const tick = async (quest: Quest) => {
    if (!backend || sending) return;
    setSending(true);
    try { await backend.reads.completeQuest(quest); notice("Quest done."); } catch (error) { notice(describeFailureText(error)); }
    setSending(false);
    refreshPlan(backend);
  };
  const line = (quest: Quest) => <QuestLine key={quest.id} quest={quest} today={today} sending={sending} onTick={() => void tick(quest)} onOpen={() => open(quest)} />;
  const active = quests.filter((quest) => !questDone(quest) && !questFailed(quest));
  const loose = active.filter((quest) => !quest.goal);
  const actions = (
    <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
      <Button title="New quest" variant="emphasis" icon="plus" testID="plan-new-quest" onPress={() => setQuestTarget({ quest: null, day: today, goals })} />
      <Button title="New goal" icon="plus" testID="plan-new-goal" onPress={() => setGoalSheet({ goal: null })} />
      <Button title="Subjects" variant="ghost" testID="plan-subjects" onPress={() => setSubjectsOpen(true)} />
      <Button title="Your study week" variant="ghost" testID="plan-week-settings" onPress={() => setWeekOpen(true)} />
    </View>
  );
  return (
    <Stack gap="xl">
      {actions}
      {result?.live?.failure && !data ? <Callout tone="caution" title="This didn't load" message={result.live.failure} /> : null}
      <View style={size === "expanded" ? { flexDirection: "row", gap: space.air, alignItems: "flex-start" } : { gap: space.xl }}>
        <Stack gap="xl" flex={size === "expanded" ? 1 : undefined}>
          <Text variant="subheading" role="heading" aria-level={2}>Goals</Text>
          {goals.length ? goals.map((goal) => {
            const owned = active.filter((quest) => quest.goal?.id === goal.id);
            const total = goal.quests?.length ?? 0;
            const finished = goal.quests?.filter((quest) => quest.status === "COMPLETED").length ?? 0;
            return (
              <Stack key={goal.id} gap="sm" testID={`plan-goal-${goal.id}`}>
                <ListRow title={goal.title} detail={[goal.targetDate ? `By ${dayTitle(goal.targetDate.slice(0, 10))}` : null, total ? `${finished} of ${total} quests done` : "No quests yet"].filter(Boolean).join(". ")} onPress={() => setGoalSheet({ goal })} />
                {total ? <Progress value={finished / total} label={`${goal.title} progress`} /> : null}
                {owned.map(line)}
              </Stack>
            );
          }) : <Text tone="soft">A goal is something bigger than one sitting, like an exam or a project.</Text>}
        </Stack>
        <Stack gap="md" flex={size === "expanded" ? 1 : undefined}>
          <Text variant="subheading" role="heading" aria-level={2}>On their own</Text>
          {loose.length ? loose.map(line) : <Text tone="soft">{data ? "No open quests outside a goal." : ""}</Text>}
        </Stack>
      </View>
      <QuestSheet target={questTarget} onClose={() => setQuestTarget(null)} />
      <GoalSheet goal={goalSheet?.goal ?? null} open={goalSheet !== null} onClose={() => setGoalSheet(null)} />
      <SubjectsSheet open={subjectsOpen} onClose={() => setSubjectsOpen(false)} />
      <WeekSheet open={weekOpen} onClose={() => setWeekOpen(false)} />
    </Stack>
  );
}
