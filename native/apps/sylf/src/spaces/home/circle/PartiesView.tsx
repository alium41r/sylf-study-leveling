// Study parties, the lifecycle: see yours, answer invitations, start one, invite friends, leave. The server allows one active party of four, and joining
// needs an invitation. Starting a shared session comes next, through the one session owner (ADR 0015), so nothing here starts a clock.
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, Dialog, EmptyState, ListRow, Sheet, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import { useAuth, useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { toLiveResult } from "../../../shell/live-result";
import { describeFailureText } from "../../../shell/account/failure";

export function PartiesView() {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const me = useAuth().userId;
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const resource = useMemo(() => (backend ? backend.resources.resource({ key: "circle-party", tags: ["circle", "party"], ttlMs: 30_000, load: async (signal) => {
    const summary = await backend.reads.party(signal);
    const detail = summary.activeParty ? await backend.reads.parties.state(summary.activeParty.id, signal).catch(() => null) : null;
    return { summary, detail };
  } }) : null), [backend]);
  const result = toLiveResult(useOptionalResource(resource), resource);
  const friendsResource = useMemo(() => (backend && inviting ? backend.resources.resource({ key: "circle-friends", tags: ["circle"], ttlMs: 60_000, load: (signal) => backend.reads.friends(signal) }) : null), [backend, inviting]);
  const friends = useOptionalResource(friendsResource)?.data ?? [];

  if (!backend) return <EmptyState icon="circle" title="Parties live in your account" message="Sign in to study with friends." />;
  if (!result) return <Text tone="soft">Loading your parties.</Text>;
  if (!result.data) return <Callout tone="caution" title={result.live.offline ? "You're offline" : "Parties didn't load"} message={result.live.failure ?? "Try again in a moment."} />;
  const { summary, detail } = result.data;
  const party = summary.activeParty;
  const members = detail?.members ?? [];
  const mine = members.find((member) => String(member.userId) === String(me));

  const run = async (work: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(true);
    try { await work(); notice(done); backend.resources.invalidate("party"); backend.resources.invalidate("circle"); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };

  return (
    <Stack gap="lg" testID="circle-parties">
      {summary.pendingInvites.length ? (
        <Stack gap="xs">
          <Text variant="subheading" role="heading" aria-level={2}>Invitations</Text>
          {summary.pendingInvites.map((invite) => (
            <View key={invite.id} testID={`party-invite-${invite.id}`} style={{ gap: space.xs }}>
              <Text variant="small">{invite.partyName}</Text>
              <Text variant="caption" tone="soft">Invited by {invite.senderName ?? invite.senderUsername}</Text>
              <View style={{ flexDirection: "row", gap: space.xs }}>
                <Button title="Join" size="small" variant="emphasis" disabled={busy} onPress={() => void run(() => backend.reads.parties.answerInvite(invite.id, true), "You joined the party.")} />
                <Button title="Not now" size="small" disabled={busy} onPress={() => void run(() => backend.reads.parties.answerInvite(invite.id, false), "Invitation declined.")} />
              </View>
            </View>
          ))}
        </Stack>
      ) : null}
      {party ? (
        <Stack gap="md">
          <Stack gap="xs">
            <Text variant="subheading" role="heading" aria-level={2}>{party.name}</Text>
            <Badge label={`${party.memberCount} ${party.memberCount === 1 ? "member" : "members"}`} />
          </Stack>
          {members.length ? <View style={{ gap: space.hair }}>{members.map((member) => <ListRow key={member.id} title={member.user?.name ?? member.user?.username ?? "Member"} detail={member.status?.toLowerCase()} />)}</View> : null}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Invite a friend" variant="emphasis" testID="party-invite-open" disabled={busy || party.memberCount >= 4} onPress={() => setInviting(true)} />
            <Button title="Leave" variant="critical" testID="party-leave" disabled={busy || !mine} onPress={() => setLeaving(true)} />
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
      <Dialog open={leaving} onClose={() => setLeaving(false)} title="Leave this party?" message="You can rejoin only if someone invites you again." actions={[{ label: "Stay", onPress: () => setLeaving(false) }, { label: "Leave", variant: "critical", onPress: () => { setLeaving(false); if (party && mine) void run(() => backend.reads.parties.leave(party.id, mine.id), "You left the party."); } }]} />
    </Stack>
  );
}
