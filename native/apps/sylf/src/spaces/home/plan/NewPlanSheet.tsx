// Step 1 of a plan: the details the student accepts. Saving is free, because nothing here asks a model for anything, and the sheet says so.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Sheet, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import type { BackendError } from "@sylf/backend";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { refreshPlan } from "./usePlan";
import { validDay } from "./shared";

const WEEK = ["S", "M", "T", "W", "T", "F", "S"];
const toMinute = (clock: string) => { const [hour, minute] = clock.split(":").map(Number); return (hour ?? 0) * 60 + (minute ?? 0); };
const validClock = (clock: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(clock);

export function NewPlanSheet({ open, onClose, onCreated, initialGoal = "" }: { open: boolean; onClose: () => void; onCreated: (planId: string) => void; initialGoal?: string }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");
  const [topics, setTopics] = useState("");
  const [notes, setNotes] = useState("");
  const [minutes, setMinutes] = useState("90");
  const [from, setFrom] = useState("16:00");
  const [to, setTo] = useState("20:00");
  const [rest, setRest] = useState<number[]>([0]);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => { if (open) { setTitle(""); setGoal(initialGoal); setDeadline(""); setTopics(""); setNotes(""); setKey(null); } }, [open, initialGoal]);

  const topicList = topics.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  const daily = Number(minutes);
  const invalid = !title.trim() || !goal.trim() || (deadline !== "" && !validDay(deadline)) || !Number.isInteger(daily) || daily < 15 || daily > 720 || !validClock(from) || !validClock(to) || toMinute(to) <= toMinute(from) || rest.length >= 7;

  const save = async () => {
    if (!backend || invalid || busy) return;
    setBusy(true);
    const planner = backend.reads.plan.planner;
    try {
      const capabilities = await backend.reads.planner(new AbortController().signal);
      const intent = planner.buildIntent({ title, goal, deadline, topics: topicList, timezone: capabilities.timezone, restDays: rest, dailyMinutes: daily, startMinute: toMinute(from), endMinute: toMinute(to) });
      // The same key goes with a retry after a lost answer, so the server finds the plan it already made instead of making a second.
      const sent = key ?? planner.newKey();
      setKey(sent);
      const made = await planner.create(sent, intent);
      if (notes.trim()) await planner.note(made.planId, planner.newKey(), notes, 0).catch(() => notice("The plan was saved, but the note was not. Add it again from the plan."));
      refreshPlan(backend); onCreated(made.planId);
    } catch (error) {
      const kind = (error as BackendError).kind;
      if (kind === "invalid" || kind === "conflict") setKey(null);
      notice(describeFailureText(error));
    }
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title="New plan">
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          <Text variant="small" tone="soft">Saving these details is free. Nothing is asked of the AI until you say so on the next page.</Text>
          <TextField label="Name" value={title} onChangeText={setTitle} testID="newplan-title" />
          <TextField label="What do you want to achieve?" value={goal} onChangeText={setGoal} multiline testID="newplan-goal" />
          <TextField label="Deadline" helper="Year, month, day. Leave empty for none." value={deadline} onChangeText={setDeadline} autoCapitalize="none" testID="newplan-deadline" />
          <TextField label="Topics" helper="One per line, or separated by commas." value={topics} onChangeText={setTopics} multiline testID="newplan-topics" />
          <TextField label="Minutes you can study on a study day" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" testID="newplan-minutes" />
          <Stack gap="xs">
            <TextField label="Earliest start" helper="24-hour clock" value={from} onChangeText={setFrom} autoCapitalize="none" testID="newplan-from" />
            <TextField label="Latest finish" value={to} onChangeText={setTo} autoCapitalize="none" testID="newplan-to" />
          </Stack>
          <Stack gap="xs">
            <Text variant="small" tone="soft">Rest days</Text>
            <View style={{ flexDirection: "row", gap: space.xs }}>
              {WEEK.map((letter, day) => <Button key={day} title={letter} size="small" variant={rest.includes(day) ? "emphasis" : "quiet"} aria-pressed={rest.includes(day)} testID={`newplan-rest-${day}`} onPress={() => setRest(rest.includes(day) ? rest.filter((item) => item !== day) : [...rest, day])} />)}
            </View>
          </Stack>
          <TextField label="Anything the planner should know (optional)" value={notes} onChangeText={setNotes} multiline testID="newplan-notes" />
          <Button title={busy ? "Saving" : "Save details"} variant="emphasis" disabled={invalid || busy} testID="newplan-save" onPress={() => void save()} />
        </Stack>
      </View>
    </Sheet>
  );
}
