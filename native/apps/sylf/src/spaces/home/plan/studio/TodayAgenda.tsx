// The phone's view of the plan: a Today agenda with the next session up front. Start opens a focus session with its quest; Later hands the session's
// time back to the plan, which repairs around it. The rest of the Studio sits below.
import { View } from "react-native";
import { Button, Plane, Press, Stack, Text, useTheme } from "@sylf/design-system";
import type { StudioState } from "@sylf/backend";
import { useHomeNavigation, useStudySession } from "../studioShell";
import { RELATIVE, blockMinutes, clockLabel, formatMinutes, itemOf, nextBlock, subjectColour, titleOf } from "./format";
import type { Studio } from "./useStudio";

export function TodayAgenda({ state, studio, onSelect }: { state: StudioState; studio: Studio; onSelect: (id: string) => void }) {
  const { space, shape } = useTheme();
  const session = useStudySession();
  const navigation = useHomeNavigation();
  const next = nextBlock(state.blocks, state.snapshot);
  const today = state.blocks.filter((b) => b.date === state.snapshot.today && b.state !== "skipped").sort((a, b) => a.start - b.start);
  const start = () => {
    if (!next) return;
    const item = itemOf(state.model, next.item);
    session.setPlan({ title: item?.title ?? "Study session", subject: state.snapshot.subjects.find((s) => s.id === item?.subject)?.name ?? null, subjectId: item?.subject ?? null, questId: item?.questId ?? next.questId ?? null });
    navigation.select("focus");
  };
  return (
    <Stack gap="md" testID="studio-today">
      {next ? (
        <Plane level="raised" radius="lg" pad="md" style={{ gap: space.sm, borderLeftWidth: 4, borderLeftColor: subjectColour(state.snapshot, itemOf(state.model, next.item)?.subject) }} testID="studio-next">
          <Text variant="label" tone="soft">{next.date === state.snapshot.today ? (next.start <= state.snapshot.nowMinute ? "Now" : `Next · ${clockLabel(next.start)}`) : `Next · ${RELATIVE(next.date, state.snapshot.today)} ${clockLabel(next.start)}`}</Text>
          <Text variant="heading">{titleOf(state.model, next.item)}</Text>
          <Text variant="small" tone="soft">{`${formatMinutes(blockMinutes(next))}${itemOf(state.model, next.item)?.firstStep ? ` · ${itemOf(state.model, next.item)!.firstStep}` : ""}`}</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Start" variant="emphasis" icon="play" onPress={start} testID="studio-next-start" />
            <Button title="Later" variant="ghost" disabled={studio.busy !== null} onPress={() => void studio.direct([{ kind: "skip", block: next.id }], `later:${next.id}`)} testID="studio-next-later" />
          </View>
        </Plane>
      ) : <Text tone="soft">Nothing left to do today.</Text>}
      {today.length ? (
        <View style={{ gap: 2 }}>
          {today.map((block) => (
            <Press key={block.id} label={`${titleOf(state.model, block.item)} at ${clockLabel(block.start)}`} onPress={() => onSelect(block.id)} radius={shape.radius.sm} bodyStyle={{ flexDirection: "row", gap: space.sm, alignItems: "center", paddingVertical: 8 }}>
              <Text variant="value" tone={block.state === "done" ? "faint" : "soft"} style={{ width: 48 }}>{clockLabel(block.start)}</Text>
              <View style={{ width: 3, height: 22, borderRadius: 2, backgroundColor: subjectColour(state.snapshot, itemOf(state.model, block.item)?.subject) }} />
              <Text variant="small" numberOfLines={1} style={{ flex: 1, textDecorationLine: block.state === "done" ? "line-through" : undefined }} tone={block.state === "missed" ? "caution" : "ink"}>{titleOf(state.model, block.item)}</Text>
              <Text variant="micro" tone="soft">{block.state === "missed" ? "missed" : formatMinutes(blockMinutes(block))}</Text>
            </Press>
          ))}
        </View>
      ) : null}
    </Stack>
  );
}
