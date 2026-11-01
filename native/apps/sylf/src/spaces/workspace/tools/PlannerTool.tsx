// The day's plan and open quests. With an account, a tick is a real action: it goes through the server's own quest rules, and what it pays comes from
// the server. Without one it is a sample and stays in this window. AI planning keeps its whole lifecycle on the web: Research, Strategy, Scheduling and
// Review, and the ApplyService behind them, are not imitated here. What a student applies there appears here as quests.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Checkbox, ListRow, Stack, Text, useNotice, useTheme } from "@sylf/design-system";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { useStudySession, useWorkspaceModel, useSessionState } from "../../../shell/context";
import type { PlannerObjective, WorkspaceDataAdapter } from "../data/contracts";
import { useToolResult } from "../data";
import { ToolEmpty, ToolFailed, ToolFootnote, ToolLoading, ToolPage, type ToolProps } from "./shared";

const load = (adapter: WorkspaceDataAdapter) => adapter.planner();

export default function PlannerTool({ window, patch, onProvenance }: ToolProps) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const session = useStudySession();
  const workspace = useWorkspaceModel();
  const { active } = useSessionState();
  const result = useToolResult("planner", load);
  const [sending, setSending] = useState<string | null>(null);
  useEffect(() => { if (result) onProvenance(result.provenance === "sample"); }, [result, onProvenance]);
  if (!result) return <ToolLoading />;
  if (!result.data && result.live?.failure) return <ToolFailed icon="planner" live={result.live} />;
  const live = result.provenance === "live" && backend !== null;
  const empty = !result.data || (live && !result.data.items.length && !result.data.objectives.length && !result.data.goals?.length);
  if (empty || !result.data) return <ToolEmpty icon="planner" title="Nothing planned" message={live ? "Quests and events for today appear here. Plans made with AI are built on Sylf for the web, and appear here once you apply them." : "Your plan for the day will appear here."} />;
  const { goals, items, objectives } = result.data;
  const done = Array.isArray(window.state.done) ? window.state.done as string[] : [];
  const toggle = (id: string) => patch({ done: done.includes(id) ? done.filter((item) => item !== id) : [...done, id] });
  const complete = async (objective: PlannerObjective) => {
    if (!backend || !objective.completion) return;
    setSending(objective.id);
    try { await backend.reads.completeQuest(objective.completion); notice("Quest done."); }
    catch (error) { notice(describeFailureText(error)); }
    setSending(null);
    backend.resources.invalidate("today");
    backend.resources.invalidate("progress");
    backend.resources.invalidate("traveller");
  };
  const study = (objective: PlannerObjective) => {
    session.setPlan({ title: objective.title, subject: objective.subject ?? null, subjectId: objective.subjectId ?? null, questId: objective.questId ?? null });
    workspace.summon("timer");
  };
  return (
    <View style={{ flex: 1 }}>
      <ToolPage>
        {items.length || !live ? (
          <Stack gap="xs">
            <Text variant="subheading" role="heading" aria-level={2}>Today</Text>
            {items.map((item) => <ListRow key={item.id} title={item.title} detail={item.detail} value={item.time} />)}
          </Stack>
        ) : null}
        {objectives.length ? (
          <Stack gap="sm">
            <Text variant="subheading" role="heading" aria-level={2}>{live ? "Quests" : "Objectives"}</Text>
            <View style={{ gap: space.sm }}>
              {objectives.map((item) => (live ? (
                <View key={item.id} style={{ gap: space.xs }}>
                  <View testID={`planner-${item.id}`}><Checkbox label={item.title} value={item.done === true} disabled={item.done === true || sending !== null} onChange={() => void complete(item)} /></View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.xl }}>
                    <Text variant="caption" tone="soft" style={{ flex: 1 }}>{item.detail}</Text>
                    {item.done || active ? null : <Button title="Study this" size="small" variant="ghost" testID={`planner-study-${item.id}`} onPress={() => study(item)} />}
                  </View>
                </View>
              ) : <Checkbox key={item.id} label={item.title} value={done.includes(item.id)} onChange={() => toggle(item.id)} />))}
            </View>
          </Stack>
        ) : null}
        {goals?.length ? (
          <Stack gap="xs">
            <Text variant="subheading" role="heading" aria-level={2}>Goals</Text>
            {goals.map((goal) => <ListRow key={goal.id} title={goal.title} detail={goal.detail} />)}
          </Stack>
        ) : null}
      </ToolPage>
      <ToolFootnote><Text variant="caption" tone="soft" testID="planner-note">{live ? "Plans made with AI are built and reviewed on Sylf for the web. What you apply there appears here." : "Ticks stay in this window for now. Nothing reaches your Planner yet."}</Text></ToolFootnote>
    </View>
  );
}
