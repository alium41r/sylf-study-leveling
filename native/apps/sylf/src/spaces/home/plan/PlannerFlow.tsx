// One plan, from its details to confirmed quests. The server says what may happen next (`workspace.allowedActions`), and this screen only offers
// that. Nothing advances on a timer: the words under "Planning" are whatever the server last said. Provider text is shown as plain text, never run.
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, Checkbox, Dialog, Disclosure, EmptyState, Segmented, Stack, Text, TextField, Toggle, useTheme } from "@sylf/design-system";
import type { PlannerView } from "@sylf/backend";
import { usePlannerPlan, type Problem } from "./usePlanner";

const LIMITS = [{ value: "0.5", label: "$0.50" }, { value: "1", label: "$1.00" }, { value: "1.75", label: "$1.75" }] as const;
type Limit = (typeof LIMITS)[number]["value"];
const PHASE_WORDS: Record<string, string> = { INTAKE: "Details saved", READY: "Ready to plan", PLANNING: "Planning", NEEDS_DECISION: "Needs your answer", REVIEW: "Ready to review", UPDATE_REQUIRED: "Needs an update", RECOVERY: "Stopped", IDLE: "In use" };
/** Server summaries are plain strings today. Anything else is not shown rather than guessed at. */
const plain = (value: unknown) => (typeof value === "string" ? value : "");

export function PlannerFlow({ planId, onBack }: { planId: string; onBack: () => void }) {
  const { space } = useTheme();
  const { view, activity, failure, offline, busy, problem, running, act, reads } = usePlannerPlan(planId);
  const [limit, setLimit] = useState<Limit>("1");
  const [consent, setConsent] = useState(false);
  const [research, setResearch] = useState(false);
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [ack, setAck] = useState<string[]>([]);
  const [stopping, setStopping] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!view) return (
    <Stack gap="md" testID="planner-flow">
      <Button title="All plans" size="small" variant="quiet" icon="chevronLeft" onPress={onBack} testID="planner-back" />
      {failure ? <Callout tone="caution" title={offline ? "You're offline" : "This plan didn't load"} message={failure} /> : <Text tone="soft">Loading the plan.</Text>}
    </Stack>
  );

  const { workspace: flow, changeSet, attempt } = view;
  const allowed = (action: string) => flow.allowedActions.includes(action);
  const canConfirm = allowed("CONFIRM") && flow.candidate?.attemptId === attempt?.attemptId && changeSet?.changeSetId === flow.candidate?.changeSetId && !view.usage?.uncertain;
  const deadlineMissed = attempt?.budget?.executionDeadlineAt ? Date.parse(attempt.budget.executionDeadlineAt) <= Date.now() && ["FAILED", "CANCELLED", "NEEDS_DECISION"].includes(attempt.state) : false;
  const missing = (changeSet?.quality.requiredAcknowledgements ?? []).filter((id) => !ack.includes(id));
  const questions = view.research?.questions ?? [];
  const unanswered = attempt?.state === "NEEDS_DECISION" && questions.some((question) => !(answers[question.ref] ?? "").trim());

  return (
    <Stack gap="lg" testID="planner-flow">
      <Button title="All plans" size="small" variant="quiet" icon="chevronLeft" onPress={onBack} testID="planner-back" />
      <Stack gap="xs">
        <Text variant="heading" role="heading" aria-level={2}>{view.plan.title}</Text>
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}><Badge label={PHASE_WORDS[flow.phase] ?? flow.phase} />{offline ? <Badge label="Offline. Showing what you last saw." /> : null}</View>
        <Text tone="soft">{view.intent.intent.outcome}</Text>
        {view.intent.intent.scope.length ? <Text variant="small" tone="soft">{view.intent.intent.scope.map((item) => item.title).join(" · ")}</Text> : null}
      </Stack>

      {problem ? <ProblemNote problem={problem} /> : null}
      {failure && !offline ? <Callout tone="caution" title="Couldn't refresh" message={failure} /> : null}
      {deadlineMissed ? <Callout tone="caution" title="This run's time ran out" message="The saved work is still here. Start a new request when you're ready." /> : null}

      {(flow.phase === "INTAKE" || flow.phase === "READY" || flow.phase === "RECOVERY" || flow.phase === "UPDATE_REQUIRED") && allowed("GENERATE") ? (
        <Stack gap="md" testID="planner-authorize">
          <Text variant="subheading" role="heading" aria-level={3}>{flow.phase === "RECOVERY" ? "Try again" : "Build this plan"}</Text>
          <Text variant="small" tone="soft">Building a plan uses AI and costs real money. You choose the most it may spend, and the server enforces it. Your details are already saved, and that was free.</Text>
          <TextField label="Anything else the planner should know" value={notes} onChangeText={setNotes} multiline testID="planner-notes" />
          {view.documents.length ? <Toggle label={`Let it read my ${view.documents.length} material${view.documents.length === 1 ? "" : "s"}`} hint="Research needs your permission each time." value={research} onChange={setResearch} /> : null}
          <Segmented<Limit> label="Most it may spend" value={limit} options={[...LIMITS]} onChange={setLimit} />
          <Checkbox label={`I allow Sylf to use AI to build this plan, for up to $${limit === "0.5" ? "0.50" : limit === "1" ? "1.00" : "1.75"}.`} value={consent} onChange={setConsent} />
          <Button title={busy === "generate" ? "Starting" : problem?.action === "generate" && problem.retryable ? "Try this same request again" : "Build plan"} variant="emphasis" disabled={!consent || busy !== null} testID="planner-generate" onPress={() => void act("generate", (key) => reads!.generate(view, key, { notes, research, spendingLimitUsd: Number(limit) }), "Planning started. You can leave: it keeps going.", false).then((ok) => { if (ok) { setConsent(false); setNotes(""); } })} />
        </Stack>
      ) : null}

      {running ? (
        <Stack gap="md" testID="planner-watch">
          <Text variant="subheading" role="heading" aria-level={3}>Planning</Text>
          <Text variant="small" tone="soft">This is what the server reports. You can leave, and it keeps going.</Text>
          {activity?.calls.length ? <Stack gap="xs">{activity.calls.map((call) => <Text key={call.id} variant="small">{call.label} · {call.state.toLowerCase()}</Text>)}</Stack> : <Text variant="small" tone="soft">Waiting for the first update.</Text>}
          {activity?.research.length ? <Stack gap="xs">{activity.research.map((item) => <Text key={item.id} variant="small" tone="soft">{item.label}: {item.detail}</Text>)}</Stack> : null}
          {allowed("CANCEL") ? <Button title="Stop planning" variant="critical" disabled={busy !== null} testID="planner-stop" onPress={() => setStopping(true)} /> : null}
        </Stack>
      ) : null}

      {attempt?.state === "NEEDS_DECISION" && questions.length ? (
        <Stack gap="md" testID="planner-questions">
          <Text variant="subheading" role="heading" aria-level={3}>A few questions</Text>
          {questions.map((question) => (
            <Stack key={question.ref} gap="xs">
              <Text>{question.question}</Text>
              <Text variant="small" tone="soft">{question.consequence}</Text>
              <TextField label="Your answer" value={answers[question.ref] ?? ""} onChangeText={(text) => setAnswers({ ...answers, [question.ref]: text })} multiline testID={`planner-answer-${question.ref}`} />
            </Stack>
          ))}
          <Button title={busy === "answer" ? "Sending" : "Send answers"} variant="emphasis" disabled={unanswered || busy !== null} testID="planner-answer-send" onPress={() => void act("answer", (key) => reads!.answer(view, key, answers), "Answers sent.").then((ok) => { if (ok) setAnswers({}); })} />
        </Stack>
      ) : null}

      {changeSet && (flow.phase === "REVIEW" || canConfirm) ? (
        <Stack gap="md" testID="planner-review">
          <Text variant="subheading" role="heading" aria-level={3}>Review</Text>
          <Text>{changeSet.entries.length} {changeSet.entries.length === 1 ? "activity" : "activities"} would be added as quests. Nothing is added until you confirm.</Text>
          {changeSet.aggregate?.feasible === false ? <Callout tone="caution" title="This may not fit your time" message="The planner couldn't fit everything before the deadline. Read what it left out below." /> : null}
          {changeSet.quality.issues.map((issue) => <Callout key={issue.issueId} tone={issue.severity === "BLOCKING" ? "critical" : "caution"} title={plain(issue.evidence) || "Something to check"} message={plain(issue.consequence)} />)}
          <Button title="Review and confirm" variant="emphasis" disabled={!canConfirm || busy !== null} testID="planner-confirm-open" onPress={() => setConfirming(true)} />
          {!canConfirm ? <Text variant="small" tone="soft">This proposal can't be confirmed as it stands. Ask for a new one.</Text> : null}
        </Stack>
      ) : null}

      <Inspect view={view} />

      <Dialog open={stopping} onClose={() => setStopping(false)} title="Stop planning?" message="The server stops the run for good. What it already wrote is kept, and you can ask again later." actions={[{ label: "Keep going", onPress: () => setStopping(false) }, { label: "Stop", variant: "critical", onPress: () => { setStopping(false); void act("cancel", () => reads!.cancel(planId, attempt!.attemptId), "Planning stopped."); } }]} />
      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Add this plan?" message={`${changeSet?.entries.length ?? 0} quests will be added to your calendar. The server checks everything again before it changes anything.`} actions={[{ label: "Not yet", onPress: () => setConfirming(false) }, { label: missing.length ? "Read the warnings first" : "Confirm", variant: "emphasis", onPress: () => { if (missing.length || busy !== null) return; setConfirming(false); void act("commit", () => reads!.commit(planId, attempt!.attemptId, changeSet!.changeSetId, ack), "Your plan is active. Its quests are in Today and Calendar.", true); } }]}>
        {(changeSet?.quality.requiredAcknowledgements ?? []).map((id) => <Checkbox key={id} label={plain(changeSet?.quality.issues.find((issue) => issue.issueId === id)?.evidence) || "I've read this warning."} value={ack.includes(id)} onChange={(on) => setAck(on ? [...ack, id] : ack.filter((item) => item !== id))} />)}
      </Dialog>
    </Stack>
  );
}

function ProblemNote({ problem }: { problem: Problem }) {
  return <View testID="planner-problem"><Callout tone="caution" title={problem.retryable ? "That may not have gone through" : "That didn't work"} message={problem.retryable ? `${problem.text} Check below, then send the same action again. It won't be done twice.` : problem.text} /></View>;
}

/** Strategy, review findings and earlier versions. Unapproved work is labelled, never hidden. */
function Inspect({ view }: { view: PlannerView }) {
  const draft = view.draft;
  if (!draft && !view.attemptHistory.length) return null;
  const approved = view.workspace.active != null;
  return (
    <Disclosure title="What the planner wrote" detail={approved ? "In use" : "Not approved yet"}>
      <Stack gap="md" testID="planner-inspect">
        {!approved ? <Text variant="small" tone="soft">This is a draft. Nothing here is in your calendar.</Text> : null}
        {draft?.strategies.map((strategy) => <Stack key={strategy.id} gap="xs"><Text variant="small" tone="soft">Strategy {strategy.version}</Text><Text>{strategy.text}</Text></Stack>)}
        {draft?.reviews.map((review) => <Stack key={review.id} gap="xs"><Text variant="small" tone="soft">Review: {review.verdict.toLowerCase()}</Text><Text>{review.explanation}</Text></Stack>)}
        {view.attemptHistory.length ? <Stack gap="xs"><Text variant="small" tone="soft">Earlier attempts</Text>{view.attemptHistory.map((item) => <Text key={item.attemptId} variant="small">{new Date(item.at).toLocaleString()} · {item.state.toLowerCase().replace("_", " ")}</Text>)}</Stack> : null}
        {!draft && !view.attemptHistory.length ? <EmptyState icon="planner" title="Nothing yet" message="The planner hasn't written anything for this plan." /> : null}
      </Stack>
    </Disclosure>
  );
}
