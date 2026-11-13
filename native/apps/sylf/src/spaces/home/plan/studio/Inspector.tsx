// The inspector: everything about one session. Why it is here (the solver's own trace, never the model's recollection), its first step, the estimate
// and what calibration learned, and the actions: Start opens a focus session with its quest, Move works from a keyboard or screen reader with the same
// device reflow as a drag, Pin keeps it put, Skip hands its time back to the plan.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Chip, IconButton, Plane, Stack, Text, useTheme } from "@sylf/design-system";
import type { StudioState } from "@sylf/backend";
import type { planning } from "@sylf/shared";
import { useHomeNavigation, useStudySession } from "../studioShell";
import { ESTIMATE, blockMinutes, clockLabel, dayLabel, formatMinutes, itemOf, sessionLabel, subjectColour } from "./format";
import type { Studio } from "./useStudio";

export function Inspector({ state, studio, blockId, onClose }: { state: StudioState; studio: Studio; blockId: string; onClose: () => void }) {
  const { space } = useTheme();
  const session = useStudySession();
  const navigation = useHomeNavigation();
  const shown = studio.view?.blocks ?? state.plan.blocks;
  const block = shown.find((b) => b.id === blockId) ?? state.blocks.find((b) => b.id === blockId) ?? null;
  const [moving, setMoving] = useState<{ date: string; start: number } | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  useEffect(() => { setMoving(null); setPhrase(null); }, [blockId]);
  if (!block) return null;
  const item = itemOf(state.model, block.item) ?? itemOf(state.proposal?.model ?? state.model, block.item);
  const goal = item?.goal ? (state.proposal?.model ?? state.model).goals.find((g) => g.key === item.goal) : null;
  const reasons = (state.proposal?.result.reasons[block.id] ?? state.plan.reasons[block.id] ?? []) as planning.Reason[];
  const subject = state.snapshot.subjects.find((s) => s.id === item?.subject);
  const committed = state.blocks.some((b) => b.id === block.id && b.state === "committed");
  const future = block.date > state.snapshot.today || (block.date === state.snapshot.today && block.end > state.snapshot.nowMinute);
  const quest = item?.questId ?? block.questId;
  const length = blockMinutes(block);
  const dates = state.snapshot.days.filter((d) => !d.rest).map((d) => d.date);
  const move = (date: string, start: number) => { setMoving({ date, start }); studio.previewMove(block.id, date, start); };
  const start = () => {
    session.setPlan({ title: item?.title ?? "Study session", subject: subject?.name ?? null, subjectId: item?.subject ?? null, questId: quest ?? null });
    navigation.select("focus");
  };
  return (
    <Plane level="raised" radius="lg" pad="md" testID="studio-inspector" style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
        <View style={{ width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: subjectColour(state.snapshot, item?.subject) }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading" role="heading" aria-level={3}>{item?.title ?? "Study session"}</Text>
          <Text variant="small" tone="soft">{`${dayLabel(block.date)} · ${clockLabel(block.start)}–${clockLabel(block.end)} · ${formatMinutes(length)}${subject ? ` · ${subject.name}` : ""}`}</Text>
          {goal ? <Text variant="caption" tone="soft">{`For ${goal.title}`}</Text> : null}
        </View>
        <IconButton icon="close" label="Close details" onPress={onClose} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {block.pinned ? <Badge label="Pinned" /> : null}
        {block.state === "done" ? <Badge tone="positive" label="Done" /> : block.state === "missed" ? <Badge tone="caution" label="Missed" /> : block.state === "skipped" ? <Badge label="Skipped" /> : block.state === "proposed" ? <Badge tone="accent" label="Proposed" /> : null}
        {item ? <Badge label={sessionLabel(item)} /> : null}
        {item ? <Badge label={`Estimate ${ESTIMATE(item, state.snapshot)}`} /> : null}
      </View>
      {item?.details ? (
        <Stack gap="sm" testID="studio-details">
          <Text variant="subheading">{item.details.aim}</Text>
          {item.details.points.length ? (
            <Stack gap="xs">
              <Text variant="label" tone="soft">{item.details.role === "revise" ? "Key points" : item.details.role === "practise" ? "Check you can" : item.details.role === "mixed" || item.details.role === "weak" ? "Cover" : "Checklist"}</Text>
              {item.details.points.map((point, i) => <View key={i} style={{ flexDirection: "row", gap: 6 }}><Text variant="small" tone="accent">•</Text><Text variant="small" style={{ flex: 1 }}>{point}</Text></View>)}
            </Stack>
          ) : null}
          {item.details.how ? <Stack gap="xs"><Text variant="label" tone="soft">How</Text><Text variant="small">{item.details.how}</Text></Stack> : null}
        </Stack>
      ) : null}
      {reasons.length ? (
        <Stack gap="xs" testID="studio-why">
          <Text variant="label" tone="soft">Why it's here</Text>
          {reasons.map((r, i) => <Text key={i} variant="small">{r.text}</Text>)}
          {phrase ? <Text variant="small" tone="soft">{phrase}</Text> : null}
        </Stack>
      ) : null}
      {item?.firstStep ? <Stack gap="xs"><Text variant="label" tone="soft">First step</Text><Text variant="small">{item.firstStep}</Text></Stack> : null}
      {item?.note && !item.details ? <Text variant="small" tone="soft">{item.note}</Text> : null}
      {item && state.calibrationNotes[item.key] ? <Text variant="small" tone="soft">{state.calibrationNotes[item.key]}</Text> : null}
      {item && item.done > 0 ? <Text variant="caption" tone="soft">{`${formatMinutes(item.done)} studied so far.`}</Text> : null}

      {moving ? (
        <Stack gap="sm" testID="studio-move">
          <Text variant="label" tone="soft">Move to</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>{dates.slice(0, 10).map((d) => <Chip key={d} label={dayLabel(d)} selected={moving.date === d} radio onPress={() => move(d, moving.start)} />)}</View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Button title="−15 min" size="small" variant="ghost" onPress={() => move(moving.date, Math.max(0, moving.start - 15))} />
            <Text variant="value">{`${clockLabel(moving.start)}–${clockLabel(moving.start + length)}`}</Text>
            <Button title="+15 min" size="small" variant="ghost" onPress={() => move(moving.date, Math.min(1440 - length, moving.start + 15))} />
          </View>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Move here" variant="emphasis" icon="check" disabled={studio.busy !== null || studio.preview?.pass === false} onPress={() => void studio.commitMove(block.id, moving.date, moving.start).then((ok) => { if (ok) setMoving(null); })} testID="studio-move-commit" />
            <Button title="Cancel" variant="quiet" onPress={() => { setMoving(null); studio.clearPreview(); }} />
          </View>
        </Stack>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {future && block.state !== "skipped" ? <Button title="Start" variant="emphasis" icon="play" onPress={start} testID="studio-start" /> : null}
        {committed && future && !moving ? <Button title="Move" icon="hand" variant="solid" onPress={() => setMoving({ date: block.date, start: block.start })} testID="studio-move-open" /> : null}
        {committed && future ? <Button title={block.pinned ? "Unpin" : "Pin"} icon="pin" variant="ghost" disabled={studio.busy !== null} onPress={() => void studio.direct([{ kind: block.pinned ? "unpin" : "pin", block: block.id }], `${block.pinned ? "unpin" : "pin"}:${block.id}`)} /> : null}
        {committed && future ? <Button title="Skip" icon="close" variant="ghost" disabled={studio.busy !== null} onPress={() => void studio.direct([{ kind: "skip", block: block.id }], `skip:${block.id}`).then((ok) => { if (ok) onClose(); })} testID="studio-skip" /> : null}
        {block.state === "skipped" || block.state === "missed" ? <Button title="Find time again" icon="reset" variant="ghost" disabled={studio.busy !== null} onPress={() => void studio.direct([{ kind: "restore", block: block.id }], `restore:${block.id}`)} /> : null}
        {state.readiness.ai && reasons.length && !phrase ? <Button title="Explain in a sentence" size="small" variant="quiet" onPress={() => void studio.explainSentence(block.id).then((sentence) => setPhrase(sentence ?? "The planner couldn't phrase it just now; the reasons above are the full picture."))} /> : null}
      </View>
    </Plane>
  );
}
