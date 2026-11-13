// The study guide for an exam planned from its syllabus: how the plan works in phases with real dates, every topic with its key points, and the plan
// day by day. The student checks the topic list, unticks what their exam leaves out and says how sure they are of each topic; the plan is rebuilt
// from that on the server, without the model, and comes back as a proposal. Every date shown comes from the solver; every topic from the syllabus.
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, Checkbox, Chip, Disclosure, Icon, Plane, Press, Progress, Segmented, Stack, Text, TextField, useTheme, withAlpha } from "@sylf/design-system";
import type { StudioState } from "@sylf/backend";
import { planning } from "@sylf/shared";
import { CONFIDENCE_WORDS, RELATIVE, SOURCE_WORDS, agendaFor, blockMinutes, clockLabel, dateSpan, dayLabel, formatMinutes, goalProgress, live, sessionLabel, subjectColour, titleOf, unitStatus } from "./format";
import type { Studio } from "./useStudio";

type Tab = "plan" | "topics" | "days";
type Pending = Record<string, { confidence?: planning.Confidence | null; included?: boolean }>;

/** "Revise 8 topics in syllabus order…", from the sessions the plan actually holds. */
function planSentence(model: planning.WorkModel, goal: planning.KGoal): string {
  const items = model.items.filter((i) => i.goal === goal.key && i.details && i.status !== "dropped");
  const count = (role: planning.StudyRole) => items.filter((i) => i.details!.role === role).length;
  const topics = goal.syllabus?.units.filter((u) => u.included).length ?? 0;
  const mixed = count("mixed"); const papers = count("paper");
  const paper = goal.syllabus?.papers[0]?.label ?? "past paper";
  return [
    `Each of the ${topics} topics gets a revision session on its key points, then past paper practice, in syllabus order.`,
    mixed ? `${mixed} mixed review${mixed === 1 ? " brings" : "s bring"} earlier topics back after a gap so they stay fresh.` : null,
    papers ? `Then ${papers} full timed ${paper}${papers === 1 ? "" : "s"}, each followed by corrections, and your weakest topics.` : null,
    "The day before is a light review, and nothing new is learnt in the final 24 hours.",
  ].filter(Boolean).join(" ");
}

export function SyllabusGoal({ state, studio, model, goal, blocks, onSelectBlock }: { state: StudioState; studio: Studio; model: planning.WorkModel; goal: planning.KGoal; blocks: planning.Block[]; onSelectBlock: (id: string) => void }) {
  const { color, space, shape } = useTheme();
  const [tab, setTab] = useState<Tab>("plan");
  const [pending, setPending] = useState<Pending>({});
  const [adding, setAdding] = useState("");
  const syllabus = goal.syllabus!;
  const colour = subjectColour(state.snapshot, goal.subject);
  const progress = goalProgress(model, state.snapshot, goal.key);
  const risk = state.plan.risks.find((r) => r.goal === goal.key && (r.kind === "shortage" || r.kind === "deadline"));
  const phases = useMemo(() => planning.pathPhases(model, goal, blocks), [model, goal, blocks]);
  const agenda = useMemo(() => agendaFor(model, goal.key, blocks), [model, goal.key, blocks]);
  const left = planning.daysLeft(goal, state.snapshot.today);
  const paper = syllabus.papers[0];
  const busy = studio.busy !== null || studio.activity?.running === true;
  const changes = Object.entries(pending).filter(([key, change]) => {
    const unit = syllabus.units.find((u) => u.key === key);
    return unit && ((change.confidence !== undefined && change.confidence !== unit.confidence) || (change.included !== undefined && change.included !== unit.included));
  });
  const next = blocks.filter((b) => live(b) && model.items.some((i) => i.key === b.item && i.goal === goal.key) && (b.date > state.snapshot.today || (b.date === state.snapshot.today && b.end > state.snapshot.nowMinute))).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0];
  const update = () => void studio.editSyllabus({ goal: goal.key, units: changes.map(([key, change]) => ({ key, ...change })) }).then((ok) => { if (ok) setPending({}); });
  const confirm = () => void studio.editSyllabus({ goal: goal.key, checked: true, units: changes.map(([key, change]) => ({ key, ...change })) }).then((ok) => { if (ok) setPending({}); });
  const add = () => { const title = adding.trim(); if (title.length < 2) return; void studio.editSyllabus({ goal: goal.key, add: [{ title }] }).then((ok) => { if (ok) setAdding(""); }); };

  return (
    <Plane level="plane" radius="lg" pad="md" testID={`studio-guide-${goal.key}`} style={{ gap: space.md, borderLeftWidth: 3, borderLeftColor: colour }}>
      <Stack gap="xs">
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
          <Text variant="subheading" role="heading" aria-level={3} style={{ flexShrink: 1 }}>{goal.title}</Text>
          {!syllabus.checked ? <Badge tone="accent" label="Check topics" /> : null}
          {risk ? <Badge tone="critical" label={risk.kind === "shortage" ? "Short of time" : "Tight"} /> : null}
        </View>
        <Text variant="caption" tone="soft">{[goal.due ? `Exam ${dayLabel(goal.due)}` : "No exam date", left != null ? (left === 0 ? "today" : `${left} day${left === 1 ? "" : "s"} to go`) : null, paper ? `${paper.label}, ${formatMinutes(paper.minutes)}${paper.marks ? `, ${paper.marks} marks` : ""}` : null].filter(Boolean).join(" · ")}</Text>
        {progress.total ? <Progress value={progress.done / progress.total} label={`${goal.title} progress`} /> : null}
        <Text variant="micro" tone="faint">{`${progress.finished} of ${progress.items} sessions done · ${formatMinutes(progress.total)} planned`}</Text>
      </Stack>

      {next ? (
        <Press label={`Next: ${titleOf(model, next.item)}, ${dayLabel(next.date)} ${clockLabel(next.start)}`} onPress={() => onSelectBlock(next.id)} radius={shape.radius.md} testID="studio-guide-next"
          bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: shape.radius.md, backgroundColor: withAlpha(color.accent.fill, 0.1) }}>
          <Icon name="play" size={14} color={color.accent.ink} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="micro" tone="accent">Next up</Text>
            <Text variant="caption" numberOfLines={1}>{titleOf(model, next.item)}</Text>
          </View>
          <Text variant="micro" tone="soft">{`${RELATIVE(next.date, state.snapshot.today)} ${clockLabel(next.start)}`}</Text>
        </Press>
      ) : null}

      <Segmented<Tab> label="Study guide view" value={tab} fit options={[{ value: "plan", label: "Plan" }, { value: "topics", label: `Topics ${syllabus.units.filter((u) => u.included).length}` }, { value: "days", label: "Day by day" }]} onChange={setTab} />

      {tab === "plan" ? (
        <Stack gap="sm" testID="studio-guide-plan">
          <Text variant="small">{planSentence(model, goal)}</Text>
          <View style={{ gap: 0 }}>
            {[...phases.map((p, i) => ({ key: p.key, n: i + 1, title: p.title, when: dateSpan(p.from, p.to), detail: `${p.sessions} session${p.sessions === 1 ? "" : "s"}` })), ...(goal.due ? [{ key: "exam", n: phases.length + 1, title: "Exam", when: dayLabel(goal.due), detail: paper ? formatMinutes(paper.minutes) : "" }] : [])].map((row, i, all) => (
              <View key={row.key} style={{ flexDirection: "row", gap: space.sm }}>
                <View style={{ alignItems: "center", width: 18 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: row.key === "exam" ? color.critical.wash : color.accent.wash }}>
                    <Text variant="micro" tone={row.key === "exam" ? "critical" : "accent"}>{String(row.n)}</Text>
                  </View>
                  {i < all.length - 1 ? <View style={{ flex: 1, width: 2, minHeight: 14, backgroundColor: color.line }} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: space.sm, gap: 1 }}>
                  <Text variant="caption">{row.title}</Text>
                  <Text variant="micro" tone="soft">{[row.when, row.detail].filter(Boolean).join(" · ")}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text variant="micro" tone="faint">{syllabus.name}</Text>
        </Stack>
      ) : null}

      {tab === "topics" ? (
        <Stack gap="sm" testID="studio-guide-topics">
          {!syllabus.checked ? (
            <Callout title="Check these topics" message={`${SOURCE_WORDS[syllabus.source]}. Untick anything your exam leaves out and say how sure you are of each one. The plan rebuilds around it.`} />
          ) : <Text variant="micro" tone="faint">{SOURCE_WORDS[syllabus.source]}.</Text>}
          <View style={{ gap: 2 }}>
            {syllabus.units.map((unit) => {
              const change = pending[unit.key] ?? {};
              const included = change.included ?? unit.included;
              const confidence = change.confidence !== undefined ? change.confidence : unit.confidence;
              const status = unitStatus(model, goal.key, unit.key, blocks);
              const detail = !included ? "Not in this exam" : status.revised && status.practised ? "Revised and practised" : status.revised ? "Revised" : status.next ? `From ${dayLabel(status.next)}` : "Not scheduled yet";
              return (
                <Disclosure key={unit.key} title={unit.title} detail={`${detail}${confidence ? ` · ${CONFIDENCE_WORDS[confidence]}` : ""}`} icon={status.revised && status.practised ? "check" : undefined}>
                  <Stack gap="sm">
                    {unit.points.length ? <View style={{ gap: 3 }}>{unit.points.map((p, i) => <View key={i} style={{ flexDirection: "row", gap: 6 }}><Text variant="small" tone="soft">•</Text><Text variant="small" style={{ flex: 1 }}>{p}</Text></View>)}</View> : <Text variant="small" tone="soft">No key points listed.</Text>}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
                      <Text variant="micro" tone="soft">How sure are you?</Text>
                      {planning.CONFIDENCES.map((c) => <Chip key={c} label={CONFIDENCE_WORDS[c]} radio selected={confidence === c} disabled={!included || busy} onPress={() => setPending({ ...pending, [unit.key]: { ...change, confidence: confidence === c ? null : c } })} />)}
                    </View>
                    <Checkbox label="In this exam" value={included} disabled={busy} onChange={(value) => setPending({ ...pending, [unit.key]: { ...change, included: value } })} />
                  </Stack>
                </Disclosure>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}><TextField label="Add a topic" placeholder="A topic that's missing" value={adding} onChangeText={setAdding} onSubmitEditing={add} testID="studio-guide-add" /></View>
            <Button title="Add" icon="plus" variant="ghost" disabled={adding.trim().length < 2 || busy} onPress={add} />
          </View>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {changes.length ? <Button title={`Rebuild the plan (${changes.length})`} icon="reset" variant="emphasis" disabled={busy} onPress={update} testID="studio-guide-update" /> : null}
            {!syllabus.checked ? <Button title="Topics look right" icon="check" variant={changes.length ? "ghost" : "solid"} disabled={busy} onPress={confirm} testID="studio-guide-confirm" /> : null}
            {changes.length ? <Button title="Undo changes" variant="quiet" disabled={busy} onPress={() => setPending({})} /> : null}
          </View>
        </Stack>
      ) : null}

      {tab === "days" ? (
        <Stack gap="sm" testID="studio-guide-days">
          {!agenda.length ? <Text tone="soft">Nothing is scheduled yet.</Text> : null}
          {agenda.map((day) => (
            <View key={day.date} style={{ gap: 2 }}>
              <Text variant="label" tone={day.date === state.snapshot.today ? "accent" : "soft"}>{`${dayLabel(day.date)}${day.date === state.snapshot.today ? " · today" : ""}`}</Text>
              {day.blocks.map((block) => {
                const item = model.items.find((i) => i.key === block.item);
                return (
                  <Press key={block.id} label={`${item?.title ?? "Study"}, ${clockLabel(block.start)}`} onPress={() => onSelectBlock(block.id)} radius={shape.radius.sm}
                    bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 5, paddingHorizontal: 6, borderRadius: shape.radius.sm }}>
                    {block.state === "done" ? <Icon name="check" size={13} color={color.positive.ink} /> : <View style={{ width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: colour }} />}
                    <Text variant="micro" tone="soft" style={{ width: 38 }}>{clockLabel(block.start)}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="caption" numberOfLines={1} tone={block.state === "done" ? "soft" : "ink"}>{item?.title ?? "Study"}</Text>
                      {item?.details?.points.length && (item.details.role === "revise" || item.details.role === "practise") ? <Text variant="micro" tone="faint" numberOfLines={1}>{item.details.points.slice(0, 2).join(" · ")}</Text> : null}
                    </View>
                    <Text variant="micro" tone="soft">{item ? `${sessionLabel(item)} · ${formatMinutes(blockMinutes(block))}` : formatMinutes(blockMinutes(block))}</Text>
                  </Press>
                );
              })}
            </View>
          ))}
          {goal.due ? <Text variant="label" tone="critical">{`${dayLabel(goal.due)} · Exam`}</Text> : null}
        </Stack>
      ) : null}

      <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
        <Button title="Drop goal" size="small" variant="quiet" disabled={busy} onPress={() => void studio.command(`drop ${goal.title}`)} />
      </View>
    </Plane>
  );
}
