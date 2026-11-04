// The first day. Three short steps on one line: what you're studying, what a good day looks like, and a way to begin. Every step can be skipped, and
// skipping still tells the server this is done, so no client ever asks again. It replaces the Spaces rather than covering them, as signing in does.
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip, Disclosure, Plane, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import type { Backend } from "@sylf/backend";
import { describeFailureText } from "./failure";
import { useKeyboardLift } from "../useKeyboardLift";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SUGGESTED = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "History", "Computer Science", "Economics"];
const TARGETS = [60, 90, 120, 180];
const STEPS = ["Subjects", "Your day", "Begin"];
const timezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };

function Steps({ current }: { current: number }) {
  const { color, marker, space } = useTheme();
  return (
    <View accessible aria-label={`Step ${current + 1} of ${STEPS.length}, ${STEPS[current]}`} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      {STEPS.map((step, index) => (
        <View key={step} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ width: 8, height: 8, borderRadius: Math.min(marker.radius, 4), backgroundColor: index <= current ? color.accent.ink : color.lineStrong }} />
          {index < STEPS.length - 1 ? <View style={{ width: 24, height: 1, backgroundColor: color.lineStrong }} /> : null}
        </View>
      ))}
    </View>
  );
}

export function OnboardingSurface({ backend, onDone }: { backend: Backend; onDone: (next: "study" | "plan") => void }) {
  const { color, space } = useTheme();
  const insets = useSafeAreaInsets();
  const notice = useNotice();
  const lifted = useKeyboardLift();
  const [step, setStep] = useState(0);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [examBoard, setExamBoard] = useState("");
  const [level, setLevel] = useState("");
  const [goal, setGoal] = useState(120);
  const [rest, setRest] = useState<number[]>([0]);
  const [busy, setBusy] = useState(false);
  const offered = useMemo(() => [...new Set([...SUGGESTED, ...subjects])], [subjects]);

  const toggle = (name: string) => setSubjects((list) => (list.includes(name) ? list.filter((item) => item !== name) : [...list, name]));
  const addTyped = () => { const name = typed.trim(); if (name && !subjects.includes(name)) setSubjects([...subjects, name]); setTyped(""); };
  const finish = async (next: "study" | "plan", answered: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await backend.reads.completeOnboarding({ subjects: answered ? subjects.map((name) => ({ name, ...(examBoard.trim() ? { examBoard: examBoard.trim() } : {}), ...(level.trim() ? { level: level.trim() } : {}) })) : [], timezone: timezone() });
      if (answered) await backend.reads.saveSchedule({ dailyGoalMinutes: goal, restDays: rest });
      for (const tag of ["progress", "subjects", "today", "plan"]) backend.resources.invalidate(tag);
      onDone(next);
    } catch (error) { notice(describeFailureText(error)); setBusy(false); }
  };

  const body = step === 0 ? (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text variant="display" role="heading" aria-level={1}>What are you studying?</Text>
        <Text tone="soft">Sessions and quests are kept by subject, so you can see where your time goes.</Text>
      </Stack>
      <View testID="onboarding-subjects" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>{offered.map((name) => <Chip key={name} label={name} selected={subjects.includes(name)} onPress={() => toggle(name)} />)}</View>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}><TextField label="Add another" hideLabel placeholder="Add another subject" value={typed} onChangeText={setTyped} testID="onboarding-subject" onSubmitEditing={addTyped} returnKeyType="done" /></View>
        <Button title="Add" disabled={!typed.trim()} testID="onboarding-subject-add" onPress={addTyped} />
      </View>
      <Disclosure title="Exam board and level" detail="Optional">
        <Stack gap="sm">
          <TextField label="Exam board" placeholder="CAIE" value={examBoard} onChangeText={setExamBoard} autoCapitalize="characters" />
          <TextField label="Level" placeholder="A-Level" value={level} onChangeText={setLevel} />
        </Stack>
      </Disclosure>
    </Stack>
  ) : step === 1 ? (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text variant="display" role="heading" aria-level={1}>What's a good day?</Text>
        <Text tone="soft">Set what feels realistic. You can change this whenever you like.</Text>
      </Stack>
      <Stack gap="xs">
        <Text variant="caption" tone="soft">Daily target</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>{TARGETS.map((minutes) => <Chip key={minutes} label={minutes % 60 ? `${minutes} min` : `${minutes / 60} hr`} selected={goal === minutes} onPress={() => setGoal(minutes)} />)}</View>
      </Stack>
      <Stack gap="xs">
        <Text variant="caption" tone="soft">Rest days</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>{DAY_NAMES.map((name, day) => <Chip key={name} label={name} selected={rest.includes(day)} onPress={() => setRest(rest.includes(day) ? rest.filter((item) => item !== day) : [...rest, day])} />)}</View>
      </Stack>
    </Stack>
  ) : (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text variant="display" role="heading" aria-level={1}>You're ready.</Text>
        <Text tone="soft">Start with one short session, or shape your week first.</Text>
      </Stack>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button title={busy ? "Getting ready" : "Study for 25 minutes"} variant="emphasis" disabled={busy} testID="onboarding-study" onPress={() => void finish("study", true)} />
        <Button title="Plan my week" disabled={busy} testID="onboarding-plan" onPress={() => void finish("plan", true)} />
      </View>
    </Stack>
  );

  return (
    <ScrollView testID="onboarding" keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: color.ground }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.xl, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }}>
      <Animated.View style={lifted}><Plane level="raised" radius="xl" style={{ width: "100%", maxWidth: 620, alignSelf: "center", padding: space.xl, gap: space.xl }}>
        <Steps current={step} />
        {body}
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          {step > 0 ? <Button title="Back" variant="ghost" testID="onboarding-back" onPress={() => setStep(step - 1)} /> : null}
          <View style={{ flex: 1 }} />
          <Button title="Skip for now" variant="ghost" disabled={busy} testID="onboarding-skip" onPress={() => void finish("study", false)} />
          {step < STEPS.length - 1 ? <Button title="Continue" variant="emphasis" testID="onboarding-next" onPress={() => setStep(step + 1)} /> : null}
        </View>
      </Plane></Animated.View>
    </ScrollView>
  );
}
