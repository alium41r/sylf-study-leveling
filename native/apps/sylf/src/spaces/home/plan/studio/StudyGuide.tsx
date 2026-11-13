// The study guide for a plan compiled from an outline: its phases with real dates, every topic (or stage, or part) with its key points, and the plan
// day by day, then week by week beyond the detailed horizon. The student checks the list, unticks what does not apply and says how sure they are;
// the plan is rebuilt on the server, without the model, and comes back as a proposal. Dates come from the solver; topics from the outline.
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Checkbox, Chip, Disclosure, Icon, IconButton, Plane, Press, Progress, Segmented, Stack, Text, TextField, useTheme, withAlpha } from "@sylf/design-system";
import type { StudioState } from "@sylf/backend";
import { planning } from "@sylf/shared";
import { CONFIDENCE_WORDS, PRESET_WORDS, RELATIVE, agendaFor, sourceWords, blockMinutes, clockLabel, dateSpan, dayLabel, formatMinutes, goalProgress, live, sessionLabel, subjectColour, titleOf, unitStatus } from "./format";
import type { Studio } from "./useStudio";

type Tab = "plan" | "topics" | "days";
type Pending = Record<string, { confidence?: planning.Confidence | null; included?: boolean }>;

const UNIT_WORD: Record<planning.PlanPreset, [string, string]> = { exam: ["topic", "Topics"], course: ["topic", "Topics"], mastery: ["part", "Parts"], skill: ["stage", "Stages"], reading: ["part", "Parts"], assignment: ["part", "Parts"] };
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

export function SyllabusGoal({ state, studio, model, goal, blocks, budgets, onSelectBlock }: { state: StudioState; studio: Studio; model: planning.WorkModel; goal: planning.KGoal; blocks: planning.Block[]; budgets: planning.WeekBudget[]; onSelectBlock: (id: string) => void }) {
  const { color, space, shape } = useTheme();
  const [tab, setTab] = useState<Tab>("plan");
  const [pending, setPending] = useState<Pending>({});
  const [adding, setAdding] = useState("");
  const syllabus = goal.syllabus!;
  const preset = planning.presetOf(goal);
  const [one, many] = UNIT_WORD[preset];
  const colour = subjectColour(state.snapshot, goal.subject);
  const progress = goalProgress(model, state.snapshot, goal.key);
  const risk = state.plan.risks.find((r) => r.goal === goal.key && (r.kind === "shortage" || r.kind === "deadline"));
  const phases = useMemo(() => planning.pathPhases(model, goal, blocks, state.snapshot.today), [model, goal, blocks, state.snapshot.today]);
  const agenda = useMemo(() => agendaFor(model, goal.key, blocks), [model, goal.key, blocks]);
  const later = useMemo(() => {
    const own = new Map(model.items.filter((i) => i.goal === goal.key).map((i) => [i.key, i.title]));
    const weeks = new Map<string, string[]>();
    for (const b of budgets) if (own.has(b.item)) weeks.set(b.week, [...(weeks.get(b.week) ?? []), own.get(b.item)!]);
    return [...weeks.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [budgets, model, goal.key]);
  const left = planning.daysLeft(goal, state.snapshot.today);
  const paper = syllabus.papers[0];
  const busy = studio.busy !== null || studio.activity?.running === true;
  const changes = Object.entries(pending).filter(([key, change]) => {
    const unit = syllabus.units.find((u) => u.key === key);
    return unit && ((change.confidence !== undefined && change.confidence !== unit.confidence) || (change.included !== undefined && change.included !== unit.included));
  });
  const next = blocks.filter((b) => live(b) && model.items.some((i) => i.key === b.item && i.goal === goal.key) && (b.date > state.snapshot.today || (b.date === state.snapshot.today && b.end > state.snapshot.nowMinute))).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0];
  const send = (extra: { checked?: boolean } = {}) => void studio.editSyllabus({ goal: goal.key, units: changes.map(([key, change]) => ({ key, ...change })), ...extra }).then((ok) => { if (ok) setPending({}); });
  const add = () => { const title = adding.trim(); if (title.length < 2) return; void studio.editSyllabus({ goal: goal.key, add: [{ title }] }).then((ok) => { if (ok) setAdding(""); }); };
  const when = goal.due ? `${PRESET_WORDS[preset].due} ${dayLabel(goal.due)}` : phases.at(-1)?.to ? `To ${dayLabel(phases.at(-1)!.to!)}` : null;

  return (
    <Plane level="plane" radius="lg" pad="md" testID={`studio-guide-${goal.key}`} style={{ gap: space.md, borderLeftWidth: 3, borderLeftColor: colour }}>
      <Stack gap="xs">
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
          <Text variant="subheading" role="heading" aria-level={3} style={{ flexShrink: 1 }}>{goal.title}</Text>
          {!syllabus.checked ? <Badge tone="accent" label={`Check ${many.toLowerCase()}`} /> : null}
          {risk ? <Badge tone="critical" label="Short of time" /> : null}
        </View>
        <Text variant="caption" tone="soft">{[PRESET_WORDS[preset].label, when, left != null && left > 0 ? `${left} days` : null, paper ? `${paper.label} ${formatMinutes(paper.minutes)}` : null, goal.target ? `Aim: ${goal.target}` : null].filter(Boolean).join(" · ")}</Text>
        {progress.total ? <Progress value={progress.done / progress.total} label={`${goal.title} progress`} /> : null}
        <Text variant="micro" tone="faint">{`${progress.finished}/${progress.items} done · ${formatMinutes(progress.total)}`}</Text>
      </Stack>

      <PlanCheck state={state} studio={studio} goal={goal} />

      {next ? (
        <Press label={`Next: ${titleOf(model, next.item)}, ${dayLabel(next.date)} ${clockLabel(next.start)}`} onPress={() => onSelectBlock(next.id)} radius={shape.radius.md} testID="studio-guide-next"
          bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: shape.radius.md, backgroundColor: withAlpha(color.accent.fill, 0.1) }}>
          <Icon name="play" size={14} color={color.accent.ink} />
          <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{titleOf(model, next.item)}</Text>
          <Text variant="micro" tone="soft">{`${RELATIVE(next.date, state.snapshot.today)} ${clockLabel(next.start)}`}</Text>
        </Press>
      ) : null}

      <Segmented<Tab> label="Study guide view" value={tab} fit options={[{ value: "plan", label: "Plan" }, { value: "topics", label: `${many} ${syllabus.units.filter((u) => u.included).length}` }, { value: "days", label: "Days" }]} onChange={setTab} />

      {tab === "plan" ? (
        <Stack gap="sm" testID="studio-guide-plan">
          <View>
            {[...phases.map((p, i) => ({ key: p.key, n: i + 1, title: p.title, when: dateSpan(p.from, p.to), exam: false })), ...(goal.due && preset !== "skill" && preset !== "reading" ? [{ key: "exam", n: phases.length + 1, title: preset === "exam" || goal.type === "exam" ? "Exam" : "Deadline", when: dayLabel(goal.due), exam: true }] : [])].map((row, i, all) => (
              <View key={row.key} style={{ flexDirection: "row", gap: space.sm }}>
                <View style={{ alignItems: "center", width: 18 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: row.exam ? color.critical.wash : color.accent.wash }}>
                    <Text variant="micro" tone={row.exam ? "critical" : "accent"}>{String(row.n)}</Text>
                  </View>
                  {i < all.length - 1 ? <View style={{ flex: 1, width: 2, minHeight: 12, backgroundColor: color.line }} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: space.sm, gap: 1 }}>
                  <Text variant="caption">{row.title}</Text>
                  <Text variant="micro" tone="soft">{row.when}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text variant="micro" tone="faint" numberOfLines={2}>{syllabus.name}</Text>
          {syllabus.sources?.length ? <Text variant="micro" tone="faint" numberOfLines={2} testID="studio-guide-sources">{`Checked against ${syllabus.sources.map((x) => host(x.url)).join(", ")}`}</Text> : null}
        </Stack>
      ) : null}

      {tab === "topics" ? (
        <Stack gap="sm" testID="studio-guide-topics">
          <Text variant="micro" tone="faint">{sourceWords(syllabus)}</Text>
          <View style={{ gap: 2 }}>
            {syllabus.units.map((unit) => {
              const change = pending[unit.key] ?? {};
              const included = change.included ?? unit.included;
              const confidence = change.confidence !== undefined ? change.confidence : unit.confidence;
              const status = unitStatus(model, goal.key, unit.key, blocks);
              const detail = !included ? "Left out" : status.revised && status.practised ? "Done" : status.next ? dayLabel(status.next) : "Later";
              return (
                <Disclosure key={unit.key} title={unit.title} detail={`${detail}${confidence ? ` · ${CONFIDENCE_WORDS[confidence]}` : ""}`} icon={status.revised && status.practised ? "check" : undefined}>
                  <Stack gap="sm">
                    {unit.points.length ? <View style={{ gap: 3 }}>{unit.points.map((p, i) => <View key={i} style={{ flexDirection: "row", gap: 6 }}><Text variant="small" tone="soft">•</Text><Text variant="small" style={{ flex: 1 }}>{p}</Text></View>)}</View> : null}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }} role="radiogroup" aria-label={`How sure are you of ${unit.title}`}>
                      {planning.CONFIDENCES.map((c) => <Chip key={c} label={CONFIDENCE_WORDS[c]} radio selected={confidence === c} disabled={!included || busy} onPress={() => setPending({ ...pending, [unit.key]: { ...change, confidence: confidence === c ? null : c } })} />)}
                    </View>
                    <Checkbox label="Include" value={included} disabled={busy} onChange={(value) => setPending({ ...pending, [unit.key]: { ...change, included: value } })} />
                  </Stack>
                </Disclosure>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}><TextField label={`Add a ${one}`} hideLabel placeholder={`Add a ${one}`} value={adding} onChangeText={setAdding} onSubmitEditing={add} testID="studio-guide-add" /></View>
            <Button title="Add" icon="plus" variant="ghost" disabled={adding.trim().length < 2 || busy} onPress={add} />
          </View>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {changes.length ? <Button title={`Rebuild (${changes.length})`} icon="reset" variant="emphasis" disabled={busy} onPress={() => send()} testID="studio-guide-update" /> : null}
            {!syllabus.checked ? <Button title="Looks right" icon="check" variant={changes.length ? "ghost" : "solid"} disabled={busy} onPress={() => send({ checked: true })} testID="studio-guide-confirm" /> : null}
            {changes.length ? <Button title="Undo" variant="quiet" disabled={busy} onPress={() => setPending({})} /> : null}
          </View>
        </Stack>
      ) : null}

      {tab === "days" ? (
        <Stack gap="sm" testID="studio-guide-days">
          {!agenda.length && !later.length ? <Text tone="soft">Nothing scheduled yet.</Text> : null}
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
                    <Text variant="caption" numberOfLines={1} tone={block.state === "done" ? "soft" : "ink"} style={{ flex: 1, minWidth: 0 }}>{item?.title ?? "Study"}</Text>
                    <Text variant="micro" tone="soft">{item ? `${sessionLabel(item)} · ${formatMinutes(blockMinutes(block))}` : formatMinutes(blockMinutes(block))}</Text>
                  </Press>
                );
              })}
            </View>
          ))}
          {later.length ? (
            <Stack gap="xs" testID="studio-guide-later">
              <Text variant="label" tone="soft">Later</Text>
              {later.map(([week, titles]) => (
                <View key={week} style={{ flexDirection: "row", gap: space.sm }}>
                  <Text variant="micro" tone="soft" style={{ width: 76 }}>{`Wk ${dayLabel(week).slice(4)}`}</Text>
                  <Text variant="caption" style={{ flex: 1, minWidth: 0 }} numberOfLines={2}>{[...new Set(titles)].slice(0, 4).join(" · ")}{new Set(titles).size > 4 ? ` +${new Set(titles).size - 4}` : ""}</Text>
                </View>
              ))}
            </Stack>
          ) : null}
          {goal.due && preset !== "skill" ? <Text variant="label" tone="critical">{`${dayLabel(goal.due)} · ${preset === "exam" || goal.type === "exam" ? "Exam" : "Deadline"}`}</Text> : null}
        </Stack>
      ) : null}

      <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
        <Button title="Drop" size="small" variant="quiet" disabled={busy} onPress={() => void studio.command(`drop ${goal.title}`)} />
      </View>
    </Plane>
  );
}

/**
 * "Is this plan right?", once per plan round, small and closeable. Yes records it and changes nothing. No (with an optional note) researches and
 * double-checks the syllabus again and proposes an improved plan; that new plan gets its own round, so it can be judged too.
 */
function PlanCheck({ state, studio, goal }: { state: StudioState; studio: Studio; goal: planning.KGoal }) {
  const { color, space } = useTheme();
  const [off, setOff] = useState(false);
  const [note, setNote] = useState("");
  const [closed, setClosed] = useState<number | null>(null);
  const round = goal.review?.round ?? 0;
  const answered = state.feedback?.[goal.key];
  const running = studio.activity?.running === true;
  if ((answered && answered.round >= round) || closed === round || running) return null;
  const close = (verdict: "accurate" | "dismissed") => { setClosed(round); setOff(false); void studio.feedback(goal.key, verdict); };
  return (
    <View testID="studio-plan-check" style={{ gap: space.sm, padding: space.sm, borderRadius: 12, borderWidth: 1, borderColor: color.accent.line, backgroundColor: withAlpha(color.accent.fill, 0.06) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text variant="small" style={{ flex: 1 }}>{round ? "Is the re-checked plan right?" : "Is this plan right?"}</Text>
        <IconButton icon="close" label="Close" onPress={() => close("dismissed")} testID="studio-plan-check-close" />
      </View>
      {off ? (
        <Stack gap="sm">
          <TextField label="What's off? (optional)" hideLabel multiline placeholder="What's off? (optional)" value={note} onChangeText={setNote} testID="studio-plan-check-note" />
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Button title="Re-check" icon="reset" variant="emphasis" size="small" disabled={studio.busy !== null} onPress={() => { setClosed(round); void studio.recheck(goal.key, note.trim() || null); setOff(false); setNote(""); }} testID="studio-plan-check-recheck" />
            <Button title="Cancel" size="small" variant="quiet" onPress={() => setOff(false)} />
          </View>
        </Stack>
      ) : (
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Button title="Looks good" icon="check" size="small" variant="solid" onPress={() => close("accurate")} testID="studio-plan-check-good" />
          <Button title="Something's off" size="small" variant="ghost" onPress={() => setOff(true)} testID="studio-plan-check-off" />
        </View>
      )}
    </View>
  );
}
