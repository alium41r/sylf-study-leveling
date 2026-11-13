// The command bar: natural language with suggestion chips and a live interpretation chip that shows what will run before anything does. Common phrasings
// are understood on the device by the kernel's fast path; anything else goes to the planner. Questions are answered from the plan's facts. Below it,
// the activity line reports real stages with real counts while a workflow runs.
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Activity as Spinner, Badge, Button, Chip, Icon, IconButton, Plane, Select, Sheet, Stack, Text, TextField, useTheme } from "@sylf/design-system";
import { planning } from "@sylf/shared";
import type { StudioState } from "@sylf/backend";
import { addDays, dayLabel, ESTIMATE, isQuestion, PRESET_WORDS, sessionLabel } from "./format";
import type { Activity, Studio } from "./useStudio";

const SUGGESTIONS = ["Max 2 hours a day on weekdays", "I'm sick today", "Am I on track?"];

/** Three short suggestions; the first names one of the student's own topics when a plan has them. */
function suggestions(state: StudioState): string[] {
  const unit = state.model.goals.find((g) => g.status === "active" && g.syllabus?.units.length)?.syllabus?.units.find((u) => u.included && u.confidence !== "weak");
  return unit ? [`I'm weak at ${unit.title.toLowerCase()}`, ...SUGGESTIONS.slice(0, 2)] : SUGGESTIONS;
}

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

export function CommandBar({ state, studio, onAddGoal, onOpenSettings, compact }: { state: StudioState; studio: Studio; onAddGoal: () => void; onOpenSettings?: () => void; compact?: boolean }) {
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
          <TextField label="Tell the planner" hideLabel placeholder="Tell the planner…" value={text} onChangeText={setText} onSubmitEditing={() => send(text)} returnKeyType="send" icon="sylvie" testID="studio-command-input" />
        </View>
        <Button title={compact ? "" : "Plan"} icon="arrowRight" variant="emphasis" disabled={text.trim().length < 2 || running} onPress={() => send(text)} testID="studio-command-send" />
        {!compact ? <Button title="New plan" icon="plus" variant="solid" onPress={onAddGoal} testID="studio-add-goal" /> : null}
        {onOpenSettings ? <IconButton icon="sliders" label="Planning settings" onPress={onOpenSettings} testID="studio-settings-open" /> : null}
      </View>
      {chip && text.trim() ? <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }} testID="studio-interpretation"><Badge tone={chip.fast ? "accent" : "neutral"} label={chip.text} />{chip.fast ? <Text variant="micro" tone="faint">instant, no AI needed</Text> : null}</View> : null}
      {!text.trim() && !running ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {suggestions(state).map((s) => <Chip key={s} label={s} onPress={() => setText(s)} />)}
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

type PresetChoice = planning.PlanPreset | "auto";
const PRESET_ORDER: PresetChoice[] = ["auto", "exam", "course", "mastery", "skill", "assignment", "reading"];
type Field = "hours" | "days" | "session" | "start" | "topics" | "level" | "weak" | "target" | "notes" | "subject";
const FIELD_LABEL: Record<Field, string> = { hours: "Hours a day", days: "Days a week", session: "Session length", start: "Start date", topics: "Topics", level: "Board or level", weak: "Weak spots", target: "Target", notes: "Notes", subject: "Subject" };
/** The prompts worth offering for each kind of plan, most useful first. */
const FIELDS: Record<PresetChoice, Field[]> = {
  auto: ["hours", "topics", "level", "weak", "target", "notes"],
  exam: ["hours", "topics", "level", "weak", "target", "notes"],
  course: ["hours", "start", "topics", "level", "target", "notes"],
  mastery: ["hours", "topics", "weak", "notes"],
  skill: ["days", "session", "level", "target", "notes"],
  assignment: ["hours", "notes"],
  reading: ["hours", "topics", "notes"],
};
const PLACEHOLDER: Record<PresetChoice, string> = {
  auto: "An exam, a course, a skill, a book…", exam: "CAIE A Level Maths Paper 1 midterm", course: "Thermodynamics (MECH 2210), whole module", mastery: "Integration by parts",
  skill: "Conversational Spanish", assignment: "History essay: causes of WW1, 2,000 words", reading: "Crime and Punishment",
};
const FIELD_HINT: Partial<Record<Field, Partial<Record<PresetChoice, string>> & { default: string }>> = {
  topics: { default: "One a line", reading: "Chapters, one a line", mastery: "Subtopics, one a line" },
  level: { default: "CAIE A Level, CBSE Class 12, MIT 6.006…", skill: "Your level now: beginner, some basics…" },
  weak: { default: "Integration, vectors…" },
  target: { default: "A*, 1400+, 70%…", skill: "Hold a 10-minute conversation" },
  notes: { default: "Anything else", assignment: "The brief: length, requirements" },
};

/** Calendar dates as short relative chips: two weeks, a month, three months, six months. */
const DATE_CHIPS = [{ days: 14, label: "2 weeks" }, { days: 30, label: "1 month" }, { days: 91, label: "3 months" }, { days: 182, label: "6 months" }];

/**
 * The composer, after the web planner's: pick the kind of plan (or Auto), say what it is and when, and add only the details that help. Each prompt
 * opens one small field. Used inline when the Studio is empty and in the New plan sheet.
 */
export function GoalComposer({ state, studio, onDone, inline }: { state: StudioState; studio: Studio; onDone?: () => void; inline?: boolean }) {
  const { space } = useTheme();
  const [preset, setPreset] = useState<PresetChoice>("auto");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [open, setOpen] = useState<Field[]>([]);
  const [values, setValues] = useState<Partial<Record<Field, string>>>({});
  const today = state.snapshot.today;
  const dueValid = !due || (planning.isDateKey(due) && due >= today);
  const startValid = !values.start || (planning.isDateKey(values.start) && values.start >= today);
  const running = studio.activity?.running === true;
  const ready = title.trim().length >= 2 && dueValid && startValid && !running;
  const fields = [...FIELDS[preset], ...(state.snapshot.subjects.length ? ["subject" as Field] : [])];
  const set = (field: Field, value: string) => setValues((v) => ({ ...v, [field]: value }));
  const toggle = (field: Field) => setOpen((o) => (o.includes(field) ? o.filter((f) => f !== field) : [...o, field]));
  const num = (field: Field) => { const v = Number(values[field]); return open.includes(field) && Number.isFinite(v) && v > 0 ? v : null; };
  const text = (field: Field) => (open.includes(field) ? values[field]?.trim() || null : null);
  const submit = () => {
    if (!ready) return;
    void studio.addGoal({
      title: title.trim(), preset, due: due || null, subjectId: text("subject") && text("subject") !== "none" ? Number(values.subject) : null,
      minutesPerDay: num("hours") ? Math.round(num("hours")! * 60) : null, daysPerWeek: num("days"), sessionMinutes: num("session"), start: text("start"),
      level: text("level"), weak: text("weak"), target: text("target"), topics: text("topics"), notes: text("notes") ?? undefined,
    });
    setTitle(""); setDue(""); setOpen([]); setValues({}); onDone?.();
  };
  const hint = (field: Field) => FIELD_HINT[field]?.[preset] ?? FIELD_HINT[field]?.default ?? "";
  return (
    <Stack gap="md" testID={inline ? "studio-composer" : "studio-goal-sheet"}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }} role="radiogroup" aria-label="Kind of plan">
        {PRESET_ORDER.map((p) => <Chip key={p} label={PRESET_WORDS[p].label} icon={PRESET_WORDS[p].icon as never} radio selected={preset === p} onPress={() => { setPreset(p); setOpen((o) => o.filter((f) => FIELDS[p].includes(f) || f === "subject")); }} />)}
      </View>
      <TextField label="What are you planning?" hideLabel placeholder={PLACEHOLDER[preset]} value={title} onChangeText={setTitle} onSubmitEditing={submit} testID="studio-goal-title" />
      <Stack gap="xs">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
          <Text variant="label" tone="soft">{`${PRESET_WORDS[preset].due}${preset === "skill" || preset === "course" ? " (optional)" : ""}`}</Text>
          {DATE_CHIPS.map((c) => { const d = addDays(today, c.days); return <Chip key={c.days} label={c.label} radio selected={due === d} onPress={() => setDue(due === d ? "" : d)} />; })}
        </View>
        <TextField label={PRESET_WORDS[preset].due} hideLabel placeholder="YYYY-MM-DD" value={due} onChangeText={setDue} error={dueValid ? undefined : "Choose a date from today on."} testID="studio-goal-due" />
        {due && dueValid ? <Text variant="micro" tone="soft">{`${dayLabel(due)} · ${planning.diffDays(due, today)} days`}</Text> : null}
      </Stack>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }} testID="studio-composer-prompts">
        {fields.filter((f) => !open.includes(f)).map((f) => <Chip key={f} label={FIELD_LABEL[f]} icon="plus" onPress={() => toggle(f)} />)}
      </View>
      {open.map((field) => (
        <View key={field} style={{ flexDirection: "row", gap: space.xs, alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {field === "hours" ? (
              <ChoiceRow label={FIELD_LABEL.hours} value={values.hours} options={[["0.5", "30 min"], ["1", "1 h"], ["1.5", "1.5 h"], ["2", "2 h"], ["3", "3 h"], ["4", "4 h"]]} onChange={(v) => set("hours", v)} />
            ) : field === "days" ? (
              <ChoiceRow label={FIELD_LABEL.days} value={values.days} options={["2", "3", "4", "5", "6", "7"].map((d) => [d, d])} onChange={(v) => set("days", v)} />
            ) : field === "session" ? (
              <ChoiceRow label={FIELD_LABEL.session} value={values.session} options={["15", "20", "30", "45", "60"].map((m) => [m, `${m} min`])} onChange={(v) => set("session", v)} />
            ) : field === "subject" ? (
              <Select label={FIELD_LABEL.subject} value={values.subject ?? "none"} options={[{ value: "none", label: "No subject" }, ...state.snapshot.subjects.map((x) => ({ value: String(x.id), label: x.name }))]} onChange={(v) => set("subject", v)} />
            ) : (
              <TextField label={field === "topics" && preset === "reading" ? "Chapters" : field === "level" && preset === "skill" ? "Your level" : field === "target" && preset === "skill" ? "Goal" : FIELD_LABEL[field]} placeholder={field === "start" ? "YYYY-MM-DD" : hint(field)} value={values[field] ?? ""} onChangeText={(v) => set(field, v)} multiline={field === "topics" || field === "notes"} error={field === "start" && !startValid ? "Choose a date from today on." : undefined} testID={`studio-field-${field}`} />
            )}
          </View>
          <IconButton icon="close" label={`Remove ${FIELD_LABEL[field]}`} onPress={() => toggle(field)} />
        </View>
      ))}
      <View style={{ flexDirection: "row" }}>
        <Button title={running ? "Planning…" : "Plan it"} variant="emphasis" icon="arrowRight" disabled={!ready} onPress={submit} testID="studio-goal-submit" />
      </View>
    </Stack>
  );
}

function ChoiceRow({ label, value, options, onChange }: { label: string; value: string | undefined; options: string[][]; onChange: (value: string) => void }) {
  const { space } = useTheme();
  return (
    <Stack gap="xs">
      <Text variant="label" tone="soft">{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }} role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => <Chip key={v} label={l} radio selected={value === v} onPress={() => onChange(v)} />)}
      </View>
    </Stack>
  );
}

/** A new plan in a sheet. */
export function AddGoalSheet({ open, onClose, state, studio }: { open: boolean; onClose: () => void; state: StudioState; studio: Studio }) {
  return (
    <Sheet open={open} onClose={onClose} title="New plan">
      <SheetScroll><GoalComposer state={state} studio={studio} onDone={onClose} /></SheetScroll>
    </Sheet>
  );
}

/** The padded, scrolling body every sheet in Sylf uses, so long content wraps and scrolls inside the sheet instead of running past its edge. */
export function SheetScroll({ children }: { children: React.ReactNode }) {
  const { space } = useTheme();
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, paddingTop: space.sm }} style={{ flexGrow: 0 }}>{children}</ScrollView>;
}

export { ESTIMATE };
