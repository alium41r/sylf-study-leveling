// The command bar: natural language with suggestion chips and a live interpretation chip that shows what will run before anything does. Common phrasings
// are understood on the device by the kernel's fast path; anything else goes to the planner. Questions are answered from the plan's facts. Below it,
// the activity line reports real stages with real counts while a workflow runs.
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Activity as Spinner, Badge, Button, Chip, Plane, Segmented, Select, Sheet, Stack, Text, TextField, useTheme } from "@sylf/design-system";
import { planning } from "@sylf/shared";
import type { StudioState } from "@sylf/backend";
import { addDays, dayLabel, ESTIMATE, isQuestion, methodLabel } from "./format";
import type { Activity, Studio } from "./useStudio";

const SUGGESTIONS = ["Move chemistry to evenings this week", "I'm sick today", "Max 2 hours a day on weekdays", "No studying after 9pm", "Am I on track?"];

export function interpret(text: string, state: StudioState): { text: string; fast: boolean } | null {
  const trimmed = text.trim();
  if (trimmed.length < 3) return null;
  if (isQuestion(trimmed)) return { text: "Question · answered from your plan", fast: false };
  const parsed = planning.parseCommand(trimmed, state.snapshot, state.model, { subjectRef: (id) => `S${id}`, goalRef: (key) => key });
  if (parsed) return { text: parsed.interpretation, fast: parsed.confident && !parsed.decompose.length };
  return { text: state.readiness.ai ? "Ask the planner" : "Try a phrasing like the chips below", fast: false };
}

export function CommandBar({ state, studio, onAddGoal, compact }: { state: StudioState; studio: Studio; onAddGoal: () => void; compact?: boolean }) {
  const { space } = useTheme();
  const [text, setText] = useState("");
  const [chip, setChip] = useState<{ text: string; fast: boolean } | null>(null);
  // The interpretation follows a short typing pause, as the blueprint's speculation rule asks.
  useEffect(() => { const timer = setTimeout(() => setChip(interpret(text, state)), 180); return () => clearTimeout(timer); }, [text, state]);
  const running = studio.activity?.running === true;
  const send = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 2 || running) return;
    if (isQuestion(trimmed)) void studio.ask(trimmed);
    else void studio.command(trimmed);
    setText("");
  };
  return (
    <Stack gap="sm" testID="studio-command">
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
        <View style={{ flex: 1 }}>
          <TextField label="Tell the planner" hideLabel placeholder="“Chem midterm on 28 Nov”, “move essay work off Wednesday”…" value={text} onChangeText={setText} onSubmitEditing={() => send(text)} returnKeyType="send" icon="sylvie" testID="studio-command-input" />
        </View>
        <Button title={compact ? "" : "Plan"} icon="arrowRight" variant="emphasis" disabled={text.trim().length < 2 || running} onPress={() => send(text)} testID="studio-command-send" />
        {!compact ? <Button title="New goal" icon="plus" variant="solid" onPress={onAddGoal} testID="studio-add-goal" /> : null}
      </View>
      {chip && text.trim() ? <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }} testID="studio-interpretation"><Badge tone={chip.fast ? "accent" : "neutral"} label={chip.text} />{chip.fast ? <Text variant="micro" tone="faint">instant, no AI needed</Text> : null}</View> : null}
      {!text.trim() && !running ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {SUGGESTIONS.map((s) => <Chip key={s} label={s} onPress={() => setText(s)} />)}
        </View>
      ) : null}
      {studio.activity ? <ActivityLine activity={studio.activity} studio={studio} /> : null}
    </Stack>
  );
}

function ActivityLine({ activity, studio }: { activity: Activity; studio: Studio }) {
  const { color, space } = useTheme();
  const last = activity.stages[activity.stages.length - 1];
  const answer = activity.workflow === "question" || activity.workflow === "brief";
  return (
    <Plane level="plane" radius="md" pad="sm" testID="studio-activity" style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {activity.running ? <Spinner label="Planning" /> : null}
        <Text variant="small" style={{ flex: 1 }} aria-live="polite">{activity.error ?? (last?.text ?? (activity.running ? "Starting" : answer ? "Answered" : "Done"))}</Text>
        {activity.running ? <Button title="Stop" size="small" variant="quiet" onPress={studio.cancelRun} /> : <Button title="Close" size="small" variant="quiet" icon="close" onPress={studio.dismissActivity} />}
      </View>
      {activity.stages.length > 1 ? <Text variant="micro" tone="faint">{activity.stages.slice(0, -1).map((s) => s.text).join("  ·  ")}</Text> : null}
      {activity.interpretation ? <Badge tone="accent" label={activity.interpretation} /> : null}
      {activity.strategy.map((s, i) => <Text key={i} variant="small" tone="soft">{s}</Text>)}
      {activity.items.length && activity.running ? (
        <View style={{ gap: 2 }} testID="studio-activity-items">
          {activity.items.slice(-6).map((item) => <View key={item.key} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent.fill }} /><Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{item.title}</Text><Text variant="micro" tone="soft">{methodLabel(item.method)}</Text></View>)}
          {activity.items.length > 6 ? <Text variant="micro" tone="faint">{`+${activity.items.length - 6} more`}</Text> : null}
        </View>
      ) : null}
      {activity.preview && activity.running ? <Text variant="micro" tone="soft">{`Fitting as it arrives: ${activity.preview.summary}`}</Text> : null}
      {activity.notices.map((n, i) => <Text key={i} variant="caption" tone="caution">{n}</Text>)}
      {activity.text ? <Text testID="studio-answer">{activity.text}</Text> : null}
    </Plane>
  );
}

const TYPES = [{ value: "exam", label: "Exam" }, { value: "essay", label: "Essay" }, { value: "problem_set", label: "Problems" }, { value: "project", label: "Project" }, { value: "skill", label: "Skill" }, { value: "general", label: "Other" }] as const;
type GoalTypeValue = (typeof TYPES)[number]["value"];

/** A new goal: name, kind, deadline and subject; pasted syllabus text or notes help the breakdown. */
export function AddGoalSheet({ open, onClose, state, studio }: { open: boolean; onClose: () => void; state: StudioState; studio: Studio }) {
  const { space } = useTheme();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<GoalTypeValue>("exam");
  const [due, setDue] = useState("");
  const [subject, setSubject] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const today = state.snapshot.today;
  const dueValid = !due || (planning.isDateKey(due) && due >= today);
  const quick = useMemo(() => [7, 14, 21, 28].map((d) => addDays(today, d)), [today]);
  useEffect(() => { if (title.trim().length > 3) setType(planning.inferGoalType(title) as GoalTypeValue); }, [title]);
  const submit = () => {
    void studio.addGoal({ title: title.trim(), type, due: due || null, subjectId: subject === "none" ? null : Number(subject), notes: notes.trim() || undefined });
    setTitle(""); setDue(""); setNotes(""); onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="New goal" footer={<Button title="Plan it" variant="emphasis" icon="arrowRight" disabled={title.trim().length < 2 || !dueValid} onPress={submit} testID="studio-goal-submit" />}>
      <Stack gap="md" testID="studio-goal-sheet">
        <TextField label="What are you preparing for?" placeholder="Organic chemistry midterm" value={title} onChangeText={setTitle} testID="studio-goal-title" />
        <Segmented<GoalTypeValue> label="Kind" value={type} options={TYPES.map((t) => ({ value: t.value, label: t.label }))} onChange={setType} />
        <TextField label="Deadline (YYYY-MM-DD)" placeholder={addDays(today, 14)} value={due} onChangeText={setDue} error={dueValid ? undefined : "Choose a date from today on."} testID="studio-goal-due" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>{quick.map((d) => <Chip key={d} label={dayLabel(d)} selected={due === d} radio onPress={() => setDue(d)} />)}</View>
        {state.snapshot.subjects.length ? <Select label="Subject" value={subject} options={[{ value: "none", label: "No subject" }, ...state.snapshot.subjects.map((s) => ({ value: String(s.id), label: s.name }))]} onChange={setSubject} /> : null}
        <TextField label="Anything the planner should know (optional)" placeholder="Paste the syllabus topics, chapters or what worries you." value={notes} onChangeText={setNotes} multiline testID="studio-goal-notes" />
        <Text variant="small" tone="soft">{state.readiness.ai ? "The planner breaks this into sessions with study methods, then fits them around your calendar. You review everything before it's added." : "This starts from a study template that fits your calendar. You review everything before it's added."}</Text>
      </Stack>
    </Sheet>
  );
}

export { ESTIMATE };
