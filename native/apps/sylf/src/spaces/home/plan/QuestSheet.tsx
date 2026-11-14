// One quest. A quest that belongs to a plan says so and stays as the plan made it, because the server guards those edits. Everything else is the student's.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, DateField, Select, Sheet, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import type { DayQuest, GoalDetail, Quest, Subject } from "@sylf/backend";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { useSubjects } from "../../../shell/live";
import { questDone, questFailed, questMinutes, validDay } from "./shared";
import { refreshPlan } from "./usePlan";

const DIFFICULTIES = [{ value: "EASY", label: "Easy" }, { value: "NORMAL", label: "Normal" }, { value: "HARD", label: "Hard" }, { value: "EXPERT", label: "Expert" }] as const;
type Difficulty = (typeof DIFFICULTIES)[number]["value"];
const NONE = "none";

export interface QuestTarget { quest: (Pick<DayQuest, "id" | "title" | "status" | "plannedMinutes" | "requiredMinutes"> & Partial<Pick<Quest, "subjectId">> & { difficulty?: string; plannerOwned?: boolean }) | null; day: string; goalId?: number | null; goals?: GoalDetail[] }

export function QuestSheet({ target, onClose }: { target: QuestTarget | null; onClose: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const subjects: Subject[] = useSubjects();
  const quest = target?.quest ?? null;
  const planned = quest?.plannerOwned === true || quest?.plannedMinutes != null;
  const closed = quest ? questDone(quest) || questFailed(quest) : false;
  const locked = planned || closed;
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [difficulty, setDifficulty] = useState<Difficulty>("NORMAL");
  const [subject, setSubject] = useState(NONE);
  const [goal, setGoal] = useState(NONE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    setTitle(target.quest?.title ?? ""); setDay(target.day); setMinutes(String(target.quest ? questMinutes(target.quest) ?? 30 : 30));
    setDifficulty((DIFFICULTIES.find((item) => item.value === target.quest?.difficulty)?.value ?? "NORMAL"));
    setSubject(target.quest?.subjectId ? String(target.quest.subjectId) : NONE); setGoal(target.goalId ? String(target.goalId) : NONE);
  }, [target]);

  const length = Number(minutes);
  const invalid = !title.trim() || !validDay(day) || !Number.isInteger(length) || length < 1;
  const save = async () => {
    if (!backend || invalid || busy) return;
    setBusy(true);
    try {
      const goalId = goal === NONE ? null : Number(goal);
      if (quest) await backend.reads.plan.updateQuest(quest.id, { title: title.trim(), requiredMinutes: length, scheduledFor: day, difficulty, goalId });
      else await backend.reads.plan.createQuest({ title: title.trim(), scheduledFor: day, targetMinutes: length, difficulty, subjectId: subject === NONE ? null : Number(subject), goalId });
      refreshPlan(backend); onClose();
    } catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  const remove = async () => {
    if (!backend || !quest || busy) return;
    setBusy(true);
    try { await backend.reads.plan.deleteQuest(quest.id); refreshPlan(backend); onClose(); notice("Quest deleted."); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };

  return (
    <Sheet open={target !== null} onClose={onClose} title={quest ? "Quest" : "New quest"}>
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          {planned ? <Text variant="small" tone="soft">This quest belongs to a plan, so it changes with the plan.</Text> : closed ? <Text variant="small" tone="soft">{questDone(quest!) ? "This quest is finished." : "This quest wasn't finished in time."}</Text> : null}
          <TextField label="Title" value={title} onChangeText={setTitle} testID="quest-title" editable={!locked} />
          <DateField label="Day" value={day} onChange={setDay} testID="quest-day" disabled={locked} />
          <TextField label="Minutes" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" testID="quest-minutes" editable={!locked} />
          {locked ? null : <Select<Difficulty> label="Difficulty" value={difficulty} options={[...DIFFICULTIES]} onChange={setDifficulty} />}
          {locked || quest ? null : <Select<string> label="Subject" value={subject} options={[{ value: NONE, label: "No subject" }, ...subjects.map((item) => ({ value: String(item.id), label: item.name }))]} onChange={setSubject} />}
          {locked || !target?.goals?.length ? null : <Select<string> label="Goal" value={goal} options={[{ value: NONE, label: "No goal" }, ...target.goals.map((item) => ({ value: String(item.id), label: item.title }))]} onChange={setGoal} />}
          {locked ? null : <Button title={busy ? "Saving" : quest ? "Save" : "Add quest"} variant="emphasis" disabled={invalid || busy} testID="quest-save" onPress={() => void save()} />}
          {quest && !planned ? <Button title="Delete quest" variant="critical" disabled={busy} testID="quest-delete" onPress={() => void remove()} /> : null}
        </Stack>
      </View>
    </Sheet>
  );
}
