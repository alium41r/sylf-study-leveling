// Diff review. Every change arrives as a proposal the student can accept, discard or (after accepting) undo: a one-line summary, the checks it passed,
// the decision notes, assumptions as tags, at most two questions as tappable answers, and the individual changes before and after.
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Chip, Disclosure, Plane, Stack, Text, useTheme } from "@sylf/design-system";
import type { StudioProposal, StudioState } from "@sylf/backend";
import type { planning } from "@sylf/shared";
import { clockLabel, dayLabel, formatMinutes } from "./format";
import type { Studio } from "./useStudio";

const SOURCE: Record<string, string> = { MODEL: "From the planner", STUDENT: "Your change", REPAIR: "Repair", SYSTEM: "Sylf", UNDO: "Undo" };
const slot = (s: planning.Slot | null) => (s ? `${dayLabel(s.date)} ${clockLabel(s.start)}` : "");

export function ProposalReview({ proposal, state, studio }: { proposal: StudioProposal; state: StudioState; studio: Studio }) {
  const { color, space } = useTheme();
  const [all, setAll] = useState(false);
  const changes = proposal.diff.changes as planning.BlockChange[];
  const shown = all ? changes : changes.slice(0, 6);
  const shortages = proposal.result.shortages;
  const questions = proposal.model.questions ?? [];
  const assumptions = proposal.model.assumptions.filter((a) => !state.model.assumptions.some((b) => b.key === a.key)).slice(0, 4);
  const busy = studio.busy !== null;
  return (
    <Plane level="raised" radius="lg" pad="md" testID="studio-review" style={{ gap: space.md, borderWidth: 1.5, borderColor: color.accent.line }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
        <Badge tone="accent" label={SOURCE[proposal.source] ?? "Proposal"} />
        {proposal.interpretation ? <Badge label={proposal.interpretation} /> : null}
        <Text variant="micro" tone="faint">{`${proposal.verification.checks} checks passed · quality ${proposal.verification.quality}`}</Text>
      </View>
      <Text variant="heading" role="heading" aria-level={3} testID="studio-review-summary">{proposal.summary}</Text>
      {proposal.strategy ? <Text tone="soft">{proposal.strategy}</Text> : null}
      {proposal.notes.map((note, i) => <Text key={i} variant="small" tone="soft">{note}</Text>)}
      {shortages.length ? <Text variant="small" tone="critical">{`Before ${dayLabel(shortages[0].due)} you need ${formatMinutes(shortages[0].needed)} and have ${formatMinutes(shortages[0].needed - shortages[0].short)} free. ${formatMinutes(shortages[0].short)} is left unscheduled.`}</Text> : null}
      {questions.length ? (
        <Stack gap="xs" testID="studio-questions">
          {questions.map((q) => (
            <View key={q.key} style={{ gap: space.xs }}>
              <Text variant="subheading">{q.text}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>{q.options.map((option) => <Chip key={option} label={option} onPress={() => void studio.answer(q.key, option)} />)}</View>
            </View>
          ))}
        </Stack>
      ) : null}
      {assumptions.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>{assumptions.map((a) => <Chip key={a.key} label={`Assumed: ${a.text}`} icon="info" onPress={() => void studio.command(`Actually, ${a.text.replace(/\.$/, "")} is not right`)} />)}</View> : null}
      {changes.length ? (
        <View style={{ gap: 4 }} testID="studio-review-changes">
          {shown.map((change) => (
            <View key={`${change.kind}-${change.id}`} style={{ flexDirection: "row", gap: space.sm, alignItems: "baseline" }}>
              <Text variant="micro" tone={change.kind === "removed" ? "critical" : change.kind === "added" ? "positive" : "accent"} style={{ width: 62 }}>{change.kind}</Text>
              <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{change.title}</Text>
              <Text variant="micro" tone="soft" numberOfLines={1}>{change.kind === "moved" ? `${slot(change.before)} → ${slot(change.after)}` : slot(change.after ?? change.before)}</Text>
            </View>
          ))}
          {changes.length > 6 ? <Button title={all ? "Show fewer" : `Show all ${changes.length} changes`} size="small" variant="quiet" onPress={() => setAll(!all)} /> : null}
        </View>
      ) : null}
      {proposal.verification.critics?.length ? (
        <Disclosure title="How this was planned" detail="Checks and quality notes">
          <Stack gap="xs">{proposal.verification.critics.map((c) => <Text key={c.code} variant="small" tone={c.score < 60 ? "caution" : "soft"}>{`${c.score} · ${c.note}`}</Text>)}</Stack>
        </Disclosure>
      ) : null}
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button title={studio.busy?.startsWith("accept") ? "Adding" : "Accept"} variant="emphasis" icon="check" disabled={busy || !proposal.verification.pass} onPress={() => void studio.accept(proposal)} testID="studio-accept" />
        <Button title="Discard" variant="quiet" disabled={busy} onPress={() => void studio.discard(proposal)} testID="studio-discard" />
      </View>
    </Plane>
  );
}
