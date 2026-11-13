// The command bar: natural language with suggestion chips and a live interpretation chip that shows what will run before anything does. Common phrasings
// are understood on the device by the kernel's fast path; anything else goes to the planner. Questions are answered from the plan's facts. Below it,
// the activity line reports real stages with real counts while a workflow runs.
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Activity as Spinner, Badge, Button, Chip, Icon, Plane, Segmented, Select, Sheet, Stack, Text, TextField, useTheme } from "@sylf/design-system";
import { planning } from "@sylf/shared";
import type { StudioState } from "@sylf/backend";
import { addDays, dayLabel, ESTIMATE, isQuestion, sessionLabel } from "./format";
import type { Activity, Studio } from "./useStudio";

const SUGGESTIONS = ["I'm weak at integration", "Move chemistry to evenings this week", "I'm sick today", "Max 2 hours a day on weekdays", "No studying after 9pm", "Am I on track?"];

export function interpret(text: string, state: StudioState): { text: string; fast: boolean } | null {
  const trimmed = text.trim();
  if (trimmed.length < 3) return null;
  const topical = planning.parseTopicCommand(trimmed, state.model);
  if (topical) return { text: topical.interpretation, fast: true };
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

/** The planning stages of an exam, as a rail like the web planner's: each lights up when the server reports it, never on a timer. */
const RAIL: { stage: string; label: string }[] = [{ stage: "read", label: "Your week" }, { stage: "syllabus", label: "Syllabus" }, { stage: "path", label: "Study path" }, { stage: "fit", label: "Calendar" }, { stage: "check", label: "Checks" }];

function StageRail({ activity }: { activity: Activity }) {
  const { color, space } = useTheme();
  const seen = activity.stages.map((s) => s.stage);
  const reached = RAIL.reduce((n, step, i) => (seen.includes(step.stage) ? i : n), -1);
  const finished = !activity.running && !activity.error && seen.includes("check");
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }} testID="studio-stage-rail" aria-label={`Planning stage ${Math.max(1, reached + 1)} of ${RAIL.length}`}>
      {RAIL.map((step, i) => {
        const done = finished || i < reached;
        const current = !finished && i === reached;
        return (
          <View key={step.stage} style={{ flex: 1, alignItems: "center", gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "stretch" }}>
              <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? "transparent" : done || current ? color.accent.fill : color.line }} />
              <View style={{ width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: done ? color.accent.fill : current ? color.accent.wash : color.sunken, borderWidth: current ? 2 : 0, borderColor: color.accent.fill }}>
                {done ? <Icon name="check" size={10} color={color.accent.on} /> : null}
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: i === RAIL.length - 1 ? "transparent" : done ? color.accent.fill : color.line }} />
            </View>
            <Text variant="micro" tone={current ? "accent" : done ? "ink" : "faint"} numberOfLines={1} style={{ paddingHorizontal: space.xs / 2 }}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const SYLLABUS_SOURCE: Record<string, string> = { catalog: "From Sylf's checked syllabus list", model: "From the AI's knowledge of the course", student: "From your topic list", subject: "From your syllabus in Sylf" };

function ActivityLine({ activity, studio }: { activity: Activity; studio: Studio }) {
  const { color, space } = useTheme();
  const last = activity.stages[activity.stages.length - 1];
  const answer = activity.workflow === "question" || activity.workflow === "brief";
  const mapping = activity.stages.some((s) => s.stage === "syllabus" || s.stage === "path");
  return (
    <Plane level="plane" radius="md" pad="sm" testID="studio-activity" style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {activity.running ? <Spinner label="Planning" /> : activity.error ? <Icon name="warning" size={16} color={color.caution.ink} /> : <Icon name="check" size={16} color={color.positive.ink} />}
        <Text variant="small" style={{ flex: 1 }} aria-live="polite">{activity.error ?? (last?.text ?? (activity.running ? "Starting" : answer ? "Answered" : "Done"))}</Text>
        {activity.running ? <Button title="Stop" size="small" variant="quiet" onPress={studio.cancelRun} /> : <Button title="Close" size="small" variant="quiet" icon="close" onPress={studio.dismissActivity} />}
      </View>
      {mapping ? <StageRail activity={activity} /> : activity.stages.length > 1 ? <Text variant="micro" tone="faint">{activity.stages.slice(0, -1).map((s) => s.text).join("  ·  ")}</Text> : null}
      {activity.interpretation ? <Badge tone="accent" label={activity.interpretation} /> : null}
      {activity.units.length ? (
        <Stack gap="xs" testID="studio-activity-units">
          <Text variant="label" tone="soft">{`${activity.units.length} topic${activity.units.length === 1 ? "" : "s"}${activity.syllabus ? ` · ${SYLLABUS_SOURCE[activity.syllabus.source] ?? ""}` : ""}`}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>{activity.units.map((unit) => <Badge key={unit.key + unit.title} label={unit.title} />)}</View>
          {activity.syllabus ? <Text variant="micro" tone="faint" numberOfLines={2}>{activity.syllabus.name}</Text> : null}
        </Stack>
      ) : null}
      {activity.strategy.map((s, i) => <Text key={i} variant="small" tone="soft">{s}</Text>)}
      {activity.items.length && activity.running ? (
        <View style={{ gap: 2 }} testID="studio-activity-items">
          {activity.items.slice(-5).map((item) => <View key={item.key} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent.fill }} /><Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{item.title}</Text><Text variant="micro" tone="soft">{sessionLabel(item)}</Text></View>)}
          {activity.items.length > 5 ? <Text variant="micro" tone="faint">{`${activity.items.length} sessions so far`}</Text> : null}
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

/**
 * The composer, after the web planner's: what it is, what's in it, when. For an exam the planner finds the syllabus itself (Sylf's checked list, or
 * the AI's knowledge), or uses the topics typed here, one a line. Used inline when the Studio is empty and in the New goal sheet.
 */
export function GoalComposer({ state, studio, onDone, inline }: { state: StudioState; studio: Studio; onDone?: () => void; inline?: boolean }) {
  const { space } = useTheme();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<GoalTypeValue>("exam");
  const [due, setDue] = useState("");
  const [subject, setSubject] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [more, setMore] = useState(false);
  const today = state.snapshot.today;
  const dueValid = !due || (planning.isDateKey(due) && due >= today);
  const quick = useMemo(() => [7, 14, 21, 28].map((d) => addDays(today, d)), [today]);
  useEffect(() => { if (title.trim().length > 3) setType(planning.inferGoalType(title) as GoalTypeValue); }, [title]);
  const running = studio.activity?.running === true;
  const ready = title.trim().length >= 2 && dueValid && !running;
  const submit = () => {
    if (!ready) return;
    void studio.addGoal({ title: title.trim(), type, due: due || null, subjectId: subject === "none" ? null : Number(subject), notes: notes.trim() || undefined });
    setTitle(""); setDue(""); setNotes(""); onDone?.();
  };
  return (
    <Stack gap="md" testID={inline ? "studio-composer" : "studio-goal-sheet"}>
      <TextField label="What are you preparing for?" placeholder="CAIE A Level Maths Paper 1 midterm" value={title} onChangeText={setTitle} onSubmitEditing={submit} testID="studio-goal-title" />
      <TextField label="What's in it? (optional)" placeholder={"Topics, one a line, or what your teacher said it covers.\nLeave it empty and the planner finds the syllabus."} value={notes} onChangeText={setNotes} multiline testID="studio-goal-notes" />
      <Stack gap="xs">
        <Text variant="label" tone="soft">When is it?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
          {quick.map((d) => <Chip key={d} label={dayLabel(d)} selected={due === d} radio onPress={() => setDue(due === d ? "" : d)} />)}
        </View>
        <TextField label="Date (YYYY-MM-DD)" placeholder={addDays(today, 18)} value={due} onChangeText={setDue} error={dueValid ? undefined : "Choose a date from today on."} testID="studio-goal-due" />
      </Stack>
      {more ? (
        <Stack gap="md">
          <Segmented<GoalTypeValue> label="Kind" value={type} options={TYPES.map((t) => ({ value: t.value, label: t.label }))} onChange={setType} />
          {state.snapshot.subjects.length ? <Select label="Subject" value={subject} options={[{ value: "none", label: "No subject" }, ...state.snapshot.subjects.map((s) => ({ value: String(s.id), label: s.name }))]} onChange={setSubject} /> : null}
        </Stack>
      ) : null}
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}>
        <Button title={running ? "Planning…" : "Plan it"} variant="emphasis" icon="arrowRight" disabled={!ready} onPress={submit} testID="studio-goal-submit" />
        <Button title={more ? "Fewer options" : `${TYPES.find((t) => t.value === type)?.label ?? "Exam"}${subject !== "none" ? ` · ${state.snapshot.subjects.find((s) => String(s.id) === subject)?.name ?? ""}` : ""}`} icon={more ? "chevronUp" : "sliders"} variant="quiet" size="small" onPress={() => setMore(!more)} />
      </View>
      <Text variant="small" tone="soft">{type === "exam"
        ? "The planner maps every topic with its key points, then builds a plan: revise and practise each topic, mixed reviews, timed past papers and a light final day, fitted around your calendar. You review it before anything is added."
        : state.readiness.ai ? "The planner breaks this into sessions, then fits them around your calendar. You review everything before it's added." : "This starts from a study template that fits your calendar. You review everything before it's added."}</Text>
    </Stack>
  );
}

/** A new goal in a sheet. */
export function AddGoalSheet({ open, onClose, state, studio }: { open: boolean; onClose: () => void; state: StudioState; studio: Studio }) {
  return (
    <Sheet open={open} onClose={onClose} title="New plan">
      <GoalComposer state={state} studio={studio} onDone={onClose} />
    </Sheet>
  );
}

export { ESTIMATE };
