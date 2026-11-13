// The two things someone can be asked: to be a friend, and to join a study party. One row each, used by Circle (People, Parties) and by Today, so an answer
// is given the same way and reaches the same server rule wherever it is pressed. Each row sends its own answer, says what happened, and asks Circle's reads again.
import { useState } from "react";
import { View } from "react-native";
import { Button, Text, useNotice, useTheme } from "@sylf/design-system";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";

function AnswerRow({ title, detail, children, testID }: { title: string; detail?: string; children: React.ReactNode; testID?: string }) {
  const { space } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: space.xs }}>
      <View style={{ flexGrow: 1, flexBasis: 140, minWidth: 0 }}>
        <Text variant="small" numberOfLines={1}>{title}</Text>
        {detail ? <Text variant="caption" tone="soft" numberOfLines={1}>{detail}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", gap: space.xs }}>{children}</View>
    </View>
  );
}

export function FriendRequestRow({ request, idPrefix = "circle" }: { request: { id: number; name: string }; /** Circle and Today can both be mounted, so each names its own buttons. */ idPrefix?: string }) {
  const backend = useLiveBackend();
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  const answer = async (accept: boolean) => {
    if (!backend) return;
    setBusy(true);
    try { await backend.reads.acceptFriend(request.id, accept); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
    backend.resources.invalidate("circle");
  };
  return (
    <AnswerRow title={request.name} detail="Wants to be friends">
      <Button title="Accept" size="small" disabled={busy} testID={`${idPrefix}-accept-${request.id}`} onPress={() => void answer(true)} />
      <Button title="Not now" size="small" variant="ghost" disabled={busy} testID={`${idPrefix}-decline-${request.id}`} onPress={() => void answer(false)} />
    </AnswerRow>
  );
}

export function PartyInviteRow({ invite, idPrefix = "party" }: { invite: { id: number; partyName: string; from: string }; idPrefix?: string }) {
  const backend = useLiveBackend();
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  const answer = async (accept: boolean) => {
    if (!backend || busy) return;
    setBusy(true);
    try {
      await backend.reads.parties.answerInvite(invite.id, accept);
      notice(accept ? "You joined the party." : "Invitation declined.");
      backend.resources.invalidate("party");
      backend.resources.invalidate("circle");
    } catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  return (
    <AnswerRow title={invite.partyName} detail={`Invited by ${invite.from}`} testID={`${idPrefix}-invite-${invite.id}`}>
      <Button title="Join" size="small" variant="emphasis" disabled={busy} testID={`${idPrefix}-invite-join-${invite.id}`} onPress={() => void answer(true)} />
      <Button title="Not now" size="small" variant="ghost" disabled={busy} testID={`${idPrefix}-invite-decline-${invite.id}`} onPress={() => void answer(false)} />
    </AnswerRow>
  );
}

/** Everything waiting on an answer, party invitations first, from Circle's view model. */
export function AnswerRowsFor({ invites, requests, idPrefix }: { invites?: { id: string; name: string; from: string }[]; requests?: { id: number; name: string }[]; idPrefix: string }) {
  return (
    <>
      {invites?.map((invite) => <PartyInviteRow key={`invite-${invite.id}`} invite={{ id: Number(invite.id), partyName: invite.name, from: invite.from }} idPrefix={`${idPrefix}-party`} />)}
      {requests?.map((request) => <FriendRequestRow key={`request-${request.id}`} request={request} idPrefix={idPrefix} />)}
    </>
  );
}
