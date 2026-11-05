// The study session's controls, used by the dock, Home's Focus and Workspace's Timer. There is one of each on purpose: the three surfaces
// are views of one session, so they must show the same words, ask the same questions and behave the same way. Only the clock renders with
// the time. Everything else renders when something happens.
import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import { modes } from "@sylf/shared";
import { Button, Chip, Dialog, Progress, Select, Text, useNotice, useTheme, type TextVariant } from "@sylf/design-system";
import { MAX_CREDITED_FOCUS_SECONDS, SESSION_LENGTHS, formatSessionClock, sessionLengthLabel, speakSessionClock, type SessionLength, type SessionReadout, type SessionStatus } from "@sylf/spaces";
import { useAuth, useSessionSync } from "../backend";
import { useSessionReadout, useSessionState, useStudySession } from "../context";
import { takeParty } from "../party/studyWith";
import { useSubjects } from "../live";
import { LOCAL_SESSION_NOTE, sessionNote } from "./note";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = { idle: "Ready", running: "In progress", paused: "Paused", finished: "Finished" };
export { LOCAL_SESSION_NOTE };

export function speakReadout({ status, clock, fraction }: SessionReadout) {
  const time = speakSessionClock(clock);
  return status === "idle" ? `Ready, ${fraction === null ? "no limit" : time}` : status === "finished" ? "Finished" : `${SESSION_STATUS_LABELS[status]}, ${time} ${fraction === null ? "so far" : "left"}`;
}

export const SessionClock = memo(function SessionClock({ variant = "readoutXL", live = true, testID }: { variant?: TextVariant; live?: boolean; testID?: string }) {
  const readout = useSessionReadout(live);
  const quiet = readout.status === "idle" || readout.status === "paused";
  return (
    <View role="timer" accessible aria-label={speakReadout(readout)} testID={testID}>
      <Text variant={variant} tone={quiet ? "soft" : "ink"} align="center" numberOfLines={1}>{formatSessionClock(readout.clock)}</Text>
    </View>
  );
});

/** How far through a countdown. It moves in hundredths, so a session makes it draw every few seconds at most. */
export const SessionProgress = memo(function SessionProgress({ live = true }: { live?: boolean }) {
  const { status, fraction } = useSessionReadout(live);
  if (status === "idle" || fraction === null) return null;
  return <Progress value={Math.floor(fraction * 100) / 100} label="Session progress" />;
});

export function SessionLengths() {
  const { space } = useTheme();
  const session = useStudySession();
  const { length } = useSessionState();
  return (
    <View role="radiogroup" aria-label="Session length" style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.xs }}>
      {SESSION_LENGTHS.map((value: SessionLength) => <Chip key={String(value)} radio label={sessionLengthLabel(value)} selected={value === length} onPress={() => session.setLength(value)} />)}
    </View>
  );
}

/** Whether this session is past what one session can credit. Moves once, at that moment, with no clock behind it. */
function usePastCredit() {
  const session = useStudySession();
  const { active } = useSessionState();
  const [, recheck] = useState(0);
  const { focusSeconds, status } = session.readout();
  const left = MAX_CREDITED_FOCUS_SECONDS - focusSeconds;
  useEffect(() => {
    if (status !== "running" || left <= 0) return;
    const timer = setTimeout(() => recheck((value) => value + 1), left * 1000 + 50);
    return () => clearTimeout(timer);
  }, [active?.clientKey, left, status]);
  return left <= 0 && Boolean(active);
}

/** The one sentence beside a session on every surface: where this time is, and what happens to it next. */
export function SessionNote() {
  const { active } = useSessionState();
  const { userId } = useAuth();
  const sync = useSessionSync();
  const past = usePastCredit();
  return <Text variant="caption" tone="soft" align="center" testID="session-note">{sessionNote({ active: active !== null, ownerId: active ? active.ownerId : userId, me: userId, offline: sync.offline, error: sync.error, pastCredit: past })}</Text>;
}

/** What the next session is about, chosen from any surface and seen on all of them, like its length. It exists only for someone with subjects. */
export function SessionSubject() {
  const session = useStudySession();
  const { plan } = useSessionState();
  const subjects = useSubjects();
  if (!subjects.length || session.status() !== "idle") return null;
  const pick = (value: string) => {
    const subject = subjects.find((item) => String(item.id) === value);
    session.setPlan(subject ? { title: null, subject: subject.name, subjectId: subject.id, questId: null } : null);
  };
  return <Select label="Subject" value={plan?.subjectId ? String(plan.subjectId) : "none"} options={[{ value: "none", label: "No subject" }, ...subjects.map((item) => ({ value: String(item.id), label: item.name }))]} onChange={pick} />;
}

/**
 * Start, pause, resume and end. `testID` names the surface, so each surface's buttons can be told apart. Ending a session that is still
 * going asks first, because it cannot be undone. A countdown that has finished has nothing left to lose, so it does not.
 */
export function SessionActions({ surface, title, subject, onEnded }: { surface: string; title?: string; subject?: string | null; onEnded?: () => void }) {
  const { space } = useTheme();
  const session = useStudySession();
  const notice = useNotice();
  const { active } = useSessionState();
  const { userId } = useAuth();
  const { offline } = useSessionSync();
  const status = session.status();
  const [asking, setAsking] = useState<string | null>(null);
  // Whether this time is on its way to a record. Only the server can say it arrived, so these words stop short of that.
  const recorded = active?.ownerId != null && active.ownerId === userId;
  const finish = () => {
    setAsking(null);
    const ended = session.end();
    if (!ended) return;
    const time = speakSessionClock(ended.focusSeconds);
    notice(!ended.focusSeconds ? "Session ended." : !recorded ? `Session ended. ${time} kept on this device.` : offline ? `Session ended. ${time} kept here, and saved when Sylf is back.` : `Session ended. Saving ${time} to your study record.`);
    onEnded?.();
  };
  const askToEnd = () => setAsking(speakSessionClock(session.readout().focusSeconds));
  // Free Flow and Flowtime have no schedule, so a break is the person's to ask for, and its length follows how long they have focused.
  const canBreak = status === "running" && Boolean(active?.phase) && modes.takesBreaksOnDemand(active!.phase!.mode) && active!.snapshot.phase === "focus";
  const row = { flexDirection: "row", gap: space.sm, alignSelf: "stretch" } as const;
  const wide = { flex: 1 } as const;
  return (
    <>
      {status === "idle" ? <Button title="Begin session" variant="emphasis" icon="play" fill testID={`${surface}-begin`} onPress={() => session.start({ title, subject, ...takeParty() })} /> : null}
      {canBreak ? <Button title="Take a break" variant="ghost" icon="pause" fill testID={`${surface}-break`} onPress={() => session.takeBreak()} /> : null}
      {status === "running" ? <View style={row}><Button title="Pause" icon="pause" testID={`${surface}-pause`} style={wide} onPress={() => session.pause()} /><Button title="End" variant="ghost" icon="stop" testID={`${surface}-end`} style={wide} onPress={askToEnd} /></View> : null}
      {status === "paused" ? <View style={row}><Button title="Resume" variant="emphasis" icon="play" testID={`${surface}-resume`} style={wide} onPress={() => session.resume()} /><Button title="End" variant="ghost" icon="stop" testID={`${surface}-end`} style={wide} onPress={askToEnd} /></View> : null}
      {status === "finished" ? <View style={row}><Button title="Finish" variant="emphasis" icon="check" testID={`${surface}-finish`} style={wide} onPress={finish} /><Button title="Keep going" icon="play" testID={`${surface}-keep-going`} style={wide} onPress={() => session.keepGoing()} /></View> : null}
      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title="End this session?"
        message={recorded ? `${asking ?? ""} so far. It goes on your study record when you end it.` : `${asking ?? ""} tracked on this device. It is not saved to your study record yet.`}
        actions={[{ label: "Keep studying", onPress: () => setAsking(null) }, { label: "End session", variant: "critical", onPress: finish }]}
      />
    </>
  );
}
