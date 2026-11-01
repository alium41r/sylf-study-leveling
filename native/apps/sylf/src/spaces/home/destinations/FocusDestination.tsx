// Focus is where a session is set up and followed, and it shows the one study session the dock and Workspace's Timer show. It keeps no
// time of its own. A session runs with or without data, so the instrument is always here. What the server has accepted is listed under
// Recent sessions, and what it has not yet is listed apart, under On this device, with a badge that stays true until the answer arrives.
import { useState, useSyncExternalStore } from "react";
import { Image, View } from "react-native";
import { Badge, Plane, Press, Stack, Text, useTheme } from "@sylf/design-system";
import { DEFAULT_SESSION_TITLE, MAX_CREDITED_FOCUS_SECONDS, endedSessionsFor, speakSessionClock, type EndedSession } from "@sylf/spaces";
import { useAuth, useSessionSync } from "../../../shell/backend";
import { useHomeNavigation, useSessionState, useStudySession } from "../../../shell/context";
import { SESSION_STATUS_LABELS, SessionActions, SessionClock, SessionLengths, SessionNote, SessionProgress, SessionSubject } from "../../../shell/session/SessionParts";
import { useStats } from "../../../shell/live";
import { useHomeResult } from "../data";
import type { FocusView, HomeDataAdapter, StudyDesk } from "../data/contracts";
import { formatMinutes } from "../format";
import { HomeColumns, HomePage, PageTitle, Section } from "../HomePage";

const load = (adapter: HomeDataAdapter) => adapter.focus();

/** A small drawing of the desk, made of the theme's own tones. Real desks show their focus background's image instead. */
function DeskPreview({ art, selected }: { art: StudyDesk["art"]; selected: boolean }) {
  const { color, shape } = useTheme();
  const ink = selected ? color.accent.mote : color.lineStrong;
  if (art.kind === "image") return <Image source={{ uri: art.url }} style={{ width: 64, height: 44, borderRadius: shape.radius.sm }} />;
  const { layout } = art;
  return (
    <View style={{ width: 64, height: 44, borderRadius: shape.radius.sm, backgroundColor: color.selected, overflow: "hidden" }}>
      {layout === "window" ? <View style={{ position: "absolute", top: 7, left: 22, width: 20, height: 20, borderWidth: 1, borderColor: ink }} /> : null}
      {layout === "lamp" ? <View style={{ position: "absolute", top: 13, left: 36, width: 8, height: 8, backgroundColor: ink }} /> : null}
      {layout === "shelf" ? [10, 18, 26].map((top) => <View key={top} style={{ position: "absolute", top, left: 10, right: 10, height: 1, backgroundColor: ink }} />) : null}
      <View style={{ position: "absolute", bottom: 7, left: 6, right: 6, height: 2, backgroundColor: color.lineStrong }} />
    </View>
  );
}

function DeskRow({ desk, selected, onPress }: { desk: StudyDesk; selected: boolean; onPress: () => void }) {
  const { shape, space } = useTheme();
  return (
    <Press role="radio" checked={selected} label={`${desk.name}. ${desk.category}`} onPress={onPress} radius={shape.radius.sm} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.xs }}>
      <DeskPreview art={desk.art} selected={selected} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small" tone="ink">{desk.name}</Text>
        <Text variant="caption" tone="soft">{desk.category}</Text>
      </View>
    </Press>
  );
}

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

function SessionInstrument({ focus }: { focus: FocusView | null }) {
  const { space } = useTheme();
  const session = useStudySession();
  const { active, plan } = useSessionState();
  const showing = useFocusIsShowing();
  const status = session.status();
  const subject = active ? active.subject : plan?.subject ?? (focus?.subject || null);
  const title = active ? active.title : plan?.title ?? (focus?.topic || DEFAULT_SESSION_TITLE);
  return (
    <Plane level="raised" radius="xl" style={{ paddingVertical: space.air, paddingHorizontal: space.xl, alignItems: "center", gap: space.lg }}>
      <Stack gap="xs" align="center">
        {subject ? <Text variant="caption" tone="soft" align="center">{subject}</Text> : null}
        <Text variant="title" align="center">{title}</Text>
      </Stack>
      <Stack gap="xs" align="center" style={{ alignSelf: "stretch" }}>
        <SessionClock live={showing} testID="focus-clock" />
        {status === "idle" ? null : <Text variant="caption" tone="soft" align="center">{SESSION_STATUS_LABELS[status]}</Text>}
      </Stack>
      {status === "idle" ? <SessionLengths /> : <View style={{ alignSelf: "center", maxWidth: 420, width: "100%" }}><SessionProgress live={showing} /></View>}
      <Stack gap="sm" align="center" style={{ alignSelf: "stretch" }}>
        <View style={{ alignSelf: "center", width: "100%", maxWidth: 320, gap: space.sm }}>
          <ElsewhereNote />
          <SessionSubject />
          <SessionActions surface="focus" title={focus?.topic || undefined} subject={focus?.subject || undefined} />
        </View>
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
  const [deskId, setDeskId] = useState<string | null>(null);
  const desk = focus?.desks.find((item) => item.id === deskId) ?? focus?.desks[0];
  const local = ended.length ? (
    <Section key="local" title="On this device">
      <View style={{ alignSelf: "flex-start" }}><Badge label="Not saved yet" /></View>
      <Stack gap="md">{ended.slice(0, 5).map((item) => <LocalRow key={item.clientKey} item={item} />)}</Stack>
    </Section>
  ) : null;

  return (
    <HomePage destination="focus" eyebrow={!result || result.live ? "Study sessions" : "Study sessions and desks"} provenance={result?.provenance} live={result?.live} ready={result !== null}>
      <>
        <PageTitle title="Focus" />
        {/* A running session needs nothing from this read, so its controls never wait for one. Only the history does. */}
        <HomeColumns
            primary={<SessionInstrument focus={focus} />}
            secondary={[
              ...(local ? [local] : []),
              ...(focus ? [
                ...(focus.desks.length ? [<Section key="desks" title="Study desks">
                  <View role="radiogroup" aria-label="Study desk" style={{ gap: space.xs }}>{focus.desks.map((item) => <DeskRow key={item.id} desk={item} selected={item.id === desk?.id} onPress={() => setDeskId(item.id)} />)}</View>
                  <Text variant="caption" tone="soft">Preview only. Desks do not change anything yet.</Text>
                </Section>] : []),
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
