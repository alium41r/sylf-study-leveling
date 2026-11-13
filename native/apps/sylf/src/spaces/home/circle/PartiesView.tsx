// Study parties: see yours, answer invitations, start one, invite friends, leave, and study together. The server allows one active party of four, and
// joining needs an invitation. Studying together is the one study session with a room attached (ADR 0015): it begins on Focus like any session, its
// time and credit are the session's alone (owner decision E-13), and this page only chooses the room and shows who is in it.
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, Dialog, EmptyState, ListRow, Sheet, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import { useAuth, useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { useHomeNavigation, useSessionState, useStudySession } from "../../../shell/context";
import { focusEnvironment } from "../../../shell/focus/environment";
import { studyWith } from "../../../shell/party/studyWith";
import { RoomMembers } from "../../../shell/party/RoomMembers";
import { usePartySummary, useRoom } from "../../../shell/party/useParty";
import { PartyInviteRow } from "./AnswerRows";
import { useDestinationSeen } from "./useSeen";

export function PartiesView() {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const navigation = useHomeNavigation();
  const session = useStudySession();
  const { active } = useSessionState();
  const me = useAuth().userId;
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [busy, setBusy] = useState(false);
  const seen = useDestinationSeen("circle");
  const { summary, loading, resource } = usePartySummary();
  const party = summary?.activeParty ?? null;
  const room = useRoom(party?.id ?? null, seen);
  const friendsResource = useMemo(() => (backend && inviting ? backend.resources.resource({ key: "circle-friends", tags: ["circle"], ttlMs: 60_000, load: (signal) => backend.reads.friends(signal) }) : null), [backend, inviting]);
  const friends = useOptionalResource(friendsResource)?.data ?? [];

  if (!backend) return <EmptyState icon="circle" title="Parties live in your account" message="Sign in to study with friends." />;
  if (!summary) return loading ? <Text tone="soft">Loading your parties.</Text> : <Stack gap="sm"><Callout tone="caution" title="Parties didn't load" message="Check your connection and try again." /><Button title="Try again" size="small" onPress={() => resource?.refresh()} /></Stack>;

  const run = async (work: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(true);
    try { await work(); notice(done); backend.resources.invalidate("party"); backend.resources.invalidate("circle"); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };

  const here = Boolean(party) && active?.party?.partyId === party?.id;
  const goStudy = () => { if (!party) return; studyWith.set({ partyId: party.id, name: party.name }); navigation.select("focus"); };
  /** One session, always: a solo session, or one in another room, ends before this begins. */
  const studyTogether = () => {
    if (!party) return;
    if (here) { focusEnvironment.open(); return; }
    if (active) { setSwitching(true); return; }
    goStudy();
  };
  const isLeader = room.state?.party.leaderId === me;

  return (
    <Stack gap="lg" testID="circle-parties">
      {summary.pendingInvites.length ? (
        <Stack gap="sm">
          <Text variant="subheading" role="heading" aria-level={2}>Invitations</Text>
          {summary.pendingInvites.map((invite) => <PartyInviteRow key={invite.id} invite={{ id: invite.id, partyName: invite.partyName, from: invite.senderName ?? invite.senderUsername }} />)}
        </Stack>
      ) : null}
      {party ? (
        <Stack gap="md">
          <Stack gap="xs">
            <Text variant="subheading" role="heading" aria-level={2}>{party.name}</Text>
            <Badge label={`${party.memberCount} ${party.memberCount === 1 ? "member" : "members"}`} />
          </Stack>
          {room.state ? <RoomMembers state={room.state} me={me} /> : room.failed ? <Text variant="small" tone="soft">The room didn't load. Pull to try again.</Text> : <Text variant="small" tone="soft">Loading the room.</Text>}
          <Button title={here ? "Back to your session" : "Study together"} variant="emphasis" icon="focus" fill testID="party-study" disabled={busy} onPress={studyTogether} />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Invite a friend" testID="party-invite-open" disabled={busy || party.memberCount >= 4} onPress={() => setInviting(true)} />
            <Button title="Leave" variant="critical" testID="party-leave" disabled={busy} onPress={() => setLeaving(true)} />
          </View>
          {party.memberCount >= 4 ? <Text variant="small" tone="soft">A party holds four people.</Text> : null}
        </Stack>
      ) : (
        <EmptyState icon="circle" title="No party yet" message="Start one, then invite up to three friends to study alongside you." action={<Button title="Start a party" variant="emphasis" testID="party-start" onPress={() => setNaming(true)} />} />
      )}

      <Sheet open={naming} onClose={() => setNaming(false)} title="Start a party">
        <View style={{ padding: space.lg }}><Stack gap="md">
          <TextField label="Name" value={name} onChangeText={setName} testID="party-name" />
          <Button title="Start" variant="emphasis" disabled={!name.trim() || busy} onPress={() => { const chosen = name.trim(); setNaming(false); setName(""); void run(() => backend.reads.parties.create(chosen), "Party started."); }} />
        </Stack></View>
      </Sheet>
      <Sheet open={inviting} onClose={() => setInviting(false)} title="Invite a friend">
        <View style={{ padding: space.lg }}><Stack gap="xs">
          {friends.length ? friends.map((friend) => <ListRow key={friend.id} title={friend.name ?? friend.username} detail={`@${friend.username}`} onPress={() => { setInviting(false); void run(() => backend.reads.parties.invite(party!.id, friend.id), "Invitation sent."); }} />) : <Text variant="small" tone="soft">Add a friend first, in People.</Text>}
        </Stack></View>
      </Sheet>
      <Dialog open={leaving} onClose={() => setLeaving(false)} title="Leave this party?" message={isLeader ? "You lead this party. Leadership passes to whoever has been in it longest. You can rejoin only if someone invites you again." : "You can rejoin only if someone invites you again."} actions={[{ label: "Stay", onPress: () => setLeaving(false) }, { label: "Leave", variant: "critical", onPress: () => { setLeaving(false); if (party) void run(() => backend.reads.parties.leave(party.id), "You left the party."); } }]} />
      <Dialog open={switching} onClose={() => setSwitching(false)} title="End your current session?" message={`You're already studying${active?.party ? ` in ${active.party.name ?? "another party"}` : " on your own"}. Sylf keeps one session at a time, so it ends first and counts as it does now.`} actions={[{ label: "Keep it going", onPress: () => setSwitching(false) }, { label: "End and continue", variant: "critical", onPress: () => { setSwitching(false); session.end(); goStudy(); } }]} />
    </Stack>
  );
}
