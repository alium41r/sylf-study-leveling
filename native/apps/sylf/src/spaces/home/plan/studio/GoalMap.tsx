// The goal map: each goal with its work, progress, estimate ranges and risk. Items stream in here while the planner writes them and settle onto the
// timeline as the solver places them. A goal Sylf knows about but the Studio has not planned yet offers to plan it; goals another planner owns are
// shown as locked, never edited.
import { View } from "react-native";
import { Badge, Button, Disclosure, Icon, Plane, Press, Progress, Stack, Text, useTheme, withAlpha } from "@sylf/design-system";
import type { StudioState } from "@sylf/backend";
import type { planning } from "@sylf/shared";
import { ESTIMATE, RELATIVE, dayLabel, formatMinutes, goalProgress, sessionLabel, subjectColour } from "./format";
import { SyllabusGoal } from "./StudyGuide";
import type { Studio } from "./useStudio";

export function GoalMap({ state, studio, model, blocks, budgets, onSelectItem, onSelectBlock }: { state: StudioState; studio: Studio; model: planning.WorkModel; blocks: planning.Block[]; budgets: planning.WeekBudget[]; onSelectItem: (item: string) => void; onSelectBlock: (block: string) => void }) {
  const { color, space, shape } = useTheme();
  const streaming = new Set(studio.activity?.running ? studio.activity.items.map((i) => i.key) : []);
  const committedKeys = new Set(state.model.items.map((i) => i.key));
  const goals = model.goals.filter((g) => g.status === "active");
  const risk = (goal: string) => state.plan.risks.find((r) => r.goal === goal && (r.kind === "shortage" || r.kind === "deadline"));
  const nextOf = (item: string) => state.plan.blocks.filter((b) => b.item === item && (b.state === "committed" || b.state === "proposed")).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0];
  return (
    <Stack gap="md" testID="studio-goals">
      {!goals.length ? <Text tone="soft">No plans yet.</Text> : null}
      {goals.map((goal) => {
        // An exam planned from its syllabus gets the full study guide: phases, topics with key points, and the plan day by day.
        if (goal.syllabus) return <SyllabusGoal key={goal.key} state={state} studio={studio} model={model} goal={goal} blocks={blocks} budgets={budgets} onSelectBlock={onSelectBlock} />;
        const items = model.items.filter((i) => i.goal === goal.key && i.status !== "dropped");
        const progress = goalProgress(model, state.snapshot, goal.key);
        const r = risk(goal.key);
        const colour = subjectColour(state.snapshot, goal.subject);
        return (
          <Plane key={goal.key} level="plane" radius="lg" pad="md" testID={`studio-goal-${goal.key}`} style={{ gap: space.sm, borderLeftWidth: 3, borderLeftColor: colour }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
              <Text variant="subheading" style={{ flexShrink: 1 }}>{goal.title}</Text>
              {goal.draft ? <Badge label="Draft" /> : null}
              {!items.length && model.questions.some((q) => q.affects.includes(goal.key)) ? <Badge tone="accent" label="Needs topics" /> : null}
              {r ? <Badge tone="critical" label={r.kind === "shortage" ? "Short of time" : "Tight"} /> : null}
            </View>
            <Text variant="caption" tone="soft">{[goal.type === "problem_set" ? "Problem set" : goal.type[0].toUpperCase() + goal.type.slice(1), goal.due ? `due ${dayLabel(goal.due)} (${RELATIVE(goal.due, state.snapshot.today)})` : "no deadline", progress.total ? `${formatMinutes(progress.done)} of ${formatMinutes(progress.total)}` : null].filter(Boolean).join(" · ")}</Text>
            {progress.total ? <Progress value={progress.total ? progress.done / progress.total : 0} label={`${goal.title} progress`} /> : null}
            {!items.length ? (
              <Button title={studio.activity?.running ? "Planning…" : "Plan this goal"} size="small" variant="solid" icon="planner" disabled={studio.activity?.running === true} onPress={() => void studio.addGoal({ goalKey: goal.key })} testID={`studio-plan-goal-${goal.key}`} />
            ) : (
              <Disclosure title={`${progress.finished} of ${items.length} done`} detail="Work" defaultOpen={items.some((i) => streaming.has(i.key) || !committedKeys.has(i.key))}>
                <View style={{ gap: 2 }}>
                  {items.map((item) => {
                    const next = nextOf(item.key);
                    const fresh = streaming.has(item.key) || !committedKeys.has(item.key);
                    return (
                      <Press key={item.key} label={`${item.title}. ${sessionLabel(item)}, ${ESTIMATE(item, state.snapshot)}${next ? `, next ${dayLabel(next.date)}` : ""}`} onPress={() => onSelectItem(item.key)} radius={shape.radius.sm}
                        bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 6, paddingHorizontal: 6, borderRadius: shape.radius.sm, backgroundColor: fresh ? withAlpha(color.accent.fill, 0.1) : undefined }}>
                        {item.status === "done" ? <Icon name="check" size={14} color={color.positive.ink} /> : <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colour }} />}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="caption" numberOfLines={2} tone={item.status === "done" ? "soft" : "ink"}>{item.title}</Text>
                          <Text variant="micro" tone="soft" numberOfLines={1}>{[sessionLabel(item), ESTIMATE(item, state.snapshot), next ? `next ${dayLabel(next.date)}` : item.status === "open" ? "not scheduled yet" : null, fresh ? "new" : null].filter(Boolean).join(" · ")}</Text>
                        </View>
                      </Press>
                    );
                  })}
                </View>
              </Disclosure>
            )}
            {items.length ? <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>{goal.type === "exam" ? <Button title="Re-plan topic by topic" size="small" variant="solid" icon="planner" disabled={studio.activity?.running === true} onPress={() => void studio.addGoal({ goalKey: goal.key })} testID={`studio-replan-${goal.key}`} /> : null}<Button title="Drop goal" size="small" variant="quiet" disabled={studio.activity?.running === true} onPress={() => void studio.command(`drop ${goal.title}`)} /></View> : null}
          </Plane>
        );
      })}
      {state.lockedGoals.length ? (
        <Text variant="caption" tone="faint">{`Planned elsewhere, shown as fixed: ${state.lockedGoals.map((g) => g.title).join(", ")}.`}</Text>
      ) : null}
    </Stack>
  );
}
