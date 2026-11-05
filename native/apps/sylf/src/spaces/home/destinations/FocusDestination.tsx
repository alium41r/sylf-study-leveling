// Focus is the threshold: what I am studying, the rhythm, and where, then one way in. The session itself lives in the environment above the
// Spaces, and in the dock, so the clock is not here until a session is running. It keeps no time of its own. What the server has accepted is
// listed under Recent sessions, and what it has not yet is listed apart, under On this device, with a badge that stays true until it answers.
import { useSyncExternalStore } from "react";
import { ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { Badge, Button, Chip, Plane, Press, Stack, Text, useTheme } from "@sylf/design-system";
import { MAX_CREDITED_FOCUS_SECONDS, endedSessionsFor, speakSessionClock, type EndedSession } from "@sylf/spaces";
import { useAuth, useSessionSync } from "../../../shell/backend";
import { useHomeNavigation, useSessionState, useStudySession } from "../../../shell/context";
import { SESSION_STATUS_LABELS, SessionActions, SessionClock, SessionNote, SessionSubject } from "../../../shell/session/SessionParts";
import { ModeChooser } from "../../../shell/focus/ModeChooser";
import { useBackgroundCatalog, useFocusBackground } from "../../../shell/focus/useFocusBackground";
import { useEnterFocus } from "../../../shell/focus/enter";
import { useStats, useSubjects } from "../../../shell/live";
import { studyWith, useStudyWith } from "../../../shell/party/studyWith";
import { RoomStrip } from "../../../shell/party/RoomStrip";
import { usePartySummary } from "../../../shell/party/useParty";
import { useHomeResult } from "../data";
import type { FocusView, HomeDataAdapter, Objective } from "../data/contracts";
import { formatMinutes } from "../format";
import { HomeColumns, HomePage, PageTitle, Section } from "../HomePage";

const load = (adapter: HomeDataAdapter) => adapter.focus();

/** The clock renders only while this page is showing, because a hidden destination stays mounted. */
function useFocusIsShowing() {
  const navigation = useHomeNavigation();
  return useSyncExternalStore(navigation.subscribe, navigation.destination, navigation.destination) === "focus";
}

/** One session across every device. Native adopts a session open elsewhere only when it matches, so someone starting here should know it is there. */
function ElsewhereNote() {
  const stats = useStats();
  const { active } = useSessionState();
  const { offline, pending } = useSessionSync();
  if (active || offline || pending || !stats?.activeSessionId) return null;
  return <Text variant="caption" tone="soft" align="center" testID="focus-elsewhere">A session is already running on another device. End it there before starting here.</Text>;
}

const loadToday = (adapter: HomeDataAdapter) => adapter.today(new Date());

/** What the next session is about: a quest from today, which fills in its subject, or just a subject. Fixed once a session exists. */
function WhatPicker({ quests }: { quests: Objective[] }) {
  const { space } = useTheme();
  const session = useStudySession();
  const { plan } = useSessionState();
  const subjects = useSubjects();
  // With nothing to choose from, a heading over nothing is just noise.
  if (!subjects.length && !quests.length) return null;
  return (
    <Stack gap="sm">
      <Text variant="caption" tone="soft">What</Text>
      <SessionSubject />
      {quests.length ? (
        <View role="radiogroup" aria-label="Quest" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {quests.map((quest) => <Chip key={quest.id} radio label={quest.title} selected={plan?.questId === quest.questId} onPress={() => session.setPlan(plan?.questId === quest.questId ? null : { title: quest.title, subject: quest.subject ?? null, subjectId: quest.subjectId ?? null, questId: quest.questId ?? null })} />)}
        </View>
      ) : null}
    </Stack>
  );
}

/** With whom: on one's own, or in a party's room. It exists only for someone in a party, and fixed once a session exists, like the rest. */
function WithPicker() {
  const { space } = useTheme();
  const { summary } = usePartySummary();
  const chosen = useStudyWith();
  const party = summary?.activeParty;
  if (!party) return null;
  return (
    <Stack gap="sm">
      <Text variant="caption" tone="soft">With</Text>
      <View role="radiogroup" aria-label="Who you study with" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Chip radio label="On my own" selected={!chosen} onPress={() => studyWith.set(null)} />
        <Chip radio label={party.name} selected={chosen?.partyId === party.id} onPress={() => studyWith.set({ partyId: party.id, name: party.name })} />
      </View>
    </Stack>
  );
}

/** Where: Sylf's plain ground, then the catalog's backgrounds. Choosing saves the preference on the account, so web shows the same one. */
function WherePicker() {
  const { space, shape, color } = useTheme();
  const catalog = useBackgroundCatalog();
  const { chosenId, choose } = useFocusBackground();
  const options = catalog?.categories.flatMap((category) => category.backgrounds).slice(0, 12) ?? [];
  if (!catalog) return null;
  const tile = { width: 88, height: 56, borderRadius: shape.radius.sm, overflow: "hidden" as const, backgroundColor: color.selected };
  return (
    <Stack gap="sm">
      <Text variant="caption" tone="soft">Where</Text>
      <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} role="radiogroup" aria-label="Background" contentContainerStyle={{ gap: space.sm }}>
        <Press role="radio" checked={chosenId === null} label="Classic. Sylf's plain ground" onPress={() => void choose(null)} radius={shape.radius.sm} bodyStyle={{ gap: space.xs }}>
          <View style={[tile, { borderWidth: 1, borderColor: chosenId === null ? color.accent.mote : color.line }]} />
          <Text variant="caption" tone={chosenId === null ? "ink" : "soft"} numberOfLines={1} style={{ width: 88 }}>Classic</Text>
        </Press>
        {options.map((option) => (
          <Press key={option.id} role="radio" checked={chosenId === option.id} label={option.name} onPress={() => void choose(option.id)} radius={shape.radius.sm} bodyStyle={{ gap: space.xs }}>
            <View style={[tile, { borderWidth: 1, borderColor: chosenId === option.id ? color.accent.mote : color.line }]}>
              <Image source={{ uri: option.publicUrl }} contentFit="cover" recyclingKey={String(option.id)} style={{ width: 88, height: 56 }} accessible={false} />
            </View>
            <Text variant="caption" tone={chosenId === option.id ? "ink" : "soft"} numberOfLines={1} style={{ width: 88 }}>{option.name}</Text>
          </Press>
        ))}
      </ScrollView>
    </Stack>
  );
}

function Threshold({ focus }: { focus: FocusView | null }) {
  const { space } = useTheme();
  const session = useStudySession();
  const { active } = useSessionState();
  const showing = useFocusIsShowing();
  const today = useHomeResult("today", loadToday);
  const enter = useEnterFocus();
  const status = session.status();
  const quests = (today?.data?.objectives ?? []).filter((objective) => !objective.done && objective.questId !== undefined).slice(0, 6);
  return (
    <Plane level="raised" radius="xl" style={{ paddingVertical: space.xl, paddingHorizontal: space.xl, gap: space.xl }}>
      {active ? (
        <Stack gap="xs" align="center">
          {active.subject ? <Text variant="caption" tone="soft" align="center">{active.subject}</Text> : null}
          <Text variant="title" align="center">{active.title}</Text>
          <SessionClock live={showing} variant="readout" testID="focus-clock" />
          <Text variant="caption" tone="soft" align="center">{SESSION_STATUS_LABELS[status]}</Text>
          <RoomStrip watching={showing} />
        </Stack>
      ) : (
        <>
          <WhatPicker quests={quests} />
          <WithPicker />
          <Stack gap="sm"><Text variant="caption" tone="soft">Rhythm</Text><ModeChooser /></Stack>
          <WherePicker />
        </>
      )}
      <Stack gap="sm" style={{ alignSelf: "stretch" }}>
        <ElsewhereNote />
        <Button title={active ? "Back to your session" : "Enter"} variant="emphasis" icon="focus" fill testID="focus-enter" onPress={() => enter({ title: focus?.topic || undefined, subject: focus?.subject || undefined })} />
        {active ? <SessionActions surface="focus" /> : null}
        <SessionNote />
      </Stack>
    </Plane>
  );
}

function LocalRow({ item }: { item: EndedSession }) {
  const { space } = useTheme();
  const when = new Date(item.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <View accessible aria-label={`${item.title}, ${speakSessionClock(item.focusSeconds)}, ended at ${when}. Not saved to your study record yet.`} style={{ flexDirection: "row", alignItems: "baseline", gap: space.md }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small">{item.title}</Text>
        <Text variant="caption" tone="soft">{`Ended at ${when}`}</Text>
      </View>
      <Text variant="value" tone="soft">{formatMinutes(Math.max(1, Math.round(item.focusSeconds / 60)))}</Text>
    </View>
  );
}

/** Says so when the server credited less than this device tracked, because the two numbers would otherwise quietly disagree. */
function CreditNote() {
  const { lastSaved } = useSessionSync();
  if (!lastSaved || lastSaved.acceptedFocusSeconds === null || lastSaved.acceptedFocusSeconds + 60 >= lastSaved.focusSeconds) return null;
  const capped = lastSaved.acceptedFocusSeconds >= MAX_CREDITED_FOCUS_SECONDS;
  return <Text variant="caption" tone="soft" testID="focus-credit-note">{`${speakSessionClock(lastSaved.acceptedFocusSeconds)} of your last ${speakSessionClock(lastSaved.focusSeconds)} counted. ${capped ? "One session counts for 12 hours at most." : "Sylf credits only the time it can verify."}`}</Text>;
}

export function FocusDestination() {
  const { space } = useTheme();
  const result = useHomeResult("focus", load);
  const state = useSessionState();
  const { userId } = useAuth();
  // Only this person's, and only what the server has not accepted. Once it has, it belongs to Recent sessions.
  const ended = endedSessionsFor(state, userId).filter((item) => !item.saved && item.focusSeconds > 0);
  const focus = result?.data ?? null;
  const local = ended.length ? (
    <Section key="local" title="On this device">
      <View style={{ alignSelf: "flex-start" }}><Badge label="Not saved yet" /></View>
      <Stack gap="md">{ended.slice(0, 5).map((item) => <LocalRow key={item.clientKey} item={item} />)}</Stack>
    </Section>
  ) : null;

  return (
    <HomePage destination="focus" eyebrow="Study sessions" provenance={result?.provenance} live={result?.live} ready={result !== null}>
      <>
        <PageTitle title="Focus" />
        {/* A running session needs nothing from this read, so its controls never wait for one. Only the history does. */}
        <HomeColumns
            primary={<Threshold focus={focus} />}
            secondary={[
              ...(local ? [local] : []),
              ...(focus ? [
                <Section key="recent" title="Recent sessions">
                  <CreditNote />
                  {focus.recent.length ? null : <Text variant="small" tone="soft" testID="focus-no-history">Sessions you finish appear here, with their time.</Text>}
                  <Stack gap="md">
                    {focus.recent.map((session) => (
                      <View key={session.id} accessible testID="focus-recent-row" style={{ flexDirection: "row", alignItems: "baseline", gap: space.md }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="small">{session.title}</Text>
                          <Text variant="caption" tone="soft">{session.detail}</Text>
                        </View>
                        <Text variant="value" tone="soft">{formatMinutes(session.minutes)}</Text>
                      </View>
                    ))}
                  </Stack>
                </Section>,
              ] : result?.live?.failure ? [<View key="failed" testID="home-failed"><Text variant="small" tone="soft">{`Recent sessions didn't load. ${result.live.failure}`}</Text></View>] : []),
            ]}
        />
      </>
    </HomePage>
  );
}
